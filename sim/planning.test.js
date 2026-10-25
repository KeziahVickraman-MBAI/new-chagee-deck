// Tests for planning.js (slides 06 and 07: AI-enabled in-store planning, the illustrative zone). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const PL = require("./planning.js");
const RAW = require("../assumptions.json");
const E = PL.inputs(RAW), P = PL.plan(E);

test("planning: crew moves keep the giving outlet covered, stay within travel and use only cross-trained people", () => {
  const { need, planned, moves } = P.staff;
  planned.forEach((row, i) => row.forEach((h, j) => { if (planned[i][j] < E.outlets[i].crew[j]) assert.ok(h >= need[i][j]); }));
  for (const m of moves) {
    assert.ok(m.minutes <= E.maxTravel);
    const f = E.outlets.find(o => o.id === m.from);
    assert.ok(f.cross_trained >= 1);
    m.days.forEach(j => assert.ok(need[E.outlets.indexOf(f)][j] <= planned[E.outlets.indexOf(f)][j]));
  }
  // every person moved is accounted for: total crew per day is unchanged
  E.days.forEach((d, j) => assert.equal(planned.reduce((a, r) => a + r[j], 0), E.outlets.reduce((a, o) => a + o.crew[j], 0)));
});

test("planning: crew needed covers the upper end of the forecast and never falls below the minimum", () => {
  E.outlets.forEach((o, i) => PL.forecast(E, o).forEach((f, j) => {
    const n = P.staff.need[i][j];
    assert.ok(n >= o.min_crew && n * E.perCrew >= f.peakHi - 1e-9 && (n === o.min_crew || (n - 1) * E.perCrew < f.peakHi));
  }));
});

test("planning: machines to run never exceed those installed; needing more is a flag, not a plan", () => {
  for (const m of P.machines) {
    m.run.forEach((r, j) => assert.ok(r >= 1 && r <= m.installed && r <= m.want[j]));
    assert.equal(m.over, m.want.some(w => w > m.installed));
  }
});

test("planning: the milk order covers the upper end until the next delivery and is usable before it expires", () => {
  const L = E.stock.litres_per_case;
  for (const s of P.stock) {
    assert.ok((s.cases + s.onHand) * L >= s.useHi - 1e-9);
    assert.ok(s.cases === 0 || (s.cases - 1 + s.onHand) * L < s.useHi);
    assert.ok(s.fits);
  }
});

test("planning: the day ranges read as the dashboard shows them", () => {
  assert.equal(PL.dayRange(E, [0, 1, 2, 3, 4]), "Mon–Fri");
  assert.equal(PL.dayRange(E, [0, 1, 2, 3, 4, 6]), "Mon–Fri, Sun");
  assert.equal(PL.dayRange(E, [5]), "Sat");
});
