// build_trace.js - records the two slide 07 counters for the video (sim/trace.js) and the values the
// slide 07 panels show at the last minute, computed separately, for render.js to check against.
// Run: node video/build_trace.js   ->  video/build/trace.js (window.TRACE) and video/build/expected.json
const fs = require("fs");
const path = require("path");
const Sim = require("../sim/sim.js");
const St = require("../sim/store.js");
const C = require("../sim/counter.js");
const T = require("../sim/trace.js");
const RAW = require("../assumptions.json");

const P = Sim.params(RAW), SB = RAW.storyboard;
const VIDEO = { minutes: 20, speed: 40, fps: 30, holdSec: 1 };          // the brief: 20-minute peak at x40
const base = { walkBack: RAW.illustration.walk_back_speed.value, seed: P.seed, day: SB.day_type_default.value, staff: 2 };
// slide 07 (data-mode "split") options for each side, as deck.js runOpts(): split preset, crew, Brigade / Fixed posts
const SIDES = [
  { key: "A", title: "Humans only, fixed posts", preset: "all_hand", o: { ...base, robots: SB.split_presets.value.all_hand.robots, mode: "fixed", assign: "best" } },
  { key: "B", title: "Machine-made drink, bucket brigade", preset: "heading", o: { ...base, robots: SB.split_presets.value.heading.robots, mode: "brigade" } },
];

// what the slide 07 panel shows after `minutes` (deck.js fresh(): counter.create, then step 0.5 s)
function panel(o, minutes) {
  const S = C.create(Sim, St, P, o), end = S.t + minutes * 60;
  while (S.t < end - 1e-9) S.step(0.5);
  return { served: S.servedInHour, queue: S.inStore(), walkedAway: S.lost };
}

function build() {
  const out = path.join(__dirname, "build");
  fs.mkdirSync(out, { recursive: true });
  const trace = {
    video: VIDEO, day: base.day, dayLabel: SB.day_type_labels.value[base.day], seed: base.seed, staff: base.staff,
    peakClock: 10 + C.peakHour(P),                                     // the deck's hourLabel(): firstHour 10 + peak hour
    sides: SIDES.map(s => ({ key: s.key, title: s.title, preset: s.preset, ...T.record(Sim, St, C, P, s.o, VIDEO.minutes) })),
  };
  const expected = { minutes: VIDEO.minutes, ...Object.fromEntries(SIDES.map(s => [s.key, panel(s.o, VIDEO.minutes)])) };
  fs.writeFileSync(path.join(out, "trace.js"), `window.TRACE = ${JSON.stringify(trace)};\n`);
  fs.writeFileSync(path.join(out, "expected.json"), JSON.stringify({ day: base.day, seed: base.seed, ...expected }, null, 2) + "\n");
  return { trace, expected };
}

if (require.main === module) { const { expected } = build(); console.log("expected at minute", VIDEO.minutes, expected); }
module.exports = { build, VIDEO };
