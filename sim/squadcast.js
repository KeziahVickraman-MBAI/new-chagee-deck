/* squadcast.js - slide 06b: squad signals into a pickup-window forecast. SYNTHETIC: a demonstration of the mechanics.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeSquadcast). Every input is
 * assumptions.json squadcast (illustrative, synthetic, not Chagee data) or the deck's own volume and hourly shape.
 *
 * One outlet's pickup window (the peak hour's first half). Its cups = walk-in and ordinary app cups (not visible
 * beforehand) + squad cups: members who confirm a drink in a group basket, and gifts redeemed for the window. Both move
 * with the day's demand level m, which nobody knows in advance.
 *
 *   inputs(RAW, P)              the window's calendar baseline and the assumptions (gifts scale with the squad share)
 *   simulate(E, seed, Sim)      one window: the day level, timed signals (basket opened with n invited, member confirmed,
 *                               gift sent, gift redeemed) and the actual cups
 *   learn(E, Sim)               from synthetic history only: the chance an invited member not yet confirmed at time t
 *                               still confirms, the chance a gift not yet redeemed at t still is, and the squad cups
 *                               that arrive after t from baskets and gifts not yet started at t
 *   forecast(E, H, w, t)        at t minutes before the window, using only signals up to t:
 *                               baseline = the calendar baseline;
 *                               enhanced = the baseline's non-squad part + confirmed cups + predicted cups not yet
 *                               confirmed (open baskets' unconfirmed invitees x learned chance, unredeemed gifts x
 *                               learned chance, squad cups still to start). Confirmed cups are counted once; an
 *                               invitation or an unredeemed gift is never a confirmed drink
 *   evaluate(E, H, Sim)         mean absolute error of both forecasts at each of eval_leads, over eval_windows
 *   pickDays(E, Sim, targets)   the seeds of the slide's quiet, typical and busy example days (actual / baseline)
 *   pickSuccess(E, H, Sim, r, t) a squad-rush day where the squad forecast is closer at minute t, and how often that holds
 */
(function (root) {
  "use strict";
  const V = (RAW, k) => RAW.squadcast[k].value;

  function inputs(RAW, P) {
    const share = P.share, h = share.indexOf(Math.max(...share)), W = V(RAW, "window_minutes");
    return { base: P.cupsYear / P.days * share[h] * W / 60, hour: h, W, lead: V(RAW, "lead_minutes"), s: V(RAW, "social_share"),
             inv: V(RAW, "invites_per_basket"), conv: V(RAW, "member_conversion"), delay: V(RAW, "confirm_delay_minutes"),
             gifts: V(RAW, "gifts_per_window"), redeem: V(RAW, "gift_redeem_share"), gdelay: V(RAW, "gift_redeem_delay_minutes"),
             sd: V(RAW, "day_shock_sd"), nHist: V(RAW, "history_windows"), nEval: V(RAW, "eval_windows"), leads: V(RAW, "eval_leads"),
             mix: V(RAW, "drink_mix"), seed: RAW.simulation.base_seed.value, s0: V(RAW, "social_share") };
  }

  const expo = (R, mean) => -mean * Math.log(1 - R());
  const gauss = R => { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
  const pois = (R, lam) => { if (lam <= 0) return 0; let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= R(); } while (p > L && k < 500); return k - 1; };

  function simulate(E, seed, Sim) {
    const R = Sim.rng(Sim.hash(E.seed, 8800 + seed)), m = Math.max(0.3, 1 + E.sd * gauss(R)), drinks = Object.keys(E.mix);
    const pick = () => { let u = R(), a = 0; for (const d of drinks) { a += E.mix[d]; if (u < a) return d; } return drinks[drinks.length - 1]; };
    const other = pois(R, E.base * (1 - E.s) * m), ev = [];
    // squad baskets: enough on average that confirmed members give the squad share of the window's cups
    const gifts = E.s0 > 0 ? E.gifts * E.s / E.s0 : 0;          // gifts scale with the squad share: none when it is zero
    const giftCups = gifts * E.redeem, perBasket = E.inv * E.conv;
    const nB = pois(R, Math.max(0, E.base * E.s * m - giftCups * m) / perBasket);
    for (let b = 0; b < nB; b++) {
      const t0 = -E.lead + R() * (E.lead - 5), n = Math.max(2, Math.min(6, 2 + pois(R, E.inv - 2)));
      ev.push({ t: t0, kind: "open", b, n });
      for (let i = 0; i < n; i++) if (R() < E.conv) { const t = t0 + expo(R, E.delay); if (t < 0) ev.push({ t, kind: "confirm", b, drink: pick() }); }
    }
    const nG = pois(R, gifts * m);
    for (let g = 0; g < nG; g++) {
      const t0 = -E.lead + R() * (E.lead - 5); ev.push({ t: t0, kind: "gift", g });
      if (R() < E.redeem) { const t = t0 + expo(R, E.gdelay); if (t < 0) ev.push({ t, kind: "redeem", g, drink: pick() }); }
    }
    ev.sort((a, b) => a.t - b.t);
    const squad = ev.filter(e => e.kind === "confirm" || e.kind === "redeem").length;
    return { seed, m, other, squad, actual: other + squad, events: ev };
  }

  // signals visible at time t (minutes before the window, negative)
  function state(w, t) {
    const seen = w.events.filter(e => e.t <= t), open = {}, gifts = {};
    let confirmed = 0;
    for (const e of seen) {
      if (e.kind === "open") open[e.b] = { n: e.n, c: 0 };
      if (e.kind === "confirm") { open[e.b].c++; confirmed++; }
      if (e.kind === "gift") gifts[e.g] = false;
      if (e.kind === "redeem") { gifts[e.g] = true; confirmed++; }
    }
    const pending = Object.values(open).reduce((a, o) => a + (o.n - o.c), 0), unredeemed = Object.values(gifts).filter(x => !x).length;
    return { confirmed, pending, baskets: Object.keys(open).length, unredeemed, gifts: Object.keys(gifts).length,
             drinks: seen.filter(e => e.drink).map(e => e.drink) };
  }

  function learn(E, Sim) {
    const grid = Array.from({ length: E.lead / 5 + 1 }, (_, i) => -E.lead + 5 * i), H = { grid, pc: [], pr: [], late: [] };
    const W = Array.from({ length: E.nHist }, (_, k) => simulate(E, 100000 + k, Sim));
    for (const t of grid) {
      let pend = 0, conv = 0, unr = 0, red = 0, late = 0;
      for (const w of W) {
        const openAt = new Set(w.events.filter(e => e.kind === "open" && e.t <= t).map(e => e.b)), giftAt = new Set(w.events.filter(e => e.kind === "gift" && e.t <= t).map(e => e.g));
        const confBy = {}; w.events.filter(e => e.kind === "confirm" && e.t <= t).forEach(e => (confBy[e.b] = (confBy[e.b] || 0) + 1));
        w.events.filter(e => e.kind === "open" && openAt.has(e.b)).forEach(e => (pend += e.n - (confBy[e.b] || 0)));
        conv += w.events.filter(e => e.kind === "confirm" && e.t > t && openAt.has(e.b)).length;
        const redBy = new Set(w.events.filter(e => e.kind === "redeem" && e.t <= t).map(e => e.g));
        unr += [...giftAt].filter(g => !redBy.has(g)).length;
        red += w.events.filter(e => e.kind === "redeem" && e.t > t && giftAt.has(e.g)).length;
        late += w.events.filter(e => (e.kind === "confirm" && !openAt.has(e.b)) || (e.kind === "redeem" && !giftAt.has(e.g))).length;
      }
      H.pc.push(pend ? conv / pend : 0); H.pr.push(unr ? red / unr : 0); H.late.push(late / W.length);
    }
    return H;
  }

  const at = (H, arr, t) => { const i = Math.max(0, Math.min(H.grid.length - 1, Math.floor((t - H.grid[0]) / 5))); return arr[i]; };
  function forecast(E, H, w, t) {
    const S = state(w, t), pc = at(H, H.pc, t), pr = at(H, H.pr, t), late = at(H, H.late, t), nonSquad = E.base * (1 - E.s);
    const predicted = S.pending * pc + S.unredeemed * pr + late;
    return { t, baseline: E.base, nonSquad, confirmed: S.confirmed, predicted, enhanced: nonSquad + S.confirmed + predicted, pc, pr, late, ...S };
  }

  function evaluate(E, H, Sim) {
    const W = Array.from({ length: E.nEval }, (_, k) => simulate(E, 200000 + k, Sim));
    return E.leads.map(L => { let b = 0, e = 0;
      for (const w of W) { const f = forecast(E, H, w, -L); b += Math.abs(f.baseline - w.actual); e += Math.abs(f.enhanced - w.actual); }
      return { lead: L, maeBaseline: b / W.length, maeEnhanced: e / W.length }; });
  }

  // example days: the seeds whose actual cups, against the calendar baseline, are closest to the targets
  function pickDays(E, Sim, targets) {
    const W = Array.from({ length: 300 }, (_, k) => simulate(E, k, Sim));
    return targets.map(r => W.reduce((a, w) => (Math.abs(w.actual / E.base - r) < Math.abs(a.actual / E.base - r) ? w : a)).seed);
  }

  // a success case, by rule: among the same seeds, those where the squad forecast is closer at minute t; of those,
  // the one whose actual cups are closest to target × baseline. Also the share of all seeds where it is closer.
  function pickSuccess(E, H, Sim, target, t) {
    const W = Array.from({ length: 300 }, (_, k) => simulate(E, k, Sim)), closer = w => { const f = forecast(E, H, w, t); return Math.abs(f.enhanced - w.actual) < Math.abs(f.baseline - w.actual); };
    const win = W.filter(closer);
    return { seed: win.reduce((a, w) => (Math.abs(w.actual / E.base - target) < Math.abs(a.actual / E.base - target) ? w : a)).seed, winShare: win.length / W.length, n: W.length };
  }

  const api = { inputs, simulate, state, learn, forecast, evaluate, pickDays, pickSuccess };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeSquadcast = api;
})(typeof window !== "undefined" ? window : globalThis);
