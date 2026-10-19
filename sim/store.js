/* store.js - the store replica: one Chagee-style counter in the peak hour, in real seconds.
 *
 * Pure functions, no UI. Runs in Node (require) and the browser (window.ChageeStore).
 * Everything comes from sim.js params() and assumptions.json; nothing is typed here.
 *
 *   The counter is the cost model's stations in stations.list order (order point first,
 *   pick-up last). Position x runs along it: station k covers [k, k+1). Each station is done
 *   by a person or a machine, per setup, exactly as in the cost model's plan().
 *
 *   PEOPLE follow the Week 5 bucket-brigade rules, in seconds:
 *     - a worker carries one cup forward through the hand stations at
 *       speed x experience x per-station variation / human seconds of the station;
 *     - no overtaking: a worker held back by the working colleague ahead is blocked;
 *     - the last worker hands the cup over at pick-up, walks back, and takes over the cup of
 *       working colleague just upstream in the line order (a handover; slowest first by default,
 *       as in Week 5); at the order point with nothing to take over, the worker
 *       starts the next order, or waits if none is waiting;
 *     - at a machine station the worker puts the cup in and, if the machine has a finished
 *       cup ready, takes it on (as a barista swaps cups at a brewer); otherwise the worker
 *       goes for the most downstream finished cup, or walks back like the Week 5 brigade.
 *     Walking speed = illustration.walk_back_speed x the worker's speed, in Week 5 units where
 *     the whole counter is one line (opts.walkBack, required). Staff on shift = plan().rosterPlan
 *     for the peak hour; speeds = sim workerSpeeds(), slowest at the order point (opts.order "fast_first"
 *     reverses it, Week 5's counter-example). The cost
 *     model's coordination loss is NOT applied: walking and blocking produce it here.
 *   MACHINES stay at their station: fixed time (machine seconds x multiplier), plan() units in
 *   parallel; a cup moves on to the next machine by itself, or waits there for a person.
 *   Arrivals: Poisson at the peak hour's rate x surge, the same stream for every setup.
 *   An arrival balks if cups in the store / nominal capacity exceeds the target wait (the
 *   cost model's rule).
 *
 *   create(Sim, P, setup, opts)  a store ready to step(dt); the hour before the peak already run
 *   run(Sim, P, setup, opts)     the peak hour -> { served, lost, times, busy shares, ... }
 *   summary(times)               median, p90, mean of time to serve (seconds)
 */
(function (root) {
  "use strict";


  function peakHour(P) { return P.share.indexOf(Math.max(...P.share)); }

  // opts.staff (optional) overrides the roster for the peak hour; the storyboard deck sets it from counter.js.
  function create(Sim, P, setup, { surge = P.surgeDefault, seed = P.seed, warm = true, walkBack, order = "slow_first", staff: staffIn } = {}) {
    if (!(walkBack > 0)) throw new Error("store.create: opts.walkBack (illustration.walk_back_speed) is required");
    const pl = Sim.plan(P, setup), h = peakHour(P);
    const mStations = setup === "all_machine" ? P.stations : setup === "mixed" ? P.mixedMachine : [];
    const R = Sim.rng(Sim.hash(seed, 7)), RT = Sim.rng(Sim.hash(seed, 8));
    const base = Sim.dailyBase(P), mult = P.surgeMult[surge];
    const lamOf = hr => base * P.share[hr] * mult / 3600;                    // cups per second
    const staff = setup === "all_machine" ? 0 : (staffIn ?? pl.rosterPlan[h]);
    const speeds = Sim.workerSpeeds(staff, P.spread);                       // slowest first (Week 5's order)
    if (order === "fast_first") speeds.reverse();                            // the Week 5 counter-example
    const capNom = Sim.nominalCap(pl, staff);                                // cups per minute
    const exp = 1 - P.newShare * (1 - P.newSpeed);
    const n = P.stations.length;
    const lineSec = P.stations.reduce((a, s) => a + P.humanSec[s] * P.humanMult, 0);
    const walk = walkBack * n / lineSec;                                     // stations per second at speed 1
    const GAP = 0.03 * n;                                                    // Week 5's spacing behind a colleague (0.03 of the line)

    const stations = P.stations.map(id => {
      const machine = mStations.includes(id);
      const units = machine ? Math.max(1, Math.ceil(Math.max(...pl.rate) * P.margin * P.machineSec[id] * P.machineMult / 60 - 1e-9)) : 0;
      return { id, machine, units, sec: machine ? P.machineSec[id] * P.machineMult : P.humanSec[id] * P.humanMult,
               queue: [], busy: [], ready: [], busyTime: 0 };
    });
    const workers = speeds.map((v, i) => ({ i, v, x: 0, mode: "idle", cup: null, m: 1, k: -1, target: null,
                                            blocked: false, busyTime: 0, blockedTime: 0 }));
    const S = { setup, staff, speeds, capNom, stations, workers, t: 0, hour: h, lam: lamOf(h), n,
                cups: [], done: [], lost: 0, arrived: 0, acc: 0, measureFrom: Infinity, servedInHour: 0, handed: 0,
                handovers: [] };

    const noise = () => { let u = 0; while (u === 0) u = RT();
      return Math.max(0.2, 1 + P.humanCv * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * RT())); };
    const inWindow = t => t >= S.measureFrom && t < S.measureFrom + 3600;

    function arrive(dt, lam) {
      S.acc += dt;
      while (S.acc >= 1) {                                                   // one Poisson draw per second
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
    function handOver(cup) {
      cup.out = S.t; S.cups.splice(S.cups.indexOf(cup), 1); S.handed++;
      if (inWindow(cup.born)) S.done.push(cup);
      if (inWindow(S.t)) S.servedInHour++;
    }
    // a cup finished at station k: on to the next machine by itself, or wait there for a person
    function leave(cup, k) {
      if (k === n - 1) handOver(cup);
      else if (stations[k + 1].machine) stations[k + 1].queue.push(cup);
      else stations[k].ready.push(cup);
    }
    const reserved = j => workers.filter(w => w.mode === "fetch" && w.target === j).length;

    function startWork(w, cup, x) { w.cup = cup; w.x = x; w.mode = "work"; w.k = -1; w.target = null; }
    // empty hands: the most downstream finished cup first; otherwise walk back for the next order
    function decide(w) {
      for (let j = n - 1; j >= 0; j--) {
        const s = stations[j];
        if (s.machine && s.ready.length > reserved(j)) {
          w.target = j; w.mode = j + 1 <= w.x + 1e-9 ? "back" : "fetch";
          return;
        }
      }
      w.target = null;
      w.mode = w.x > 1e-9 ? "back" : "idle";                                // nothing ready: walk back towards the order point (Week 5)
    }
    function atMachine(w, j) {                                               // the cup reaches machine station j
      stations[j].queue.push(w.cup); w.cup = null;
      if (stations[j].ready.length) { startWork(w, stations[j].ready.shift(), j + 1); return; }
      w.x = j; decide(w);
    }

    S.step = (dt, lam = S.lam) => {
      S.t += dt;
      arrive(dt, lam);
      for (let k = n - 1; k >= 0; k--) {                                     // machines, downstream first
        const s = stations[k];
        if (!s.machine) continue;
        for (const b of s.busy) b.left -= dt;
        if (s.busy.length) s.busyTime += dt * s.busy.length / s.units;
        for (const b of s.busy.filter(b => b.left <= 0)) { s.busy.splice(s.busy.indexOf(b), 1); leave(b.cup, k); }
        while (s.busy.length < s.units && s.queue.length) s.busy.push({ cup: s.queue.shift(), left: s.sec });
      }
      // carriers first (downstream first, as in Week 5), then everyone else, so a worker walking back
      // always meets a carrier's new position and nobody slips past within one step
      const order = [...workers].sort((a, b) => (b.mode === "work") - (a.mode === "work") || b.x - a.x || b.i - a.i);
      for (const w of order) {
        w.blocked = false;
        if (w.mode === "work") {
          const k = Math.min(n - 1, Math.floor(w.x + 1e-9));
          if (k !== w.k) { w.k = k; w.m = noise(); }
          let nx = w.x + w.v * exp * w.m * dt / stations[k].sec;
          const ahead = workers.filter(o => o !== w && o.mode === "work" && o.x > w.x)
                               .reduce((a, o) => (a == null || o.x < a.x ? o : a), null);
          if (ahead && nx > ahead.x - GAP) {                                 // held back by the colleague ahead
            nx = Math.max(w.x, ahead.x - GAP); w.blocked = true; w.blockedTime += dt;
          }
          if (nx <= w.x + 1e-12) continue;
          w.busyTime += dt;
          if (nx >= k + 1) {
            if (k + 1 >= n) { const c = w.cup; w.cup = null; w.x = n; handOver(c); w.mode = "back"; w.target = null; }
            else if (stations[k + 1].machine) atMachine(w, k + 1);
            else w.x = nx;
          } else w.x = nx;
        } else if (w.mode === "back") {
          const nx = w.x - walk * w.v * dt;
          // the first thing met walking upstream: a working colleague (handover) or a finished cup at a machine
          // Week 5: a worker only takes over from the colleague upstream in the line order (lower index), so
          // nobody passes; with slowest first the line balances itself
          const u = workers.filter(o => o.i < w.i && o.mode === "work" && o.x >= nx)
                           .reduce((a, o) => (a == null || o.x > a.x ? o : a), null);
          let pick = null;
          for (let j = n - 1; j >= 0; j--) {
            const s = stations[j], at = j + 1;
            if (s.machine && s.ready.length && at <= w.x + 1e-9 && at >= nx && (!u || at > u.x)) { pick = j; break; }
          }
          if (pick != null) { startWork(w, stations[pick].ready.shift(), pick + 1); continue; }
          if (u) {
            S.handovers.push({ t: S.t, x: u.x });
            startWork(w, u.cup, u.x); u.cup = null; u.mode = "back"; u.target = null;
            continue;
          }
          if (nx <= 0) {
            w.x = 0;
            if (!stations[0].machine && stations[0].queue.length) startWork(w, stations[0].queue.shift(), 0);
            else decide(w);
          } else w.x = nx;
        } else if (w.mode === "fetch") {
          const j = w.target, at = j + 1, nx = Math.min(at, w.x + walk * w.v * dt);
          if (nx >= at - 1e-9) {
            if (stations[j].ready.length) startWork(w, stations[j].ready.shift(), at);
            else { w.x = at; decide(w); }
          } else w.x = nx;
        } else {                                                             // idle
          if (w.x <= 1e-9 && !stations[0].machine && stations[0].queue.length) startWork(w, stations[0].queue.shift(), 0);
          else decide(w);
        }
      }
    };
    S.queue = () => stations[0].queue.length;
    S.inStore = () => S.cups.length;

    if (warm && h > 0) { const lw = lamOf(h - 1); for (let i = 0; i < 7200; i++) S.step(0.5, lw); }   // the hour before the peak
    S.measureFrom = S.t; S.done = []; S.arrived = 0; S.lost = 0; S.servedInHour = 0; S.handovers = [];
    for (const s of stations) s.busyTime = 0;
    for (const w of workers) { w.busyTime = 0; w.blockedTime = 0; }
    return S;
  }

  function run(Sim, P, setup, opts = {}) {
    const S = create(Sim, P, setup, opts), dt = opts.dt || 0.5, t0 = S.t;
    while (S.t < t0 + 3600 - 1e-9) S.step(dt);
    const busy = S.workers.map(w => w.busyTime / 3600), mbusy = S.stations.filter(s => s.machine).map(s => s.busyTime / 3600);
    const handovers = S.handovers.length;
    // follow every cup ordered in the hour to pick-up (arrivals continue at the same rate meanwhile)
    const pending = () => S.cups.some(c => c.born < t0 + 3600);
    while (pending() && S.t < t0 + 3600 + 1800) S.step(dt);
    return { setup, staff: S.staff, served: S.servedInHour, lost: S.lost, arrived: S.arrived, handovers,
             times: S.done.map(c => c.out - c.born), workerBusy: busy, machineBusy: mbusy };
  }

  function summary(times) {
    if (!times.length) return { median: null, p90: null, mean: null };
    const x = [...times].sort((a, b) => a - b), q = p => x[Math.min(x.length - 1, Math.floor(p * x.length))];
    return { median: q(0.5), p90: q(0.9), mean: x.reduce((a, b) => a + b, 0) / x.length };
  }

  const api = { create, run, summary, peakHour };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ChageeStore = api;
})(typeof window !== "undefined" ? window : globalThis);
