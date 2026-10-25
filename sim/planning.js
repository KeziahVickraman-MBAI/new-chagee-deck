/* planning.js - storyboard deck, Proposal 2 (slides 06 and 07): AI-enabled in-store planning, one illustrative zone and week.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageePlanning). Inputs: assumptions.json planning_demo
 * (an invented scenario: forecasts, crews, machines, stock), store.hourly_demand_share (the peak hour's share of the day) and
 * provision.* (milk per cup, shelf life). Nothing is typed here.
 *
 *   inputs(RAW)          E: outlets, days, rules.
 *   forecast(E, o)       per outlet and day: orders (point, lo, hi) and peak-hour orders (point, lo, hi).
 *   staff(E)             crew needed at the peak (upper end of the forecast, never below the minimum) against the roster; moves
 *                        from an outlet with a spare cross-trained person to one short that day, only within the travel limit and
 *                        only if the giving outlet still covers its own need; shortfalls no move can cover.
 *   machines(E)          machines to run each day (at most the installed count); a flag when the peak needs more than installed,
 *                        which is an investment question for a separate review, not part of the weekly plan.
 *   stock(E)             Monday's fresh-milk delivery in cases: use until the next delivery at the upper end, less usable stock on
 *                        hand, rounded up; checked to be usable at the lower end within the shelf life.
 *   plan(E)              all of it, plus the recommendation list the dashboard shows.
 *   upcoming(E)          peaks and quiet spells: days at least 15% above or below the outlet's usual (non-holiday) week.
 */
(function (root) {
  "use strict";

  function inputs(RAW) {
    const T = RAW.planning_demo, v = k => T[k].value;
    return { outlets: v("outlets"), days: v("days"), band: v("forecast_band"), perCrew: v("orders_per_crew_peak_hour"),
             perMachine: v("machine_orders_per_hour"), travel: v("travel_minutes"), maxTravel: v("max_travel_minutes"), stock: v("stock"),
             peakShare: Math.max(...RAW.store.hourly_demand_share.value), milk: RAW.provision.milk_litres_per_cup.value,
             shelf: RAW.provision.milk_shelf_life_days.value, zone: v("zone"), week: v("week") };
  }
  const travel = (E, a, b) => E.travel[`${a}_${b}`] ?? E.travel[`${b}_${a}`];
  const out = (E, id) => E.outlets.find(o => o.id === id);

  function forecast(E, o) {
    return o.forecast.map(f => ({ point: f, lo: f * (1 - E.band), hi: f * (1 + E.band),
      peak: f * E.peakShare, peakLo: f * E.peakShare * (1 - E.band), peakHi: f * E.peakShare * (1 + E.band) }));
  }

  function staff(E) {
    const need = E.outlets.map(o => forecast(E, o).map(f => Math.max(o.min_crew, Math.ceil(f.peakHi / E.perCrew - 1e-9))));
    const have = E.outlets.map(o => [...o.crew]), moves = [];
    E.days.forEach((d, j) => {
      const free = E.outlets.map(o => o.cross_trained);                   // trained people each outlet can lend today
      for (;;) {
        const short = E.outlets.map((o, i) => i).filter(i => have[i][j] < need[i][j]);
        let best = null;
        for (const t of short) for (let f = 0; f < E.outlets.length; f++) {
          if (f === t || free[f] < 1 || have[f][j] - 1 < need[f][j]) continue;                 // the giving outlet stays covered
          const m = travel(E, E.outlets[f].id, E.outlets[t].id);
          if (m > E.maxTravel) continue;
          if (!best || m < best.m) best = { f, t, m };
        }
        if (!best) break;
        have[best.f][j]--; have[best.t][j]++; free[best.f]--;
        moves.push({ day: j, from: E.outlets[best.f].id, to: E.outlets[best.t].id, minutes: best.m });
      }
    });
    // one line per pair: the days, the checks that held
    const pairs = {};
    moves.forEach(m => { const k = `${m.from}>${m.to}`; (pairs[k] ||= { from: m.from, to: m.to, minutes: m.minutes, days: [] }).days.push(m.day); });
    const short = [];
    E.outlets.forEach((o, i) => E.days.forEach((d, j) => { if (have[i][j] < need[i][j]) short.push({ outlet: o.id, day: j, missing: need[i][j] - have[i][j] }); }));
    return { need, roster: E.outlets.map(o => o.crew), planned: have, moves: Object.values(pairs), short };
  }

  function machines(E) {
    return E.outlets.map(o => {
      const want = forecast(E, o).map(f => Math.max(1, Math.ceil(f.peakHi / E.perMachine - 1e-9)));
      return { outlet: o.id, installed: o.machines, run: want.map(w => Math.min(w, o.machines)), want, over: want.some(w => w > o.machines),
               maxRun: Math.max(...want.map(w => Math.min(w, o.machines))) };
    });
  }

  function stock(E) {
    const S = E.stock, L = S.litres_per_case, di = d => E.days.indexOf(d), first = di(S.deliveries[0]), next = di(S.deliveries[1]);
    return E.outlets.map(o => {
      const f = forecast(E, o), span = f.slice(first, next);
      const useHi = span.reduce((a, x) => a + x.hi * E.milk, 0), useLo = span.reduce((a, x) => a + x.lo * E.milk, 0);
      const cases = Math.max(0, Math.ceil((useHi - o.on_hand_cases * L) / L - 1e-9));
      // usable before expiry: what the lower end uses within the shelf life from delivery
      const life = f.slice(first, first + E.shelf).reduce((a, x) => a + x.lo * E.milk, 0);
      return { outlet: o.id, unit: S.unit, cover: [first, next - 1], useHi, useLo, onHand: o.on_hand_cases, standing: o.standing_order_cases,
               cases, fits: (cases + o.on_hand_cases) * L <= life, lead: S.lead_time_days };
    });
  }

  function upcoming(E) {
    const r = [];
    E.outlets.forEach(o => {
      const hi = o.forecast.map((f, j) => (f >= o.usual[j] * 1.15 ? j : -1)).filter(j => j >= 0);
      const lo = o.forecast.map((f, j) => (f <= o.usual[j] * 0.85 ? j : -1)).filter(j => j >= 0);
      if (hi.length) r.push({ outlet: o.id, kind: "peak", days: hi });
      if (lo.length) r.push({ outlet: o.id, kind: "quiet", days: lo });
    });
    return r;
  }

  function plan(E) {
    const st = staff(E), mc = machines(E), sk = stock(E);
    return { staff: st, machines: mc, stock: sk, upcoming: upcoming(E), forecast: E.outlets.map(o => forecast(E, o)) };
  }

  // "Mon–Fri", "Sat", "Mon, Wed"
  function dayRange(E, js) {
    const s = [...js].sort((a, b) => a - b), parts = [];
    for (let i = 0; i < s.length;) { let k = i; while (k + 1 < s.length && s[k + 1] === s[k] + 1) k++;
      parts.push(k > i ? `${E.days[s[i]]}–${E.days[s[k]]}` : E.days[s[i]]); i = k + 1; }
    return parts.join(", ");
  }

  const api = { inputs, forecast, staff, machines, stock, upcoming, plan, dayRange, out };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageePlanning = api;
})(typeof window !== "undefined" ? window : globalThis);
