// node --test sim/siteext.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const deps = { Sim: require("./sim.js"), C: require("./counter.js"), Site: require("./sitepick.js"),
  RAW: require("../assumptions.json"), GEO: require("./sg_geo.json"), TIERS: require("../machine_tiers.json") };
const B = require("./benefit.js");
const { evaluate } = require("./siteext.js");
deps.P = deps.Sim.params(deps.RAW);

test("siteext: cups a day, price and margin are the benefit slide's inputs", () => {
  const X = evaluate(deps), e = B.econ(deps.RAW, deps.P);
  assert.equal(X.price, e.price);
  assert.equal(X.margin, e.margin);
  assert.equal(Math.round(X.cups.base), Math.round(deps.Sim.dailyBase(deps.P)));
});

test("siteext: net profit adds up and the recommendation follows the rule", () => {
  const X = evaluate(deps), m = X.month;
  assert.ok(Math.abs(m.contribution - m.moved - m.delivery - m.counter - m.rent - m.utilities - m.net) < 1e-6);
  assert.ok(X.net.lo < X.net.base && X.net.base < X.net.hi);
  const want = X.net.base <= 0 ? "skip" : X.net.lo > 0 ? "open" : "pilot";
  assert.equal(X.rec, want);
  if (X.payback) assert.ok(X.payback.lo < X.payback.base && X.payback.base < X.payback.hi);
});

test("siteext: the pin is slide 05's top cluster; moving cups from neighbours lowers net profit", () => {
  const X = evaluate(deps), M = deps.Site.model(deps.Sim, deps.RAW, deps.GEO);
  assert.equal(X.pin.x, M.candidates[0].x);
  assert.ok(X.share > 0 && X.share < 1);
  if (X.contrast) assert.ok(X.contrast.share > X.share && X.contrast.net.base < X.net.base);
});

test("siteext: higher rent lowers net profit one for one", () => {
  const RAW = JSON.parse(JSON.stringify(deps.RAW)); RAW.site_ext.rent_per_month.value += 1000;
  const a = evaluate(deps), b = evaluate({ ...deps, RAW });
  assert.ok(Math.abs(a.net.base - b.net.base - 1000) < 1e-6);
});
