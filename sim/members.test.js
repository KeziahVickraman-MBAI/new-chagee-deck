// Tests for members.js (slides M1-M3, candidate chapter). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Sim = require("./sim.js");
const MB = require("./members.js");
const RAW = require("../assumptions.json");
const close = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} vs ${b}`);

test("members: closed-form equilibria solve p = k z (1 - z), low below high", () => {
  for (const [p, k] of [[0.2, 1], [0.15, 1.3], [0.05, 0.6]]) {
    const e = MB.equilibria(p, k);
    close(k * e.low * (1 - e.low), p); close(k * e.high * (1 - e.high), p);
    assert.ok(e.low < 0.5 && e.high > 0.5); close(e.low + e.high, 1);
  }
});

test("members: no positive equilibrium when 4p/k > 1; a double root at 4p/k = 1", () => {
  assert.equal(MB.equilibria(0.3, 1), null);
  assert.equal(MB.equilibria(0.26, 1), null);
  const e = MB.equilibria(0.25, 1); close(e.low, 0.5); close(e.high, 0.5);
});

test("members: adoption rounds collapse below z' and take off above it, to z''", () => {
  const p = 0.2, k = 1, e = MB.equilibria(p, k);
  close(MB.next(0.5, p, k), 1 - p / (k * 0.5));
  assert.equal(MB.next(0, p, k), 0);
  const below = MB.rounds(e.low - 0.02, p, k, 60), above = MB.rounds(e.low + 0.02, p, k, 60);
  assert.equal(below[60], 0);
  close(above[60], e.high, 1e-6);
  assert.equal(MB.rounds(0.9, 0.3, 1, 30)[30], 0);              // the stalled app: collapses from any start
});

test("members: the scenario table equals members.expected_table", () => {
  const exp = RAW.members.expected_table.value;
  for (const s of MB.table(RAW)) {
    const got = s.eq ? [+s.eq.low.toFixed(2), +s.eq.high.toFixed(2)] : null;
    assert.deepEqual(got, exp[s.id], s.id);
  }
});

test("members: each quote is word for word in its source text", () => {
  const tpl = fs.readFileSync(path.join(__dirname, "..", "storyboard", "template.html"), "utf8");
  for (const q of RAW.members.quotes.value) {
    assert.ok(q.excerpt.includes(q.text), q.id);
    assert.ok(tpl.includes(`{{s.${q.id}}}`), `${q.id} is placed on the slide by placeholder`);
  }
  // the course quote against the course file itself, when it is on this machine
  const pptx = path.join(process.env.HOME || "", "Desktop", "SMU_MBAI", "Term1", "OPIM639", "slides08-Service-Platforms.pptx");
  if (fs.existsSync(pptx)) {
    const out = require("node:child_process").execFileSync("unzip", ["-p", pptx, "ppt/slides/slide34.xml"]).toString("utf8");
    const text = [...out.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join(" ");
    assert.ok(text.includes(RAW.members.quotes.value.find(q => q.id === "qtopic8").text));
  }
});

test("members: break-even extra orders make the credit pay for itself", () => {
  const b = MB.breakEven(RAW), m = RAW.storyboard.gross_margin_per_cup;
  for (const q of ["low", "mid", "high"]) {
    const E = b[q].extraNeeded;
    close(b[q].margin * E, b.credit * (b.base + E));                // margin on extra orders = credit on all group orders
  }
  close(b.mid.margin, m.value); close(b.low.margin, m.range[0]); close(b.high.margin, m.range[1]);
  assert.ok(b.high.extraNeeded < b.mid.extraNeeded && b.mid.extraNeeded < b.low.extraNeeded);
  assert.equal(MB.breakEven(RAW, { credit: 0.7 }).high.extraNeeded, null);   // a credit at the margin never pays back
});

test("members: the network simulation is seeded and stalls when the formula has no equilibrium", () => {
  const a = MB.network(RAW, 0.2, 1, 0.5, 3, Sim), b = MB.network(RAW, 0.2, 1, 0.5, 3, Sim);
  assert.deepEqual(a.path, b.path);
  assert.equal(MB.network(RAW, 0.3, 1, 0.6, 0, Sim).final, 0);
});
