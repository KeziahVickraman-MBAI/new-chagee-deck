// Tests for newmarket.js (slides 8A-8D). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const Store = require("./store.js");
const C = require("./counter.js");
const N = require("./newmarket.js");
const RAW = require("../assumptions.json");
const P = Sim.params(RAW), deps = { Sim, Store, C, RAW, P };

test("newmarket: no feature in the profile needs existing Chagee activity", () => {
  const keys = N.areas(RAW).features.map(f => f.key);
  for (const k of ["unmet", "own", "nearKm", "area"]) assert.ok(!keys.includes(k), k);
  for (const a of N.areas(RAW).areas) for (const k of keys) assert.ok(Number.isFinite(a[k]), `${a.id} ${k}`);
});

test("newmarket: scores are 0-100, ranked, and a zero weight drops a feature", () => {
  const s = N.score(RAW);
  assert.deepEqual(s.map(o => o.rank), s.map((_, i) => i + 1));
  s.forEach(o => assert.ok(o.score >= 0 && o.score <= 100));
  const W = RAW.new_market.weights.value, only = Object.fromEntries(Object.keys(W).map(k => [k, k === "workers_k" ? 1 : 0]));
  const top = N.areas(RAW).areas.reduce((a, b) => (b.workers_k > a.workers_k ? b : a));
  assert.equal(N.score(RAW, only)[0].id, top.id);
});

test("newmarket: first opening has no cannibalisation; a second one only within the overlap distance", () => {
  Object.values(N.cannibal(RAW, null)).forEach(v => assert.equal(v, 0));
  const c = N.cannibal(RAW, "A"), O = RAW.new_market.cannibalisation.value;
  for (const a of RAW.new_market.areas.value) if (a.id !== "A") {
    const d = Math.hypot(a.x_km, a.y_km);
    assert.ok(d >= O.overlap_km ? c[a.id] === 0 : c[a.id] > 0, a.id);
  }
});

test("newmarket: staffing is the only change between without and with AI; equipment is the base plan", () => {
  for (const key of RAW.new_market.setups.value) {
    const S = N.setupOf(deps, key), D = N.demand(RAW, P);
    const c = C.configure({ ...P, cupsYear: D.base * P.days }, RAW.storyboard.split_presets.value[key].robots);
    assert.equal(S.units, Sim.plan(c.P, c.setup).machineUnits);
    assert.equal(S.planned, C.forecastDay(Sim, c.P, "none", c.setup).peakStaff);
    // a forecast that is exact on a normal day at the planned volume puts on the planned crew
    assert.equal(S.rosterDay(D.base, "none").peakStaff, S.planned);
  }
});

test("newmarket: break-even contribution is zero at the break-even cups (without AI, fixed crew)", () => {
  const E = N.econ(RAW), rent = RAW.new_market.areas.value[0].rent_month;
  for (const key of RAW.new_market.setups.value) {
    const b = N.breakEven(deps, E, rent, key), S = N.setupOf(deps, key);
    const r = { dayCups: b.withoutAI, busyCups: 0, lostShare: 0, labourHours: S.planned * P.hours };
    assert.ok(Math.abs(N.money(r, E, rent, S.units, P.days).contribution) < 1e-6);
    assert.ok(b.withAI > 0);
  }
});
