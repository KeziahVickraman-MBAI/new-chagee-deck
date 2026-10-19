// Recomputes the GM's four decisions (slide 08) from the simulator and fails if any stops holding.
//   node storyboard/check_decisions.js [data.json]
// Run by build_storyboard.py on every build. It never compares stored strings: each decision is rebuilt from
// sim/ and assumptions.json, and, if a data.json is given, its figures must match the recomputed ones.
const fs = require("node:fs");
const path = require("node:path");
const deps = {
  Sim: require("../sim/sim.js"), Store: require("../sim/store.js"), C: require("../sim/counter.js"),
  Site: require("../sim/sitepick.js"), B: require("../sim/benefit.js"),
  RAW: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assumptions.json"), "utf8")),
  GEO: require("../sim/sg_geo.json"), TIERS: require("../machine_tiers.json"),
};
const { decide } = require("../sim/decisions.js");
deps.P = deps.Sim.params(deps.RAW);
const R = deps.RAW, o = { target: R.storyboard.walkaway_target.value, extra: R.storyboard.extra_staff_search.value,
  walkBack: R.illustration.walk_back_speed.value, seeds: R.validation.crossover_stability.value.seeds, shareDay: R.storyboard.day_type_default.value };
const D = decide(deps, o), fail = [];
if (!D.where.holds) fail.push("1 where to open: the app-search site no longer adds more cups than a store beside the nearest outlet");
if (!D.automate.holds) fail.push("2 what to automate: one tea-and-milk machine is no longer the cheapest on every day type, or its break-even machine cost is not below the assumed cost");
if (!D.roster.holds) fail.push("3 how many people: the economic rule no longer adds a person on event days only");
if (!D.share.holds) fail.push("4 how to share: the brigade no longer loses fewer orders than fixed posts at the event-day forecast crew");
const file = process.argv[2];
if (file && fs.existsSync(file)) {
  const S = JSON.parse(fs.readFileSync(file, "utf8")).decisions, near = (a, b) => Math.abs(a - b) < 1e-6;
  if (!S || !near(S.automate.breakEvenMax, D.automate.breakEvenMax) || !near(S.where.topNet, D.where.topNet) || S.roster.event !== D.roster.event)
    fail.push("data.json decisions differ from a fresh run of sim/: re-run storyboard/precompute.js");
}
if (fail.length) { console.error("check_decisions: FAILED\n  " + fail.join("\n  ")); process.exit(1); }
console.log("check_decisions: all four GM decisions hold");
