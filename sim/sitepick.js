/* sitepick.js - slide 05: forecast a new store from app demand (synthetic), with DBSCAN.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeSite).
 * Geometry is sim/sg_geo.json (the team's map, image pixels); every number is in assumptions.json "sitepick".
 *
 *   events(Sim, RAW, geo)        synthetic app-intent dots on land: around the hubs, plus an even spread.
 *   dbscan(pts, eps, minPts)     density clusters: labels per point (-1 = noise), from Ester et al. (1996).
 *   model(Sim, RAW, geo, o)      the market today: each dot's pull from every outlet, which dots are
 *                                "no store nearby" (nearest outlet beyond walk_km), the dot weight that
 *                                makes the average outlet sell store cups/day, DBSCAN clusters of the
 *                                no-store-nearby dots, and suggested pins at the cluster centres.
 *                                o: { walkKm, epsKm, minPts } override the slider defaults.
 *   outlet(M, j)                 an existing outlet today: cups/day, share from within walking distance,
 *                                nearest neighbour, unserved demand around it.
 *   forecast(M, pin)             a new outlet at pin (map pixels): its cups/day, how many come from
 *                                demand no outlet serves today (net new) and how many from existing
 *                                outlets (cannibalised, with the outlets it takes most from).
 * Proximity split (Huff-style): pull of store j on a dot = exp(-(d / L)^2 / 2), L = walk_km x decay_share;
 * share of the dot bought at j = pull_j / (outside_option + sum of pulls).
 */
(function (root) {
  "use strict";

  function events(Sim, RAW, geo) {
    const S = RAW.sitepick, v = k => S[k].value, R = Sim.rng(Sim.hash(RAW.simulation.base_seed.value, 31));
    const cells = [];
    geo.land.forEach((row, cy) => { for (let cx = 0; cx < row.length; cx++) if (row[cx] === "1") cells.push([cx, cy]); });
    const isLand = (x, y) => { const r = geo.land[Math.floor(y / geo.cell)]; return !!r && r[Math.floor(x / geo.cell)] === "1"; };
    const hubs = v("hubs"), wsum = hubs.reduce((a, h) => a + h.weight, 0), sd = v("hub_spread_km") / v("km_per_px");
    const n = v("events"), nBg = Math.round(n * v("background_share")), out = [];
    const nMall = Math.round(n * (S.mall_share ? S.mall_share.value : 0)), mallSd = (S.mall_spread_km ? S.mall_spread_km.value : 0) / v("km_per_px");
    const gauss = () => { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
    for (let i = 0; i < nBg; i++) {
      const [cx, cy] = cells[Math.floor(R() * cells.length)];
      out.push({ x: (cx + R()) * geo.cell, y: (cy + R()) * geo.cell });
    }
    for (let i = 0; i < nMall; i++) {                                 // footfall at the malls the outlets sit in
      const [ox, oy] = geo.outlets[i % geo.outlets.length];
      for (let t = 0; t < 20; t++) {
        const x = ox + gauss() * mallSd, y = oy + gauss() * mallSd;
        if (isLand(x, y)) { out.push({ x, y, mall: i % geo.outlets.length }); break; }
      }
    }
    while (out.length < n) {
      let u = R() * wsum, h = hubs[0];
      for (const c of hubs) { u -= c.weight; if (u <= 0) { h = c; break; } }
      for (let t = 0; t < 20; t++) {                                  // resample until the dot is on land
        const x = h.x + gauss() * sd, y = h.y + gauss() * sd;
        if (isLand(x, y)) { out.push({ x, y, hub: h.name }); break; }
      }
    }
    return out;
  }

  function dbscan(pts, eps, minPts) {
    const n = pts.length, labels = new Array(n).fill(undefined), e2 = eps * eps;
    const near = i => { const r = []; for (let j = 0; j < n; j++) { const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y; if (dx * dx + dy * dy <= e2) r.push(j); } return r; };
    let c = -1;
    for (let i = 0; i < n; i++) {
      if (labels[i] !== undefined) continue;
      const nb = near(i);
      if (nb.length < minPts) { labels[i] = -1; continue; }
      labels[i] = ++c;
      const queue = nb.filter(j => j !== i);
      while (queue.length) {
        const j = queue.shift();
        if (labels[j] === -1) labels[j] = c;                          // border point
        if (labels[j] !== undefined) continue;
        labels[j] = c;
        const nj = near(j);
        if (nj.length >= minPts) queue.push(...nj);
      }
    }
    return labels;
  }

  function model(Sim, RAW, geo, o = {}) {
    const S = RAW.sitepick, v = k => S[k].value, kmpx = v("km_per_px");
    const walkKm = o.walkKm ?? v("walk_km"), epsKm = o.epsKm ?? v("dbscan_eps_km"), minPts = o.minPts ?? v("dbscan_min_points");
    const L = walkKm * v("decay_share") / kmpx, a0 = v("outside_option"), walkPx = walkKm / kmpx;
    const pull = d => Math.exp(-0.5 * (d / L) * (d / L));                    // bell-shaped: fades fast beyond 2 L
    const ev = o.events || events(Sim, RAW, geo), stores = geo.outlets;
    const sum = new Float64Array(ev.length), nearest = new Float64Array(ev.length);
    const storeRaw = new Float64Array(stores.length);
    ev.forEach((e, i) => {
      let s = 0, dmin = Infinity;
      stores.forEach(([x, y]) => { const d = Math.hypot(e.x - x, e.y - y); s += pull(d); if (d < dmin) dmin = d; });
      sum[i] = s; nearest[i] = dmin;
      stores.forEach(([x, y], j) => { storeRaw[j] += pull(Math.hypot(e.x - x, e.y - y)) / (a0 + s); });
    });
    const target = RAW.store.cups_per_store_per_year.value / RAW.store.open_days_per_year.value;
    const scale = target / (storeRaw.reduce((a, b) => a + b, 0) / stores.length);   // cups/day per dot
    const unmet = ev.map((e, i) => nearest[i] > walkPx);
    const pts = ev.filter((e, i) => unmet[i]), idx = ev.map((e, i) => i).filter(i => unmet[i]);
    const lab = dbscan(pts, epsKm / kmpx, minPts), labels = new Array(ev.length).fill(null);
    idx.forEach((i, k) => (labels[i] = lab[k]));
    const M = { ev, stores, sum, nearest, unmet, labels, scale, L, a0, kmpx, pull, walkKm, epsKm, minPts, target,
                storeCups: Array.from(storeRaw, x => x * scale) };
    const k = Math.max(-1, ...lab);
    M.clusters = Array.from({ length: k + 1 }, (_, c) => {
      const m = idx.filter((i, q) => lab[q] === c).map(i => ev[i]);
      const cx = m.reduce((a, p) => a + p.x, 0) / m.length, cy = m.reduce((a, p) => a + p.y, 0) / m.length;
      return { id: c, size: m.length, x: cx, y: cy, r: Math.max(...m.map(p => Math.hypot(p.x - cx, p.y - cy))) };
    });
    M.candidates = M.clusters.map(c => ({ ...c, f: forecast(M, c) })).sort((a, b) => b.f.netNew - a.f.netNew);
    return M;
  }

  function forecast(M, pin) {
    const { ev, stores, sum, a0, scale, pull } = M;
    let cups = 0, netNew = 0, fromUnmet = 0;
    const take = new Float64Array(stores.length);
    ev.forEach((e, i) => {
      const a = pull(Math.hypot(e.x - pin.x, e.y - pin.y));
      if (a < 1e-9) return;
      const s = sum[i], before = s / (a0 + s), after = s / (a0 + s + a);
      const c = a / (a0 + s + a);
      cups += c; netNew += c - (before - after);
      if (M.unmet[i]) fromUnmet += c;
      if (before - after > 1e-9)
        stores.forEach(([x, y], j) => {
          const p = pull(Math.hypot(e.x - x, e.y - y));
          take[j] += p / (a0 + s) - p / (a0 + s + a);
        });
    });
    const hit = Array.from(take, (t, j) => ({ j, x: stores[j][0], y: stores[j][1], cups: t * scale,
      km: Math.hypot(stores[j][0] - pin.x, stores[j][1] - pin.y) * M.kmpx })).filter(s => s.cups > 0.5).sort((a, b) => b.cups - a.cups);
    return { cups: cups * scale, netNew: netNew * scale, cannibal: (cups - netNew) * scale, fromUnmet: fromUnmet * scale, hit };
  }

  // an existing outlet today: its cups/day, the share from customers within walking distance,
  // its nearest neighbouring outlet, and the unmet ("no store nearby") demand within twice the walking distance
  function outlet(M, j) {
    const { ev, stores, sum, a0, scale, pull } = M, [ox, oy] = stores[j], walkPx = M.walkKm / M.kmpx;
    let near = 0, all = 0, unmet = 0;
    ev.forEach((e, i) => {
      const d = Math.hypot(e.x - ox, e.y - oy), c = pull(d) / (a0 + sum[i]);
      all += c; if (d <= walkPx) near += c;
      if (M.unmet[i] && d <= 2 * walkPx) unmet += (1 - sum[i] / (a0 + sum[i]));
    });
    const nb = stores.map(([x, y], k) => ({ j: k, km: Math.hypot(x - ox, y - oy) * M.kmpx })).filter(o => o.j !== j).sort((a, b) => a.km - b.km)[0];
    return { cups: all * scale, nearShare: all ? near / all : 0, neighbour: nb, unmetNearby: unmet * scale };
  }

  const api = { events, dbscan, model, forecast, outlet };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeSite = api;
})(typeof window !== "undefined" ? window : globalThis);
