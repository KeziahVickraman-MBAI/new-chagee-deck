/* siteext.js - slides 08 and 09, the extension: Jin's site-selection framework (four scores, pin to net profit).
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeSiteExt). Reuses the slide 05 engine
 * (sitepick.js: model, forecast) and the counter's day cost (counter.js: configure, dayCost) unchanged; every number
 * is assumptions.json. Illustrative, synthetic data, not Chagee data. Never feeds the benefit or the GM's decisions.
 *
 *   econ(RAW, P)                 the money inputs: price and margin (the benefit slide's), delivery, rent, utilities, set-up
 *   siteScore(scores, weights)   weighted site score out of 100 (cannibalisation is deducted in the profit, not scored)
 *   appraise(deps, e, share, c)  at c cups a day and a share of cups moved from existing outlets: a month's contribution
 *                                (cups x price x margin), neighbours' lost contribution, delivery fees, counter staff and
 *                                the one machine (dayCost, normal day), rent, utilities, net profit to Chagee; net at the
 *                                low end of the cups range; payback at the set-up cost and its range; open / pilot / skip
 *                                by site_ext.recommendation_rule
 *   evaluate(deps)               the precomputed slide figures (Node, storyboard/precompute.js):
 *     pins      three pins from the slide 05 engine, each with its moved share, its most-hit outlet (neighbour outlet B)
 *               and the outlets inside site_ext.ring_km: A the top app-search cluster (slide 05's "With AI"),
 *               C the top cluster with exactly one outlet inside the ring, D beside the outlet nearest A (slide 05's
 *               "Without AI")
 *     cups      the benefit slide's default cups a day and range (store.cups_per_store_per_year / open days), not the
 *               engine's own cup forecast, so slides 09 and 11 rest on the same volume
 *     the rest  pin A appraised at the default; contrast = pin C appraised the same way
 */
(function (root) {
  "use strict";

  function econ(RAW, P) {
    const X = RAW.site_ext, v = k => X[k].value, S = RAW.storyboard, [yLo, yHi] = RAW.store.cups_per_store_per_year.range;
    return { price: S.price_per_cup.value, margin: S.gross_margin_per_cup.value, perMonth: P.days / 12,
             deliveryShare: v("delivery_share_of_cups"), commission: v("delivery_commission_share"),
             rent: v("rent_per_month"), utilities: v("utilities_per_month"), setup: v("setup_cost"), setupRange: X.setup_cost.range,
             cups: { base: P.cupsYear / P.days, lo: yLo / P.days, hi: yHi / P.days } };
  }

  const siteScore = (sc, w) => Object.keys(w).reduce((a, k) => a + w[k] * sc[k], 0);

  function appraise({ Sim, C, P, TIERS }, e, share, c) {
    const robots = TIERS.tiers.find(t => t.id === "single").replaces;
    const counterDay = cups => { const PP = { ...P, cupsYear: cups * P.days }, k = C.configure(PP, robots); return C.dayCost(Sim, k.P, k.setup, "none").total; };
    const month = cups => {
      const contribution = cups * e.price * e.margin * e.perMonth, moved = share * contribution;
      const delivery = cups * e.deliveryShare * e.price * e.commission * e.perMonth;
      const counter = counterDay(cups) * e.perMonth, rent = e.rent, utilities = e.utilities;
      return { contribution, moved, delivery, counter, rent, utilities, net: contribution - moved - delivery - counter - rent - utilities };
    };
    const m = month(c), lo = month(e.cups.lo).net;
    const payback = m.net > 0 ? { base: e.setup / m.net, lo: e.setupRange[0] / m.net, hi: e.setupRange[1] / m.net } : null;
    const rec = m.net <= 0 ? "skip" : lo > 0 ? "open" : "pilot";
    return { cupsDay: c, month: m, netLo: lo, payback, rec };
  }

  function evaluate(deps) {
    const { Sim, Site, RAW, P, GEO } = deps, X = RAW.site_ext, e = econ(RAW, P);
    const M = Site.model(Sim, RAW, GEO);
    const engine = (id, pin) => {
      const f = Site.forecast(M, pin), top = f.hit[0];
      const ring = M.stores.filter(([x, y]) => Math.hypot(x - pin.x, y - pin.y) * M.kmpx <= X.ring_km.value).length;
      return { id, x: pin.x, y: pin.y, share: f.cannibal / f.cups, ring,
               neighbour: top ? { share: top.cups / M.storeCups[top.j], km: top.km } : null };
    };
    const A = M.candidates[0];
    const Cc = M.candidates.find(c => engine("C", c).ring === 1);
    const j = M.stores.map(([x, y], k) => [Math.hypot(x - A.x, y - A.y), k]).sort((a, b) => a[0] - b[0])[0][1];
    const pins = [engine("A", A), Cc && engine("C", Cc), engine("D", { x: M.stores[j][0] + 3, y: M.stores[j][1] })].filter(Boolean);
    const full = p => { const a = appraise(deps, e, p.share, e.cups.base);
      return { ...p, month: a.month, net: { lo: a.netLo, base: a.month.net, hi: appraise(deps, e, p.share, e.cups.hi).month.net }, payback: a.payback, rec: a.rec }; };
    const sc = X.scores.value, w = X.score_weights.value;
    const pA = full(pins[0]), pC = pins.find(p => p.id === "C");
    return { price: e.price, margin: e.margin, cups: e.cups, scores: sc, weights: w, siteScore: siteScore(sc, w),
             pins, ...pA, contrast: pC ? full(pC) : null };
  }

  const api = { econ, siteScore, appraise, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeSiteExt = api;
})(typeof window !== "undefined" ? window : globalThis);
