// node --test sim/decisions.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const deps = { Sim: require("./sim.js"), Store: require("./store.js"), C: require("./counter.js"), Site: require("./sitepick.js"),
  B: require("./benefit.js"), RAW: require("../assumptions.json"), GEO: require("./sg_geo.json"), TIERS: require("../machine_tiers.json") };
const { decide } = require("./decisions.js");
const R = deps.RAW, o = { target: R.storyboard.walkaway_target.value, extra: R.storyboard.extra_staff_search.value,
  walkBack: R.illustration.walk_back_speed.value, seeds: 5, shareDay: R.storyboard.day_type_default.value };

test("decisions: at the assumed machine cost all four hold; below the break-even, decision 2 fails", () => {
  const P = deps.Sim.params(R), D = decide({ ...deps, P }, o);
  assert.ok(D.where.holds && D.automate.holds && D.roster.holds && D.share.holds);
  assert.ok(D.automate.breakEvenMax > 0 && D.automate.breakEvenMax < P.machineMonth);
  const lo = decide({ ...deps, P: { ...P, machineMonth: D.automate.breakEvenMax * 0.8 } }, o);
  assert.equal(lo.automate.holds, false);                      // the check would stop the build
});
