// Tests for online.js (slides 03 to 07: the online retailing business case). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const O = require("./online.js");
const RAW = require("../assumptions.json");
const E = O.inputs(RAW);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("online: the deck's outlets, cups, price and margin, not the brief's", () => {
  assert.equal(E.outlets, RAW.facts.sg_outlets.value);
  close(O.annual(E).revenue, E.outlets * E.cupsPerOutlet * E.price);
  close(E.appShare + E.delShare + E.gpShare + E.adShare, 1);
});

test("online: the discount is paid on every redeemed order, incremental or not", () => {
  const a = O.annual(E).i2;
  close(a.discountCost, a.redeemed * E.discount);
  close(a.contrib, a.incremental * E.contrib - a.redeemed * E.discount);
  // at the break-even incremental share, offers add nothing
  const E2 = { ...E, incShare: { base: a.breakEvenInc } };
  close(O.annual(E2).i2.contrib, 0);
});

test("online: moving an order to app pickup moves its revenue, it does not add it", () => {
  const a = O.annual(E);
  close(a.sales, a.i1.sales + a.i2.sales);
  close(a.i3.delivery.shiftedRevenue, a.i3.delivery.moved * E.price);
  close(a.i3.delivery.perOrder, E.price * (E.comm - E.pay) - E.reward);
  close(a.i3.grabPickup.perOrder, E.price * (E.gpComm - E.pay) - E.reward);
});

test("online: rerouting counts only Chagee-app orders at peak", () => {
  const a = O.annual(E);
  close(a.i1.eligible, a.cups * E.appShare * E.peakShare);
  close(a.i1.contrib, a.i1.eligible * E.retained.base * E.contrib);
});

test("online: operating result = gross contribution less the run team and cloud", () => {
  const a = O.annual(E);
  close(a.operating, a.gross - E.runTeam * E.personMonth * 12 - E.outlets * E.cloudPerStoreMonth * 12);
  assert.ok(O.annual(E, "low").gross < a.gross && a.gross < O.annual(E, "high").gross);
});

test("online: cash flow is zero benefit in build, the pilot share in pilot, full after scale-up", () => {
  const [b, p, s] = E.roadmap;
  assert.equal(O.share(E, b.to), 0); close(O.share(E, p.to), E.pilot / E.outlets); close(O.share(E, s.to), 1);
  const c = O.cashflow(E);
  close(c.rows.reduce((a, r) => a + r.net, 0), c.end);
  close(c.rows.slice(0, b.to).reduce((a, r) => a + r.integ, 0), E.integration);
  if (c.payback != null) assert.ok(c.rows[c.payback - 1].cum >= 0 && c.rows[c.payback - 2].cum < 0);
});

test("online: the brief's own arithmetic is rebuilt from its inputs", () => {
  const b = O.brief(E), B = E.briefIn;
  assert.ok(Math.abs(b.rerouting - B.sales.rerouting) < 1000);
  assert.ok(Math.abs(b.pickupSaving - B.profit.pickup) < 1000);
  close(b.pricingProfit, B.profit.pricing);
});
