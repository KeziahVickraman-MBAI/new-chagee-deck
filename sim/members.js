/* members.js - slides M1-M3 (candidate chapter): squad tiers and the network-effects tipping point.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeMembers). An analytics model from the
 * course (Topic 8, slides 30-36), not AI. Every parameter is assumptions.json members (illustrative, not Chagee data).
 *
 *   Consumers x in (0,1), interest r(x) = 1 - x; others using the app are worth f(z) = k z, z = share of a customer's
 *   circle on the app. Consumer x joins if r(x) f(z) >= p, p = effort cost of tiering up (0-1).
 *
 *   equilibria(p, k)            { low z', high z'' } solving p = k z (1 - z), or null when 4p/k > 1 (stalls at zero)
 *   next(z, p, k)               one adoption round: the share for whom (1 - x) k z >= p, i.e. 1 - p / (k z), clipped
 *   rounds(z0, p, k, n)         z0 and n rounds after it
 *   table(RAW)                  the scenario table (members.scenarios), computed
 *   network(RAW, p, k, z0, s)   friend-group simulation, one seeded run: N customers, a random graph with about m friends
 *                               each, r uniform; a customer is on the app next round if r k (share of friends on it) >= p
 *   tipping(RAW, p, k, Sim)     the smallest starting share (bisection, to members.network.z0_step) from which the mean
 *                               of the seeded runs does not collapse (ends above takeoff_share): the simulated tipping point
 *   kind(p, k)                  'two' crossings, 'merged' at the hump's peak (4p = k), or 'none'
 *   levers(RAW)                 squads' k step and the incentive's p step, read from members.scenarios
 *   perMember(RAW, o, E, m)     contribution per member a month at E extra orders, after credits (S$)
 *   breakEven(RAW, o)           extra orders a squad member must place a month for the group-order credit to pay for
 *                               itself, at the low, base and high gross margin
 */
(function (root) {
  "use strict";

  const M = (RAW, k) => RAW.members[k].value;

  function equilibria(p, k) {
    const d = 1 - 4 * p / k;
    if (!(k > 0) || d < 0) return null;
    const s = Math.sqrt(d);
    return { low: (1 - s) / 2, high: (1 + s) / 2 };
  }

  const next = (z, p, k) => (z <= 0 ? 0 : Math.max(0, Math.min(1, 1 - p / (k * z))));
  function rounds(z0, p, k, n) { const out = [z0]; for (let i = 0; i < n; i++) out.push(next(out[i], p, k)); return out; }

  function table(RAW) {
    return M(RAW, "scenarios").map(s => ({ ...s, eq: equilibria(s.p, s.k) }));
  }

  // a seeded random graph: each customer links to about m/2 others at random, links both ways (average degree about m)
  function graph(N, m, R) {
    const nb = Array.from({ length: N }, () => new Set());
    for (let i = 0; i < N; i++) for (let j = 0; j < m / 2; j++) {
      let q = Math.floor(R() * N); if (q === i) q = (q + 1) % N; nb[i].add(q); nb[q].add(i);
    }
    return nb.map(s => [...s]);
  }

  function network(RAW, p, k, z0, seed, Sim) {
    const C = M(RAW, "network"), N = C.customers, R = Sim.rng(Sim.hash(RAW.simulation.base_seed.value, 7100 + seed));
    const nb = graph(N, C.friends_per_customer, R), r = Array.from({ length: N }, () => R());   // r(x) = 1 - x, x uniform: r uniform
    let on = Array.from({ length: N }, () => R() < z0);
    const path = [on.filter(Boolean).length / N];
    for (let t = 0; t < C.max_rounds; t++) {
      const nx = on.map((_, i) => { const f = nb[i].length ? nb[i].reduce((a, j) => a + (on[j] ? 1 : 0), 0) / nb[i].length : 0; return r[i] * k * f >= p; });
      const changed = nx.some((v, i) => v !== on[i]); on = nx; path.push(on.filter(Boolean).length / N);
      if (!changed) break;
    }
    return { final: path[path.length - 1], path };
  }

  function tipping(RAW, p, k, Sim) {
    const C = M(RAW, "network"), runs = C.runs;
    const meanFinal = z0 => { let a = 0; for (let s = 0; s < runs; s++) a += network(RAW, p, k, z0, s, Sim).final; return a / runs; };
    // bisection on the starting share (adoption is monotone in it): collapse below, take-off above
    let lo = 0, hi = 1; if (meanFinal(hi) <= C.takeoff_share) return null;
    while (hi - lo > C.z0_step) { const m = (lo + hi) / 2; if (meanFinal(m) > C.takeoff_share) hi = m; else lo = m; }
    return hi;
  }

  function breakEven(RAW, o = {}) {
    const c = o.credit ?? M(RAW, "group_credit_share"), B = o.base ?? M(RAW, "base_group_orders_per_member_month"), E = o.extra ?? M(RAW, "extra_orders_per_member_month");
    const price = RAW.storyboard.price_per_cup.value, g = RAW.storyboard.gross_margin_per_cup, [gLo, gHi] = g.range;
    // the credit is paid on every group order, old and new: c x price x (B + E); the extra orders earn margin x price x E.
    // break-even E* solves margin x E = c x (B + E), so E* = c B / (margin - c)
    const at = m => ({ margin: m, extraNeeded: m > c ? c * B / (m - c) : null, netPerMember: price * (m * E - c * (B + E)) });
    return { credit: c, base: B, extra: E, price, low: at(gLo), mid: at(g.value), high: at(gHi) };
  }

  // what kind of crossing the effort line makes with the hump: two points, one (they merge at the peak), or none
  function kind(p, k) { const d = 1 - 4 * p / k; return Math.abs(d) < 1e-9 ? "merged" : d < 0 ? "none" : "two"; }

  // the levers as the scenario table defines them: squads add (squad k - today k), an incentive takes (today p - incentive p)
  function levers(RAW) {
    const S = Object.fromEntries(M(RAW, "scenarios").map(s => [s.id, s]));
    const r6 = x => Math.round(x * 1e6) / 1e6;
    return { dk: r6(S.squad.k - S.today.k), dp: r6(S.today.p - S.incentive.p) };
  }

  // contribution per squad member a month at E extra orders, after the credit on every group order (old and new)
  function perMember(RAW, o, E, margin) {
    const b = breakEven(RAW, o), m = margin ?? b.mid.margin;
    return b.price * (m * E - b.credit * (b.base + E));
  }

  const api = { equilibria, next, rounds, table, network, tipping, breakEven, kind, levers, perMember };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeMembers = api;
})(typeof window !== "undefined" ? window : globalThis);
