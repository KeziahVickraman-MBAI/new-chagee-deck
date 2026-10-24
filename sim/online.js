/* online.js - slides 03 to 07: the online retailing business case (capacity-aware ordering, targeted discounts,
 * self-pickup rewards), reconciled against the team brief.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeOnline). Every input is assumptions.json:
 * reused (outlets, cups per outlet, open days, price, margin, hourly curve, third-party delivery share and commission,
 * specialist day rate, platform cost per store, pilot outlets, horizon) or new and labelled (online_case.*).
 * Nothing here feeds another chapter: a peak order kept by rerouting is not counted again in the counter chapter.
 *
 *   inputs(RAW)         the inputs, with the deck's values where they exist
 *   annual(E, s)        one scenario ("low" | "base" | "high") at full scale, per year:
 *                       i1 rerouting: peak-hour Chagee-app orders kept (Grab orders cannot be rerouted in the app);
 *                       i2 offers: off-peak app orders redeemed with an offer; the discount is paid on every redeemed
 *                          order, incremental or not, so contribution = incremental x margin - redeemed x discount;
 *                       i3 pickup: orders moved to Chagee-app pickup from Grab delivery (fulfilment and channel change)
 *                          and from Grab self-pickup (channel change only); their revenue moves, it is not added; each
 *                          saves the commission avoided less the app payment cost and the pickup reward;
 *                       gross contribution, then the run team and cloud: the operating result
 *   cashflow(E, s)      month by month over the horizon: nothing in build (months 1-6), the pilot outlets' share in
 *                       the pilot (7-12), an even ramp to every outlet in scale-up (13-18), full after; the team as it
 *                       joins, the run team after month 18, integration spread over the build. Implementation spend,
 *                       cumulative cash and payback month (null if not within the horizon)
 *   brief(E)            the brief's arithmetic rebuilt from its own inputs, and the shares it implies
 *   compare(E)          the three scenarios, their cash flows, the brief and the break-even requirements
 */
(function (root) {
  "use strict";

  function inputs(RAW) {
    const O = RAW.online_case, v = k => O[k].value, BC = RAW.business_case, X = RAW.site_ext;
    const hs = RAW.store.hourly_demand_share.value, ph = v("peak_hours");
    const peakShare = [...hs].sort((a, b) => b - a).slice(0, ph).reduce((a, b) => a + b, 0);
    const ch = v("channel_shares"), del = X.delivery_share_of_cups.value;
    const price = RAW.storyboard.price_per_cup.value, margin = RAW.storyboard.gross_margin_per_cup.value;
    const R = k => ({ base: v(k), low: O[k].range[0], high: O[k].range[1] });
    return {
      outlets: RAW.facts.sg_outlets.value, outletsLocator: v("outlets_locator"), cupsPerOutlet: RAW.store.cups_per_store_per_year.value,
      days: RAW.store.open_days_per_year.value, price, margin, contrib: price * margin, peakHours: ph, peakShare,
      delShare: del, gpShare: ch.grab_pickup, adShare: ch.app_delivery, appShare: 1 - del - ch.grab_pickup - ch.app_delivery,
      comm: X.delivery_commission_share.value, gpComm: v("grab_pickup_commission"), pay: v("app_payment_cost"), reward: v("pickup_reward"),
      offerShare: v("offer_share"), discount: v("offer_discount"),
      retained: R("peak_retained_share"), incShare: R("offer_incremental_share"), shiftDel: R("shift_share_delivery"), shiftGp: R("shift_share_grab_pickup"),
      personMonth: BC.specialist_day_rate.value * BC.working_days_per_month.value, cloudPerStoreMonth: BC.platform_per_store_month.value,
      team: v("team"), runTeam: v("run_team_people"), integration: v("integration_one_time"),
      roadmap: v("roadmap"), gates: v("gates"), pilot: RAW.storyboard.pilot_outlets.value, months: BC.horizon_years.value * 12,
      policy: v("offer_policy"), briefIn: v("brief"),
    };
  }

  function annual(E, s = "base") {
    const cups = E.outlets * E.cupsPerOutlet, app = cups * E.appShare;
    const peakApp = app * E.peakShare, offApp = app - peakApp;
    const kept = peakApp * E.retained[s];
    const i1 = { eligible: peakApp, cups: kept, sales: kept * E.price, contrib: kept * E.contrib };
    const red = offApp * E.offerShare, inc = red * E.incShare[s], disc = red * E.discount;
    const i2 = { eligible: offApp, redeemed: red, incremental: inc, discountCost: disc, sales: inc * E.price - disc,
                 contrib: inc * E.contrib - disc, breakEvenInc: E.discount / E.contrib };
    const mvD = cups * E.delShare * E.shiftDel[s], perD = E.price * (E.comm - E.pay) - E.reward;
    const mvP = cups * E.gpShare * E.shiftGp[s], perP = E.price * (E.gpComm - E.pay) - E.reward;
    const i3 = { delivery: { eligible: cups * E.delShare, moved: mvD, perOrder: perD, contrib: mvD * perD, shiftedRevenue: mvD * E.price },
                 grabPickup: { eligible: cups * E.gpShare, moved: mvP, perOrder: perP, contrib: mvP * perP, shiftedRevenue: mvP * E.price,
                               breakEvenComm: E.pay + E.reward / E.price },
                 rewardCost: (mvD + mvP) * E.reward };
    i3.contrib = i3.delivery.contrib + i3.grabPickup.contrib;
    const gross = i1.contrib + i2.contrib + i3.contrib, sales = i1.sales + i2.sales;
    const team = E.runTeam * E.personMonth * 12, cloud = E.outlets * E.cloudPerStoreMonth * 12;
    return { cups, revenue: cups * E.price, app, i1, i2, i3, sales, gross, team, cloud, operating: gross - team - cloud,
             teamAt: n => n * E.personMonth * 12 };
  }

  // share of full-scale benefit in month m: build, pilot outlets, an even ramp to every outlet, then all
  function share(E, m) {
    const p = E.pilot / E.outlets, [b, pl, sc] = E.roadmap;
    if (m <= b.to) return 0;
    if (m <= pl.to) return p;
    if (m <= sc.to) return p + (1 - p) * (m - pl.to) / (sc.to - pl.to);
    return 1;
  }

  function cashflow(E, s = "base") {
    const A = annual(E, s), last = E.roadmap[E.roadmap.length - 1].to, build = E.roadmap[0].to, rows = [];
    let cum = 0, payback = null, low = 0;
    for (let m = 1; m <= E.months; m++) {
      const f = share(E, m), people = m <= last ? E.team.filter(r => r.from_month <= m).reduce((a, r) => a + r.people, 0) : E.runTeam;
      const benefit = A.gross / 12 * f, team = people * E.personMonth, cloud = E.outlets * E.cloudPerStoreMonth * f;
      const integ = m <= build ? E.integration / build : 0, net = benefit - team - cloud - integ;
      cum += net; low = Math.min(low, cum);
      if (payback == null && m > 1 && cum >= 0 && rows[m - 2].cum < 0) payback = m;
      rows.push({ m, f, people, benefit, team, cloud, integ, net, cum });
    }
    const years = [];
    for (let y = 0; y < E.months / 12; y++) {
      const r = rows.slice(y * 12, y * 12 + 12), sum = k => r.reduce((a, x) => a + x[k], 0);
      years.push({ year: y + 1, benefit: sum("benefit"), team: sum("team"), cloud: sum("cloud"), integ: sum("integ"), net: sum("net"), cum: r[r.length - 1].cum });
    }
    const implementation = rows.slice(0, build).reduce((a, x) => a + x.team + x.integ + x.cloud, 0);
    return { rows, years, implementation, payback, trough: low, end: cum };
  }

  function brief(E) {
    const B = E.briefIn, base = B.outlets * B.cups_per_day * B.days * B.price;
    const rerouting = base * B.peak_share * B.retained, pricingBase = B.sales.pricing / B.offpeak_uplift;
    const moved = pricingBase * B.shift;
    return { base, rerouting, reroutingMargin: B.profit.rerouting / B.sales.rerouting, pricingBase, pricingBaseShare: pricingBase / base,
             pricingProfit: B.sales.pricing * B.delivery_margin, moved, pickupSaving: moved * (B.commission - B.payment),
             ourBase: E.outlets * E.cupsPerOutlet * E.price, locatorScale: E.outletsLocator / E.outlets };
  }

  function compare(E) {
    const sc = ["low", "base", "high"], out = { scenarios: {}, cash: {} };
    sc.forEach(s => { out.scenarios[s] = annual(E, s); out.cash[s] = cashflow(E, s); });
    const b = out.scenarios.base;
    out.brief = brief(E);
    out.breakEven = { incShare: b.i2.breakEvenInc, grabPickupComm: b.i3.grabPickup.breakEvenComm, grossNeeded: b.team + b.cloud,
                      runTeamCovered: Math.floor((b.gross - b.cloud) / (E.personMonth * 12)) };
    return out;
  }

  const api = { inputs, annual, cashflow, brief, compare, share };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeOnline = api;
})(typeof window !== "undefined" ? window : globalThis);
