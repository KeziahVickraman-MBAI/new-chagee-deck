/* ladder.js - slide 08: the machine ladder. When does each rung's setup beat an all-human counter?
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeLadder).
 * Uses counter.js dayCost unchanged; tiers are machine_tiers.json, every other number is assumptions.json.
 * Vendor speed claims are not used: every rung runs at the model's station speeds.
 *
 *   rungs(RAW, P, TIERS)                    today's split (the baseline marker) plus each tier, with the
 *                                           stations it puts on machines and its per-setup prices in SGD.
 *   saved(Sim, C, P, robots, o)             labour saved a month against all-human, o = { cupsDay, wage, day };
 *                                           also the machine units the model sizes for that volume.
 *   evaluate(Sim, C, RAW, P, TIERS, o)      every rung at one outlet, o = { cupsDay, wage, unitMonth }:
 *                                           labour saved, the model's machine cost (units x unitMonth),
 *                                           a lease's margin, simple payback on a purchase.
 *   volumes(Sim, C, RAW, P, TIERS, o)       across the per-outlet volume range (store.cups_per_store_per_year
 *                                           range / open days), the volume bands where each rung beats
 *                                           all-human on its cost basis, and where it saves more labour
 *                                           than today's split. Bands, not one threshold: rosters step.
 * Month = open days / 12. Simple payback = list price / labour saved a month (no maintenance or financing).
 */
(function (root) {
  "use strict";

  const monthly = P => P.days / 12;

  function rungs(RAW, P, TIERS) {
    const fx = RAW._meta.fx_sgd_per_usd.value, sgd = (x, cur) => (x == null ? null : cur === "USD" ? x * fx : x);
    const out = [{ id: "today", name: TIERS.baseline.label, baseline: true, robots: [...P.mixedMachine], prices: [], modelRate: true }];
    for (const t of TIERS.tiers) {
      const prices = t.examples.filter(e => e.cost.kind !== "not_disclosed" && e.cost.kind !== "estimate").map(e => ({
        name: e.name, currency: e.cost.currency, lease: sgd(e.cost.lease_month, e.cost.currency), purchase: sgd(e.cost.purchase, e.cost.currency),
        leaseRaw: e.cost.lease_month ?? null, purchaseRaw: e.cost.purchase ?? null }));
      out.push({ id: t.id, name: t.name, robots: t.replaces, prices, disclosed: prices.length > 0, modelRate: !!t.model_rate_applies });
    }
    return out;
  }

  function dayLabour(Sim, C, P, robots, o) {
    const c = C.configure({ ...P, cupsYear: o.cupsDay * P.days, wage: o.wage ?? P.wage }, robots);
    return C.dayCost(Sim, c.P, c.setup, o.day ?? "none");
  }
  function saved(Sim, C, P, robots, o) {
    const hand = dayLabour(Sim, C, P, [], o), m = dayLabour(Sim, C, P, robots, o);
    return { month: (hand.labour - m.labour) * monthly(P), units: m.machineUnits };
  }

  // the rung's cost basis: a published lease per setup; else, for semi-automated rungs, the model's rate per
  // station unit; else none (robot rungs with no published price get only the cost needed to break even)
  const basis = (r, units, unitMonth) => {
    const lease = r.prices.find(p => p.lease != null);
    return lease ? { kind: "lease", name: lease.name, month: lease.lease }
      : r.modelRate ? { kind: "model", month: units * unitMonth } : { kind: "none", month: null };
  };

  function evaluate(Sim, C, RAW, P, TIERS, o) {
    const unitMonth = o.unitMonth ?? P.machineMonth;
    return rungs(RAW, P, TIERS).map(r => {
      const s = saved(Sim, C, P, r.robots, o), b = basis(r, s.units, unitMonth);
      const lease = r.prices.find(p => p.lease != null) || null;
      return { ...r, saved: s.month, basisMonth: b.month, units: s.units, modelCost: s.units * unitMonth,
        modelMargin: s.month - s.units * unitMonth, basis: b.kind,
        lease, leaseMargin: lease ? s.month - lease.lease : null,
        breakEvenSetup: s.month,                                          // cost a whole setup may have a month and still break even
        payback: r.prices.filter(p => p.purchase != null).map(p => ({ name: p.name, price: p.purchase, priceRaw: p.purchaseRaw, currency: p.currency,
          months: s.month > 0 ? p.purchase / s.month : Infinity })) };
    });
  }

  function volumes(Sim, C, RAW, P, TIERS, o = {}) {
    const unitMonth = o.unitMonth ?? P.machineMonth, [lo, hi] = RAW.store.cups_per_store_per_year.range.map(x => Math.round(x / P.days));
    const R = rungs(RAW, P, TIERS), base = R[0];
    const vols = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
    const rows = R.map(r => ({ id: r.id, beats: [], more: [] }));
    for (const v of vols) {
      const q = { ...o, cupsDay: v }, b0 = saved(Sim, C, P, base.robots, q);
      R.forEach((r, k) => {
        const s = r === base ? b0 : saved(Sim, C, P, r.robots, q), b = basis(r, s.units, unitMonth);
        rows[k].beats.push(b.month != null && s.month > b.month + 1e-9);
        rows[k].more.push(s.month > b0.month + 1e-9);
      });
    }
    // bands: the [from, to] volume ranges where the flag holds (rosters step in whole people, so wins come and go)
    const bands = flags => flags.reduce((a, f, k) => { if (f) { const l = a[a.length - 1]; if (l && l[1] === vols[k] - 1) l[1] = vols[k]; else a.push([vols[k], vols[k]]); } return a; }, []);
    return { lo, hi, vols, rungs: rows.map((x, k) => ({ id: x.id, basis: basis(R[k], 1, unitMonth).kind,
      beats: x.beats, beatsBands: bands(x.beats), more: x.more, moreBands: bands(x.more) })) };
  }

  const api = { rungs, saved, evaluate, volumes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeLadder = api;
})(typeof window !== "undefined" ? window : globalThis);
