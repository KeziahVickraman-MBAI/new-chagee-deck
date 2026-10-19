/* counter.js - storyboard deck: who works the counter at the peak, and how they share it.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeCounter).
 * Any split of the stations between robots and people. configure(P, robots) turns a list of robot
 * stations into the cost model's setup: none = "all_human", every station = "all_machine", otherwise
 * "mixed" with stations.mixed_machine_stations replaced by that list (so plan() sizes the robots and
 * the people for it). Leaving robots out means today's split (stations.mixed_machine_stations).
 * Everything comes from sim.js params() and assumptions.json; nothing is typed here.
 *
 *   configure(P, robots)         { P, setup, robots } for one split.
 *   presets(RAW, P)              the named splits on the GM slide (storyboard.split_presets).
 *   dayCost(Sim, P, setup, day, peakStaff)  the counter's cost for a day at the forecast roster
 *                                (raised to peakStaff in the busy hours, if given), by the cost
 *                                model's formulas: people hours x wage (all-robot: attendant hours),
 *                                robot units x monthly cost x 12 / open days.
 *   compare(Sim, Store, P, o)    one option, many seeds: peak-hour served, walk-aways, median wait,
 *                                plus dayCost. Used live by the side-by-side slides.
 *
 *   forecastDay(Sim, P, day)     the predictive step: cups per open hour for a day type (the
 *                                day's multiplier lands on the busiest hours, as surgeHourSet()),
 *                                and the people each hour needs under plan()'s staffing rule.
 *   recommendStaff(Sim, P, day)  people the forecast puts on the counter in the peak hour.
 *   assignFixed(P, speeds, how)  fixed stations: which hand stations each person owns.
 *                                "best" = fastest person on the heaviest work, "worst" = slowest.
 *   create(Sim, Store, P, o)     a peak-hour counter ready to step(dt).
 *                                o.mode "brigade" = store.js replica (Week 5 bucket-brigade rules);
 *                                o.mode "fixed"   = each person stays on their own stations, cups wait
 *                                in a queue in front of each station. Same customers as the brigade
 *                                (same arrival seed and balking rule), same robots.
 *   run(Sim, Store, P, o)        the peak hour -> { served, lost, arrived, times, ... }
 *   grid(Sim, Store, P, o)       every day type x staff x mode, averaged over seeds (deck tables).
 */
(function (root) {
  "use strict";

  const peakHour = P => P.share.indexOf(Math.max(...P.share));

  function configure(P, robots) {
    const set = robots ?? P.mixedMachine;
    const list = P.stations.filter(s => set.includes(s));
    const setup = list.length === 0 ? "all_human" : list.length === P.stations.length ? "all_machine" : "mixed";
    return { P: { ...P, mixedMachine: list }, setup, robots: list };
  }
  function presets(RAW, P) {
    const v = RAW.storyboard.split_presets.value;
    return Object.fromEntries(Object.entries(v).map(([k, o]) =>
      [k, { label: o.label, robots: o.robots === "today" ? [...P.mixedMachine] : o.robots === "all" ? [...P.stations] : o.robots }]));
  }

  function forecastDay(Sim, P, day, setup = "mixed") {
    const pl = Sim.plan(P, setup), base = Sim.dailyBase(P), mult = P.surgeMult[day], busy = Sim.surgeHourSet(P);
    const cups = P.share.map((s, h) => base * s * (busy.has(h) ? mult : 1));
    const staff = cups.map(c => setup === "all_machine" ? 0
      : Math.max(P.minStaff[setup], Math.ceil(c / 60 * P.margin / pl.perWorker - 1e-9)));
    const h = peakHour(P);
    return { cups, staff, peak: h, peakCups: cups[h], peakStaff: staff[h], perWorkerHour: pl.perWorker * 60 };
  }
  const recommendStaff = (Sim, P, day, setup = "mixed") => forecastDay(Sim, P, day, setup).peakStaff;

  // peakStaff (optional): the crew chosen for the peak; it also works the other busy hours (surgeHourSet)
  function dayCost(Sim, P, setup, day, peakStaff) {
    const pl = Sim.plan(P, setup), F = forecastDay(Sim, P, day, setup), busy = Sim.surgeHourSet(P);
    const roster = F.staff.map((n, h) => (peakStaff != null && busy.has(h) ? Math.max(n, peakStaff) : n));
    const labourHours = setup === "all_machine" ? P.attendant * P.hours : roster.reduce((a, b) => a + b, 0);
    const labour = labourHours * P.wage, machine = pl.machineUnits * P.machineMonth * 12 / P.days;
    return { labourHours, labour, machineUnits: pl.machineUnits, machine, total: labour + machine };
  }

  // contiguous groups of hand stations, the split that makes the heaviest group lightest
  function groups(sec, H, k) {
    let best = null;
    const load = g => g.reduce((a, j) => a + sec[j], 0);
    const rec = (i, left, acc) => {
      if (left === 1) {
        const gs = [...acc, H.slice(i)], mx = Math.max(...gs.map(load));
        if (!best || mx < best.mx - 1e-9) best = { gs, mx };
        return;
      }
      for (let j = i + 1; j <= H.length - (left - 1); j++) rec(j, left - 1, [...acc, H.slice(i, j)]);
    };
    rec(0, k, []);
    return best.gs;
  }

  function assignFixed(P, speeds, how = "best") {
    if (!speeds.length) return [];
    const st = P.stations, mach = new Set(P.mixedMachine);
    const sec = st.map(id => P.humanSec[id] * P.humanMult);
    const H = st.map((id, k) => k).filter(k => !mach.has(st[k]));
    const sp = [...speeds].sort((a, b) => (how === "worst" ? a - b : b - a));     // first speed goes to the heaviest work
    const load = g => g.reduce((a, j) => a + sec[j], 0);
    if (speeds.length <= H.length) {
      const gs = groups(sec, H, speeds.length).sort((a, b) => load(b) - load(a));
      return gs.map((g, i) => ({ v: sp[i], set: g }));
    }
    const out = [...H].sort((a, b) => sec[b] - sec[a]).map((k, i) => ({ v: sp[i], set: [k] }));
    const pool = k => out.filter(o => o.set[0] === k).reduce((a, o) => a + o.v, 0);
    for (let i = H.length; i < sp.length; i++) {                                    // extra people join the most loaded station
      const k = H.reduce((a, j) => (sec[j] / pool(j) > sec[a] / pool(a) ? j : a), H[0]);
      out.push({ v: sp[i], set: [k] });
    }
    return out;
  }

  function createFixed(Sim, P, setup, { day = P.surgeDefault, seed = P.seed, warm = true, walkBack, staff, assign = "best" }) {
    const pl = Sim.plan(P, setup), h = peakHour(P), n = P.stations.length;
    const R = Sim.rng(Sim.hash(seed, 7)), RT = Sim.rng(Sim.hash(seed, 8));     // the replica's arrival seed
    const base = Sim.dailyBase(P), mult = P.surgeMult[day];
    const lamOf = hr => base * P.share[hr] * mult / 3600;
    const speeds = Sim.workerSpeeds(staff, P.spread);
    const capNom = Sim.nominalCap(pl, staff);
    const exp = 1 - P.newShare * (1 - P.newSpeed);
    const lineSec = P.stations.reduce((a, s) => a + P.humanSec[s] * P.humanMult, 0);
    const walk = walkBack * n / lineSec;                                     // as store.js: stations per second at speed 1
    const stations = P.stations.map(id => {
      const machine = P.mixedMachine.includes(id);
      const units = machine ? Math.max(1, Math.ceil(Math.max(...pl.rate) * P.margin * P.machineSec[id] * P.machineMult / 60 - 1e-9)) : 0;
      return { id, machine, units, sec: machine ? P.machineSec[id] * P.machineMult : P.humanSec[id] * P.humanMult,
               queue: [], busy: [], ready: [], busyTime: 0 };
    });
    const workers = assignFixed(P, speeds, assign).map((a, i) => ({ i, v: a.v, set: a.set, x: a.set[0], mode: "idle",
      cup: null, k: -1, left: 0, total: 0, target: null, blocked: false, busyTime: 0, blockedTime: 0 }));
    const S = { setup, mode: "fixed", staff, speeds, capNom, stations, workers, t: 0, hour: h, lam: lamOf(h), n,
                cups: [], done: [], lost: 0, arrived: 0, acc: 0, measureFrom: Infinity, servedInHour: 0, handed: 0, handovers: [] };
    const noise = () => { let u = 0; while (u === 0) u = RT();
      return Math.max(0.2, 1 + P.humanCv * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * RT())); };
    const inWindow = t => t >= S.measureFrom && t < S.measureFrom + 3600;

    function arrive(dt, lam) {                                              // identical to store.js
      S.acc += dt;
      while (S.acc >= 1) {
        S.acc -= 1;
        const a = Sim.poisson(lam, R());
        for (let k = 0; k < a; k++) {
          const counted = inWindow(S.t);
          if (counted) S.arrived++;
          if (S.cups.length / capNom > P.targetWait) { if (counted) S.lost++; continue; }
          const cup = { born: S.t };
          S.cups.push(cup); stations[0].queue.push(cup);
        }
      }
    }
    function leave(cup, k) {
      if (k === n - 1) {
        cup.out = S.t; S.cups.splice(S.cups.indexOf(cup), 1); S.handed++;
        if (inWindow(cup.born)) S.done.push(cup);
        if (inWindow(S.t)) S.servedInHour++;
      } else stations[k + 1].queue.push(cup);
    }
    function begin(w, k, carry = 0) {                                       // carry: time left over in this step
      w.cup = stations[k].queue.shift(); w.k = k; w.total = stations[k].sec / (w.v * exp * noise()); w.left = w.total - carry;
      w.mode = "work"; w.x = k;
    }

    S.step = (dt, lam = S.lam) => {
      S.t += dt;
      arrive(dt, lam);
      for (let k = n - 1; k >= 0; k--) {                                     // robots, downstream first
        const s = stations[k];
        if (!s.machine) continue;
        for (const b of s.busy) b.left -= dt;
        if (s.busy.length) s.busyTime += dt * s.busy.length / s.units;
        for (const b of s.busy.filter(b => b.left <= 0)) { s.busy.splice(s.busy.indexOf(b), 1); leave(b.cup, k); }
        while (s.busy.length < s.units && s.queue.length) s.busy.push({ cup: s.queue.shift(), left: s.sec });
      }
      for (const w of workers) {
        let carry = 0;
        if (w.mode === "work") {
          w.left -= dt;
          if (w.left > 0) { w.busyTime += dt; w.x = w.k + 1 - w.left / w.total; continue; }
          carry = -w.left; w.busyTime += dt - carry;
          const c = w.cup; w.cup = null; w.mode = "idle"; w.x = w.k + 1; leave(c, w.k);
        }
        if (w.mode === "walk") {                                             // to another station they own
          const d = w.target - w.x, stepX = walk * w.v * dt;
          if (Math.abs(d) > stepX) { w.x += Math.sign(d) * stepX; continue; }
          w.x = w.target;
          if (stations[w.target].queue.length) begin(w, w.target); else w.mode = "idle";   // a colleague took it first
          continue;
        }
        const k = [...w.set].reverse().find(j => stations[j].queue.length > workers.filter(o => o.mode === "walk" && o.target === j).length);
        if (k == null) continue;                                             // nothing waiting at their stations
        if (w.set.length === 1 || Math.abs(w.x - k) < 1e-9) begin(w, k, carry);
        else { w.mode = "walk"; w.target = k; }
      }
    };
    S.queue = () => stations[0].queue.length;
    S.inStore = () => S.cups.length;

    if (warm && h > 0) { const lw = lamOf(h - 1); for (let i = 0; i < 7200; i++) S.step(0.5, lw); }   // as store.js
    S.measureFrom = S.t; S.done = []; S.arrived = 0; S.lost = 0; S.servedInHour = 0;
    for (const s of stations) s.busyTime = 0;
    for (const w of workers) { w.busyTime = 0; w.blockedTime = 0; }
    return S;
  }

  function create(Sim, Store, P, o = {}) {
    if (!(o.walkBack > 0)) throw new Error("counter.create: opts.walkBack (illustration.walk_back_speed) is required");
    const c = configure(P, o.robots), day = o.day ?? P.surgeDefault;
    const staff = c.setup === "all_machine" ? 0 : (o.staff ?? recommendStaff(Sim, c.P, day, c.setup));
    if (o.mode === "fixed" && c.setup !== "all_machine") return createFixed(Sim, c.P, c.setup, { ...o, day, staff });
    const S = Store.create(Sim, c.P, c.setup, { surge: day, seed: o.seed ?? P.seed, warm: o.warm ?? true, walkBack: o.walkBack, staff });
    S.mode = o.mode === "fixed" ? "fixed" : "brigade";
    return S;
  }

  function run(Sim, Store, P, o = {}) {
    const S = create(Sim, Store, P, o), dt = o.dt || 0.5, t0 = S.t;
    while (S.t < t0 + 3600 - 1e-9) S.step(dt);
    const handovers = S.handovers.length, workerBusy = S.workers.map(w => w.busyTime / 3600);
    while (S.cups.some(c => c.born < t0 + 3600) && S.t < t0 + 3600 + 1800) S.step(dt);
    return { mode: S.mode, staff: S.staff, served: S.servedInHour, lost: S.lost, arrived: S.arrived, handovers,
             times: S.done.map(c => c.out - c.born), workerBusy };
  }

  function compare(Sim, Store, P, o) {
    const c = configure(P, o.robots), seeds = o.seeds;
    const runs = Array.from({ length: seeds }, (_, k) => run(Sim, Store, P, { ...o, seed: P.seed + k }));
    const mean = f => runs.reduce((a, r) => a + f(r), 0) / runs.length;
    return { setup: c.setup, robots: c.robots, staff: runs[0].staff, arrived: mean(r => r.arrived), served: mean(r => r.served),
             lost: mean(r => r.lost), lostShare: mean(r => (r.arrived ? r.lost / r.arrived : 0)),
             medianWait: median(runs.flatMap(r => r.times)), cost: dayCost(Sim, c.P, c.setup, o.day ?? P.surgeDefault, runs[0].staff) };
  }

  const median = x => { if (!x.length) return null; const s = [...x].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

  // modes: brigade, fixed with the best assignment, fixed with the worst; mean over seeds P.seed .. P.seed + seeds - 1
  const MODES = [["brigade", {}], ["fixed_best", { mode: "fixed", assign: "best" }], ["fixed_worst", { mode: "fixed", assign: "worst" }]];
  function grid(Sim, Store, P, { walkBack, seeds, staffRange = [1, 4] }) {
    const out = {};
    for (const day of Object.keys(P.surgeMult)) {
      out[day] = { forecast: forecastDay(Sim, P, day), staff: {} };
      for (let staff = staffRange[0]; staff <= staffRange[1]; staff++) {
        const row = {};
        for (const [key, extra] of MODES) {
          const runs = Array.from({ length: seeds }, (_, k) =>
            run(Sim, Store, P, { day, staff, walkBack, seed: P.seed + k, mode: "brigade", ...extra }));
          const mean = f => runs.reduce((a, r) => a + f(r), 0) / runs.length;
          row[key] = { arrived: mean(r => r.arrived), served: mean(r => r.served), lost: mean(r => r.lost),
                       lostShare: mean(r => (r.arrived ? r.lost / r.arrived : 0)),
                       medianWait: median(runs.flatMap(r => r.times)) };
        }
        out[day].staff[staff] = row;
      }
    }
    return out;
  }

  const api = { configure, presets, forecastDay, recommendStaff, dayCost, assignFixed, create, run, compare, grid, peakHour, MODES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeCounter = api;
})(typeof window !== "undefined" ? window : globalThis);
