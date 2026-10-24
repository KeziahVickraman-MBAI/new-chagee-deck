// Tests for toppings.js (slides 06 to 08: fixed responsibilities against a bucket brigade as toppings come in). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const T = require("./toppings.js");
const RAW = require("../assumptions.json");
const E = T.inputs(RAW, Sim);
const K = id => T.STEPS.indexOf(id);

// step a counter to the end of the hour, checking the rules at every step
function watch(o) {
  const S = T.create(E, Sim, { ...o, events: true }), bad = [];
  while (S.t < S.H) {
    S.step();
    const work = S.workers.filter(w => w.mode === "work");
    for (const k of [K("tea_milk"), K("shake_seal")]) if (work.filter(w => w.k === k).length > 1) bad.push(`two people at ${T.STEPS[k]} at ${S.t}`);
    if (work.filter(w => E.steps[w.k].loc === E.steps[K("topping")].loc).length > S.C.bar) bad.push(`bar over capacity at ${S.t}`);
    const held = S.workers.filter(w => w.cup).map(w => w.cup.id);
    if (new Set(held).size !== held.length) bad.push(`one cup in two hands at ${S.t}`);
    if (S.mode === "brigade") {                                       // holders keep their order along the counter
      const h = S.workers.filter(w => w.cup);
      h.forEach((d, i) => { const u = h[i - 1];
        if (u && ((u.mode === "work" && u.k >= d.k) || u.x > d.x + 1e-9)) bad.push(`overtaking at ${S.t}: ${u.id} ${u.k} ${u.x}, ${d.id} ${d.k} ${d.x}`); });
    }
  }
  return { S, bad };
}

test("toppings: both views and every share face the same orders", () => {
  const a = T.orders(E, Sim, 5, 50, E.perHour), b = T.orders(E, Sim, 5, 50, E.perHour);
  assert.deepEqual(a, b);
  const f = T.create(E, Sim, { mode: "fixed", seed: 5, share: 0.3 }), g = T.create(E, Sim, { mode: "brigade", seed: 5, share: 0.7 });
  assert.deepEqual(f.orders.map(c => [c.t, c.u, c.nz]), g.orders.map(c => [c.t, c.u, c.nz]));
  for (let i = 0; i < 4000; i++) { f.step(); g.step(); }
  const land = S => S.orders.filter(c => c.top != null);
  assert.equal(land(f).length, land(g).length);
  land(f).forEach((c, i) => assert.ok(!c.top || land(g)[i].top));    // a higher share only adds toppings to the same orders
});

test("toppings: no toppings means no topping step; toppings are worked only on orders that have them", () => {
  for (const mode of ["fixed", "brigade"]) {
    const none = watch({ mode, share: 0 }).S.events, half = watch({ mode, share: 0.5 }).S;
    assert.ok(!none.some(e => e.type === "step" && e.step === "topping"));
    const topped = new Set(half.orders.filter(c => c.top).map(c => c.id));
    const tops = half.events.filter(e => e.type === "step" && e.step === "topping");
    assert.ok(tops.length > 0 && tops.every(e => topped.has(e.order)));
    // every step of every delivered order done exactly once
    for (const c of half.delivered) {
      const st = half.events.filter(e => e.type === "step" && e.order === c.id).map(e => e.step);
      assert.deepEqual(st, T.STEPS.filter(s => s !== "topping" || c.top));
    }
  }
});

test("toppings: one cup per machine and spot, no duplicated work, no overtaking in the brigade", () => {
  for (const mode of ["fixed", "brigade"]) for (const o of [{ share: 0.5 }, { share: 1, toppingSec: 30, bar: 2 }, { share: 0.8, trained: { ana: false } }]) {
    const { S, bad } = watch({ mode, ...o });
    assert.deepEqual(bad, [], `${mode} ${JSON.stringify(o)}`);
    assert.equal(new Set(S.delivered.map(c => c.id)).size, S.delivered.length);
  }
});

test("toppings: training sets who may do what", () => {
  for (const mode of ["fixed", "brigade"]) {
    const ev = watch({ mode, share: 0.6 }).S.events.filter(e => e.type === "step" && e.who === "cai");
    assert.ok(ev.length && ev.every(e => !["topping", "finish"].includes(e.step)));     // Cai is not trained on them
  }
  const ev = watch({ mode: "brigade", share: 0.6, trained: { ana: false } }).S.events.filter(e => e.type === "step" && e.who === "ana");
  assert.ok(ev.every(e => ["cup_ice", "tea_milk"].includes(e.step)));
  assert.throws(() => T.setup(E, { trained: { ben: false } }), /mid-line/);
  assert.deepEqual(T.setup(E, { trained: { ana: false } }).zones.map(z => [z.lo, z.hi]), [[0, K("tea_milk")], [0, K("handover")], [K("shake_seal"), K("handover")]]);
});

test("toppings: one brigade hand-over cycle, as slide 07 animates it", () => {
  const S = T.create(E, Sim, { mode: "brigade", share: 0, events: true });
  const st = RAW.toppings.cycle_stage.value;                         // Cai finishing #1, Ben topping #2, Ana on cup and ice with #3
  assert.deepEqual([st.people.cai.step, st.people.ben.step, st.people.ana.step], [K("handover"), K("topping"), K("cup_ice")]);
  S.stage(st);
  const id = i => E.firstId + i;
  while (!S.events.some(e => e.type === "start" && e.order === id(3)) && S.t < 300) S.step();
  const seq = S.events.filter(e => ["ready", "pass", "start"].includes(e.type)).map(e => `${e.type}:${e.who}:${e.order}${e.from ? ":" + e.from : ""}`);
  assert.deepEqual(seq, [`ready:cai:${id(0)}`, `pass:cai:${id(1)}:ben`, `pass:ben:${id(2)}:ana`, `start:ana:${id(3)}`]);
});

test("toppings: the comparison holds everything but the rule, and the brigade is not made to win", () => {
  const r = T.compare(E, Sim, { share: 0.5, seeds: 6 });
  assert.equal(r.fixed.placed, r.brigade.placed);
  assert.ok(r.cost > 0 && r.people === E.crew.length);
  assert.ok(r.brigade.completed > r.fixed.completed && r.brigade.median < r.fixed.median);
  const z = T.compare(E, Sim, { share: 0, seeds: 6 });                            // before toppings: little in it
  assert.ok(Math.abs(z.brigade.completed - z.fixed.completed) < 2);
  const c = T.content(E, { share: 0.5 });
  assert.equal(c.topped - c.standard, E.toppingSec.value);
  assert.equal(c.standard, E.steps.reduce((a, s) => a + (s.topping ? 0 : s.sec), 0));
});
