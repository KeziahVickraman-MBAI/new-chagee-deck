// node --test sim/benefit.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js"), Store = require("./store.js"), C = require("./counter.js"), B = require("./benefit.js");
const RAW = require("../assumptions.json"), TI = require("../machine_tiers.json");
const P = Sim.params(RAW), robots = TI.tiers.find(t => t.id === "single").replaces;
const R = B.runs(Sim, Store, C, P, { robots, walkBack: RAW.illustration.walk_back_speed.value, seeds: 3 });
const e = B.econ(RAW, P), V = B.value(R, P, e);

test("benefit: the counterfactual is all by hand on the flat normal-day crew, every day", () => {
  const flat = R.days.none.cf.staff;
  for (const row of Object.values(R.days)) { assert.equal(row.cf.staff, flat); assert.equal(row.b.staff, row.b.staff); }
  assert.equal(R.days.none.a.staff, flat);                           // on a normal day the forecast crew is the flat crew
});

test("benefit: profit = orders x price x margin + labour saved - machine; revenue never includes labour", () => {
  for (const day of Object.values(V.per)) for (const x of Object.values(day)) {
    assert.ok(Math.abs(x.revenue - x.orders * e.price) < 1e-9);
    assert.ok(Math.abs(x.profit - (x.revenue * e.margin + x.labour - x.machine)) < 1e-9);
  }
});

test("benefit: a year = days of each type x the per-day figure; normal days are the rest of the open days", () => {
  assert.equal(V.daysUsed.normal, P.days - e.days.busy - e.days.event);
  const y = Object.entries(V.per).reduce((s, [d, v]) => s + V.daysUsed[d] * v.ab.revenue, 0);
  assert.ok(Math.abs(y - V.year.ab.revenue) < 1e-6);
});

test("benefit: the yearly figures move with the days-a-year input and nothing else", () => {
  const W = B.value(R, P, { ...e, days: { busy: 0, event: 0 } });
  assert.ok(Math.abs(W.year.a.orders - P.days * V.per.normal.a.orders) < 1e-9);
  assert.deepEqual(W.per, V.per);
});
