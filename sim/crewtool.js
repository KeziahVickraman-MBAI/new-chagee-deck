/* crewtool.js - storyboard deck, Proposal 2 (slides 06 to 08): the outlet manager's bottleneck tool.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeCrewTool). Every input is assumptions.json:
 * the counter (stations.*, today's split = stations.mixed_machine_stations, machine units sized as counter.js does), worker
 * speeds (people.worker_speed_spread), task-time variation (people.human_speed_variation_cv), walking speed
 * (illustration.walk_back_speed, as counter.js), the per-cup coordination cost away from one's own step
 * (sharing.assist_handover_sec), and the tool's own illustrative scenario (ops_tool). Nothing is typed here.
 *
 * Two separate parts, kept apart on purpose:
 *   project(E, o)    the tool's prediction: a fluid projection of the next window. Expected incoming drinks (the demand
 *                    forecast, o.perHour) and the drinks waiting now flow down the counter; each step's capacity is its
 *                    machines or its assigned people. Per step: utilisation (work due / capacity) and the backlog left at the
 *                    end of the window. The constraint is the step with the highest utilisation, not the longest list.
 *   recommend(E, o)  operational rules on that projection: keep the allocation if no step builds up; escalate if the
 *                    constraint is a machine, or if no trained colleague with spare time can clear it; otherwise move the
 *                    one feasible helper that leaves the least work waiting. Run at the low, base and high end of the forecast.
 *   simulate / compare  an independent check, seeded: the same arrivals, drink mix and task-time variation for every
 *                    allocation; people walk, pay a set-up cost on every move and a coordination cost on every drink away
 *                    from their own step; a helper returns whenever their own step queues (the original step is reassessed)
 *                    and the help ends once the constraint's backlog clears (the review). The recommendation is not fed in:
 *                    a recommended move can lose here.
 *
 *   inputs(RAW, Sim)  E: stations, crew, drink mix and the rules' settings.
 *   check(E, alloc)   throws unless alloc = { workerId: one hand step that worker is trained for, not their own }.
 */
(function (root) {
  "use strict";

  function inputs(RAW, Sim) {
    const P = Sim.params(RAW), O = RAW.ops_tool, v = k => O[k].value;
    const pl = Sim.plan(P, "mixed"), R = Math.max(...pl.rate) * P.margin, lab = v("station_labels");
    const stations = P.stations.map(id => {
      const machine = P.mixedMachine.includes(id), sec = machine ? P.machineSec[id] * P.machineMult : P.humanSec[id] * P.humanMult;
      return { id, label: lab[id], machine, sec, units: machine ? Math.max(1, Math.ceil(R * sec / 60 - 1e-9)) : 0 };   // as counter.js
    });
    const idx = id => { const k = P.stations.indexOf(id); if (k < 0) throw new Error(`crewtool: unknown step ${id}`); return k; };
    const mix = v("drink_mix"), tot = mix.reduce((a, d) => a + d.share, 0);
    const crew = v("crew").map(c => {
      const home = idx(c.home), trained = c.trained.map(idx);
      if (stations[home].machine || !trained.includes(home)) throw new Error(`crewtool: ${c.id} must own a hand step they are trained for`);
      return { id: c.id, name: c.name, note: c.note, v: 1 + c.speed_step * P.spread, home, trained };
    });
    const lineSec = P.stations.reduce((a, s) => a + P.humanSec[s] * P.humanMult, 0);
    const eq = v("equipment");
    return {
      stations, crew, n: stations.length, cv: P.humanCv,
      mix: mix.map(d => ({ ...d, share: d.share / tot })), meanMult: mix.reduce((a, d) => a + d.share * d.finish_mult, 0) / tot,
      finish: idx("topping_finish"),
      walk: RAW.illustration.walk_back_speed.value * stations.length / lineSec,   // steps a second at speed 1, as counter.js
      awaySec: RAW.sharing.assist_handover_sec.value, switchSec: v("switch_sec"),
      returnTrigger: v("return_trigger"), clearLevel: v("clear_level"), spareMin: v("spare_min"),
      window: v("window_min"), band: v("forecast_band"), seeds: v("seeds"), seed: P.seed,
      snapshot: P.stations.map(id => v("snapshot")[id] || 0),
      equipment: { k: idx(eq.station), label: eq.label, factor: eq.slow_factor },
      demand: { value: v("demand_per_hour"), range: O.demand_per_hour.range, step: v("demand_step") },
    };
  }

  // seconds a step needs per drink: machines (slowed in the equipment scenario), people at an average drink
  const stepSec = (E, k, slow) => E.stations[k].sec * (E.stations[k].machine ? (slow && k === E.equipment.k ? E.equipment.factor : 1) : k === E.finish ? E.meanMult : 1);
  const moveSec = (E, w, a, b) => Math.abs(a - b) / (E.walk * w.v) + E.switchSec;

  function check(E, alloc = {}) {
    for (const [id, to] of Object.entries(alloc)) {
      const w = E.crew.find(c => c.id === id);
      if (!w) throw new Error(`crewtool: unknown worker ${id}`);
      if (to == null) continue;
      if (typeof to !== "string") throw new Error(`crewtool: ${id} can help at one step at a time`);
      const k = E.stations.findIndex(s => s.id === to);
      if (k < 0 || E.stations[k].machine) throw new Error(`crewtool: ${to} is not a hand step`);
      if (k === w.home) throw new Error(`crewtool: ${id} already works ${to}`);
      if (!w.trained.includes(k)) throw new Error(`crewtool: ${id} is not trained on ${to}`);
    }
    return Object.fromEntries(Object.entries(alloc).filter(([, to]) => to != null).map(([id, to]) => [id, E.stations.findIndex(s => s.id === to)]));
  }

  /* ---------------------------------------------------------------- the prediction: a fluid projection of the window */
  function project(E, o) {
    const H = E.window, lam = o.perHour / 60, al = check(E, o.alloc), n = E.n;
    const cap = E.stations.map((s, k) => (s.machine ? s.units : E.crew.filter(w => w.home === k).reduce((a, w) => a + w.v, 0)) * 60 / stepSec(E, k, o.slow));
    const flow = c => {
      let I = lam; const st = [];
      for (let k = 0; k < n; k++) {
        const B = E.snapshot[k], due = I + B / H, out = Math.min(due, c[k]);
        st.push({ id: E.stations[k].id, B, I, cap: c[k], rho: due / c[k], end: Math.max(0, B + (I - c[k]) * H) });
        I = out;
      }
      return st;
    };
    const st0 = flow(cap), c = [...cap], helpers = [];
    for (const [id, t] of Object.entries(al)) {                     // a helper gives their own step's predicted spare time
      const w = E.crew.find(x => x.id === id), over = 2 * moveSec(E, w, w.home, t) / (H * 60);
      const spare = Math.max(0, 1 - st0[w.home].rho), share = Math.max(0, spare - over);
      const add = share * w.v * 60 / (stepSec(E, t, o.slow) + E.awaySec);
      c[t] += add; helpers.push({ id, to: t, spare, share, add });
    }
    const st = helpers.length ? flow(c) : st0;
    const con = st.reduce((a, s, k) => (s.rho > st[a].rho ? k : a), 0);
    const longest = E.snapshot.reduce((a, b, k) => (b > E.snapshot[a] ? k : a), 0);
    const crew = E.crew.map(w => ({ id: w.id, load: st0[w.home].rho, spare: Math.max(0, 1 - st0[w.home].rho) }));
    return { st, con, machine: E.stations[con].machine, longest, waiting: st.reduce((a, s) => a + s.end, 0), crew, helpers };
  }

  /* ---------------------------------------------------------------- the rules: keep, move one helper, or escalate */
  function options(E, o) {
    const base = project(E, { ...o, alloc: {} }), out = [];
    for (const w of E.crew) for (let t = 0; t < E.n; t++) {
      if (E.stations[t].machine || t === w.home) continue;
      const spare = base.crew.find(c => c.id === w.id).spare;
      const why = !w.trained.includes(t) ? "untrained" : spare < E.spareMin ? "busy" : null;
      const r = { worker: w.id, to: E.stations[t].id, spare, why };
      if (!why) { const p = project(E, { ...o, alloc: { [w.id]: E.stations[t].id } }); r.waiting = p.waiting; r.conEnd = p.st[base.con].end; r.p = p; }
      out.push(r);
    }
    return { base, options: out };
  }

  function decide(E, o) {
    const { base, options: ops } = options(E, o), con = base.con, s = base.st[con];
    const feas = ops.filter(r => !r.why).sort((a, b) => a.waiting - b.waiting);
    const best = feas[0] && feas[0].waiting < base.waiting - 0.5 ? feas[0] : null;
    let kind, cause;
    if (s.end <= E.clearLevel) { kind = "keep"; cause = "clears"; }
    else if (base.machine) { kind = "escalate"; cause = "equipment"; }
    else if (best && best.conEnd <= E.clearLevel) { kind = "move"; cause = "helper"; }
    else { kind = "escalate"; cause = best ? "partial" : "crew"; }
    return { kind, cause, con, conId: E.stations[con].id, longest: base.longest, base, best: kind === "move" || cause === "partial" ? best : null, options: ops };
  }

  function recommend(E, o) {
    const at = f => decide(E, { ...o, perHour: o.perHour * f });
    const r = at(1), lo = at(1 - E.band), hi = at(1 + E.band);
    return { ...r, range: { low: lo.kind, high: hi.kind, holds: lo.kind === r.kind && hi.kind === r.kind, lowEnd: lo.base.st[r.con].end, highEnd: hi.base.st[r.con].end } };
  }

  /* ---------------------------------------------------------------- the check: a seeded simulation of the window */
  function simulate(E, Sim, o) {
    const al = check(E, o.alloc), n = E.n, W = E.window * 60, dt = o.dt || 0.5, seed = o.seed ?? E.seed;
    const RA = Sim.rng(Sim.hash(seed, 11)), RD = Sim.rng(Sim.hash(seed, 12)), RN = Sim.rng(Sim.hash(seed, 13));
    const noise = () => { let u = 0; while (u === 0) u = RN(); return Math.max(0.2, 1 + E.cv * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * RN())); };
    const drink = () => { let u = RD(), k = 0; while (k < E.mix.length - 1 && u > E.mix[k].share) { u -= E.mix[k].share; k++; } return E.mix[k].finish_mult; };
    // each drink carries its own work content (mix and variation), drawn in arrival order: the same for every allocation
    const cup = born => ({ born, mult: drink(), nz: E.stations.map(() => noise()), out: null });
    const Q = E.stations.map(() => []), all = [];
    E.snapshot.forEach((b, k) => { for (let i = 0; i < b; i++) { const c = cup(-60 * (b - i)); Q[k].push(c); all.push(c); } });
    const M = E.stations.map(s => (s.machine ? [] : null));
    const sec = (k, c) => stepSec(E, k, o.slow) / (k === E.finish ? E.meanMult : 1) * (k === E.finish ? c.mult : 1);
    const workers = E.crew.map(w => ({ ...w, at: w.home, target: al[w.id] ?? null, active: al[w.id] != null, mode: "idle",
      left: 0, k: -1, c: null, dest: null, work: 0, moving: 0, moves: 0, away: 0, released: null }));
    let t = 0, acc = 0;
    const lam = o.perHour / 3600, inW = () => t < W;
    const pass = (c, k) => { if (k === n - 1) c.out = t; else Q[k + 1].push(c); };
    const startMove = (w, to) => { w.mode = "move"; w.dest = to; w.left = moveSec(E, w, w.at, to); w.moves++; };
    function next(w) {
      let want = w.home;
      if (w.active) {
        const hq = Q[w.home].length, tq = Q[w.target].length;
        if (tq <= E.clearLevel && (w.at === w.target || w.at === w.home)) { w.active = false; w.released = t; }   // the review
        else want = (w.at === w.home ? hq > 0 : hq >= E.returnTrigger) ? w.home : w.target;       // own step reassessed
      }
      if (want !== w.at) return startMove(w, want);
      if (!Q[w.at].length) return;
      w.c = Q[w.at].shift(); w.k = w.at; w.mode = "work";
      w.left = sec(w.at, w.c) * w.c.nz[w.at] / w.v + (w.at !== w.home ? E.awaySec : 0);
      if (w.at !== w.home) w.away++;
    }
    const cap = W + 1800;
    while (t < cap && (t < W || all.some(c => c.born >= 0 && c.born < W && c.out == null))) {
      t += dt;
      acc += dt;                                                     // arrivals, one Poisson draw a second
      while (acc >= 1) { acc -= 1; const a = Sim.poisson(lam, RA()); for (let i = 0; i < a; i++) { const c = cup(t); Q[0].push(c); all.push(c); } }
      for (let k = n - 1; k >= 0; k--) {                             // machines, downstream first
        if (!M[k]) continue;
        for (const b of M[k]) b.left -= dt;
        for (const b of M[k].filter(b => b.left <= 0)) { M[k].splice(M[k].indexOf(b), 1); pass(b.c, k); }
        while (M[k].length < E.stations[k].units && Q[k].length) { const c = Q[k].shift(); M[k].push({ c, left: sec(k, c) }); }
      }
      for (const w of workers) {
        if (w.mode === "work") { w.left -= dt; if (inW()) w.work += dt; if (w.left <= 0) { w.mode = "idle"; pass(w.c, w.k); w.c = null; } }
        else if (w.mode === "move") { w.left -= dt; if (inW()) w.moving += dt; if (w.left <= 0) { w.mode = "idle"; w.at = w.dest; } }
        if (w.mode === "idle") next(w);
      }
    }
    const win = all.filter(c => c.born >= 0 && c.born < W), times = win.filter(c => c.out != null).map(c => c.out - c.born);
    return { arrived: win.length, completed: all.filter(c => c.out != null && c.out < W).length,
             unfinished: all.filter(c => c.born < W && (c.out == null || c.out >= W)).length, times,
             crew: workers.map(w => ({ id: w.id, work: w.work / W, moving: w.moving / W, moves: w.moves, away: w.away, released: w.released })) };
  }

  const median = x => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const quant = (x, q) => { const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  // one allocation over the seeds: means, the pooled median order-to-ready time and the spread of the per-run medians
  function outcome(E, Sim, o) {
    const runs = Array.from({ length: o.seeds ?? E.seeds }, (_, i) => simulate(E, Sim, { ...o, seed: E.seed + i }));
    const mean = f => runs.reduce((a, r) => a + f(r), 0) / runs.length, meds = runs.map(r => median(r.times));
    return { arrived: mean(r => r.arrived), completed: mean(r => r.completed), unfinished: mean(r => r.unfinished),
             median: median(runs.flatMap(r => r.times)), lo: quant(meds, 0.1), hi: quant(meds, 0.9),
             crew: E.crew.map((w, i) => ({ id: w.id, work: mean(r => r.crew[i].work), moving: mean(r => r.crew[i].moving), moves: mean(r => r.crew[i].moves), away: mean(r => r.crew[i].away) })) };
  }
  // the current allocation against another: same crew, equipment, incoming drinks and mix; only who does which step changes
  const compare = (E, Sim, o) => ({ current: outcome(E, Sim, { ...o, alloc: {} }), tried: outcome(E, Sim, o) });

  const api = { inputs, check, project, options, recommend, simulate, outcome, compare, stepSec };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeCrewTool = api;
})(typeof window !== "undefined" ? window : globalThis);
