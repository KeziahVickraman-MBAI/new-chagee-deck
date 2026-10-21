// Tests for pnl.js (slide 05's P&L view). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const C = require("./counter.js");
const N = require("./pnl.js");
const RAW = require("../assumptions.json");
const P = Sim.params(RAW), deps = { Sim, C, P }, E = N.inputs(RAW, P);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("pnl: revenue is cups x days x price, net of the displaced cups", () => {
  const r = N.project(deps, E, { sells: 800, moved: 200 }, false).years[1];
  close(r.revNew, 800 * E.days * E.price); close(r.revMoved, 200 * E.days * E.price); close(r.netRev, 600 * E.days * E.price);
});

test("pnl: the bridge adds up, and neighbours lose contribution, not their rent or staff", () => {
  const r = N.project(deps, E, { sells: 800, moved: 200 }, true).years[2];
  close(r.lostContrib, r.revMoved * (E.margin - E.delShare * E.commission));
  close(r.netRev - r.cogs - r.delivery - r.labour - r.machine - r.rent - r.utilities - r.maint + (r.revMoved - r.lostContrib) - r.aiRec, r.opProfit);
});

test("pnl: only the AI scenario carries AI costs; equipment and fixed costs are the same at both sites", () => {
  const a = N.project(deps, E, { sells: 700, moved: 300 }, false), b = N.project(deps, E, { sells: 700, moved: 300 }, true);
  assert.equal(a.total.aiRec, 0); assert.ok(b.total.aiRec > 0);
  close(b.invest - a.invest, E.aiImpl * E.aiShare); assert.equal(a.units, b.units);
  close(a.total.rent + a.total.machine, b.total.rent + b.total.machine);
});

test("pnl: payback is where cumulative cash flow (after the set-up) turns positive", () => {
  const x = N.project(deps, E, { sells: 900, moved: 100 }, false);
  assert.ok(x.payback > 0);
  const k = Math.ceil(x.payback);
  assert.ok(x.years[k - 1].cum >= 0 && (k === 1 ? -x.invest : x.years[k - 2].cum) < 0);
});

test("pnl: no growth and no inflation by default, so steady-state years are equal", () => {
  const y = N.project(deps, E, { sells: 800, moved: 200 }, true).years;
  for (let i = 2; i < y.length; i++) close(y[i].opProfit, y[1].opProfit);
});
