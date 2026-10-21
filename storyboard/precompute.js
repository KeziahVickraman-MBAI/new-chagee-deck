// Precomputes the storyboard deck's tables from the simulator and writes one JSON file.
//   node storyboard/precompute.js <out.json>
// The counter slide animates live in the browser (sim/store.js, sim/counter.js); the tables and the
// printed numbers average many seeded runs, which is too slow to redo on every click, so they are made here.

const fs = require("node:fs");
const path = require("node:path");
const Sim = require("../sim/sim.js");
const Store = require("../sim/store.js");
const C = require("../sim/counter.js");
const Site = require("../sim/sitepick.js");
const GEO = require("../sim/sg_geo.json");
const L = require("../sim/ladder.js");
const TIERS = require("../machine_tiers.json");
const B = require("../sim/benefit.js");
const Dec = require("../sim/decisions.js");
const Ext = require("../sim/siteext.js");
const SMod = require("../sim/sitemodel.js");
const NM = require("../sim/newmarket.js");
const PNL = require("../sim/pnl.js");

const RAW = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assumptions.json"), "utf8"));
const P = Sim.params(RAW), SB = RAW.storyboard;
const out = process.argv[2];
if (!out) { console.error("usage: node storyboard/precompute.js <out.json>"); process.exit(1); }

const walkBack = RAW.illustration.walk_back_speed.value;
const seeds = RAW.validation.crossover_stability.value.seeds;
const t0 = Date.now();
const grid = C.grid(Sim, Store, P, { walkBack, seeds, staffRange: SB.staff_choices.value });
// GM slide: for each split and day, the fewest people (forecast roster up) and the better sharing rule
// that keep peak-hour walk-aways within storyboard.walkaway_target; the day's cost with that peak crew.
const target = SB.walkaway_target.value, extra = SB.extra_staff_search.value;
const splits = {};
for (const day of Object.keys(P.surgeMult)) {
  splits[day] = {};
  for (const [key, pr] of Object.entries(C.presets(RAW, P))) {
    const c = C.configure(P, pr.robots), F = C.forecastDay(Sim, c.P, day, c.setup);
    const tried = [];
    let pick = null;
    const staffs = c.setup === "all_machine" ? [0] : Array.from({ length: extra + 1 }, (_, k) => F.peakStaff + k);
    for (const staff of staffs) {
      const modes = c.setup === "all_machine" ? ["brigade"] : ["brigade", "fixed"];
      const rows = modes.map(mode => ({ mode, ...C.compare(Sim, Store, P, { day, robots: pr.robots, staff, mode, walkBack, seeds }) }));
      rows.sort((a, b) => a.lostShare - b.lostShare || a.medianWait - b.medianWait);
      tried.push(...rows.map(r => ({ staff, mode: r.mode, lostShare: r.lostShare, medianWait: r.medianWait })));
      if (rows[0].lostShare <= target + 1e-12) { pick = { staff, ...rows[0] }; break; }
    }
    const cost = C.dayCost(Sim, c.P, c.setup, day, pick ? pick.staff : undefined);
    splits[day][key] = { label: pr.label, robots: c.robots, setup: c.setup, forecastStaff: F.peakStaff, tried,
      meets: !!pick, staff: pick ? pick.staff : null, mode: pick ? pick.mode : null,
      lostShare: pick ? pick.lostShare : null, medianWait: pick ? pick.medianWait : null, cost };
  }
  const ok = Object.entries(splits[day]).filter(([, v]) => v.meets);
  splits[day]._cheapest = ok.length ? ok.reduce((a, b) => (b[1].cost.total < a[1].cost.total ? b : a))[0] : null;
  splits[day]._fastest = ok.length ? ok.reduce((a, b) => (b[1].medianWait < a[1].medianWait ? b : a))[0] : null;
}

// slides 06 and 07, the AI layer alone: for each day, split and sharing rule, the normal-day roster against the
// day's forecast roster, same robots and customers (counter.aiLayer). The browser reads this; custom splits run live.
const aiPresets = { ...C.presets(RAW, P), single: { robots: TIERS.tiers.find(t => t.id === "single").replaces } };
const aiLayer = {};
for (const day of Object.keys(P.surgeMult)) {
  aiLayer[day] = {};
  for (const [key, pr] of Object.entries(aiPresets)) {
    const rules = C.configure(P, pr.robots).setup === "all_machine" ? [["brigade", {}]] : C.MODES;
    aiLayer[day][key] = Object.fromEntries(rules.map(([rule, extra]) =>
      [rule, C.aiLayer(Sim, Store, P, { day, robots: pr.robots, walkBack, seeds, mode: "brigade", ...extra })]));
  }
}

// slide 05: the new-store forecast at the slider defaults
const SM = Site.model(Sim, RAW, GEO), top = SM.candidates[0];
const hubOf = pt => RAW.sitepick.hubs.value.reduce((a, h) => (Math.hypot(h.x - pt.x, h.y - pt.y) < Math.hypot(a.x - pt.x, a.y - pt.y) ? h : a)).name;
const order = SM.storeCups.map((c, j) => [c, j]).sort((a, b) => a[0] - b[0]), mid = GEO.outlets[order[Math.floor(order.length / 2)][1]];
const site = { top: { x: top.x, y: top.y, hub: hubOf(top), ...top.f }, nextDoor: Site.forecast(SM, { x: mid[0] + 3, y: mid[1] }),
               clusters: SM.clusters.length, unmetShare: SM.unmet.filter(Boolean).length / SM.ev.length };
// the same store placed without AI: beside the existing outlet nearest the top site (slide 05's comparison)
const bj = GEO.outlets.map(([x, y], k) => [Math.hypot(x - top.x, y - top.y), k]).sort((a, b) => a[0] - b[0])[0][1];
site.besideTop = { j: bj, km: Math.hypot(GEO.outlets[bj][0] - top.x, GEO.outlets[bj][1] - top.y) * SM.kmpx,
                   ...Site.forecast(SM, { x: GEO.outlets[bj][0] + 3, y: GEO.outlets[bj][1] }) };

// slide 05's P&L view at the defaults: the top site (with AI) against the same store beside its nearest outlet (without)
const pnlE = PNL.inputs(RAW, P), pnlSites = { wo: { sells: site.besideTop.cups, moved: site.besideTop.cannibal }, wi: { sells: top.f.cups, moved: top.f.cannibal } };
const pnl = { sites: pnlSites, net: { wo: site.besideTop.netNew, wi: top.f.netNew }, ...PNL.compare({ Sim, C, P }, pnlE, pnlSites.wo, pnlSites.wi) };

// slide 08: the machine ladder at the default outlet, and the volume bands across the per-outlet range
const ladderAt = { cupsDay: Math.round(Sim.dailyBase(P)), wage: P.wage, unitMonth: P.machineMonth };
const ladder = { at: ladderAt, rungs: L.evaluate(Sim, C, RAW, P, TIERS, ladderAt), volumes: L.volumes(Sim, C, RAW, P, TIERS, ladderAt) };

// slide 10: the benefit, one outlet; simulation runs only (money is worked out from them, here and in the browser)
const bRobots = TIERS.tiers.find(t => t.id === "single").replaces, bo = { walkBack, seeds, extra: SB.extra_staff_search.value };
const [vLo, vHi] = RAW.store.cups_per_store_per_year.range;
const bP = { base: P, volLo: { ...P, cupsYear: vLo }, volHi: { ...P, cupsYear: vHi },
             fragile: { ...P, minStaff: { ...P.minStaff, all_human: P.minStaff.mixed } } };   // fragility: no extra by-hand minimum
const bR = { base: B.runs(Sim, Store, C, bP.base, { ...bo, robots: bRobots }), volLo: B.runs(Sim, Store, C, bP.volLo, { ...bo, robots: bRobots }),
             volHi: B.runs(Sim, Store, C, bP.volHi, { ...bo, robots: bRobots }), fragile: B.runs(Sim, Store, C, bP.fragile, { ...bo, robots: bRobots }),
             today: B.runs(Sim, Store, C, P, { ...bo, robots: [...P.mixedMachine] }) };
const benefit = { robots: bRobots, cups: Math.round(Sim.dailyBase(P)), volCups: [vLo, vHi].map(x => Math.round(x / P.days)),
                  runs: bR, P: Object.fromEntries(Object.entries(bP).map(([k, p]) => [k, { cupsYear: p.cupsYear, minStaff: p.minStaff }])),
                  summary: B.summary(bR, bP, RAW, B.econ(RAW, P)) };

// slide 08: the GM's four decisions (storyboard/check_decisions.js recomputes them on every build)
const decisions = Dec.decide({ Sim, Store, C, Site, B, RAW, P, GEO, TIERS },
  { target, extra, walkBack, seeds, shareDay: SB.day_type_default.value });

// slides 08 and 09, the extension: Jin's site-selection framework on the slide 05 engine (illustrative)
const siteExt = Ext.evaluate({ Sim, C, Site, RAW, P, GEO, TIERS });
benefit.econ = B.econ(RAW, P);                                  // what the build compares slide 09's inputs against
// slide 08b: the supervised model on the synthetic outlets; leave-one-out with every input and with the new-market inputs
const smD = SMod.dataset(Sim, RAW, GEO, Site), smAll = SMod.FEATURES.map(f => f.key), smNM = RAW.site_ext.new_market_inputs.value;
const siteModel = { ...smD, all: SMod.loo(smD.rows, smAll, smD.lambda), newMarket: SMod.loo(smD.rows, smNM, smD.lambda), none: SMod.loo(smD.rows, [], smD.lambda) };
const smCity = SMod.city(Sim, RAW, GEO, Site);
siteModel.city = { width_km: smCity.width_km, height_km: smCity.height_km, grid_km: smCity.grid_km, towns: smCity.towns, dots: smCity.dots.map(d => [+d.x.toFixed(3), +d.y.toFixed(3)]),
                   grid: SMod.cityGrid(smCity, RAW, smD.cap), stores_default: smCity.stores_default, stores_max: smCity.stores_max };

// slides 8A-8D, the new-market worked example (Australia, A$, scenario assumptions): kept apart from every result above
const nmDeps = { Sim, Store, C, RAW, P }, nmR = NM.runs(nmDeps, seeds), nmE = NM.econ(RAW), nmW = NM.dayWeights(RAW, P);
const nmScore = NM.score(RAW), nmSens = NM.sensitivity(RAW), nmPilot = nmScore[0].id;
const nmRent = RAW.new_market.areas.value.find(a => a.id === nmPilot).rent_month;
const newMarket = { runs: nmR, score: nmScore, sensitivity: nmSens, pilot: nmPilot, cannibal: NM.cannibal(RAW, nmPilot), dayWeights: nmW,
  breakEven: Object.fromEntries(RAW.new_market.setups.value.map(k => [k, NM.breakEven(nmDeps, nmE, nmRent, k)])),
  worst: NM.worst(nmR, nmE, nmRent, nmW, P.days), flipMachine: NM.flipMachine(nmR, nmE, nmRent, nmW, P.days),
  flipWage: NM.flipWage(nmR, nmE, nmRent, nmW, P.days, RAW.new_market.wage_per_hour.range) };
// the figures slides 8B-8D quote: realised base demand on an event day (the printed state of slide 8C)
{
  const nmDay = SB.day_type_default.value, q = { day: nmDay, setups: {} };
  for (const [k, s] of Object.entries(nmR.setups)) {
    const at = s.at.base[nmDay], m = r => NM.money(r, nmE, nmRent, s.units, P.days).contribution;
    q.setups[k] = { units: s.units, without: { ...at.without, contribution: m(at.without) },
      ai: Object.fromEntries(Object.entries(at.ai).map(([e, r]) => [e, { ...r, contribution: m(r) }])),
      year: Object.fromEntries(Object.entries(s.at).map(([n, a]) => [n, NM.yearAvg(nmW, d => m(a[d].ai["0"]))])) };
  }
  const w = newMarket.worst; q.robust = Object.keys(w).reduce((a, b) => (w[b] > w[a] ? b : a));
  // the next opening after the pilot: each other area's score is unchanged, its cups lose the cannibalised share
  q.next = nmScore.filter(o => o.id !== nmPilot).map(o => ({ id: o.id, score: o.score, cannibal: newMarket.cannibal[o.id] }));
  newMarket.quote = q;
}

const pl = Sim.plan(P, "mixed");
const data = {
  generated: new Date().toISOString(), seeds,
  grid, splits, aiLayer, newMarket, pnl, site, ladder, benefit, decisions, siteExt, siteModel,
  counter: {
    peakHour: C.peakHour(P), firstHour: 10, cupsPerDay: Sim.dailyBase(P),
    perWorkerHour: pl.perWorker * 60, handSeconds: pl.W,
    machineStations: P.mixedMachine, handStations: P.stations.filter(s => !P.mixedMachine.includes(s)),
  },
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(data));
console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
