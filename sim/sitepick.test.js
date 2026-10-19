// Tests for sitepick.js (slide 05 new-store forecast). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const T = require("./sitepick.js");
const RAW = require("../assumptions.json");
const geo = require("./sg_geo.json");
const M = T.model(Sim, RAW, geo);

test("site: the map has the 44 outlets the facts give, and every dot is on land", () => {
  assert.equal(geo.outlets.length, RAW.facts.sg_outlets.value);
  const land = (x, y) => geo.land[Math.floor(y / geo.cell)]?.[Math.floor(x / geo.cell)] === "1";
  assert.equal(M.ev.length, RAW.sitepick.events.value);
  assert.ok(M.ev.every(e => land(e.x, e.y)));
});

test("site: the dots are the same on every run (seeded)", () => {
  const a = T.events(Sim, RAW, geo), b = T.events(Sim, RAW, geo);
  assert.deepEqual(a.slice(0, 50), b.slice(0, 50));
});

test("site: calibration - the average outlet sells the deck's cups per day", () => {
  const mean = M.storeCups.reduce((a, b) => a + b, 0) / M.storeCups.length;
  assert.ok(Math.abs(mean - RAW.store.cups_per_store_per_year.value / RAW.store.open_days_per_year.value) < 1e-6);
});

test("site: DBSCAN finds two dense groups and leaves the lone point as noise", () => {
  const g = (x, y) => Array.from({ length: 10 }, (_, k) => ({ x: x + (k % 4), y: y + Math.floor(k / 4) }));
  const pts = [...g(0, 0), ...g(100, 100), { x: 50, y: 50 }];
  const lab = T.dbscan(pts, 2, 4);
  assert.equal(new Set(lab.slice(0, 10)).size, 1); assert.equal(new Set(lab.slice(10, 20)).size, 1);
  assert.notEqual(lab[0], lab[10]); assert.equal(lab[20], -1);
});

test("site: 'no store nearby' dots are exactly those beyond the walking distance", () => {
  const walkPx = M.walkKm / M.kmpx;
  M.ev.forEach((e, i) => {
    const d = Math.min(...geo.outlets.map(([x, y]) => Math.hypot(e.x - x, e.y - y)));
    assert.equal(M.unmet[i], d > walkPx);
  });
});

test("site: a new pin's cups = net new + cannibalised, and existing outlets only lose", () => {
  for (const pin of [M.candidates[0], { x: geo.outlets[5][0] + 3, y: geo.outlets[5][1] }]) {
    const f = T.forecast(M, pin);
    assert.ok(Math.abs(f.cups - f.netNew - f.cannibal) < 1e-6);
    assert.ok(f.netNew > 0 && f.cannibal >= 0 && f.hit.every(h => h.cups > 0));
    assert.ok(Math.abs(f.hit.reduce((a, h) => a + h.cups, 0) - f.cannibal) < 0.5 * f.hit.length + 1);
  }
  // next to an existing outlet, much more is cannibalised than at the top suggested pin
  const nextDoor = T.forecast(M, { x: geo.outlets[5][0] + 3, y: geo.outlets[5][1] });
  assert.ok(nextDoor.cannibal / nextDoor.cups > M.candidates[0].f.cannibal / M.candidates[0].f.cups);
});

test("site: a pin far out at sea sells next to nothing", () => {
  assert.ok(T.forecast(M, { x: 1650, y: 30 }).cups < 5);
});

test("site: suggested pins are ranked by net new cups; a wider walk leaves less unmet demand", () => {
  const n = M.candidates.map(c => c.f.netNew);
  assert.deepEqual(n, [...n].sort((a, b) => b - a));
  const far = T.model(Sim, RAW, geo, { walkKm: RAW.sitepick.walk_km.range[1] });
  assert.ok(far.unmet.filter(Boolean).length < M.unmet.filter(Boolean).length);
});

test("site: a store opened beside an outlet takes the most from that outlet", () => {
  // an outlet on its own loses far more than anyone else; where outlets bunch, it is still in the top two
  for (const j of [0, 23]) {
    const [x, y] = geo.outlets[j], f = T.forecast(M, { x, y });
    assert.equal(f.hit[0].j, j, `outlet ${geo.numbers[j]}: biggest loss at ${geo.numbers[f.hit[0].j]}`);
    assert.ok(f.hit[0].cups > 2 * (f.hit[1]?.cups || 0));
  }
  geo.outlets.forEach(([x, y], j) => {
    const f = T.forecast(M, { x, y });
    assert.ok(f.hit.slice(0, 2).some(h => h.j === j), `outlet ${geo.numbers[j]}`);
  });
  assert.equal(geo.numbers.length, 44); assert.equal(geo.names[geo.numbers.indexOf(44)], "The Star Vista");
});
