/* benefit.js - slide 10: the size of the benefit, one Singapore outlet, against a stated counterfactual.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeBenefit).
 * Uses counter.js (forecastDay, dayCost, compare) unchanged; every number is assumptions.json.
 *
 * Counterfactual: an all-by-hand counter with a flat normal-day roster (the normal day's forecast crew every day).
 * Levers, each against that counterfactual, for each day type (normal, busy, event):
 *   a  roster to the forecast: the day's forecast crew instead of the flat roster, all by hand;
 *   b  counter split: the machine stations (o.robots) with the flat roster;
 *   ab both at once, in one run (not a + b: they share the same labour hours).
 * Two crew rules for a and ab: the day's forecast crew, which is the fewest people keeping peak-hour walk-aways within
 * storyboard.walkaway_target (checked at build); and aE, abE, the economic rule: from the flat crew up to
 * storyboard.extra_staff_search more, the crew with the largest orders kept x price x margin less extra labour.
 * Walk-aways are the counter replica's peak hour only (the hour slide 09 shows), so orders avoided are a floor.
 *
 *   runs(Sim, Store, C, P, o)       the simulation part, money-free: peak-hour orders lost, labour hours a day and
 *                                   machine units, per day type and per case (cf, a, b, ab).
 *   value(R, P, econ)               money from runs: econ = { wage, unitMonth, price, margin, days: { busy, event } };
 *                                   per day type and a year, per case: orders avoided, revenue (orders x price),
 *                                   contribution (revenue x margin), labour saved, machine cost, profit
 *                                   (contribution + labour saved - machine cost). Revenue and labour stay separate.
 *   econ(RAW, P)                    the default econ from assumptions.json.
 */
(function (root) {
  "use strict";

  const CASES = { cf: { hand: true, flat: true }, a: { hand: true, flat: false }, b: { hand: false, flat: true }, ab: { hand: false, flat: false } };

  function runs(Sim, Store, C, P, o) {
    const out = { days: {} };
    for (const day of Object.keys(P.surgeMult)) {
      out.days[day] = {};
      for (const [k, cs] of Object.entries(CASES)) {
        const robots = cs.hand ? [] : o.robots, c = C.configure(P, robots);
        const rosterDay = cs.flat ? "none" : day;                         // flat = the normal day's forecast crew
        const staff = C.forecastDay(Sim, c.P, rosterDay, c.setup).peakStaff;
        const r = C.compare(Sim, Store, P, { day, robots, staff, mode: "brigade", walkBack: o.walkBack, seeds: o.seeds });
        const cost = C.dayCost(Sim, c.P, c.setup, rosterDay);
        out.days[day][k] = { staff, lost: r.lost, arrived: r.arrived, lostShare: r.lostShare, labourHours: cost.labourHours, machineUnits: cost.machineUnits };
      }
      // economic rule: candidate peak crews from the flat crew up (flat roster, crew k on the busy hours), money-free here
      for (const [k, robots] of [["hand", []], ["machine", o.robots]]) {
        const c = C.configure(P, robots), flat = C.forecastDay(Sim, c.P, "none", c.setup).peakStaff;
        out.days[day]["cand_" + k] = Array.from({ length: o.extra + 1 }, (_, i) => {
          const staff = flat + i, r = C.compare(Sim, Store, P, { day, robots, staff, mode: "brigade", walkBack: o.walkBack, seeds: o.seeds });
          const cost = C.dayCost(Sim, c.P, c.setup, "none", staff);
          return { staff, lost: r.lost, arrived: r.arrived, lostShare: r.lostShare, labourHours: cost.labourHours, machineUnits: cost.machineUnits };
        });
      }
    }
    return out;
  }

  // economic rule: the crew whose orders kept x price x margin, less its extra labour, is largest (ties: fewer people)
  function economic(cands, cf, e) {
    const gain = x => (cf.lost - x.lost) * e.price * e.margin - (x.labourHours - cands[0].labourHours) * e.wage;
    return cands.reduce((best, x) => (gain(x) > gain(best) + 1e-9 ? x : best));
  }

  function econ(RAW, P) {
    const S = RAW.storyboard;
    return { wage: P.wage, unitMonth: P.machineMonth, price: S.price_per_cup.value, margin: S.gross_margin_per_cup.value,
             days: { busy: S.busy_days_per_year.value, event: S.event_days_per_year.value } };
  }

  const DAYKEY = { none: "normal", moderate: "busy", large: "event" };
  const CASE_KEYS = ["a", "b", "ab", "aE", "abE"];               // a, ab: the 2% walk-away rule; aE, abE: the economic rule
  function value(R, P, e) {
    const n = { busy: e.days.busy, event: e.days.event }; n.normal = P.days - n.busy - n.event;
    const per = {}, year = {};
    for (const [day, r0] of Object.entries(R.days)) {
      const cf = r0.cf, out = {};
      const row = { ...r0, aE: economic(r0.cand_hand, cf, e), abE: economic(r0.cand_machine, cf, e) };
      for (const k of CASE_KEYS) {
        const x = row[k], orders = cf.lost - x.lost, revenue = orders * e.price, contribution = revenue * e.margin;
        const labour = (cf.labourHours - x.labourHours) * e.wage, machine = x.machineUnits * e.unitMonth * 12 / P.days;
        out[k] = { staff: x.staff, orders, revenue, contribution, labour, machine, counterNet: labour - machine, profit: contribution + labour - machine };
      }
      per[DAYKEY[day]] = out;
    }
    for (const k of CASE_KEYS) {
      year[k] = {};
      for (const f of ["orders", "revenue", "contribution", "labour", "machine", "counterNet", "profit"])
        year[k][f] = Object.entries(per).reduce((s, [d, v]) => s + n[d] * v[k][f], 0);
    }
    return { per, year, daysUsed: n };
  }

  // everything slide 10 shows, from precomputed runs (so the browser can redo it when the days-a-year input moves):
  // R = { base, volLo, volHi, fragile, today } runs; Ps = matching params; e = econ. RAW gives the input ranges.
  function summary(R, Ps, RAW, e) {
    const S = RAW.storyboard, cr = RAW.costs;
    const base = value(R.base, Ps.base, e), pyr = v => v.year.ab.profit;
    const ins = [                                                     // one-at-a-time low/high, for the chart and the range
      ["wage", "Wage", cr.labour_cost_per_hour.range, x => ({ R: R.base, P: Ps.base, e: { ...e, wage: x } })],
      ["unitMonth", "Machine cost", cr.machine_cost_per_unit_per_month.range, x => ({ R: R.base, P: Ps.base, e: { ...e, unitMonth: x } })],
      ["volume", "Cups a day", ["lo", "hi"], x => ({ R: x === "lo" ? R.volLo : R.volHi, P: x === "lo" ? Ps.volLo : Ps.volHi, e })],
      ["price", "Price per cup", S.price_per_cup.range, x => ({ R: R.base, P: Ps.base, e: { ...e, price: x } })],
      ["margin", "Margin per cup", S.gross_margin_per_cup.range, x => ({ R: R.base, P: Ps.base, e: { ...e, margin: x } })]];
    const tornado = ins.map(([k, label, ends, f]) => {
      const [lo, hi] = ends.map(x => { const c = f(x); return pyr(value(c.R, c.P, c.e)); });
      return { k, label, ends, lo, hi, adverse: lo <= hi ? 0 : 1 };
    });
    const pick = which => {                                           // every input at the end that lowers (0) or raises (1) profit
      let c = { R: R.base, P: Ps.base, e: { ...e } };
      tornado.forEach((t, i) => { const end = t.ends[which === 0 ? t.adverse : 1 - t.adverse], x = ins[i][3](end);
        if (t.k === "volume") { c.R = x.R; c.P = x.P; } else c.e = { ...c.e, [t.k]: x.e[t.k] }; });
      return value(c.R, c.P, c.e);
    };
    const low = pick(0), high = pick(1);
    // orders vary with volume only, revenue with volume and price: their own ranges, not the profit extremes'
    const vols = [[R.volLo, Ps.volLo], [R.base, Ps.base], [R.volHi, Ps.volHi]];
    const span = xs => [Math.min(...xs), Math.max(...xs)];
    const orders = span(vols.map(([r, p]) => value(r, p, e).year.ab.orders));
    const revenue = span(vols.flatMap(([r, p]) => S.price_per_cup.range.map(x => value(r, p, { ...e, price: x }).year.ab.revenue)));
    const contribution = S.gross_margin_per_cup.range.map(m => value(R.base, Ps.base, { ...e, margin: m }).year.ab.contribution);
    // combined against a + b: the orders and revenue overlap; labour can come out above (fewer extra hours with a machine)
    const Y = base.year, ex = f => Y.ab[f] - Y.a[f] - Y.b[f];
    const interaction = { orders: ex("orders"), revenue: ex("revenue"), contribution: ex("contribution"), counterNet: ex("counterNet"), profit: ex("profit") };
    // the headline split: the machine alone (automation) and what rostering to the forecast adds on top (the AI part)
    const split = rule => { const ab = rule === "E" ? "abE" : "ab";
      return { automation: base.year.b.profit, forecast: base.year[ab].profit - base.year.b.profit, total: base.year[ab].profit }; };
    const fragile = value(R.fragile, Ps.fragile, e);
    return { base, low, high, tornado, orders, revenue, contribution, interaction, split: { L: split("L"), E: split("E") },
             minCrew: [fragile.year.ab.profit, base.year.ab.profit],
             fragile, today: value(R.today, Ps.base, e) };
  }

  const api = { runs, value, econ, summary, CASES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeBenefit = api;
})(typeof window !== "undefined" ? window : globalThis);
