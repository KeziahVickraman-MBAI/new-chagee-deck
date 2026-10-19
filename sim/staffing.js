/* staffing.js - staff-optimisation slide: how many people to roster in each hour, and which shifts.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeStaffing).
 * Separate from the cost-per-cup model in sim.js; it reuses that model's inputs (via sim.js plan()).
 *
 *   inputs(RAW, Sim, over)   every input from assumptions.json, with slide overrides
 *                            (cupsPerDay, wage, slTarget, humanMult, hype).
 *   requirement(inp)         step 2-3: per open hour, the fewest people (Erlang C, one shared queue)
 *                            meeting the service-level target and the utilisation cap, at forecast
 *                            demand x the capacity safety margin. null = not reachable within
 *                            max_staff_available.
 *   schedule(req, inp)       step 4: the lowest-cost set of shifts covering that requirement in every
 *                            half-hour, with shift lengths, breaks and the staff limit. Exact search
 *                            (depth-first over start hours, memoised on the state that matters for the
 *                            rest of the day), so "lowest cost" holds within this shift model.
 *   evaluate(sched, lam, inp) waits, service level and utilisation the schedule delivers at a demand.
 *   run(inp)                 steps 1-5 together, with the fixed-staffing baseline.
 */
(function (root) {
  "use strict";

  /* Erlang C: probability that an arrival waits, c servers, offered load a (erlangs). */
  function erlangC(c, a) {
    if (a <= 0) return 0;
    if (c <= a) return 1;
    let term = 1, sum = 1;
    for (let k = 1; k < c; k++) { term *= a / k; sum += term; }
    const top = term * (a / c) / (1 - a / c);          // a^c / c! / (1 - a/c)
    return top / (sum + top);
  }

  /* Queue at c people, arrivals lam per hour, mu per person per hour, wait limit T hours. */
  function perf(c, lam, mu, T) {
    if (lam <= 0) return { util: 0, pWait: 0, wait: 0, sl: 1 };
    if (c <= 0) return { util: Infinity, pWait: 1, wait: Infinity, sl: 0 };
    const rho = lam / (c * mu);
    if (rho >= 1) return { util: rho, pWait: 1, wait: Infinity, sl: 0 };
    const C = erlangC(c, lam / mu);
    return { util: rho, pWait: C, wait: C / (c * mu - lam), sl: 1 - C * Math.exp(-(c * mu - lam) * T) };
  }

  function inputs(RAW, Sim, over = {}) {
    const P0 = Sim.params(RAW), S = RAW.staffing, v = o => o.value;
    const P = { ...P0, humanMult: over.humanMult ?? 1 };
    const pl = Sim.plan(P, "all_human");
    const cupsPerDay = over.cupsPerDay ?? Sim.dailyBase(P0);
    const hype = over.hype ? P0.hype : 1;
    return {
      open: v(RAW.store.open_hours_per_day), firstHour: 10,
      share: P0.share, cupsPerDay, hype,
      lam: P0.share.map(s => cupsPerDay * hype * s),          // forecast orders per hour (one cup per order)
      margin: P0.margin,                                       // demand-variability buffer
      mu: pl.perWorker * 60,                                   // cups per person per hour
      serviceSec: 3600 / (pl.perWorker * 60), handSec: pl.W,   // effective and hands-on seconds per cup
      T: P0.targetWait / 60, slTarget: over.slTarget ?? v(S.service_level_target),
      maxUtil: v(S.max_utilisation), minStaff: P0.minStaff.all_human, maxStaff: v(S.max_staff_available),
      minLen: v(S.shift_min_hours), maxLen: v(S.shift_max_hours),
      breakAfter: v(S.break_after_hours), breakSlots: Math.round(v(S.break_minutes) / 30),
      wage: over.wage ?? P0.wage,
    };
  }

  function requirement(inp) {
    return inp.lam.map(l => {
      const lp = l * inp.margin;
      for (let c = Math.max(1, inp.minStaff); c <= inp.maxStaff; c++) {
        const p = perf(c, lp, inp.mu, inp.T);
        if (p.util <= inp.maxUtil + 1e-12 && p.sl >= inp.slTarget - 1e-12) return c;
      }
      return null;
    });
  }

  /* One shift: start hour, length in hours, and the half-hour slots it is on the counter. */
  function makeShift(start, len, inp) {
    const brk = len > inp.breakAfter ? 2 * start + len - Math.floor(inp.breakSlots / 2) : null;   // middle of the shift
    const on = s => s >= 2 * start && s < 2 * (start + len) && !(brk != null && s >= brk && s < brk + inp.breakSlots);
    return { start, len, brk, on };
  }
  const coverage = (shifts, slots) => Array.from({ length: slots }, (_, s) => shifts.reduce((n, x) => n + (x.on(s) ? 1 : 0), 0));

  function schedule(req, inp, limit = 3e5) {
    const H = req.length;
    if (req.some(r => r == null)) return { feasible: false, reason: "requirement", shifts: [], complete: true };
    const lens = [];
    for (let L = inp.minLen; L <= inp.maxLen; L++) lens.push(L);
    const pool = {};                                          // shifts by start hour
    for (let h = 0; h < H; h++) pool[h] = lens.filter(L => h + L <= H).map(L => makeShift(h, L, inp));
    let best = null, bestCost = Infinity, nodes = 0, complete = true;
    const memo = new Map();
    const covAt = (shifts, s) => shifts.reduce((n, x) => n + (x.on(s) ? 1 : 0), 0);

    function rec(h, chosen, hours) {
      if (++nodes > limit) { complete = false; return; }
      if (hours >= bestCost) return;
      if (h === H) { bestCost = hours; best = chosen.slice(); return; }
      const act = chosen.filter(x => x.start + x.len > h);
      // lower bound: each further paid hour covers at most two half-hour slots for one person
      let deficit = 0, most = 0;
      for (let s = 2 * h; s < 2 * H; s++) { const d = Math.max(0, req[s >> 1] - covAt(act, s)); deficit += d; most = Math.max(most, d); }
      if (hours + deficit / 2 >= bestCost) return;
      if (chosen.length + most > inp.maxStaff) return;              // each new person adds at most one per slot
      const key = h + "|" + chosen.length + "|" + act.map(x => (x.start + x.len) + ":" + (x.brk ?? -1)).sort().join(",");
      if (memo.has(key) && memo.get(key) <= hours) return;
      memo.set(key, hours);
      const room = inp.maxStaff - chosen.length;
      const opts = pool[h];
      // every multiset of shift lengths starting at hour h, smallest first
      const pick = [];
      const tryPick = (i, left) => {
        const all = chosen.concat(pick);
        if (covAt(all, 2 * h) >= req[h] && covAt(all, 2 * h + 1) >= req[h])
          rec(h + 1, all, hours + pick.reduce((a, x) => a + x.len, 0));
        if (left === 0) return;
        for (let j = i; j < opts.length; j++) { pick.push(opts[j]); tryPick(j, left - 1); pick.pop(); }
      };
      tryPick(0, room);
    }
    rec(0, [], 0);
    if (!best) return { feasible: false, reason: complete ? "constraints" : "search limit", shifts: [], complete };
    // complete = the search finished, so no cheaper schedule exists in this shift model; otherwise best found
    return { feasible: true, complete, shifts: best.sort((a, b) => a.start - b.start || b.len - a.len), hours: bestCost };
  }

  function evaluate(shifts, lam, inp) {
    const cov = coverage(shifts, 2 * lam.length);
    let arr = 0, waitSum = 0, slSum = 0, work = 0, staffed = 0, worstWait = 0;
    cov.forEach((c, s) => {
      const l = lam[Math.floor(s / 2)], p = perf(c, l, inp.mu, inp.T);
      arr += l / 2; waitSum += p.wait * l / 2; slSum += p.sl * l / 2;
      work += l / 2 / inp.mu; staffed += c / 2; worstWait = Math.max(worstWait, p.wait);
    });
    return { cov, wait: arr ? waitSum / arr : 0, sl: arr ? slSum / arr : 1, util: staffed ? work / staffed : 0, worstWait };
  }

  function run(inp) {
    const req = requirement(inp), sched = schedule(req, inp);
    const peak = req.every(r => r != null) ? Math.max(...req) : null;
    const base = peak == null ? null : {                                  // fixed staffing: busiest hour's crew, every hour
      hours: peak * inp.open, cost: peak * inp.open * inp.wage,
      shifts: [], ...evaluate(Array.from({ length: peak }, () => ({ on: () => true })), inp.lam, inp),
    };
    const out = { inp, req, sched, base };
    if (sched.feasible) {
      out.cost = sched.hours * inp.wage;
      out.at = evaluate(sched.shifts, inp.lam, inp);
      out.high = evaluate(sched.shifts, inp.lam.map(l => l * (1 + (inp.uHigh ?? 0))), inp);
    }
    return out;
  }

  const api = { erlangC, perf, inputs, requirement, makeShift, coverage, schedule, evaluate, run };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeStaffing = api;
})(typeof window !== "undefined" ? window : globalThis);
