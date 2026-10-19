// Tests for staffing.js (staff-optimisation slide). Run: node --test sim/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const RAW = require("../assumptions.json");
const Sim = require("./sim.js");
const St = require("./staffing.js");

test("Erlang C matches the textbook value for two servers at one erlang", () => {
  assert.ok(Math.abs(St.erlangC(2, 1) - 1 / 3) < 1e-12);
  assert.equal(St.erlangC(2, 2), 1);
});

test("hourly requirement is the fewest people meeting the service level and the utilisation cap", () => {
  const inp = St.inputs(RAW, Sim, { hype: true });
  St.requirement(inp).forEach((c, h) => {
    const lp = inp.lam[h] * inp.margin, ok = n => { const p = St.perf(n, lp, inp.mu, inp.T); return p.util <= inp.maxUtil && p.sl >= inp.slTarget; };
    assert.ok(ok(c), `hour ${h} meets both targets`);
    if (c > inp.minStaff) assert.ok(!ok(c - 1), `hour ${h}: one fewer would miss a target`);
  });
});

for (const over of [{}, { hype: true }, { cupsPerDay: 833, hype: true }]) {
  test(`schedule satisfies every constraint (${JSON.stringify(over)})`, () => {
    const inp = St.inputs(RAW, Sim, over), req = St.requirement(inp), s = St.schedule(req, inp);
    assert.ok(s.feasible && s.complete);
    assert.ok(s.shifts.length <= inp.maxStaff, "staff available");
    for (const x of s.shifts) {
      assert.ok(x.len >= inp.minLen && x.len <= inp.maxLen, "shift length");
      assert.ok(x.start + x.len <= inp.open, "ends by closing");
      assert.equal(x.brk != null, x.len > inp.breakAfter, "break when the shift is long");
    }
    St.coverage(s.shifts, 2 * inp.open).forEach((c, slot) => assert.ok(c >= req[slot >> 1], `half-hour ${slot} covered`));
    assert.ok(s.hours <= Math.max(...req) * inp.open, "never more paid hours than fixed staffing");
  });
}

test("schedule is the lowest-cost one: brute force agrees on small cases", () => {
  const inp = { minLen: 2, maxLen: 4, breakAfter: 3, breakSlots: 1, maxStaff: 5 };
  const cases = [[1, 2, 2, 1, 1, 2], [2, 2, 1, 1, 2, 2], [1, 3, 1, 1, 2, 1], [2, 1, 1, 1, 1, 2]];
  for (const req of cases) {
    const H = req.length, pool = [];
    for (let h = 0; h < H; h++) for (let L = inp.minLen; L <= inp.maxLen; L++) if (h + L <= H) pool.push(St.makeShift(h, L, inp));
    let best = Infinity;
    const walk = (i, chosen) => {                                  // every multiset of up to maxStaff shifts
      const cov = St.coverage(chosen, 2 * H);
      if (cov.every((c, s) => c >= req[s >> 1])) best = Math.min(best, chosen.reduce((a, x) => a + x.len, 0));
      if (chosen.length === inp.maxStaff) return;
      for (let j = i; j < pool.length; j++) walk(j, chosen.concat(pool[j]));
    };
    walk(0, []);
    const s = St.schedule(req, inp);
    assert.ok(s.complete);
    assert.equal(s.hours, best, `req ${req}`);
  }
});

test("reports infeasible instead of a schedule when staff are too few", () => {
  const inp = { ...St.inputs(RAW, Sim, { hype: true }), maxStaff: 3 };
  const s = St.schedule(St.requirement({ ...inp, maxStaff: 8 }), inp);
  assert.equal(s.feasible, false);
  assert.equal(s.reason, "constraints");
});
