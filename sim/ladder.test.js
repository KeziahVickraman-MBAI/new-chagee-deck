// node --test sim/ladder.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js"), C = require("./counter.js"), L = require("./ladder.js");
const RAW = require("../assumptions.json"), TI = require("../machine_tiers.json");
const P = Sim.params(RAW), at = { cupsDay: Math.round(Sim.dailyBase(P)), wage: P.wage, unitMonth: P.machineMonth };

test("ladder: today's split rung is the model's own day cost, monthly, against all by hand", () => {
  const today = L.evaluate(Sim, C, RAW, P, TI, at).find(r => r.id === "today");
  const hand = C.dayCost(Sim, C.configure(P, []).P, "all_human", "none"), mix = C.dayCost(Sim, P, "mixed", "none");
  assert.ok(Math.abs(today.saved - (hand.labour - mix.labour) * P.days / 12) < 1e-6);
  assert.ok(Math.abs(today.modelCost - mix.machine * P.days / 12) < 1e-6);
});

test("ladder: every figure on a rung is a source price or computed; undisclosed rungs carry no price", () => {
  const ev = L.evaluate(Sim, C, RAW, P, TI, at), fx = RAW._meta.fx_sgd_per_usd.value;
  for (const t of TI.tiers) {
    const r = ev.find(x => x.id === t.id);
    if (t.examples.every(e => e.cost.kind === "not_disclosed")) assert.equal(r.prices.length, 0, t.id);
    assert.ok(["company claim", "vendor page", "press", "our assumption"].includes(t.replaces_reliability));
    t.examples.forEach(e => assert.match(e.source, /^https:\/\//));
  }
  const oli = ev.find(x => x.id === "barista").lease;
  assert.ok(Math.abs(oli.lease - 4990 * fx) < 1e-9);
  assert.equal(ev.find(x => x.id === "single").payback[0].priceRaw, 10000);
});

test("ladder: simple payback = price / labour saved a month; a lease margin = saved - lease", () => {
  for (const r of L.evaluate(Sim, C, RAW, P, TI, at)) {
    r.payback.forEach(p => assert.ok(Math.abs(p.months - p.price / r.saved) < 1e-9));
    if (r.lease) assert.ok(Math.abs(r.leaseMargin - (r.saved - r.lease.lease)) < 1e-9);
  }
});

test("ladder: a higher wage never makes a machine rung save less", () => {
  const a = L.evaluate(Sim, C, RAW, P, TI, at), b = L.evaluate(Sim, C, RAW, P, TI, { ...at, wage: at.wage * 1.5 });
  a.forEach((r, k) => assert.ok(b[k].saved >= r.saved - 1e-9, r.id));
});

test("ladder: volume bands match a direct check at their edges", () => {
  const V = L.volumes(Sim, C, RAW, P, TI, at);
  for (const v of V.rungs.filter(x => x.basis === "model")) {
    v.beatsBands.forEach(([a]) => {
      const r = L.evaluate(Sim, C, RAW, P, TI, { ...at, cupsDay: a }).find(x => x.id === v.id);
      assert.ok(r.modelMargin > 0, `${v.id} at ${a}`);
    });
  }
});
