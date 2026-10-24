// Tests for counter.js (storyboard deck). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const St = require("./store.js");
const C = require("./counter.js");
const RAW = require("../assumptions.json");
const P = Sim.params(RAW);
const walkBack = RAW.illustration.walk_back_speed.value;
const run = (o, Q = P) => C.run(Sim, St, Q, { walkBack, ...o });

test("counter: brigade and fixed stations see the same customers (common random numbers)", () => {
  for (const day of Object.keys(P.surgeMult)) {
    const a = [run({ day, staff: 2 }), run({ day, staff: 2, mode: "fixed" }), run({ day, staff: 2, mode: "fixed", assign: "worst" })];
    assert.ok(a.every(r => r.arrived === a[0].arrived), `${day}: ${a.map(r => r.arrived)}`);
  }
});

test("counter: brigade mode is the store replica with the roster overridden", () => {
  const a = run({ day: "large", staff: 3 });
  const b = St.run(Sim, P, "mixed", { surge: "large", walkBack, staff: 3 });
  assert.equal(a.served, b.served); assert.equal(a.lost, b.lost); assert.equal(a.staff, 3);
});

test("counter: store replica default roster is unchanged when staff is not given", () => {
  const a = St.create(Sim, P, "mixed", { walkBack }), h = St.peakHour(P);
  assert.equal(a.staff, Sim.plan(P, "mixed").rosterPlan[h]);
});

test("counter: every cup ordered in the hour is served or walks away", () => {
  for (const mode of ["brigade", "fixed"]) for (const day of ["none", "moderate"]) {
    const r = run({ day, staff: 3, mode });
    assert.equal(r.times.length + r.lost, r.arrived, `${mode} ${day}`);
  }
});

test("counter: forecast staffing on a normal day equals plan()'s peak-hour roster", () => {
  assert.equal(C.recommendStaff(Sim, P, "none"), Sim.plan(P, "mixed").rosterPlan[C.peakHour(P)]);
  const f = C.forecastDay(Sim, P, "large");
  assert.ok(f.peakCups > C.forecastDay(Sim, P, "none").peakCups);
  assert.ok(C.recommendStaff(Sim, P, "large") >= C.recommendStaff(Sim, P, "none"));
});

test("counter: fixed assignment puts the fastest (best) or slowest (worst) on the heaviest work", () => {
  const sp = Sim.workerSpeeds(3, P.spread), sec = k => P.humanSec[P.stations[k]];
  for (const how of ["best", "worst"]) {
    const a = C.assignFixed(P, sp, how), load = o => o.set.reduce((s, k) => s + sec(k), 0);
    const heavy = a.reduce((x, o) => (load(o) > load(x) ? o : x));
    assert.equal(heavy.v, how === "best" ? Math.max(...sp) : Math.min(...sp));
    const owned = a.flatMap(o => o.set).sort();
    const hand = P.stations.map((s, k) => k).filter(k => !P.mixedMachine.includes(P.stations[k]));
    assert.deepEqual(owned, hand);                                    // each hand station owned exactly once
  }
  assert.equal(C.assignFixed(P, Sim.workerSpeeds(5, P.spread)).length, 5);
});

test("counter: a saturated fixed line runs at its slowest station's rate (no noise)", () => {
  const Q = { ...P, humanCv: 0 }, S = C.create(Sim, St, Q, { walkBack, staff: 3, mode: "fixed", warm: false });
  S.lam = 10 / 60;                                                   // far above capacity
  while (S.t < 4 * 3600) S.step(0.5);
  const exp = 1 - Q.newShare * (1 - Q.newSpeed);
  const rate = Math.min(...S.workers.map(w => w.v * exp / w.set.reduce((a, k) => a + S.stations[k].sec, 0)),
                        ...S.stations.filter(s => s.machine).map(s => s.units / s.sec));
  const thr = S.handed / S.t;
  assert.ok(Math.abs(thr - rate) / rate < 0.03, `${thr * 3600} vs ${rate * 3600} cups/h`);
});

test("counter: a badly assigned fixed line loses more cups than a well assigned one at a big peak", () => {
  const seeds = [0, 1, 2, 3, 4].map(k => P.seed + k);
  const lost = assign => seeds.reduce((a, seed) => a + run({ day: "large", staff: 2, mode: "fixed", assign, seed }).lost, 0);
  assert.ok(lost("worst") > lost("best"), `${lost("worst")} vs ${lost("best")}`);
});

test("counter: configure maps a robot list to the cost model's setups", () => {
  assert.equal(C.configure(P, []).setup, "all_human");
  assert.equal(C.configure(P, P.stations).setup, "all_machine");
  const t = C.configure(P);
  assert.equal(t.setup, "mixed"); assert.deepEqual(t.robots, P.mixedMachine);
  assert.deepEqual(C.configure(P, ["shake_seal", "ticket"]).robots, ["ticket", "shake_seal"]);   // station order kept
  const pr = C.presets(RAW, P);
  assert.deepEqual(pr.today.robots, P.mixedMachine); assert.equal(pr.all_robot.robots.length, P.stations.length);
});

test("counter: today's split passed explicitly gives the same run as the default", () => {
  const a = run({ day: "large", staff: 2 }), b = run({ day: "large", staff: 2, robots: [...P.mixedMachine] });
  assert.equal(a.served, b.served); assert.equal(a.lost, b.lost);
});

test("counter: all robots runs with nobody on the line; all by hand needs more people than today", () => {
  const r = run({ day: "moderate", robots: P.stations });
  assert.equal(r.staff, 0); assert.ok(r.served > 0); assert.equal(r.times.length + r.lost, r.arrived);
  const h = C.configure(P, []), t = C.configure(P);
  assert.ok(C.recommendStaff(Sim, h.P, "large", h.setup) > C.recommendStaff(Sim, t.P, "large", t.setup));
  const f = run({ day: "moderate", robots: [], mode: "fixed" });
  assert.equal(f.times.length + f.lost, f.arrived);
});

test("counter: dayCost uses the cost model's machine formula and the forecast roster", () => {
  for (const robots of [[], P.mixedMachine, P.stations]) {
    const c = C.configure(P, robots), k = C.dayCost(Sim, c.P, c.setup, "none"), pl = Sim.plan(c.P, c.setup);
    assert.ok(Math.abs(k.machine - pl.machineUnits * P.machineMonth * 12 / P.days) < 1e-9);
    const hours = c.setup === "all_machine" ? P.attendant * P.hours : C.forecastDay(Sim, c.P, "none", c.setup).staff.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(k.labour - hours * P.wage) < 1e-9);
  }
  // on a normal day the forecast roster is plan()'s roster, so labour matches simulateDay's
  const c = C.configure(P), d = Sim.simulateDay(c.P, c.setup, { deterministic: true });
  assert.ok(Math.abs(C.dayCost(Sim, c.P, c.setup, "none").labour - d.cost.labour) < 1e-9);
});

test("counter: the AI layer changes only the crew (normal-day roster vs the day's forecast roster)", () => {
  for (const robots of [[], RAW.storyboard.split_presets.value.heading.robots]) {
    const c = C.configure(P, robots), L = C.aiLayer(Sim, St, P, { day: "large", robots, walkBack, seeds: 3 });
    assert.equal(L.without.staff, C.recommendStaff(Sim, c.P, "none", c.setup));
    assert.equal(L.with.staff, C.recommendStaff(Sim, c.P, "large", c.setup));
    assert.equal(L.without.cost, C.dayCost(Sim, c.P, c.setup, "none").total);
    const N = C.aiLayer(Sim, St, P, { day: "none", robots, walkBack, seeds: 3 });
    assert.deepEqual(N.without, N.with);                       // on a normal day the forecast is the normal roster
  }
});

test("counter: forecastError at zero error is the forecast roster; a lower forecast never adds people", () => {
  const o = { day: "moderate", walkBack: 1, seeds: 2, mode: "brigade", errors: [-0.3, 0, 0.3], price: 6, margin: 0.6 };
  const [lo, mid, hi] = C.forecastError(Sim, St, P, o), F = C.forecastDay(Sim, P, "moderate");
  assert.equal(mid.staff, F.peakStaff);
  assert.equal(mid.labourHours, F.staff.reduce((a, b) => a + b, 0));
  assert.ok(lo.staff <= mid.staff && mid.staff <= hi.staff && lo.labourHours <= hi.labourHours);
  const r = C.compare(Sim, St, P, { ...o, staff: mid.staff });       // same customers as the day's own run
  assert.equal(mid.lostShare, r.lostShare);
  assert.ok(RAW.storyboard.forecast_error_scenarios.value.includes(0));
});

// flexible assistance (mode "assist"): a separate rule from the brigade; crew, robots, customers and times held
const SH = RAW.sharing, AS = { trigger: SH.assist_trigger_cups.value, handoverSec: SH.assist_handover_sec.value };
const shareRun = o => run({ robots: P.mixedMachine, day: SH.crew_day.value, staff: 2, assist: AS, ...o });

test("counter assist: needs its trigger and hand-over cost, never silently defaults", () => {
  assert.throws(() => run({ mode: "assist", staff: 2 }), /assist/);
});

test("counter assist: same customers as fixed responsibilities, and every order is completed, unfinished or walked away", () => {
  for (const perHour of [40, 120, 170]) {
    const f = shareRun({ mode: "fixed", perHour }), a = shareRun({ mode: "assist", perHour });
    assert.equal(a.arrived, f.arrived, `${perHour}/h`);
    for (const r of [f, a]) assert.equal(r.completed + r.unfinished + r.lost, r.arrived, `${r.mode} ${perHour}/h`);
  }
});

test("counter assist: with one person there is no one to help, so it matches fixed responsibilities exactly", () => {
  const f = shareRun({ mode: "fixed", staff: 1, perHour: 120 }), a = shareRun({ mode: "assist", staff: 1, perHour: 120 });
  assert.deepEqual([a.served, a.lost, a.times], [f.served, f.lost, f.times]); assert.equal(a.assisted, 0);
});

test("counter assist: a trigger nobody reaches means no help and the fixed result", () => {
  const f = shareRun({ mode: "fixed", perHour: 150 }), a = shareRun({ mode: "assist", perHour: 150, assist: { ...AS, trigger: 1e6 } });
  assert.equal(a.assisted, 0); assert.deepEqual([a.served, a.lost, a.times], [f.served, f.lost, f.times]);
});

test("counter assist: the hand-over cost is charged (a large one cannot make assisted service faster)", () => {
  const o = { robots: P.mixedMachine, day: SH.crew_day.value, staff: 2, walkBack, seeds: 6, upper: SH.upper_percentile.value, perHour: 160 };
  const cheap = C.shareCompare(Sim, St, P, { ...o, assist: { ...AS, handoverSec: 0 } }).assist;
  const dear = C.shareCompare(Sim, St, P, { ...o, assist: { ...AS, handoverSec: 60 } }).assist;
  assert.ok(dear.median >= cheap.median, `${dear.median} vs ${cheap.median}`);
});

test("counter assist: perHour sets the arrivals; shareCompare holds the crew and its paid hour", () => {
  const o = { robots: P.mixedMachine, day: SH.crew_day.value, walkBack, seeds: 8, upper: SH.upper_percentile.value, assist: AS, perHour: 100 };
  const r = C.shareCompare(Sim, St, P, o);
  assert.ok(Math.abs(r.fixed.arrived - 100) < 12, `${r.fixed.arrived}`);
  assert.equal(r.fixed.staff, r.assist.staff); assert.equal(r.fixed.labour, r.assist.labour);
  assert.equal(r.fixed.labour, r.fixed.staff * P.wage);
});
