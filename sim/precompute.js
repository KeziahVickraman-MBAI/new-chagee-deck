// Precomputes everything the deck needs from the simulator and writes one JSON file.
//   node sim/precompute.js <out.json>
// Slide 4's sweeps are too slow to run live in the browser, so they are computed here
// (same code, same seeds) and embedded; slides 2, 3 and 5 compute live from sim.js.

const fs = require("node:fs");
const path = require("node:path");
const S = require("./sim.js");
const { loadWeek5Brigade } = require("./week5.js");

const RAW = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assumptions.json"), "utf8"));
const P0 = S.params(RAW);
const out = process.argv[2];
if (!out) { console.error("usage: node sim/precompute.js <out.json>"); process.exit(1); }

const trim = rows => rows.map(r => {
  const o = { u: r.u };
  for (const s of S.SETUPS) {
    const x = r[s];
    o[s] = { cost: x.costPerCup, machine: x.perCup.machine, labour: x.perCup.labour, lost: x.perCup.lost,
             lostShare: x.lostShare, busy: x.machineBusy };
  }
  return o;
});
const run = (P, g) => { const rows = S.sweep(P, g); return { rows: trim(rows), crossover: (({ kind, u }) => ({ kind, u }))(S.crossover(rows)) }; };

const t0 = Date.now();
const data = { generated: new Date().toISOString(), sweeps: {}, util: {}, shift: {} };

for (const g of Object.keys(P0.surgeMult)) {
  data.sweeps[g] = run(P0, g);
  const u = S.peakUtilisation(P0, g), sim = S.runPoint(P0, 0, g, P0.seed, P0.draws);
  data.util[g] = Object.fromEntries(S.SETUPS.map(s => [s, { ...u[s], peakLostShare: sim[s].peakLostShare }]));
}

// "What could shift the balance": the approved low/high ends, moderate surge.
const SHIFT = {
  machine_cost: ["costs", "machine_cost_per_unit_per_month", (P, x) => (P.machineMonth = x)],
  staff_turnover: ["people", "new_staff_share", (P, x) => (P.newShare = x)],
};
const surge0 = RAW.surge.surge_default.value;
for (const [k, [sec, key, set]] of Object.entries(SHIFT)) {
  const [lo, hi] = RAW[sec][key].range;
  const withValue = x => { const P = { ...P0 }; set(P, x); return P; };
  data.shift[k] = { param: `${sec}.${key}`, surge: surge0, low: lo, high: hi,
    lowRun: run(withValue(lo), surge0), highRun: run(withValue(hi), surge0) };
}

// Multi-seed stability (validation.crossover_stability), default surge.
const V = RAW.validation.crossover_stability.value, kinds = {}, us = [];
for (let k = 0; k < V.seeds; k++) {
  const c = S.crossover(S.sweep(P0, surge0, P0.seed + k));
  kinds[c.kind] = (kinds[c.kind] || 0) + 1; if (c.kind === "crossover") us.push(c.u);
}
const spread = us.length ? Math.max(...us) - Math.min(...us) : null;
data.stability = { surge: surge0, seeds: V.seeds, kinds, spread,
  pass: us.length >= V.min_seeds_with_crossover && spread != null && 100 * spread <= V.max_spread_pct_points };

// Week 5 cross-check, as run by the tests.
const W = RAW.validation.week5_comparison.value, { Brigade, measure } = loadWeek5Brigade();
data.week5 = W.speed_sets.map(speeds => {
  const eng = measure(Brigade, { speeds, walk: W.settings.walk, hiccup: 0, bufferCap: 0, seed: 7 }).thr;
  const eng6 = measure(Brigade, { speeds, walk: 6, hiccup: 0, bufferCap: 0, seed: 7 }).thr;
  const pooled = S.brigadeRate(speeds, 1);
  return { speeds, engine: eng, pooled, gapPct: 100 * Math.abs(pooled - eng) / eng, ratioWalk6: eng6 / pooled };
});
data.week5Pass = data.week5.every(w => w.gapPct <= W.tolerance_pct);

// Slide 2 default band and slide 3 headline figures (same functions the slides run live).
const sig = RAW.predict.signal_strength_default.value, noHype = RAW.predict_toggles.remove_hype_default.value;
const b0 = S.band(P0, sig, noHype), daily = b0.base / 7, days0 = RAW.provision.opening_stock_days.value;
const prov = u => S.provision(P0, u, days0, daily);
data.defaults = { signal: sig, removeHype: noHype, u: b0.u, band: b0 };
data.provision = { none: prov(P0.uNone), def: prov(b0.u), strong: prov(P0.uStrong) };
for (const k in data.provision) delete data.provision[k].curve;

// Staff-optimisation slide (sim/staffing.js): steady demand and the opening-week surge at our defaults.
{
  const Staff = require("./staffing.js");
  const ev = e => e && { wait: e.wait, sl: e.sl, util: e.util, worstWait: e.worstWait, cov: e.cov };
  const one = over => {
    const r = Staff.run({ ...Staff.inputs(RAW, S, over), uHigh: b0.u });
    return { lam: r.inp.lam, req: r.req, feasible: r.sched.feasible, complete: r.sched.complete, hours: r.sched.hours,
             cost: r.cost, shifts: (r.sched.shifts || []).map(x => ({ start: x.start, len: x.len, brk: x.brk })),
             base: r.base && { hours: r.base.hours, cost: r.base.cost, ...ev(r.base) }, at: ev(r.at), high: ev(r.high),
             mu: r.inp.mu, serviceSec: r.inp.serviceSec, handSec: r.inp.handSec };
  };
  data.staffing = { steady: one({}), surge: one({ hype: true }) };
}

// ---------------- brief-v2: break-even triggers, volume curve, machine-speed dependency ----------------
const u0 = S.defaultU(P0);
const PAIRS = [
  ["u", "mixed", "all_machine"], ["u", "all_human", "mixed"],
  ["wage", "all_human", "mixed"], ["wage", "mixed", "all_machine"],
  ["machineMonth", "all_human", "mixed"], ["machineMonth", "mixed", "all_machine"],
  ["cupsPerDay", "all_human", "mixed"], ["cupsPerDay", "mixed", "all_machine"],
  ["newShare", "all_human", "mixed"],
  ["machineMult", "mixed", "all_machine"], ["machineMult", "all_human", "mixed"],
  ["coordHuman", "all_human", "mixed"], ["coordMixed", "all_human", "mixed"],
];
const slim = r => { const { grid, ...rest } = r; return { ...rest, grid: grid.map(([x, g]) => [x, +g.toFixed(4)]) }; };
data.breakEven = PAIRS.map(([lever, a, b]) => slim(S.breakEven(P0, lever, a, b, { u: u0 })));
data.milkTrigger = S.milkTrigger(P0);
data.leverNow = Object.fromEntries(Object.entries(S.LEVERS).map(([k, L]) => [k, L.now(P0)]));

// Cost per cup against cups/day over the approved cups range (cost charts keep 278-833).
const [c0, c1] = P0.ranges.cupsPerDay, NV = RAW.validation.breakeven.value.grid_points;
data.volumeCurve = [...Array(NV)].map((_, i) => {
  const cpd = c0 + (c1 - c0) * i / (NV - 1), r = S.runPoint({ ...P0, cupsYear: cpd * P0.days }, u0, surge0, P0.seed, P0.draws);
  return { cupsPerDay: cpd, ...Object.fromEntries(S.SETUPS.map(k => [k, { cost: r[k].costPerCup, busy: r[k].machineBusy, lostShare: r[k].lostShare }])) };
});

// Machine-speed dependency: how busy the automated line is, and the costs, across the approved range.
const [m0, m1] = P0.ranges.machineMult;
data.machineSpeed = [...Array(NV)].map((_, i) => {
  const mult = m0 + (m1 - m0) * i / (NV - 1), Q = { ...P0, machineMult: mult }, r = S.runPoint(Q, u0, surge0, P0.seed, P0.draws);
  const slowest = Math.max(...Object.values(P0.machineSec)) * mult;
  return { mult, slowestSec: slowest, units: S.plan(Q, "all_machine").machineUnits,
           ...Object.fromEntries(S.SETUPS.map(k => [k, { cost: r[k].costPerCup, busy: r[k].machineBusy }])) };
});

// Slide 5 "as sized in our cost model": machine line rate / crew rate, read from peak capacities.
const pu = data.util[surge0];
data.mechanism = { asSizedRatio: pu.all_machine.capacityPerMin / pu.mixed.capacityPerMin, surge: surge0 };

// Time to serve in the peak hour, per surge and setup: a read-out of the cost model (sim.js serveTimes),
// so it matches the costs and lost orders on the cost slide. The replica (store.js) only animates.
const St = require("./store.js"), NS = RAW.validation.crossover_stability.value.seeds;
data.store = {};
for (const g of Object.keys(P0.surgeMult)) {
  data.store[g] = {};
  for (const s of S.SETUPS) {
    const r = S.serveTimes(P0, s, { surge: g, seeds: NS });
    data.store[g][s] = { ...r, staff: s === "all_machine" ? 0 : S.plan(P0, s).rosterPlan[St.peakHour(P0)] };
  }
}

// Sensitivity (appendix A2): the mixed minus all-human cost per cup at each ranged assumption's low and high,
// one at a time, everything else at its default (default band, default surge, full draws). Station-time tables
// are varied through the simulator's multipliers.
{
  const gapAt = P => { const r = S.runPoint(P, S.defaultU(P), surge0, P.seed, P.draws); return r.mixed.costPerCup - r.all_human.costPerCup; };
  const base = gapAt(P0), rows = [];
  for (const [sec, o] of Object.entries(RAW)) {
    if (sec.startsWith("_") || sec === "staffing") continue;   // staffing slide only; never in the cost model
    for (const [key, a] of Object.entries(o)) {
      if (!a || typeof a !== "object" || !Array.isArray(a.range) || a.range.length !== 2 || typeof a.range[0] !== "number") continue;
      const at = x => {
        if (typeof a.value === "number") {
          const R2 = JSON.parse(JSON.stringify(RAW)); R2[sec][key].value = x; return gapAt(S.params(R2));
        }
        if (key === "machine_seconds_per_cup") return gapAt({ ...P0, machineMult: x });
        if (key === "human_seconds_per_cup") return gapAt({ ...P0, humanMult: x });
        return null;
      };
      const lo = at(a.range[0]), hi = at(a.range[1]);
      if (lo == null) continue;
      rows.push({ key: `${sec}.${key}`, value: a.value, range: a.range, unit: a.unit, gapLo: lo, gapHi: hi });
    }
  }
  rows.sort((x, y) => Math.abs(y.gapHi - y.gapLo) - Math.abs(x.gapHi - x.gapLo));
  data.tornado = { base, surge: surge0, rows };
}

// Replica capacity against the cost model's nominal capacity (saturated, no lost orders): the gap is walking.
data.storeCap = {};
for (const s of S.SETUPS) {
  const Q = { ...P0, targetWait: 1e9 }, X = St.create(S, Q, s, { warm: false, walkBack: RAW.illustration.walk_back_speed.value });
  const cap = S.nominalCap(S.plan(Q, s), X.staff);
  X.lam = cap * 1.5 / 60;                                  // keeps the line full without an endless queue
  while (X.t < 4 * 3600) X.step(0.5);
  data.storeCap[s] = { replica: X.handed / (X.t / 60), nominal: cap };
}
data.storePrintMinute = 20;   // static frame of the replica: a third into the peak hour

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data));
console.log(`precompute: wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
