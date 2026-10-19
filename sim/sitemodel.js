/* sitemodel.js - slide 08b: the supervised model behind the site scores, as a proxy for a market with no data.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeSiteModel).
 * Training data: Singapore's outlets on the slide 05 engine (sitepick.js). Label = each outlet's cups a day in the
 * engine (synthetic, not Chagee data). Features = attributes computed from the same synthetic map at any point.
 * Model: ridge regression on standardised features (site_ext.model.ridge_lambda), tested by leave-one-out: each
 * outlet is predicted by a model trained on the others, so the error is on outlets the model has not seen.
 *
 *   FEATURES                     the inputs, their labels and whether a new market would have them (our assumption)
 *   dataset(Sim, RAW, GEO)       { rows: [{ f, y }], pins: { A, C, D }: features at slide 08's pins, ranges }
 *   fit(rows, keys, lambda)      { predict(f), beta (standardised), mu, sd, mean }; keys = [] gives the mean only
 *   loo(rows, keys, lambda)      { pred[], mae, r2 } on held-out outlets
 *   city(Sim, RAW, GEO, Site)    a hypothetical new city (site_ext.new_city) at Singapore's synthetic density
 *   cityGrid(city, RAW, cap)     every grid point with the inputs a market with no Chagee history has
 *   pick(grid, predict, k, km)   the k best grid points, at least km apart (greedy)
 *
 * Footfall dots around each outlet's own mall are left out of the features: they exist only where an outlet already is.
 */
(function (root) {
  "use strict";

  // key, label, unit, newMarket: "yes" | "maybe" | "no" (would a market with no Chagee history have it?)
  const FEATURES = [
    ["pop", "People within reach", "app-intent dots within the residents radius, a census proxy", "yes"],
    ["hubKm", "Distance to a town centre", "km to the nearest town hub, a transit and footfall proxy", "yes"],
    ["area", "Delivery-area demand", "dots within the delivery radius; needs platform data", "maybe"],
    ["unmet", "Unserved app searches", "no-store-nearby searches within the ring; needs Chagee app history", "no"],
    ["own", "Chagee outlets nearby", "outlets within the ring; a new market has none", "no"],
    ["nearKm", "Distance to nearest Chagee outlet", "km, capped; a new market has none", "no"],
  ].map(([key, label, unit, newMarket]) => ({ key, label, unit, newMarket }));

  function dataset(Sim, RAW, GEO, Site) {
    const X = RAW.site_ext, mo = X.model.value, M = Site.model(Sim, RAW, GEO), k = M.kmpx;
    const rRes = X.residents_radius_km.value, rRing = X.ring_km.value, rDel = mo.delivery_km, cap = mo.nearest_cap_km;
    const hubs = RAW.sitepick.hubs.value;
    const ev = M.ev.map((e, i) => ({ ...e, unmet: M.unmet[i] })).filter(e => e.mall === undefined);
    const feat = (p, self) => {
      const d = e => Math.hypot(e.x - p.x, e.y - p.y) * k;
      const o = M.stores.map(([x, y], j) => [j, Math.hypot(x - p.x, y - p.y) * k]).filter(a => a[0] !== self);
      let pop = 0, area = 0, unmet = 0;
      ev.forEach(e => { const z = d(e); if (z <= rRes) pop++; if (z <= rDel) area++; if (e.unmet && z <= rRing) unmet++; });
      return { pop, hubKm: Math.min(...hubs.map(h => Math.hypot(h.x - p.x, h.y - p.y) * k)), area, unmet,
               own: o.filter(a => a[1] <= rRing).length, nearKm: Math.min(cap, ...o.map(a => a[1])) };
    };
    const rows = M.stores.map(([x, y], j) => ({ f: feat({ x, y }, j), y: M.storeCups[j] }));
    const A = M.candidates[0], Cc = M.candidates.find(c => M.stores.filter(([x, y]) => Math.hypot(x - c.x, y - c.y) * k <= rRing).length === 1);
    const j = M.stores.map(([x, y], q) => [Math.hypot(x - A.x, y - A.y), q]).sort((a, b) => a[0] - b[0])[0][1];
    const pins = { A: feat(A, -1), C: Cc ? feat(Cc, -1) : null, D: feat({ x: M.stores[j][0] + 3, y: M.stores[j][1] }, -1) };
    const ranges = Object.fromEntries(FEATURES.map(({ key }) => { const v = rows.map(r => r.f[key]); return [key, [Math.min(...v), Math.max(...v)]]; }));
    return { rows, pins, ranges, cap, lambda: mo.ridge_lambda };
  }

  function fit(rows, keys, lambda) {
    const n = rows.length, m = keys.length, mean = rows.reduce((a, r) => a + r.y, 0) / n;
    const mu = keys.map(c => rows.reduce((a, r) => a + r.f[c], 0) / n);
    const sd = keys.map((c, i) => Math.sqrt(rows.reduce((a, r) => a + (r.f[c] - mu[i]) ** 2, 0) / n) || 1);
    const Z = rows.map(r => keys.map((c, i) => (r.f[c] - mu[i]) / sd[i]));
    // (Z'Z + lambda I) beta = Z'(y - mean), solved by Gauss-Jordan with partial pivoting
    const A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => Z.reduce((a, z) => a + z[i] * z[j], 0) + (i === j ? lambda : 0)));
    const b = Array.from({ length: m }, (_, i) => Z.reduce((a, z, q) => a + z[i] * (rows[q].y - mean), 0));
    for (let i = 0; i < m; i++) {
      let p = i; for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = 0; r < m; r++) { if (r === i) continue; const t = A[r][i] / A[i][i]; for (let c = i; c < m; c++) A[r][c] -= t * A[i][c]; b[r] -= t * b[i]; }
    }
    const beta = b.map((v, i) => v / A[i][i]);
    return { keys, beta, mu, sd, mean, predict: f => mean + keys.reduce((a, c, i) => a + beta[i] * (f[c] - mu[i]) / sd[i], 0) };
  }

  function loo(rows, keys, lambda) {
    const mean = rows.reduce((a, r) => a + r.y, 0) / rows.length;
    const pred = rows.map((r, i) => fit(rows.filter((_, q) => q !== i), keys, lambda).predict(r.f));
    const mae = pred.reduce((a, p, i) => a + Math.abs(p - rows[i].y), 0) / rows.length;
    const sse = pred.reduce((a, p, i) => a + (p - rows[i].y) ** 2, 0), sst = rows.reduce((a, r) => a + (r.y - mean) ** 2, 0);
    return { pred, mae, r2: 1 - sse / sst };
  }

  // a hypothetical new city (site_ext.new_city), at Singapore's synthetic density so the inputs mean the same thing:
  // the same dots per unit of town weight and the same even background per km2 as the slide 05 events
  function city(Sim, RAW, GEO, Site) {
    const C = RAW.site_ext.new_city.value, SP = RAW.sitepick, k = SP.km_per_px.value;
    let cells = 0; GEO.land.forEach(r => { for (const c of r) if (c === "1") cells++; });
    const sgArea = cells * (GEO.cell * k) ** 2, ev = Site.events(Sim, RAW, GEO).filter(e => e.mall === undefined);
    const sgBg = ev.filter(e => e.hub === undefined).length, sgW = SP.hubs.value.reduce((a, h) => a + h.weight, 0);
    const perWeight = (ev.length - sgBg) / sgW, bgPerKm2 = sgBg / sgArea;
    const R = Sim.rng(Sim.hash(RAW.simulation.base_seed.value, C.seed_offset)), sd = SP.hub_spread_km.value;
    const gauss = () => { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
    const inside = (x, y) => x >= 0 && y >= 0 && x <= C.width_km && y <= C.height_km, dots = [];
    for (let i = 0, n = Math.round(bgPerKm2 * C.width_km * C.height_km); i < n; i++) dots.push({ x: R() * C.width_km, y: R() * C.height_km });
    C.towns.forEach(t => { for (let i = 0, n = Math.round(perWeight * t.weight); i < n; i++)
      for (let q = 0; q < 20; q++) { const x = t.x + gauss() * sd, y = t.y + gauss() * sd; if (inside(x, y)) { dots.push({ x, y }); break; } } });
    return { ...C, dots, perWeight, bgPerKm2 };
  }

  // every grid point in the city, with the inputs a market with no Chagee history has (and none of the others)
  function cityGrid(ct, RAW, cap) {
    const X = RAW.site_ext, rRes = X.residents_radius_km.value, rDel = X.model.value.delivery_km, g = ct.grid_km, out = [];
    for (let y = g / 2; y < ct.height_km; y += g) for (let x = g / 2; x < ct.width_km; x += g) {
      let pop = 0, area = 0;
      ct.dots.forEach(d => { const z = Math.hypot(d.x - x, d.y - y); if (z <= rRes) pop++; if (z <= rDel) area++; });
      out.push({ x, y, f: { pop, area, hubKm: Math.min(...ct.towns.map(t => Math.hypot(t.x - x, t.y - y))), unmet: 0, own: 0, nearKm: cap } });
    }
    return out;
  }

  // greedy: the highest forecast first, then the next best at least spacing km from every site already picked
  function pick(grid, predict, k, spacingKm) {
    const scored = grid.map(c => ({ ...c, cups: predict(c.f) })).sort((a, b) => b.cups - a.cups), out = [];
    for (const c of scored) { if (out.length >= k) break; if (out.every(o => Math.hypot(o.x - c.x, o.y - c.y) >= spacingKm)) out.push(c); }
    return { picks: out, scored };
  }

  const api = { FEATURES, dataset, fit, loo, city, cityGrid, pick };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeSiteModel = api;
})(typeof window !== "undefined" ? window : globalThis);
