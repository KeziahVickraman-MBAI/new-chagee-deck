/* newmarket.js - slides 8A-8D: a new market with no Chagee history, Australia as the worked example.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeNewMarket). Every input is
 * assumptions.json new_market (A$, scenario assumptions) or reused, labelled, from the Singapore sections; nothing
 * here feeds slides 01-11. Reuses counter.js (configure, forecastDay, compare) and sim.js (plan) unchanged.
 *
 *   areas(RAW)                     archetype candidate areas and the features a market with no history can measure
 *   score(RAW, w)                  suitability 0-100 per area: each feature min-max scaled across the areas,
 *                                  turned round where it lowers the score, weighted mean; ranked
 *   sensitivity(RAW, w)            one weight at a time x new_market.sensitivity: best and worst rank per area
 *   cannibal(RAW, pilotId)         a second opening: share of each other area's cups taken from the pilot
 *   demand(RAW, P)                 low / base / high cups a day (the Singapore per-outlet placeholder scale)
 *   econ(RAW)                      the A$ inputs: wage, machine unit, price, margin, utilities
 *   runs(deps, seeds)              the counter simulation at each realised demand, each setup, each staffing:
 *                                  without AI = one crew all day, set for the planned (base) peak;
 *                                  with AI = the forecast roster, the forecast missing realised demand by
 *                                  new_market.forecast_error. Equipment sized for the base plan in every run;
 *                                  realised demand reaches the counter as a multiplier on the base arrivals
 *                                  Each realised demand runs on a normal, busy and event day: the AI roster knows the day
 *                                  type (and misses the level); the crew without AI does not
 *   money(r, E, rent, units, days) a day's operating contribution: served cups x price x margin, less labour,
 *                                  machine units and rent and utilities (before set-up, delivery, overheads)
 *   dayWeights, yearAvg            the year's average day, by new_market.day_mix
 *   breakEven(deps, E, rent, s)    cups a day at which the contribution is zero: with AI (roster follows the cups)
 *                                  and without (the fixed planned crew); walk-aways left out
 *   worst, flipMachine             year-average contribution, worst case over demand x forecast error, per setup; the
 *                                  machine unit cost at which the two worst cases meet; flipWage the same for the wage
 *
 * Walk-aways: the peak-hour walk-away share is applied to the busiest hours (surge.surge_hours), other hours
 * assumed served. An approximation, stated on the slide.
 */
(function (root) {
  "use strict";

  const NMv = (RAW, k) => RAW.new_market[k].value;

  function areas(RAW) {
    return { areas: NMv(RAW, "areas"), features: NMv(RAW, "features"), excluded: NMv(RAW, "excluded") };
  }

  function score(RAW, w) {
    const A = NMv(RAW, "areas"), F = NMv(RAW, "features"), W = w || NMv(RAW, "weights");
    const tot = F.reduce((a, f) => a + (W[f.key] || 0), 0) || 1;
    const scaled = F.map(f => { const v = A.map(a => a[f.key]), lo = Math.min(...v), hi = Math.max(...v);
      return A.map(a => { const z = hi > lo ? (a[f.key] - lo) / (hi - lo) : 0.5; return f.dir > 0 ? z : 1 - z; }); });
    const out = A.map((a, i) => ({ id: a.id, name: a.name,
      parts: Object.fromEntries(F.map((f, j) => [f.key, 100 * (W[f.key] || 0) * scaled[j][i] / tot])) }));
    out.forEach(o => (o.score = Object.values(o.parts).reduce((a, b) => a + b, 0)));
    out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).forEach((o, k) => (o.rank = k + 1));
    return out;
  }

  function sensitivity(RAW, w) {
    const W = w || NMv(RAW, "weights"), S = NMv(RAW, "sensitivity"), out = {};
    const variants = [W, ...Object.keys(W).flatMap(k => [S.low, S.high].map(m => ({ ...W, [k]: W[k] * m })))];
    variants.forEach(v => score(RAW, v).forEach(o => {
      const b = out[o.id] || (out[o.id] = { best: Infinity, worst: 0, top: 0 });
      b.best = Math.min(b.best, o.rank); b.worst = Math.max(b.worst, o.rank); if (o.rank === 1) b.top++;
    }));
    return { variants: variants.length, byArea: out };
  }

  function cannibal(RAW, pilotId) {
    const A = NMv(RAW, "areas"), c = NMv(RAW, "cannibalisation"), p = A.find(a => a.id === pilotId);
    return Object.fromEntries(A.map(a => {
      if (!p) return [a.id, 0];                                   // first opening: no Chagee outlet anywhere
      if (a.id === p.id) return [a.id, null];
      const d = Math.hypot(a.x_km - p.x_km, a.y_km - p.y_km);
      return [a.id, c.max_share * Math.max(0, 1 - d / c.overlap_km)];
    }));
  }

  function demand(RAW, P) {
    const [lo, hi] = RAW.store.cups_per_store_per_year.range;
    return { low: lo / P.days, base: P.cupsYear / P.days, high: hi / P.days };
  }

  function econ(RAW) {
    return { currency: NMv(RAW, "currency"), wage: NMv(RAW, "wage_per_hour"), machineMonth: NMv(RAW, "machine_cost_per_unit_per_month"),
             price: NMv(RAW, "price_per_cup"), margin: RAW.storyboard.gross_margin_per_cup.value, utilities: NMv(RAW, "utilities_per_month") };
  }

  // the counter for one setup, equipment sized for the planned (base) cups
  function setupOf({ Sim, C, RAW, P }, key) {
    const robots = RAW.storyboard.split_presets.value[key].robots, D = demand(RAW, P);
    const c = C.configure({ ...P, cupsYear: D.base * P.days }, robots);
    const pl = Sim.plan(c.P, c.setup), busy = Sim.surgeHourSet(c.P);
    const rosterDay = (cups, day) => C.forecastDay(Sim, { ...c.P, cupsYear: cups * P.days }, day, c.setup);
    const planned = rosterDay(D.base, "none").peakStaff;          // without AI: one crew, set once for a normal day's planned peak
    return { key, robots, setup: c.setup, P: c.P, units: pl.machineUnits, planned, hours: P.hours, days: P.days,
             busyShare: [...busy].reduce((a, h) => a + P.share[h], 0), rosterDay };
  }

  // one peak hour, many seeds: the base plan's counter facing `cups` a day on `day`, with `staff` at the peak
  function peak({ Sim, Store, C, P }, S, cups, day, staff, walkBack, seeds) {
    const D = S.P.cupsYear / P.days, Q = { ...S.P, surgeMult: { ...S.P.surgeMult, realised: cups / D * S.P.surgeMult[day] } };
    const r = C.compare(Sim, Store, Q, { day: "realised", robots: S.robots, staff, mode: "brigade", walkBack, seeds });
    return { lostShare: r.lostShare, medianWait: r.medianWait };
  }
  // realised cups that day, all hours and the busiest ones (the day's multiplier lands on surge.surge_hours)
  const dayCups = (S, cups, day) => { const m = S.P.surgeMult[day], busy = S.busyShare * cups * m;
    return { dayCups: cups * (1 - S.busyShare) + busy, busyCups: busy }; };

  function runs(deps, seeds) {
    const { RAW, P } = deps, D = demand(RAW, P), E = NMv(RAW, "forecast_error"), walkBack = RAW.illustration.walk_back_speed.value;
    const sc = NMv(RAW, "scan"), days = Object.keys(P.surgeMult), out = { demand: D, errors: E, days, setups: {} };
    for (const key of NMv(RAW, "setups")) {
      const S = setupOf(deps, key), row = { setup: S.setup, units: S.units, planned: S.planned, at: {}, scan: {} };
      const without = (cups, day) => ({ cups, day, staff: S.planned, labourHours: S.planned * S.hours, ...dayCups(S, cups, day),
                                        ...peak(deps, S, cups, day, S.planned, walkBack, seeds) });
      const ai = (cups, day, e) => { const F = C_roster(S, cups * (1 + e), day);
        return { cups, day, forecast: cups * (1 + e), staff: F.peakStaff, labourHours: F.staff.reduce((a, b) => a + b, 0), ...dayCups(S, cups, day),
                 ...peak(deps, S, cups, day, F.peakStaff, walkBack, seeds) }; };
      for (const [name, cups] of Object.entries(D)) {
        row.at[name] = Object.fromEntries(days.map(day => [day, { without: without(cups, day), ai: Object.fromEntries(E.map(e => [String(e), ai(cups, day, e)])) }]));
      }
      for (const day of days) { row.scan[day] = [];
        for (let m = sc.from; m <= sc.to + 1e-9; m += sc.step) row.scan[day].push({ ai: ai(D.base * m, day, 0), without: without(D.base * m, day) }); }
      out.setups[key] = row;
    }
    return out;
  }
  const C_roster = (S, cups, day) => S.rosterDay(cups, day);

  // a day's operating contribution (before set-up, delivery and overheads), in the A$ of econ()
  function money(r, E, rentMonth, units, days) {
    const lost = r.lostShare * r.busyCups, served = r.dayCups - lost;
    const labour = r.labourHours * E.wage, machine = units * E.machineMonth * 12 / days, fixed = (rentMonth + E.utilities) * 12 / days;
    return { served, lost, gross: served * E.price * E.margin, labour, machine, fixed,
             contribution: served * E.price * E.margin - labour - machine - fixed };
  }
  // the year's average day: normal, busy and event days weighted by new_market.day_mix
  function dayWeights(RAW, P) {
    const m = NMv(RAW, "day_mix"), busy = Object.values(m).reduce((a, b) => a + b, 0);
    return Object.fromEntries(Object.keys(P.surgeMult).map(d => [d, (d === "none" ? P.days - busy : m[d] || 0) / P.days]));
  }
  const yearAvg = (W, f) => Object.entries(W).reduce((a, [d, w]) => a + w * f(d), 0);

  function breakEven({ Sim, C, RAW, P }, E, rentMonth, key) {
    const S = setupOf({ Sim, C, RAW, P }, key), cm = E.price * E.margin;
    const fixed = S.units * E.machineMonth * 12 / P.days + (rentMonth + E.utilities) * 12 / P.days;
    const withoutAI = (fixed + S.planned * S.hours * E.wage) / cm;
    let withAI = null;
    for (let c = 1; c <= 4 * demand(RAW, P).high; c++) {
      const h = S.rosterDay(c, "none").staff.reduce((a, b) => a + b, 0);
      if (c * cm - h * E.wage - fixed >= 0) { withAI = c; break; }
    }
    return { withAI, withoutAI, units: S.units, planned: S.planned };
  }

  // year-average contribution with AI staffing, worst case over realised demand x forecast error;
  // and the machine unit cost at which the two setups' worst cases meet (contribution falls linearly in it)
  function worst(R, E, rentMonth, W, days) {
    return Object.fromEntries(Object.entries(R.setups).map(([k, s]) => {
      const all = Object.values(s.at).flatMap(a => R.errors.map(e => yearAvg(W, d => money(a[d].ai[String(e)], E, rentMonth, s.units, days).contribution)));
      return [k, Math.min(...all)];
    }));
  }
  function flipMachine(R, E, rentMonth, W, days) {
    const [a, b] = Object.keys(R.setups), w0 = worst(R, { ...E, machineMonth: 0 }, rentMonth, W, days);
    const ua = R.setups[a].units, ub = R.setups[b].units;
    if (ua === ub) return null;
    const x = (w0[a] - w0[b]) / ((ua - ub) * 12 / days);
    return x > 0 ? x : null;
  }

  // the wage at which the two setups' worst cases meet, by bisection over [lo, hi]; null if one wins throughout
  function flipWage(R, E, rentMonth, W, days, [lo, hi]) {
    const [a, b] = Object.keys(R.setups), gap = w => { const x = worst(R, { ...E, wage: w }, rentMonth, W, days); return x[a] - x[b]; };
    let g0 = gap(lo), g1 = gap(hi); if (g0 * g1 > 0) return null;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2, gm = gap(m); if (gm * g0 > 0) { lo = m; g0 = gm; } else hi = m; }
    return (lo + hi) / 2;
  }

  const api = { flipWage, areas, score, sensitivity, cannibal, demand, econ, setupOf, runs, money, dayWeights, yearAvg, breakEven, worst, flipMachine };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeNewMarket = api;
})(typeof window !== "undefined" ? window : globalThis);
