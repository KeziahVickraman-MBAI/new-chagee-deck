// Tests for trace.js (the video's recording). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("./sim.js");
const St = require("./store.js");
const C = require("./counter.js");
const T = require("./trace.js");
const RAW = require("../assumptions.json");
const P = Sim.params(RAW);
const walkBack = RAW.illustration.walk_back_speed.value;
const heading = RAW.storyboard.split_presets.value.heading.robots;
const SIDES = [{ robots: [], mode: "fixed", assign: "best", staff: 2 }, { robots: heading, mode: "brigade", staff: 2 }];

// what the slide 07 panel shows after toMinute minutes (deck.js fresh(): create, then step 0.5 s)
function panel(o, minutes) {
  const S = C.create(Sim, St, P, { walkBack, seed: P.seed, ...o }), end = S.t + minutes * 60;
  while (S.t < end - 1e-9) S.step(0.5);
  return { served: S.servedInHour, lost: S.lost, inStore: S.inStore() };
}

test("trace: every sample equals the slide panel at that time", () => {
  for (const o of SIDES) for (const day of Object.keys(P.surgeMult)) {
    const tr = T.record(Sim, St, C, P, { walkBack, seed: P.seed, day, ...o }, 20);
    for (const m of [0, 1, 7, 12, 20]) {
      const [served, lost, inStore] = tr.samples[m * 120];
      assert.deepEqual({ served, lost, inStore }, panel({ day, ...o }, m), `${day} ${o.mode} minute ${m}`);
    }
  }
});

test("trace: recording leaves the run's results unchanged", () => {
  for (const o of SIDES) {
    const before = C.run(Sim, St, P, { walkBack, ...o });
    T.record(Sim, St, C, P, { walkBack, seed: P.seed, ...o }, 20);
    assert.deepEqual(C.run(Sim, St, P, { walkBack, ...o }), before);
  }
});

test("trace: events add up to the counters", () => {
  for (const o of SIDES) {
    const tr = T.record(Sim, St, C, P, { walkBack, seed: P.seed, day: "large", ...o }, 20), last = tr.samples.at(-1);
    assert.equal(tr.events.balk.length, last[1]);
    const start = tr.samples[0][2];
    assert.equal(start + tr.events.arrive.length - tr.events.out.length, last[2]);
  }
});
