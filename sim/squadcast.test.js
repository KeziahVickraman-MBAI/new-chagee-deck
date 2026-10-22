// Tests for squadcast.js (slide 06b, synthetic forecast demonstration). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const Q = require("./squadcast.js");
const RAW = require("../assumptions.json");
const P = Sim.params(RAW), E = Q.inputs(RAW, P), H = Q.learn(E, Sim);

test("squadcast: the calendar baseline is the deck's own peak half-hour", () => {
  const h = P.share.indexOf(Math.max(...P.share));
  assert.ok(Math.abs(E.base - P.cupsYear / P.days * P.share[h] / 2) < 1e-9);
});

test("squadcast: actual cups = non-squad cups + confirmed members + redeemed gifts; invites and unredeemed gifts never count", () => {
  for (let s = 0; s < 30; s++) {
    const w = Q.simulate(E, s, Sim);
    const counted = w.events.filter(e => e.kind === "confirm" || e.kind === "redeem").length;
    assert.equal(w.actual, w.other + counted);
    assert.equal(w.squad, counted);
  }
});

test("squadcast: confirmed cups are counted once; the forecast uses only signals up to its time", () => {
  for (let s = 0; s < 30; s++) {
    const w = Q.simulate(E, s, Sim);
    for (const t of [-90, -45, -10]) {
      const f = Q.forecast(E, H, w, t), seen = w.events.filter(e => e.t <= t);
      assert.equal(f.confirmed, seen.filter(e => e.kind === "confirm" || e.kind === "redeem").length);
      assert.ok(Math.abs(f.enhanced - (f.nonSquad + f.confirmed + f.predicted)) < 1e-9);
      // removing every later signal leaves this forecast unchanged
      const cut = { ...w, events: seen };
      assert.ok(Math.abs(Q.forecast(E, H, cut, t).enhanced - f.enhanced) < 1e-9);
    }
  }
});

test("squadcast: with no squad share there are no squad signals and the enhanced forecast is the baseline", () => {
  const E0 = { ...E, s: 0 }, H0 = Q.learn(E0, Sim), w = Q.simulate(E0, 7, Sim);
  assert.equal(w.events.length, 0);
  assert.ok(Math.abs(Q.forecast(E0, H0, w, -30).enhanced - E0.base) < 1e-9);
});

test("squadcast: learned chances are shares between 0 and 1, from synthetic history only", () => {
  for (const arr of [H.pc, H.pr]) arr.forEach(x => assert.ok(x >= 0 && x <= 1));
  assert.equal(H.grid[0], -E.lead);
});
