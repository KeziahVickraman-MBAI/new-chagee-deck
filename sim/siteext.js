/* siteext.js - slides 08 and 09, the extension: Jin's site-selection framework (four scores, pin to net profit).
 *
 * Pure functions, no UI. Node only (storyboard/precompute.js). Reuses the slide 05 engine (sitepick.js: model,
 * forecast) and the counter's day cost (counter.js: configure, dayCost) unchanged; every number is assumptions.json.
 * Illustrative, synthetic data, not Chagee data. Never feeds the benefit or the GM's decisions.
 *
 *   evaluate({ Sim, C, Site, RAW, P, GEO, TIERS })
 *     pin       candidate site A: the top app-search cluster of the slide 05 engine (the same site as slide 05's "With AI")
 *     cups      the benefit slide's default cups a day and range (store.cups_per_store_per_year / open days), not the
 *               engine's own cup forecast, so slides 09 and 11 rest on the same volume
 *     moved     the engine's share of the pin's cups taken from existing outlets (the cannibalisation factor),
 *               and the outlet that loses most (neighbour outlet B): its share of sales lost and distance
 *     scores    hand-set demand, delivery and competition scores, and the weighted site score (site_ext)
 *     month     per month: contribution (cups x price x margin), neighbours' lost contribution, delivery fees,
 *               counter staff and the one machine (dayCost, normal day), rent, utilities, net profit to Chagee
 *     net       net per month at the low, default and high cups a day; payback months at the set-up cost range
 *     rec       open / pilot / skip by site_ext.recommendation_rule
 *     contrast  the top cluster with exactly one outlet inside site_ext.ring_km, valued the same way
 */
"use strict";

function evaluate({ Sim, C, Site, RAW, P, GEO, TIERS }) {
  const X = RAW.site_ext, v = k => X[k].value, S = RAW.storyboard;
  const price = S.price_per_cup.value, margin = S.gross_margin_per_cup.value, perMonth = P.days / 12;
  const robots = TIERS.tiers.find(t => t.id === "single").replaces;
  const M = Site.model(Sim, RAW, GEO);
  const cupsAt = cy => cy / P.days, [yLo, yHi] = RAW.store.cups_per_store_per_year.range;
  const cups = { base: Sim.dailyBase(P), lo: cupsAt(yLo), hi: cupsAt(yHi) };

  // the engine at a pin: share of its cups moved from existing outlets, and the outlet that loses most
  const engine = pin => {
    const f = Site.forecast(M, pin), top = f.hit[0];
    const ring = M.stores.filter(([x, y]) => Math.hypot(x - pin.x, y - pin.y) * M.kmpx <= v("ring_km")).length;
    return { engineCups: f.cups, share: f.cannibal / f.cups, ring,
             neighbour: top ? { share: top.cups / M.storeCups[top.j], km: top.km } : null };
  };
  const counterDay = cy => { const PP = { ...P, cupsYear: cy }, c = C.configure(PP, robots); return C.dayCost(Sim, c.P, c.setup, "none").total; };
  const money = (c, share, cy) => {
    const contribution = c * price * margin * perMonth, moved = share * contribution;
    const delivery = c * v("delivery_share_of_cups") * price * v("delivery_commission_share") * perMonth;
    const counter = counterDay(cy) * perMonth, rent = v("rent_per_month"), utilities = v("utilities_per_month");
    return { contribution, moved, delivery, counter, rent, utilities, net: contribution - moved - delivery - counter - rent - utilities };
  };
  const value = (pin) => {
    const e = engine(pin), m = money(cups.base, e.share, P.cupsYear);
    const net = { lo: money(cups.lo, e.share, yLo).net, base: m.net, hi: money(cups.hi, e.share, yHi).net };
    const [sLo, sHi] = X.setup_cost.range;
    const payback = m.net > 0 ? { base: v("setup_cost") / m.net, lo: sLo / m.net, hi: sHi / m.net } : null;
    const rec = net.base <= 0 ? "skip" : net.lo > 0 ? "open" : "pilot";
    return { pin: { x: pin.x, y: pin.y }, ...e, month: m, net, payback, rec };
  };

  const sc = v("scores"), w = v("score_weights");
  const siteScore = Object.keys(w).reduce((a, k) => a + w[k] * sc[k], 0);
  const A = value(M.candidates[0]);
  const alt = M.candidates.find(c => engine(c).ring === 1);
  return { price, margin, cups, scores: sc, weights: w, siteScore, ...A, contrast: alt ? value(alt) : null };
}

module.exports = { evaluate };
