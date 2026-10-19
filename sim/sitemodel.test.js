// node --test sim/sitemodel.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js"), Site = require("./sitepick.js"), GEO = require("./sg_geo.json"), RAW = require("../assumptions.json");
const SM = require("./sitemodel.js");

test("sitemodel: ridge recovers a linear rule and no inputs gives the mean", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ f: { a: i, b: (i * 7) % 11 }, y: 100 + 5 * i - 3 * ((i * 7) % 11) }));
  const m = SM.fit(rows, ["a", "b"], 1e-9);
  assert.ok(Math.abs(m.predict({ a: 40, b: 2 }) - (100 + 200 - 6)) < 1e-6);
  const mean = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  assert.ok(Math.abs(SM.fit(rows, [], 1).predict({}) - mean) < 1e-9);
});

test("sitemodel: leave-one-out never sees the held-out outlet", () => {
  const rows = [{ f: { a: 0 }, y: 0 }, { f: { a: 1 }, y: 10 }, { f: { a: 2 }, y: 1000 }];
  const L = SM.loo(rows, ["a"], 1e-9);
  assert.ok(Math.abs(L.pred[2] - 20) < 1e-6);                     // fitted on the first two only
});

test("sitemodel: on the synthetic outlets, all inputs beat the new-market inputs, which beat the mean", () => {
  const D = SM.dataset(Sim, RAW, GEO, Site), all = SM.FEATURES.map(x => x.key), nm = RAW.site_ext.new_market_inputs.value;
  assert.equal(D.rows.length, GEO.outlets.length);
  const a = SM.loo(D.rows, all, D.lambda), b = SM.loo(D.rows, nm, D.lambda), c = SM.loo(D.rows, [], D.lambda);
  assert.ok(a.r2 > b.r2 && b.r2 > c.r2 && a.mae < b.mae && b.mae < c.mae);
  assert.ok(D.pins.A && D.pins.D && D.pins.D.own >= 1);
});

test("sitemodel: the new city has no Chagee history, and the picks are the best spots at least the ring apart", () => {
  const D = SM.dataset(Sim, RAW, GEO, Site), ct = SM.city(Sim, RAW, GEO, Site), g = SM.cityGrid(ct, RAW, D.cap);
  assert.ok(g.every(c => c.f.unmet === 0 && c.f.own === 0 && c.f.nearKm === D.cap));
  const m = SM.fit(D.rows, RAW.site_ext.new_market_inputs.value, D.lambda), k = RAW.site_ext.ring_km.value, P = SM.pick(g, m.predict, 4, k);
  assert.equal(P.picks.length, 4);
  assert.equal(P.picks[0].cups, P.scored[0].cups);
  P.picks.forEach((a, i) => P.picks.slice(i + 1).forEach(b => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= k)));
  assert.ok(ct.towns.every(t => g.some(c => Math.hypot(c.x - t.x, c.y - t.y) < 1)));
});
