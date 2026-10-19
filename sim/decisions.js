/* decisions.js - slide 08, the GM's playbook: the four decisions, each recomputed from the simulator.
 *
 * Pure functions, no UI. Node only (used by storyboard/precompute.js for the figures, and by
 * storyboard/check_decisions.js, which the build runs every time and which fails if a decision stops holding).
 * Every number is assumptions.json or machine_tiers.json; nothing here changes an assumption value.
 *
 *   splitPick(Sim, Store, C, P, robots, day, o)  the fewest people (forecast roster up) and the better sharing rule
 *                                                keeping peak-hour walk-aways within storyboard.walkaway_target, as
 *                                                slide 07's table; plus costAt(m): the day's cost at machine cost m.
 *   decide(deps, o)                              { where, automate, roster, share }, each with its figures and `holds`.
 *                                                share is measured in the recommended setup: one machine, the economic-rule crew.
 *
 * automate: one tea-and-milk machine against the four slide 07 splits on every day type, and the machine cost per
 * unit a month at which it and today's split (our scenario) cost the same (sim.breakEvenFn, the breakEven core,
 * with simulation.breakeven tolerances over the machine-cost range).
 */
"use strict";

function splitPick(Sim, Store, C, P, robots, day, o) {
  const c = C.configure(P, robots), F = C.forecastDay(Sim, c.P, day, c.setup), target = o.target;
  const staffs = c.setup === "all_machine" ? [0] : Array.from({ length: o.extra + 1 }, (_, k) => F.peakStaff + k);
  for (const staff of staffs) {
    const modes = c.setup === "all_machine" ? ["brigade"] : ["brigade", "fixed"];
    const rows = modes.map(mode => ({ mode, ...C.compare(Sim, Store, P, { day, robots, staff, mode, walkBack: o.walkBack, seeds: o.seeds }) }))
      .sort((a, b) => a.lostShare - b.lostShare || a.medianWait - b.medianWait);
    if (rows[0].lostShare <= target + 1e-12) {
      const pk = c.setup === "all_machine" ? undefined : staff;
      const costAt = m => C.dayCost(Sim, { ...c.P, machineMonth: m }, c.setup, day, pk).total;
      return { staff, mode: rows[0].mode, lostShare: rows[0].lostShare, medianWait: rows[0].medianWait, cost: costAt(P.machineMonth), costAt };
    }
  }
  return null;
}

function decide({ Sim, Store, C, Site, B, RAW, P, GEO, TIERS }, o) {
  const days = Object.keys(P.surgeMult), presets = C.presets(RAW, P);
  const single = TIERS.tiers.find(t => t.id === "single").replaces;

  // 1. where to open: the top app-search cluster against a store beside the outlet nearest to it
  const M = Site.model(Sim, RAW, GEO), top = M.candidates[0];
  const j = GEO.outlets.map(([x, y], k) => [Math.hypot(x - top.x, y - top.y), k]).sort((a, b) => a[0] - b[0])[0][1];
  const beside = Site.forecast(M, { x: GEO.outlets[j][0] + 3, y: GEO.outlets[j][1] });
  const where = { topNet: top.f.netNew, besideNet: beside.netNew, outlet: j, holds: top.f.netNew > beside.netNew };

  // 2. what to automate: one machine against the four slide 07 splits, every day type; break-even machine cost
  const opts = { ...presets, single: { label: "One machine (tea and milk)", robots: single } };
  const perDay = {};
  for (const day of days) {
    const picks = Object.fromEntries(Object.entries(opts).map(([k, p]) => [k, splitPick(Sim, Store, C, P, p.robots, day, o)]));
    const ok = Object.entries(picks).filter(([, v]) => v);
    const cheapest = ok.reduce((a, b) => (b[1].cost < a[1].cost ? b : a))[0];
    const be = Sim.breakEvenFn(m => picks.single.costAt(m) - picks.today.costAt(m), P.ranges.machineMonth, P.breakeven);
    // a value: below it one side is cheaper; none in range: one side is cheaper across the whole range ("always")
    perDay[day] = { cheapest, single: strip(picks.single), today: strip(picks.today), hand: strip(picks.all_hand),
                    breakEven: be.kind === "value" ? be.x : null,
                    cheaperBelow: be.kind === "value" ? (be.below === "a" ? "single" : "today") : null,
                    always: be.kind === "value" ? null : (be.cheaper === "a" ? "single" : "today") };
  }
  const bes = days.map(d => perDay[d].breakEven).filter(x => x != null);
  // above breakEvenMax one machine is cheaper on every day type; below it today's split wins on at least one
  const automate = { perDay, breakEvenMax: bes.length ? Math.max(...bes) : null, range: P.ranges.machineMonth, assumed: P.machineMonth,
    holds: days.every(d => perDay[d].cheapest === "single")
           && days.every(d => perDay[d].always === "single" || (perDay[d].cheaperBelow === "today" && perDay[d].breakEven < P.machineMonth)) };

  // 3. how many people: the economic rule adds a person on event days, not on busy days (with the one machine)
  const R = B.runs(Sim, Store, C, P, { robots: single, walkBack: o.walkBack, seeds: o.seeds, extra: o.extra });
  const V = B.value(R, P, B.econ(RAW, P)), flat = R.days.none.cand_machine[0].staff;
  const roster = { flat, busy: V.per.busy.abE.staff, event: V.per.event.abE.staff, eventOrders: V.per.event.abE.orders,
    holds: V.per.busy.abE.staff === flat && V.per.event.abE.staff > flat };

  // 4. how to share: in the recommended setup (one machine, the event-day crew the economic rule picks), the brigade
  //    against fixed posts with the best and the worst assignment
  const ev = o.shareDay, k = roster.event, cmp = mode => C.compare(Sim, Store, P, { day: ev, robots: single, staff: k, walkBack: o.walkBack, seeds: o.seeds, ...mode });
  const bri = cmp({}), fb = cmp({ mode: "fixed", assign: "best" }), fw = cmp({ mode: "fixed", assign: "worst" });
  const share = { day: ev, staff: k, config: "single", brigade: bri.lostShare, fixedBest: fb.lostShare, fixedWorst: fw.lostShare,
    waitBrigade: bri.medianWait, waitFixedBest: fb.medianWait,
    holds: bri.lostShare <= fb.lostShare && bri.lostShare < fw.lostShare && bri.medianWait <= fb.medianWait };

  return { where, automate, roster, share };
}

const strip = x => x && { staff: x.staff, mode: x.mode, lostShare: x.lostShare, medianWait: x.medianWait, cost: x.cost };

module.exports = { splitPick, decide };
