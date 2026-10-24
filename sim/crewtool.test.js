// Tests for crewtool.js (slides 06 to 08: the outlet manager's bottleneck tool). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const T = require("./crewtool.js");
const RAW = require("../assumptions.json");
const E = T.inputs(RAW, Sim);
const D = E.demand.value, id = k => E.stations[k].id;

test("crewtool: an allocation gives each person at most one other step, one they are trained for", () => {
  assert.throws(() => T.check(E, { ana: ["topping_finish", "handover"] }), /one step at a time/);
  assert.throws(() => T.check(E, { cai: "topping_finish" }), /not trained/);
  assert.throws(() => T.check(E, { ana: "shake_seal" }), /not a hand step/);
  assert.throws(() => T.check(E, { ben: "topping_finish" }), /already works/);
  assert.deepEqual(T.check(E, { ana: "topping_finish", cai: null }), { ana: E.finish });
});

test("crewtool: every allocation compared faces the same drinks", () => {
  const a = T.simulate(E, Sim, { perHour: D, alloc: {}, seed: 3 }), b = T.simulate(E, Sim, { perHour: D, alloc: { ana: "topping_finish" }, seed: 3 });
  assert.equal(a.arrived, b.arrived);
  for (const r of [a, b]) {
    assert.equal(r.times.length, r.arrived);                     // every drink ordered in the window is followed until ready
    r.crew.forEach(c => assert.ok(c.work + c.moving <= 1 + 1e-9));
  }
  assert.ok(b.crew[0].moves >= 2 && b.crew[0].away > 0);         // the helper walks there and back and works away from home
  assert.equal(a.crew[0].moves, 0);
});

test("crewtool: the constraint is the step short of capacity, not the longest list", () => {
  const p = T.project(E, { perHour: D, alloc: {} });
  assert.equal(id(p.longest), "ticket");
  assert.equal(id(p.con), "topping_finish");
  assert.ok(p.st[p.con].rho > 1 && p.st[p.longest].rho < 1);
});

test("crewtool: the rules keep, move or escalate", () => {
  const r = T.recommend(E, { perHour: D });
  assert.equal(r.kind, "move");
  assert.deepEqual([r.best.worker, r.best.to], ["ana", "topping_finish"]);
  assert.equal(T.recommend(E, { perHour: E.demand.range[0] }).kind, "keep");
  const hi = T.recommend(E, { perHour: E.demand.range[1] });
  assert.equal(hi.kind, "escalate"); assert.equal(hi.cause, "crew");
  const sl = T.recommend(E, { perHour: D, slow: true });
  assert.equal(sl.kind, "escalate"); assert.equal(sl.cause, "equipment"); assert.equal(sl.conId, E.stations[E.equipment.k].id);
  assert.ok(r.options.some(o => o.worker === "cai" && o.to === "topping_finish" && o.why === "untrained"));
});

test("crewtool: the comparison is the simulation's, not the recommendation's", () => {
  const c = T.compare(E, Sim, { perHour: D, alloc: { ana: "topping_finish" }, seeds: 8 });
  assert.ok(c.tried.median < c.current.median && c.tried.completed > c.current.completed);
  // with the sealer slow, helping at finishing adds nothing: the sealer sets the pace for both
  const s = T.compare(E, Sim, { perHour: D, slow: true, alloc: { ana: "topping_finish" }, seeds: 8 });
  assert.ok(Math.abs(s.tried.completed - s.current.completed) < 1);
  assert.ok(s.current.median > c.current.median);
});
