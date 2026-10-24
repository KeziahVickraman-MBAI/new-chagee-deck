/* toppings.js - storyboard deck, Proposal 2 (slides 06 to 08): can the same crew absorb toppings?
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeToppings). Every input is assumptions.json:
 * step times for cup and ice, hand-over and the two machines (stations.*), the machine split (stations.mixed_machine_stations),
 * task-time variation (people.human_speed_variation_cv), worker speeds (people.worker_speed_spread x ops_tool.crew speed_step),
 * the crew's names and training (ops_tool.crew), the wage (costs.labour_cost_per_hour) and the scenario (toppings). Nothing
 * is typed here.
 *
 * The counter is six steps on five spots in a line: cup and ice, tea and milk (machine), toppings (orders with toppings only)
 * and finishing at the topping bar, the sealer (machine), hand-over. Whoever carries a cup attends the two machines for their
 * cycle. Each spot takes one person at a time, except the bar, which takes toppings.bar_positions. Every order carries its own
 * arrival time, topping draw and task-time variation, drawn in arrival order whatever the topping share, so both views, and
 * every share, face the same order sequence: an order has toppings when its draw is below the share.
 *
 *   mode "fixed"    view A, fixed responsibilities: each person owns a run of steps (toppings.fixed_assignment), takes the
 *                   next cup from their pass shelf, carries it through their steps, puts it on the next owner's shelf and
 *                   walks back.
 *   mode "brigade"  view B, a bucket brigade (Week 5's rules, with safe hand-overs): people keep their order along the
 *                   counter and never overtake. Each carries a cup forward through the steps they are trained for. The last
 *                   person hands the order over, walks back and takes over the cup of the colleague just upstream, but only
 *                   at a safe point: when that colleague finishes the step in hand. The colleague walks back in turn; the
 *                   first person starts the next order. Someone not trained on a step stops before it and waits for the
 *                   colleague downstream to take the cup; walking back, they wait at the first step they are trained for.
 *                   One cup per machine and per spot: nobody shares the dispenser or the sealer, nobody duplicates work.
 * Both views pay the same walking (toppings.walk_sec_per_station) and the same seconds on every pass between people
 * (toppings.handover_sec). Paid labour is the same crew for the same hour.
 *
 *   inputs(RAW, Sim)        E: steps, crew, scenario and defaults.
 *   setup(E, o)             the resolved settings for one run (share, topping seconds, speeds, training, bar, walking, passes),
 *                           with each person's brigade zone; throws if the crew cannot cover the counter.
 *   orders(E, Sim, seed, n) the order sequence: arrival time, topping draw, task-time variation per step.
 *   create(E, Sim, o)       a counter ready to step(dt), at minute 0 of the peak with an empty counter. o.mode, o.seed, o.share
 *                           and the setup() overrides. Whether an order has toppings is fixed as it lands, from S.share (slide 06
 *                           introduces toppings mid-run). o.events: keep a log of passes and hand-overs. S.stage(spec) places
 *                           people and cups by hand (slide 07's one hand-over cycle).
 *   run(E, Sim, o)          one peak hour, orders followed until ready: completed in the hour, order-to-ready times, each
 *                           person's time working, walking, passing and waiting, the bar's use, passes.
 *   outcome(E, Sim, o)      one view over the seeds: means and the pooled median and 90th percentile.
 *   compare(E, Sim, o)      both views, same orders, crew, equipment and step times; plus the paid labour cost of the hour.
 *   content(E, o)           work content of one order at an average worker: standard, with toppings, and at the share.
 */
(function (root) {
  "use strict";

  const STEPS = ["cup_ice", "tea_milk", "topping", "finish", "shake_seal", "handover"];

  function inputs(RAW, Sim) {
    const P = Sim.params(RAW), T = RAW.toppings, v = k => T[k].value;
    const lab = v("step_labels"), loc = v("step_locations"), skill = v("skill_steps");
    const sec = { cup_ice: P.humanSec.cup_ice, tea_milk: P.machineSec.tea_milk, topping: v("topping_sec"), finish: v("finish_sec"),
                  shake_seal: P.machineSec.shake_seal, handover: P.humanSec.handover };
    const steps = STEPS.map(id => ({ id, label: lab[id], loc: loc[id], machine: P.mixedMachine.includes(id), sec: sec[id],
                                     topping: id === "topping", skill: skill.includes(id) }));
    const crew = RAW.ops_tool.crew.value.map(c => ({ id: c.id, name: c.name, v: 1 + c.speed_step * P.spread, speedStep: c.speed_step,
                                                    trained: c.trained.includes("topping_finish") }));
    const fixed = v("fixed_assignment");
    return {
      steps, crew, n: steps.length, cv: P.humanCv, spread: P.spread, wage: P.wage, seed: P.seed,
      locs: [...new Set(steps.map(s => s.loc))].sort((a, b) => a - b),
      fixed: Object.fromEntries(Object.entries(fixed).map(([id, ks]) => [id, ks.map(k => STEPS.indexOf(k))])),
      perHour: v("peak_orders_per_hour"), minutes: v("peak_minutes"), follow: v("follow_minutes"), dt: v("dt"), seeds: v("seeds"),
      share: { value: v("topping_share"), range: T.topping_share.range, step: T.topping_share.step },
      toppingSec: { value: v("topping_sec"), range: T.topping_sec.range, step: T.topping_sec.step },
      walkSec: { value: v("walk_sec_per_station"), range: T.walk_sec_per_station.range, step: T.walk_sec_per_station.step },
      handSec: { value: v("handover_sec"), range: T.handover_sec.range, step: T.handover_sec.step },
      bar: { value: v("bar_positions"), range: T.bar_positions.range },
      firstId: v("first_order_id"),
    };
  }

  // one run's settings; o may override share, toppingSec, walkSec, handSec, bar, speeds { id: v } and trained { id: bool }
  function setup(E, o = {}) {
    const val = (k, d) => (o[k] ?? d);
    const crew = E.crew.map(c => ({ ...c, v: val("speeds", {})[c.id] ?? c.v, trained: val("trained", {})[c.id] ?? c.trained }));
    const ok = (w, k) => !E.steps[k].skill || w.trained, last = E.n - 1;
    // brigade zones: the first person's run of trained steps starts at cup and ice, the last person's ends at hand-over,
    // anyone else must be trained on every step
    const zones = crew.map((w, i) => {
      let lo = 0, hi = last;
      if (i === 0) { while (hi > 0 && !ok(w, hi)) hi--; for (let k = 0; k <= hi; k++) if (!ok(w, k)) { hi = k - 1; break; } }
      else if (i === crew.length - 1) { for (let k = last; k >= 0; k--) if (!ok(w, k)) { lo = k + 1; break; } }
      else if (E.steps.some((s, k) => !ok(w, k))) throw new Error(`toppings: ${w.id} works mid-line, so must be trained on every step`);
      return { lo, hi };
    });
    for (let k = 0; k <= last; k++) if (!zones.some(z => z.lo <= k && k <= z.hi)) throw new Error(`toppings: no one trained on ${E.steps[k].id}`);
    // fixed responsibilities: consecutive runs, in crew order, covering every step once, each owner trained on their steps
    const own = E.crew.flatMap(c => E.fixed[c.id]);
    if (own.length !== E.n || own.some((k, j) => k !== j)) throw new Error("toppings: fixed_assignment must cover the steps in order, once");
    crew.forEach(w => E.fixed[w.id].forEach(k => { if (!ok(w, k)) throw new Error(`toppings: ${w.id} owns ${E.steps[k].id} untrained`); }));
    const share = val("share", E.share.value), bar = val("bar", E.bar.value);
    if (!(share >= 0 && share <= 1)) throw new Error("toppings: share must be between 0 and 1");
    if (![1, 2].includes(bar)) throw new Error("toppings: the bar takes one or two people");
    const sec = E.steps.map(s => (s.topping ? val("toppingSec", E.toppingSec.value) : s.sec));
    return { crew, zones, share, bar, sec, walkSec: val("walkSec", E.walkSec.value), handSec: val("handSec", E.handSec.value),
             perHour: val("perHour", E.perHour), minutes: val("minutes", E.minutes), follow: val("follow", E.follow) };
  }

  // the order sequence: the same for both views and every share (draws do not depend on the settings)
  function orders(E, Sim, seed, n, perHour) {
    const RA = Sim.rng(Sim.hash(seed, 41)), RU = Sim.rng(Sim.hash(seed, 42)), RN = Sim.rng(Sim.hash(seed, 43));
    const noise = () => { let u = 0; while (u === 0) u = RN(); return Math.max(0.2, 1 + E.cv * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * RN())); };
    const out = []; let t = 0;
    for (let i = 0; i < n; i++) {
      let u = 0; while (u === 0) u = RA();
      t += -Math.log(u) * 3600 / perHour;
      out.push({ i, id: E.firstId + i, t, u: RU(), nz: E.steps.map(() => noise()) });
    }
    return out;
  }

  const nextStep = (c, k) => { let j = k + 1; if (j < STEP_N && STEP_TOP[j] && !c.top) j++; return j; };
  const STEP_N = STEPS.length, STEP_TOP = STEPS.map(s => s === "topping");

  function create(E, Sim, o = {}) {
    const C = setup(E, o), brigade = o.mode === "brigade", seed = o.seed ?? E.seed, H = C.minutes * 60, END = H + C.follow * 60;
    const lam = C.perHour / 3600, N = Math.ceil(END * lam + 12 * Math.sqrt(END * lam) + 20);
    const seq = (o.orders || orders(E, Sim, seed, N, C.perHour)).map(x => ({ ...x, top: null, ready: null, work: 0 }));
    const loc = k => E.steps[k].loc, capOf = L => (L === E.steps[2].loc ? C.bar : 1);
    const owner = k => C.crew.findIndex(w => E.fixed[w.id].includes(k));
    const dur = (w, c, k) => (E.steps[k].machine ? C.sec[k] : C.sec[k] * c.nz[k] / w.v);
    const W = C.crew.map((w, i) => {
      const seg = E.fixed[w.id];
      return { ...w, i, x: loc(seg[0]), mode: "idle", cup: null, k: -1, left: 0, at: null, zone: C.zones[i], seg: [seg[0], seg[seg.length - 1]],
               inq: [], work: 0, walk: 0, pass: 0, wait: 0, blocked: 0 };
    });
    const S = { mode: brigade ? "brigade" : "fixed", C, t: 0, H, END, workers: W, orders: seq, screen: [], next: 0, delivered: [],
                passes: 0, events: o.events ? [] : null, barUse: 0, share: C.share };
    const log = e => { if (S.events) S.events.push({ t: S.t, ...e }); };
    const inH = () => S.t <= H;
    const working = (k, me) => W.some(w => w !== me && w.mode === "work" && w.k === k);
    const occ = (L, me) => W.filter(w => w !== me && w.mode === "work" && loc(w.k) === L).length;

    function deliver(w) {
      const c = w.cup; c.ready = S.t; S.delivered.push(c); w.cup = null; w.k = -1;
      log({ type: "ready", who: w.id, order: c.id });
    }
    function take(d, c, k, from) {                                           // d takes cup c (next step k): a pass
      d.cup = c; d.k = k; d.mode = "take"; d.safe = false; d.left = C.handSec; if (inH()) S.passes++;
      log({ type: "pass", who: d.id, from, order: c.id, step: E.steps[k].id });
    }
    // brigade: the colleague just downstream, waiting beside u (or at the start of their zone), takes u's cup at a safe point
    function tryTakeover(u) {
      if (!brigade || !u.cup) return false;
      const d = W[u.i + 1];
      if (!d || !u.safe || d.mode !== "wait" || u.k < d.zone.lo || u.k > d.zone.hi || Math.abs(d.x - u.x) > 1e-6) return false;
      take(d, u.cup, u.k, u.id); d.x = u.x; u.cup = null; u.k = -1; u.mode = "back";
      return true;
    }
    function finished(w) {
      const c = w.cup, k = w.k; c.work += w.done || 0;
      if (k === E.n - 1) { deliver(w); w.mode = "back"; return; }
      const nk = nextStep(c, k); w.k = nk; w.safe = true;                     // a safe point: between two steps
      if (brigade) { w.mode = nk > w.zone.hi ? "hold" : "go"; tryTakeover(w); return; }
      if (nk <= w.seg[1]) { w.mode = "go"; return; }
      w.mode = "drop"; w.at = owner(nk);
    }
    function canStart(w, k) {
      if (!brigade) return true;
      if (working(k, w) || occ(loc(k), w) >= capOf(loc(k))) return false;
      const d = W[w.i + 1];
      return !(d && d.cup && d.k <= k);                                       // no overtaking the colleague downstream
    }
    const toward = (w, tgt, dt) => {                                          // walk; true on arrival
      const step = C.walkSec > 0 ? dt / C.walkSec : Infinity;
      if (Math.abs(tgt - w.x) <= step + 1e-9) { const moved = Math.abs(tgt - w.x) > 1e-9; w.x = tgt; if (moved && inH()) w.walk += dt; return true; }
      w.x += Math.sign(tgt - w.x) * step; if (inH()) w.walk += dt; return false;
    };
    function startNext(w) {                                                   // a person at their start with empty hands
      if (brigade || w.i === 0) {
        if (!S.screen.length) return false;
        const c = S.screen.shift(); w.cup = c; w.k = 0; w.mode = "go"; w.safe = false; log({ type: "start", who: w.id, order: c.id }); return true;
      }
      if (!w.inq.length) return false;
      const c = w.inq.shift(); take(w, c, c.nk, "shelf"); return true;
    }

    S.step = (dt = E.dt) => {
      S.t += dt;
      while (S.next < seq.length && seq[S.next].t <= S.t) { const c = seq[S.next++]; c.top = c.u < S.share; S.screen.push(c); }   // toppings decided as the order lands
      // 1. steps and passes in hand
      for (const w of W) {
        if (w.mode === "work") { w.left -= dt; if (inH()) w.work += dt; if (w.left <= 1e-9) finished(w); }
        else if (w.mode === "take") { w.left -= dt; if (inH()) w.pass += dt; if (w.left <= 1e-9) { w.mode = "go"; tryTakeover(w); } }
      }
      // 2. safe-point takeovers for anyone between steps
      if (brigade) for (const u of W) if (u.cup && (u.mode === "go" || u.mode === "hold")) tryTakeover(u);
      // 3. walking and starting, downstream first
      for (let i = W.length - 1; i >= 0; i--) {
        const w = W[i];
        if (w.mode === "go") {
          if (!toward(w, loc(w.k), dt)) continue;
          if (tryTakeover(w)) continue;
          if (canStart(w, w.k)) { w.mode = "work"; w.safe = false; w.done = dur(w, w.cup, w.k); w.left = w.done; log({ type: "step", who: w.id, order: w.cup.id, step: E.steps[w.k].id }); }
          else if (inH()) { w.blocked += dt; w.wait += dt; }
        } else if (w.mode === "drop") {                                         // fixed: carry to the next owner's shelf
          if (!toward(w, loc(W[w.at].seg[0]), dt)) continue;
          w.cup.nk = w.k; W[w.at].inq.push(w.cup); log({ type: "shelf", who: w.id, to: W[w.at].id, order: w.cup.id }); w.cup = null; w.k = -1; w.mode = "back";
        } else if (w.mode === "back" || w.mode === "wait" || w.mode === "idle") {
          if (!brigade) {
            if (toward(w, loc(w.seg[0]), dt) && !startNext(w)) { w.mode = "idle"; if (inH()) w.wait += dt; }
            continue;
          }
          if (i === 0) { if (toward(w, loc(0), dt) && !startNext(w)) { w.mode = "idle"; if (inH()) w.wait += dt; } continue; }
          const u = W[i - 1], tgt = Math.max(loc(w.zone.lo), u.x);
          if (toward(w, tgt, dt)) { w.mode = "wait"; if (inH()) w.wait += dt; if (u.cup && (u.mode === "go" || u.mode === "hold")) tryTakeover(u); }
          else w.mode = "back";
        } else if (w.mode === "hold" && inH()) w.wait += dt;
      }
      if (inH()) S.barUse += dt * occ(E.steps[2].loc, null) / C.bar;
    };

    // slide 07: place people and cups by hand. spec: { screen: [order index...], top: [order index...] (the orders with toppings),
    // people: { id: { x, order, step, left, mode } } }
    S.stage = spec => {
      const used = new Set(), top = new Set(spec.top || []);
      seq.forEach((c, i) => (c.top = top.has(i)));
      for (const [id, p] of Object.entries(spec.people || {})) {
        const w = W.find(x => x.id === id); Object.assign(w, { x: p.x ?? w.x, mode: p.mode || "idle", cup: null, k: -1, left: 0 });
        if (p.order != null) { const c = seq[p.order]; used.add(p.order); w.cup = c; w.k = p.step; w.safe = w.mode !== "work"; if (w.mode === "work") { w.done = dur(w, c, p.step); w.left = w.done * (p.left ?? 1); } }
      }
      S.screen = (spec.screen || []).map(i => { used.add(i); return seq[i]; });
      S.next = Math.max(...used) + 1; S.t = Math.max(0, ...[...used].map(i => seq[i].t));
    };
    return S;
  }

  const quant = (x, q) => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  function run(E, Sim, o = {}) {
    const S = create(E, Sim, o), dt = o.dt || E.dt;
    const placed = () => S.orders.filter(c => c.t <= S.H);
    while (S.t < S.H - 1e-9) S.step(dt);
    while (S.t < S.END - 1e-9 && placed().some(c => c.ready == null)) S.step(dt);
    const pl = placed(), times = pl.map(c => (c.ready ?? S.t) - c.t);
    return { mode: S.mode, placed: pl.length, completed: S.delivered.filter(c => c.ready <= S.H).length, late: pl.filter(c => c.ready == null).length,
             times, median: quant(times, 0.5), p90: quant(times, 0.9), passes: S.passes, bar: S.barUse / S.H,
             topped: pl.filter(c => c.top).length,
             crew: S.workers.map(w => ({ id: w.id, work: w.work / S.H, walk: w.walk / S.H, pass: w.pass / S.H, wait: w.wait / S.H, blocked: w.blocked / S.H })) };
  }

  function outcome(E, Sim, o = {}) {
    const n = o.seeds ?? E.seeds, runs = Array.from({ length: n }, (_, i) => run(E, Sim, { ...o, seed: (o.seed ?? E.seed) + i }));
    const mean = f => runs.reduce((a, r) => a + f(r), 0) / runs.length, meds = runs.map(r => r.median);
    return { mode: runs[0].mode, placed: mean(r => r.placed), completed: mean(r => r.completed), late: mean(r => r.late), passes: mean(r => r.passes), bar: mean(r => r.bar),
             median: quant(runs.flatMap(r => r.times), 0.5), p90: quant(runs.flatMap(r => r.times), 0.9), lo: quant(meds, 0.1), hi: quant(meds, 0.9),
             crew: runs[0].crew.map((c, i) => ({ id: c.id, ...Object.fromEntries(["work", "walk", "pass", "wait", "blocked"].map(k => [k, mean(r => r.crew[i][k])])) })) };
  }

  // work content of one order at an average worker (speed 1): the same under both views
  function content(E, o = {}) {
    const C = setup(E, o), walk = (E.steps[E.n - 1].loc - E.steps[0].loc) * C.walkSec;
    const base = C.sec.reduce((a, s, k) => a + (E.steps[k].topping ? 0 : s), 0), top = C.sec[2];
    return { standard: base, topped: base + top, atShare: base + C.share * top, toppingSec: top, carry: walk };
  }

  function compare(E, Sim, o = {}) {
    const C = setup(E, o), cost = C.crew.length * E.wage * C.minutes / 60;
    return { fixed: outcome(E, Sim, { ...o, mode: "fixed" }), brigade: outcome(E, Sim, { ...o, mode: "brigade" }), cost, people: C.crew.length, content: content(E, o) };
  }

  const api = { inputs, setup, orders, create, run, outcome, compare, content, STEPS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeToppings = api;
})(typeof window !== "undefined" ? window : globalThis);
