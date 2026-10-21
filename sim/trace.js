/* trace.js - a read-only recording of one counter run, for the animated video.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeTrace).
 * It builds the counter exactly as the side-by-side slides do (counter.create with the same options,
 * stepped by 0.5 s) and only reads its state after each step; nothing in the run is changed, so the
 * numbers are the ones the slide 07 panel shows at the same minute.
 *
 *   record(Sim, Store, C, P, o, minutes)  -> { opts, dt, n, stations, workers, samples, events }
 *     stations   [{ id, machine, units, sec }]
 *     workers    [{ v, set }]                      speed; fixed posts: the stations each person owns
 *     samples[i] state after step i (t = i * dt seconds into the peak hour, sample 0 = the start):
 *                [served, lost, inStore, workers, stations]
 *                workers  [x, mode, cupId]         x along the counter (station k covers [k, k+1))
 *                stations [queueIds, busy [[cupId, progress 0..1]], readyIds]
 *     events     { arrive [[t, cupId]], balk [t], out [[t, cupId]], handover [[t, x]] }
 *                arrive = an order placed (a cup created), balk = a customer who walked away,
 *                out = a cup handed to its customer, handover = one person took over another's cup.
 *   Cup ids are numbered in the order the trace first sees them (cups already in store at the start first).
 */
(function (root) {
  "use strict";

  const MODES = ["idle", "work", "back", "fetch", "walk"];

  function record(Sim, Store, C, P, o, minutes) {
    const dt = 0.5, S = C.create(Sim, Store, P, o), t0 = S.t;
    const ids = new Map(); let next = 0;
    const id = c => (c == null ? -1 : ids.has(c) ? ids.get(c) : (ids.set(c, next), next++));
    const r3 = x => Math.round(x * 1000) / 1000;
    const events = { arrive: [], balk: [], out: [], handover: [] };
    const sample = () => [S.servedInHour, S.lost, S.inStore(),
      S.workers.map(w => [r3(w.x), MODES.indexOf(w.mode), id(w.cup)]),
      S.stations.map(s => [s.queue.map(id), s.busy.map(b => [id(b.cup), r3(1 - Math.max(0, b.left) / s.sec)]), s.ready.map(id)])];
    S.cups.forEach(id);
    const samples = [sample()];
    let inStore = new Set(S.cups), lost = S.lost, hand = S.handovers.length;
    const steps = Math.round(minutes * 60 / dt);
    for (let i = 1; i <= steps; i++) {
      S.step(dt);
      const t = r3(S.t - t0);
      for (const c of S.cups) if (!inStore.has(c)) events.arrive.push([r3(c.born - t0), id(c)]);
      for (const c of inStore) if (!S.cups.includes(c)) events.out.push([r3(c.out - t0), id(c)]);
      for (let k = lost; k < S.lost; k++) events.balk.push(t);
      for (const h of S.handovers.slice(hand)) events.handover.push([r3(h.t - t0), r3(h.x)]);
      inStore = new Set(S.cups); lost = S.lost; hand = S.handovers.length;
      samples.push(sample());
    }
    return { opts: o, dt, n: S.stations.length, mode: S.mode, staff: S.staff,
             stations: S.stations.map(s => ({ id: s.id, machine: s.machine, units: s.units, sec: s.sec })),
             workers: S.workers.map(w => ({ v: w.v, set: w.set || null })), samples, events };
  }

  const api = { record, MODES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeTrace = api;
})(typeof window !== "undefined" ? window : globalThis);
