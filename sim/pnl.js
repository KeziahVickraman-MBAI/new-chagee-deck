/* pnl.js - slide 05's "What does this mean for P&L?": five years of the same new outlet at two sites.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageePnl). Every input is assumptions.json:
 * reused (price, margin, wage, rent, utilities, delivery, set-up, open days, machine units) or new and labelled (pnl.*).
 * Cups come from the slide 05 engine (sitepick.js forecast): what the store sells and what it moves from nearby outlets.
 * Both scenarios open on the same date with the same equipment (today's split, sized for an average outlet) and the same
 * staffing rule (counter.js forecastDay, a normal day), so only the site differs. Nothing here feeds any other slide.
 *
 *   inputs(RAW, P)                 the money inputs, with where each comes from
 *   project(deps, E, site, ai, v)  one scenario, years 1-5: site = { sells, moved } cups a day; ai adds the AI costs;
 *                                  v = volume multiplier (pnl.volume_scenarios). Per year: new-store revenue, displaced
 *                                  revenue, net additional network sales; new-store ingredients and packaging (1 - margin),
 *                                  delivery commission, labour (staffing rule at the new store's cups), machine units,
 *                                  rent, utilities, maintenance; contribution lost at nearby outlets (their revenue less
 *                                  their variable costs: their rent and staff stay); recurring AI cost; incremental
 *                                  operating profit before depreciation, interest and tax. Investment at opening = set-up
 *                                  (+ AI implementation, allocated); payback from cumulative cash flow, null beyond year 5
 *   compare(deps, E, wo, wi)       both scenarios at low / base / high volume; five-year uplifts; the AI cost's own payback
 */
(function (root) {
  "use strict";

  function inputs(RAW, P) {
    const N = RAW.pnl, v = k => N[k].value, X = RAW.site_ext, [lo, hi] = RAW.store.cups_per_store_per_year.range;
    return {
      days: P.days, price: RAW.storyboard.price_per_cup.value, margin: RAW.storyboard.gross_margin_per_cup.value,
      wage: P.wage, machineMonth: P.machineMonth, rent: X.rent_per_month.value, utilities: X.utilities_per_month.value,
      maint: v("store_maintenance_per_month"), delShare: X.delivery_share_of_cups.value, commission: X.delivery_commission_share.value,
      setup: X.setup_cost.value, years: v("years"), ramp: v("ramp_up"), growth: v("demand_growth"), inflation: v("cost_inflation"),
      aiImpl: v("ai_implementation_cost"), aiRec: v("ai_recurring_per_year"), aiShare: v("ai_cost_share_to_outlet"),
      vol: { low: lo / P.cupsYear, base: 1, high: hi / P.cupsYear },
    };
  }

  function project({ Sim, C, P }, E, site, ai, v = 1) {
    const c = C.configure(P, P.mixedMachine), units = Sim.plan(c.P, c.setup).machineUnits;   // same counter at both sites
    const vc = E.margin - E.delShare * E.commission;                // contribution per S$ of sales, after delivery commission
    const share = ai ? E.aiShare : 0, invest = E.setup + E.aiImpl * share;
    let cum = -invest, payback = null;
    const years = [];
    for (let y = 1; y <= E.years; y++) {
      const k = E.ramp[Math.min(y, E.ramp.length) - 1] * (1 + E.growth) ** (y - 1) * v, inf = (1 + E.inflation) ** (y - 1);
      const cupsNew = site.sells * k, cupsMoved = site.moved * k;
      const revNew = cupsNew * E.days * E.price, revMoved = cupsMoved * E.days * E.price;
      const F = C.forecastDay(Sim, { ...c.P, cupsYear: cupsNew * E.days }, "none", c.setup);
      const r = { y, cupsNew, cupsMoved, revNew, revMoved, netRev: revNew - revMoved,
        cogs: revNew * (1 - E.margin), delivery: revNew * E.delShare * E.commission,
        labour: F.staff.reduce((a, b) => a + b, 0) * E.wage * E.days * inf,
        machine: units * E.machineMonth * 12 * inf, rent: E.rent * 12 * inf, utilities: E.utilities * 12 * inf, maint: E.maint * 12 * inf,
        lostContrib: revMoved * vc, aiRec: E.aiRec * share * inf };
      r.opex = r.cogs + r.delivery + r.labour + r.machine + r.rent + r.utilities + r.maint;
      r.opProfit = r.revNew - r.opex - r.lostContrib - r.aiRec;
      if (payback == null && cum + r.opProfit >= 0 && r.opProfit > 0) payback = y - 1 + -cum / r.opProfit;
      cum += r.opProfit; r.cum = cum; r.cumOp = years.reduce((a, q) => a + q.opProfit, 0) + r.opProfit;
      years.push(r);
    }
    const tot = f => years.reduce((a, r) => a + r[f], 0);
    return { years, units, invest, payback, total: { netRev: tot("netRev"), revNew: tot("revNew"), revMoved: tot("revMoved"), opProfit: tot("opProfit"),
      cogs: tot("cogs"), delivery: tot("delivery"), labour: tot("labour"), machine: tot("machine"), rent: tot("rent"), utilities: tot("utilities"),
      maint: tot("maint"), lostContrib: tot("lostContrib"), aiRec: tot("aiRec") } };
  }

  function compare(deps, E, wo, wi) {
    const run = (site, ai) => Object.fromEntries(Object.entries(E.vol).map(([n, v]) => [n, project(deps, E, site, ai, v)]));
    const A = run(wo, false), B = run(wi, true), a = A.base, b = B.base;
    // the AI cost's own payback: its allocated implementation cost against the yearly operating-profit uplift
    let aiPay = null, cum = -E.aiImpl * E.aiShare;
    for (let i = 0; i < b.years.length && aiPay == null; i++) { const d = b.years[i].opProfit - a.years[i].opProfit;
      if (d > 0 && cum + d >= 0) aiPay = i + -cum / d; cum += d; }
    return { wo: A, wi: B, uplift: { netRev: b.total.netRev - a.total.netRev, opProfit: b.total.opProfit - a.total.opProfit }, aiPayback: aiPay };
  }

  const api = { inputs, project, compare };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageePnl = api;
})(typeof window !== "undefined" ? window : globalThis);
