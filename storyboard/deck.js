/* deck.js - storyboard deck: navigation, step-through panels, forecast chart, counter replica, playbook.
 * Numbers on screen come from window.STORY (assumptions.json + storyboard/build/data.json) or are computed
 * live with sim.js, store.js and counter.js. Nothing here types a figure.
 */
(function () {
  "use strict";
  const PRISTINE = "<!doctype html>\n" + document.documentElement.outerHTML;   // before anything renders: the Download base
  const { RAW, DATA } = window.STORY;
  const Sim = window.ChageeSim, Store = window.ChageeStore, C = window.ChageeCounter;
  const P = Sim.params(RAW), SB = RAW.storyboard;
  const $ = (r, s) => r.querySelector(s), $$ = (r, s) => [...r.querySelectorAll(s)];
  const Q = new URLSearchParams(location.search);
  const PRINT = Q.has("print"), reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DAYS = Object.keys(P.surgeMult), DAY_LABEL = SB.day_type_labels.value, DAY0 = SB.day_type_default.value;
  const WB = RAW.illustration.walk_back_speed.value;
  const pct = (x, d = 0) => `${(100 * x).toFixed(d)}%`;
  const mmss = s => (s == null ? "–" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
  const hourLabel = h => `${String(DATA.counter.firstHour + h).padStart(2, "0")}:00`;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const COL = { red: css("--red"), navy: css("--navy"), gold: css("--gold"), taupe: css("--taupe"), ink: css("--ink"),
                ink2: css("--ink2"), cream: css("--cream"), line: css("--line"), blue: css("--blue") };
  const T = (x, y, s, a = "") => `<text x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" ${a}>${s}</text>`;
  const BUS = { day: DAY0, fns: [] };                       // the day type, shared by the forecast and counter slides
  const setDay = d => { BUS.day = d; BUS.fns.forEach(f => f(d)); };
  const daySeg = (onPick) => {
    const el = document.createElement("div"); el.className = "seg";
    el.innerHTML = DAYS.map(d => `<button class="btn" data-d="${d}">${DAY_LABEL[d]}</button>`).join("");
    $$(el, "button").forEach(b => (b.onclick = () => onPick(b.dataset.d)));
    const sync = d => $$(el, "button").forEach(b => b.classList.toggle("on", b.dataset.d === d));
    BUS.fns.push(sync); sync(BUS.day);
    return el;
  };

  /* ---------------------------------------------------------------- slides, scaling, rail */
  const deck = $(document, "#deck"), slides = $$(document, ".slide");
  let cur = 0;
  const content = slides.filter(s => s.classList.contains("content") && s.dataset.chapter !== "Appendix");
  const chapters = [...new Set(content.map(s => s.dataset.chapter))];
  slides.forEach((s, i) => {
    const pg = $(s, ".pg"); if (pg) pg.textContent = i + 1;
    const rail = $(s, ".rail");
    if (rail) {
      const at = chapters.indexOf(s.dataset.chapter);
      rail.innerHTML = chapters.map((c, k) => `<span class="${k === at ? "cur" : k < at ? "past" : ""}">${c}</span>`).join("");
    }
  });
  function fit() {
    if (PRINT) return;
    const nw = document.body.classList.contains("shownotes") ? 380 : 0;
    const W = innerWidth - nw, H = innerHeight, s = Math.min(W / 1280, H / 720);
    deck.style.left = `${W / 2}px`;
    deck.style.transform = `translate(${-640 * s}px,${-360 * s}px) scale(${s})`;
  }
  function show(i, fromEnd = false) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle("active", k === cur));
    const st = slides[cur]._stepper; if (st) st.go(fromEnd || revealAll ? st.N : 1, true);
    const rv = $(slides[cur], ".vs.clickrev"); if (rv) setRev(rv, fromEnd || revealAll ? 2 : 0);
    $(document, "#count").textContent = `${cur + 1} / ${slides.length}`;
    const n = $(slides[cur], "aside.notes");
    $(document, "#notes .nb").innerHTML = n ? n.innerHTML : "";
    history.replaceState(null, "", `${location.search}#${cur + 1}`);
  }
  const editingNow = () => document.body.classList.contains("editing");
  // a band revealed by click (.vs.clickrev, slide 05): 0 hidden, 1 Without AI, 2 both; arrows step it after the panel's steps
  function setRev(el, r) { el._r = r; el.classList.toggle("r1", r >= 1); el.classList.toggle("r2", r >= 2); }
  $$(document, ".vs.clickrev").forEach(el => { setRev(el, 2); el.addEventListener("click", ev => { if (!ev.target.closest(".vsb")) setRev(el, Math.min(2, (el._r || 0) + 1)); }); });
  const revOf = () => { const el = $(slides[cur], ".vs.clickrev"); return el && !revealAll && !editingNow() ? el : null; };
  function next() { const st = slides[cur]._stepper, rv = revOf();
    if (st && st.cur < st.N && !revealAll && !editingNow()) st.go(st.cur + 1); else if (rv && rv._r < 2) setRev(rv, rv._r + 1); else if (cur < slides.length - 1) show(cur + 1); }
  function prev() { const st = slides[cur]._stepper, rv = revOf();
    if (rv && rv._r > 0) setRev(rv, rv._r - 1); else if (st && st.cur > 1 && !revealAll && !editingNow()) st.go(st.cur - 1); else if (cur > 0) show(cur - 1, true); }
  /* ---------------------------------------------------------------- toolbar (as in the previous deck) */
  const toast = m => { const t = $(document, "#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 2200); };
  const MODE_KEY = "opim639-storyboard-reveal";
  let revealAll = false;
  try { revealAll = localStorage.getItem(MODE_KEY) === "all"; } catch (e) {}
  function setReveal(all, say) {
    revealAll = all; try { localStorage.setItem(MODE_KEY, all ? "all" : "one"); } catch (e) {}
    const b = $(document, "#modeb"); b.textContent = all ? "Reveal: all at once" : "Reveal: one by one"; b.classList.toggle("on", all);
    const st = slides[cur]._stepper; if (st) st.go(all ? st.N : st.cur, true);
    const rv = $(slides[cur], ".vs.clickrev"); if (rv && all) setRev(rv, 2);
    if (say) toast((all ? "Every step shown" : "Step through each panel") + " · every slide");
  }
  const toggleFull = () => { try { const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); p && p.catch && p.catch(() => {}); } catch (e) {} };
  const toggleNotes = () => { document.body.classList.toggle("shownotes"); $(document, "#notesb").classList.toggle("on", document.body.classList.contains("shownotes")); fit(); };
  const doPrint = () => { preparePrint(); window.print(); };
  $(document, "#prev").onclick = prev; $(document, "#next").onclick = next;
  $(document, "#modeb").onclick = () => setReveal(!revealAll, true);
  $(document, "#notesb").onclick = toggleNotes;
  $(document, "#printb").onclick = doPrint;
  $(document, "#fs").onclick = toggleFull;
  if (!document.fullscreenEnabled) $(document, "#fs").style.display = "none";          // blocked in embedded previews
  document.addEventListener("fullscreenchange", () => setTimeout(fit, 50));

  /* editing: click any slide text in edit mode; saved in this browser; Download bakes the edits into a copy */
  const EDIT_SEL = ".kicker,.head,.sub,.card h4,.card p,.takeaway span:not(.lab),.vs span:not(.lab),.caps li span:not(.n),.ptitle,.move .k,.move p," +
    ".area h5,.area .d,.area .why,.aibox p,.node h5,.node .what,.persona dd,.slide.agenda .nm,.slide.cover h1,.slide.cover .tl,.slide.cover .meta,aside.notes p";
  const STORE = "opim639-storyboard-edits";
  slides.forEach((sl, i) => $$(sl, EDIT_SEL).forEach((el, k) => { if (!el.closest(".ctl,.cset,.opt")) el.dataset.ek = `${i}.${k}`; }));
  let edits = {};
  try { edits = JSON.parse($(document, "#baked-edits").textContent || "{}"); } catch (e) {}
  try { Object.assign(edits, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch (e) {}
  $$(document, "[data-ek]").forEach(el => { if (edits[el.dataset.ek] != null) el.innerHTML = edits[el.dataset.ek]; });
  function setEditing(on) {
    document.body.classList.toggle("editing", on); $(document, "#editb").classList.toggle("on", on);
    $$(document, "[data-ek]").forEach(el => (on ? el.setAttribute("contenteditable", "true") : el.removeAttribute("contenteditable")));
    if (!on && document.activeElement?.blur) document.activeElement.blur();
    steppers.forEach(({ S }) => S.go(on || revealAll ? S.N : S.cur, true));            // edit mode shows every step
    if (on) $$(document, ".vs.clickrev").forEach(el => setRev(el, 2));
    toast(on ? "Edit mode: click any text to change it" : "Edits saved in this browser");
  }
  $(document, "#editb").onclick = () => setEditing(!editingNow());
  document.addEventListener("input", e => { const el = e.target.closest?.("[data-ek]"); if (!el) return;
    edits[el.dataset.ek] = el.innerHTML; try { localStorage.setItem(STORE, JSON.stringify(edits)); } catch (x) {} });
  document.addEventListener("paste", e => { if (!e.target.closest?.("[data-ek]")) return; e.preventDefault();
    document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); });
  $(document, "#dl").onclick = () => {
    const json = JSON.stringify(edits).replace(/</g, "\\u003c");
    const out = PRISTINE.replace(/(<script id="baked-edits" type="application\/json">)[\s\S]*?(<\/script>)/, (m, a, b) => a + json + b);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out], { type: "text/html" }));
    a.download = "chagee_storyboard_edited.html"; document.body.appendChild(a); a.click(); a.remove();
    toast("Downloaded a copy with your edits built in");
  };
  $(document, "#reset").onclick = () => { if (!confirm("Undo every edit made in this browser?")) return;
    try { localStorage.removeItem(STORE); } catch (e) {} location.reload(); };

  addEventListener("keydown", e => {
    if (e.target.isContentEditable) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.target.closest?.("input,select,textarea")) return;
    if (["ArrowRight", " ", "PageDown"].includes(e.key) && e.target.tagName !== "BUTTON") { e.preventDefault(); e.key === "PageDown" ? show(cur + 1) : next(); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); e.key === "PageUp" ? show(cur - 1) : prev(); }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(slides.length - 1);
    else if (e.key === "n" || e.key === "N") toggleNotes();
    else if ((e.key === "f" || e.key === "F") && document.fullscreenEnabled) toggleFull();
    else if (e.key === "e" || e.key === "E") setEditing(!editingNow());
    else if (e.key === "v" || e.key === "V") setReveal(!revealAll, true);
    else if (e.key === "p" || e.key === "P") doPrint();
  });
  let idle; const wake = () => { document.body.classList.remove("idle"); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add("idle"), 2500); };
  addEventListener("mousemove", wake); addEventListener("keydown", wake); wake();
  $$(document, ".agenda li[data-go]").forEach(li => (li.onclick = () => show(slides.indexOf(document.getElementById(li.dataset.go)))));
  addEventListener("resize", fit);

  /* ---------------------------------------------------------------- step-through panels */
  function stepper(panel) {
    const N = +panel.dataset.steps, els = $$(panel, "[data-s]"), hooks = [];
    const ctl = $(panel, ".ctl:not(.cctl)");
    ctl.innerHTML = `<button class="btn" data-k="prev" aria-label="Previous step">◀</button>
      <button class="btn primary" data-k="play">▶ Play</button>
      <button class="btn" data-k="next" aria-label="Next step">▶</button>
      <span class="count"></span><button class="btn" data-k="all">Show all</button>`;
    const S = { N, cur: N, timer: null, hooks };
    S.go = (k, quiet) => {
      S.cur = Math.max(1, Math.min(N, k));
      els.forEach(e => { const s = +e.dataset.s; e.classList.toggle("on", s <= S.cur); e.classList.toggle("now", s === S.cur); });
      $(ctl, ".count").textContent = `${S.cur} / ${N}`;
      hooks.forEach(f => f(S.cur));
      if (!quiet && S.cur >= N) stop();
    };
    const stop = () => { clearInterval(S.timer); S.timer = null; $(ctl, "[data-k=play]").textContent = "▶ Play"; };
    const play = () => {
      if (S.timer) return stop();
      if (S.cur >= N) S.go(1, true);
      $(ctl, "[data-k=play]").textContent = "❚❚ Pause";
      S.timer = setInterval(() => S.go(S.cur + 1), reduce ? 3200 : 2400);
    };
    ctl.onclick = e => { const k = e.target.closest("[data-k]")?.dataset.k; if (!k) return;
      if (k === "play") play(); else { stop(); S.go(k === "prev" ? S.cur - 1 : k === "next" ? S.cur + 1 : N); } };
    S.stop = stop;
    panel.closest(".slide")._stepper = S;
    return S;
  }
  const steppers = $$(document, ".panel.stepper, .inner.stepper").map(p => ({ p, S: stepper(p) }));

  // 02: the cup token travels along the chain
  steppers.filter(x => x.p.closest("#c2")).forEach(({ p, S }) => {
    const tok = $(p, ".token"), nodes = $$(p, ".node");
    S.hooks.push(k => { tok.style.left = `${(k - 0.5) / nodes.length * 100}%`; nodes.forEach((n, i) => n.classList.toggle("now", i === k - 1)); });
  });
  // 03: rows light up one by one, then the scope rows
  steppers.filter(x => x.p.dataset.kind === "matrix").forEach(({ p, S }) => {
    const rows = $$(p, ".rowg"), scope = [1, 2, 4, 5];
    S.hooks.push(k => rows.forEach(r => {
      const i = +r.dataset.row;
      r.classList.toggle("hot", k < S.N && i === k);
      r.classList.toggle("dim", k < S.N ? i > k : !scope.includes(i));
      r.classList.toggle("scope", k === S.N && scope.includes(i));
    }));
  });

  /* ---------------------------------------------------------------- 06 / 07 side-by-side counters */
  const NAME = { ticket: "Order and tag", cup_ice: "Cup and ice", tea_milk: "Tea and milk", topping_finish: "Toppings", shake_seal: "Shake and seal", handover: "Hand-over" };
  const SHARE = [["brigade", "Bucket brigade"], ["fixed_best", "Fixed, fastest on toppings"], ["fixed_worst", "Fixed, slowest on toppings"]];
  const PRESETS = C.presets(RAW, P), [SMIN, SMAX] = SB.staff_choices.value, SEEDS = DATA.seeds;
  Object.entries(SB.split_presets.display_labels || {}).forEach(([k, l]) => PRESETS[k] && (PRESETS[k].label = l));   // display names only
  PRESETS.today.label = "Today's split (our scenario)";                 // never Chagee's setup; display only
  PRESETS.single = { label: "One machine (tea and milk)", robots: [...window.STORY.TIERS.tiers.find(t => t.id === "single").replaces] };
  const SPLITROW = (day, k) => k === "single" ? { ...DATA.decisions.automate.perDay[day].single, label: PRESETS.single.label, setup: "mixed", meets: true,
    cost: { total: DATA.decisions.automate.perDay[day].single.cost } } : DATA.splits[day][k];
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const money = x => `S$${Math.round(x).toLocaleString("en-SG")}`;
  const printers = [];
  let PRINTING = PRINT;

  function compareWidget(panel) {
    const mode = panel.dataset.mode, slide = panel.closest(".slide"), side = $(slide, ".cards");
    const ctl = $(panel, ".cctl"), opts = $$(panel, ".opt");
    const [gA, gB] = SB.gm_compare_default.value;
    const init = () => (mode === "share"
      ? [{ share: "brigade" }, { share: "fixed_best" }]
      : [{ robots: [...PRESETS[gA].robots], share: "brigade" }, { robots: [...PRESETS[gB].robots], share: "brigade" }]);
    const st = { playing: false, speed: 10, o: init() };
    const conf = o => C.configure(P, o.robots);
    const forecastStaff = o => { const c = conf(o); return C.recommendStaff(Sim, c.P, BUS.day, c.setup); };
    // on the GM slide a preset split starts with the crew the split table found; otherwise the forecast roster
    const startStaff = o => {
      if (mode === "split") { const k = presetOf(o), row = k && SPLITROW(BUS.day, k);
        if (row && row.meets) { o.share = row.mode === "fixed" ? "fixed_best" : "brigade"; return row.staff; } }
      return forecastStaff(o);
    };
    const presetOf = o => Object.keys(PRESETS).find(k => sameSet(PRESETS[k].robots, conf(o).robots)) || null;
    const runOpts = o => ({ day: BUS.day, staff: o.staff, walkBack: WB, robots: o.robots,
                            mode: o.share === "brigade" ? "brigade" : "fixed", assign: o.share === "fixed_worst" ? "worst" : "best" });

    ctl.innerHTML = `<button class="btn primary" data-k="play">▶ Play</button><button class="btn" data-k="step">Step +30 s</button>
      <button class="btn" data-k="end" title="Skip to the end of the peak hour and compare A and B">⏭ End</button>
      <button class="btn" data-k="reset">Reset</button><span class="seg"><button class="btn" data-v="10">×10</button><button class="btn" data-v="30">×30</button></span>`;
    $(side, ".dslot").replaceWith(daySeg(setDay));

    function head(i) {
      const o = st.o[i], el = opts[i], c = conf(o), robotsAll = c.setup === "all_machine";
      const shareSel = `<select data-f="share" aria-label="Sharing rule">${SHARE.map(([k, l]) => `<option value="${k}"${k === o.share ? " selected" : ""}>${l}</option>`).join("")}</select>`;
      const pk = presetOf(o);
      const splitSel = `<select data-f="split" aria-label="Split">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}"${k === pk ? " selected" : ""}>${p.label}</option>`).join("")}${pk ? "" : `<option selected value="">Custom split</option>`}</select>`;
      const fs = forecastStaff(o);
      const people = robotsAll ? `<span class="muted" style="font-size:11.5px">no one on the line</span>`
        : `<span class="staffctl"><button class="btn" data-f="minus">−</button><span class="v">${o.staff}</span><button class="btn" data-f="plus">+</button></span>
           <span class="rec">${o.staff === fs ? (mode === "split" ? "" : "forecast roster") : `forecast ${fs}`}</span>`;
      const shareSeg = robotsAll ? "" : `<span class="seg"><button class="btn${o.share === "brigade" ? " on" : ""}" data-f="sh" data-v="brigade">Brigade</button><button class="btn${o.share !== "brigade" ? " on" : ""}" data-f="sh" data-v="fixed_best">Fixed posts</button></span>`;
      el.classList.toggle("clickable", mode === "split");
      el.innerHTML = `<div class="ohead screenonly"><span class="badge">${"AB"[i]}</span>${mode === "share" ? shareSel : splitSel}${people}${mode === "split" ? shareSeg : ""}</div>
        <div class="ohead printonly"><span class="badge">${"AB"[i]}</span><span class="nm">${mode === "share" ? SHARE.find(s => s[0] === o.share)[1] : (pk ? PRESETS[pk].label : "Custom split")}</span>
          <span class="muted" style="font-size:11.5px">${robotsAll ? "no one on the line" : `${o.staff} ${o.staff === 1 ? "person" : "people"}${mode === "split" ? ", " + (o.share === "brigade" ? "brigade" : "fixed posts") : ""}`}</span></div>
        <svg class="vsvg" viewBox="0 0 380 212"></svg>
        <div class="ostat live"></div><div class="ostat mean"></div>`;
    }
    function fresh(i, toMinute = 0) {
      const S = C.create(Sim, Store, P, { ...runOpts(st.o[i]), seed: P.seed });
      const end = S.t + toMinute * 60; while (S.t < end - 1e-9) S.step(0.5);
      st.o[i].S = S;
    }
    function mean(i) {                                         // many seeded runs, after the click has painted
      const o = st.o[i], el = $(opts[i], ".ostat.mean");
      el.innerHTML = `<span>running ${SEEDS} peak hours…</span>`;
      clearTimeout(o.tm);
      const go = () => {
        const r = C.compare(Sim, Store, P, { ...runOpts(o), seeds: SEEDS }); o.res = r;
        el.innerHTML = `<span>${SEEDS} runs:</span><span>away <b>${pct(r.lostShare, 1)}</b></span><span>${mode === "split" ? "wait" : "median wait"} <b>${mmss(r.medianWait)}</b></span>` +
          (mode === "split" ? `<span><b>${money(r.cost.total)}</b>/day</span>` : "");
      };
      if (PRINTING) go(); else o.tm = setTimeout(go, 30);
    }
    const minute = S => (S.t - S.measureFrom) / 60;
    const cup = (x, y, c = COL.gold) => `<path d="M${(x - 4).toFixed(1)} ${(y - 5.5).toFixed(1)}h8l-1.3 10.5h-5.4z" fill="${c}" stroke="#fff" stroke-width=".8"/>`;
    const Y0 = 22, RH = 30;
    function draw(i) {
      const S = st.o[i].S, el = opts[i], n = S.stations.length;
      let s = T(8, 13, `ORDERS IN · ${S.inStore()} cups in store`, `font-size="9.5" font-weight="700" letter-spacing=".06em" fill="${COL.taupe}"`);
      S.stations.forEach((o, k) => {
        const y = Y0 + k * RH, m = o.machine;
        s += `<g class="st" data-k="${k}"><rect x="6" y="${y}" width="170" height="${RH - 5}" rx="6" fill="${m ? COL.navy : "#fff"}" stroke="${m ? COL.navy : "#CFC6B5"}" stroke-width="1.3"/>` +
             T(13, y + 11, NAME[o.id] || o.id, `font-size="10.5" font-weight="600" fill="${m ? "#fff" : COL.ink}"`) +
             T(13, y + 21.5, m ? `robot${o.units > 1 ? " ×" + o.units : ""} · ${Math.round(o.sec)} s` : `by hand · ${Math.round(o.sec)} s`, `font-size="9.5" fill="${m ? "#C9D3E6" : COL.taupe}"`) + `</g>`;
        if (m) o.busy.forEach((b, j) => (s += `<rect x="12" y="${y + RH - 8 - j * 3}" width="${158 * (1 - Math.max(0, b.left) / o.sec)}" height="2" fill="${COL.gold}"/>`));
        o.queue.slice(0, 5).forEach((c, j) => (s += cup(186 + j * 9, y + 13)));
        const more = o.queue.length - 5; if (more > 0) s += T(232, y + 18, `+${more}`, `font-size="9.5" fill="${COL.taupe}"`);
        if (m) o.ready.slice(0, 3).forEach((c, j) => (s += cup(186 + (Math.min(5, o.queue.length) + j) * 9 + 4, y + 13, COL.red)));
      });
      s += T(8, Y0 + n * RH + 9, "PICK-UP", `font-size="9.5" font-weight="700" letter-spacing=".06em" fill="${COL.taupe}"`);
      (S.handovers || []).filter(h => S.t - h.t < 60).forEach(h =>
        (s += `<path d="M262 ${(Y0 + h.x * RH).toFixed(1)} l7 -4 v8 z" fill="${COL.gold}" opacity="${(1 - (S.t - h.t) / 60).toFixed(2)}"/>`));
      S.workers.forEach(w => {
        const near = S.workers.filter(o => o.i < w.i && Math.abs(o.x - w.x) < 0.45).length;
        const x = 292 + near * 24, y = Y0 + Math.min(n, w.x) * RH + 2, faded = w.mode !== "work";
        s += `<g opacity="${faded ? 0.42 : 1}">`;
        if (w.cup) s += cup(x - 17, y, COL.gold);
        s += `<circle cx="${x}" cy="${y.toFixed(1)}" r="10" fill="${COL.red}"/>`;
        if (w.blocked) s += `<circle cx="${x}" cy="${y.toFixed(1)}" r="13.5" fill="none" stroke="${COL.gold}" stroke-width="3"/>`;
        s += T(x, y + 3.5, w.v.toFixed(1), `font-size="9" font-weight="700" fill="#fff" text-anchor="middle"`) + `</g>`;
      });
      if (!S.workers.length) s += T(292, Y0 + 3 * RH, "robots only", `font-size="10" fill="${COL.taupe}" text-anchor="middle"`);
      $(el, "svg").innerHTML = s;
      const mi = Math.max(0, Math.min(60, minute(S)));
      $(el, ".ostat.live").innerHTML = `<span>minute <b>${mi.toFixed(0)}</b> / 60</span><span>served <b>${S.servedInHour}</b></span><span>walked away <b>${S.lost}</b></span>` +
        (S.mode === "brigade" && S.workers.length > 1 ? `<span>hand-overs <b>${S.handovers.length}</b></span>` : "");
    }
    function table() {
      const tb = $(side, ".res");
      if (mode === "share") {
        const k = Math.max(SMIN, Math.min(SMAX, st.o[0].staff || SMIN)), row = DATA.grid[BUS.day].staff[k];
        const best = SHARE.map(r => r[0]).reduce((a, x) => (row[x].lostShare < row[a].lostShare - 1e-9 || (Math.abs(row[x].lostShare - row[a].lostShare) < 1e-9 && row[x].medianWait < row[a].medianWait) ? x : a));
        tb.innerHTML = `<tr><th>${DAY_LABEL[BUS.day]}, ${k} ${k === 1 ? "person" : "people"}</th><th>Walked away</th><th>Median wait</th></tr>` +
          SHARE.map(([x, nm]) => `<tr class="${x === best ? "best" : ""}"><td>${nm}</td><td>${pct(row[x].lostShare, 1)}</td><td>${mmss(row[x].medianWait)}</td></tr>`).join("");
      } else {
        const D = DATA.splits[BUS.day], best = DATA.decisions.automate.perDay[BUS.day].cheapest;
        tb.innerHTML = `<tr><th>${DAY_LABEL[BUS.day]}</th><th>People</th><th>Walked away</th><th>Wait</th><th>Cost/day</th></tr>` +
          Object.keys(PRESETS).map(k => { const r = SPLITROW(BUS.day, k);
            return `<tr class="${k === best ? "best pick" : ""}"><td>${PRESETS[k].label}</td><td>${r.setup === "all_machine" ? "–" : r.meets ? `${r.staff}${r.mode === "fixed" ? " fixed" : ""}` : "over limit"}</td>` +
                   `<td>${r.meets ? pct(r.lostShare, 1) : "–"}</td><td>${r.meets ? mmss(r.medianWait) : "–"}</td><td>${money(r.cost.total)}</td></tr>`; }).join("") +
          `<tr><td colspan="5" style="text-align:left;color:${COL.taupe};font-size:11px">✓ cheapest within the limit · fastest: ${D[D._fastest] ? PRESETS[D._fastest].label : "–"}</td></tr>`;
        // the normal day as well, so the headline's "on a normal day, people are still cheaper" is on the page
        const nd = $(side, ".normday"), NB = DATA.decisions.automate.perDay.none.cheapest, ks = Object.keys(PRESETS).filter(k => SPLITROW("none", k).meets);
        if (nd) nd.innerHTML = BUS.day === "none" ? "" : `<b>${DAY_LABEL.none}, cost a day:</b> ` +
          ks.sort((a, b) => SPLITROW("none", a).cost.total - SPLITROW("none", b).cost.total).map(k => `${PRESETS[k].label} ${money(SPLITROW("none", k).cost.total)}${k === NB ? " (cheapest)" : ""}`).join(" · ") + `.`;
      }
    }
    // end of the hour: A against B, this run and the mean of the seeded runs
    const endBox = document.createElement("div"); endBox.className = "endcmp screenonly"; panel.append(endBox);
    endBox.addEventListener("click", e => { const k = e.target.closest("[data-x]")?.dataset.x; if (!k) return;
      endBox.classList.remove("open"); if (k === "again") { restartBoth(); st.playing = true; sync(); } });
    function showEnd() {
      const R = st.o.map((o, i) => {
        const S = o.S, t0 = S.measureFrom, inH = S.done.filter(c => c.born >= t0 && c.born < t0 + 3600).map(c => c.out - c.born).sort((a, b) => a - b);
        const c = conf(o), cost = C.dayCost(Sim, c.P, c.setup, BUS.day, c.setup === "all_machine" ? undefined : o.staff);
        return { name: mode === "share" ? SHARE.find(x => x[0] === o.share)[1] : (presetOf(o) ? PRESETS[presetOf(o)].label : "Custom split"),
          people: c.setup === "all_machine" ? 0 : o.staff, served: S.servedInHour, lost: S.lost, wait: inH.length ? inH[Math.floor(inH.length / 2)] : null,
          hand: S.mode === "brigade" && S.workers.length > 1 ? S.handovers.length : null, cost: cost.total, res: o.res };
      });
      const [a, b] = R, row = (lab, f, fmt, better, show = true) => { if (!show) return "";
        const va = f(a), vb = f(b), w = va == null || vb == null || va === vb ? -1 : (better === "low" ? (va < vb ? 0 : 1) : (va > vb ? 0 : 1));
        return `<tr><td>${lab}</td><td class="${w === 0 ? "win" : ""}">${va == null ? "–" : fmt(va)}</td><td class="${w === 1 ? "win" : ""}">${vb == null ? "–" : fmt(vb)}</td></tr>`; };
      const id = x => `${x}`, sp = mode === "split";
      const dl = b.lost - a.lost, dw = (b.wait ?? 0) - (a.wait ?? 0), dc = b.cost - a.cost;
      const say = [dl ? `B, ${b.name}, ${dl < 0 ? "kept" : "lost"} ${Math.abs(dl)} more ${Math.abs(dl) === 1 ? "order" : "orders"} than A` : "A and B kept the same orders",
                   a.wait != null && b.wait != null && Math.abs(dw) >= 1 ? `waits ${mmss(Math.abs(dw))} ${dw < 0 ? "shorter" : "longer"}` : "",
                   sp && Math.abs(dc) >= 1 ? `and costs ${money(Math.abs(dc))} a day ${dc > 0 ? "more" : "less"}` : ""].filter(Boolean).join(", ");
      endBox.innerHTML = `<div class="eh"><b>End of the peak hour · ${DAY_LABEL[BUS.day]}</b><button class="btn" data-x="again">▶ Watch again</button><button class="btn" data-x="close" title="Back to the counters">✕</button></div>
        <table><tr><th></th><th><span class="badge">A</span>${a.name}</th><th><span class="badge">B</span>${b.name}</th></tr>
        ${row("People on the line", r => r.people, id, "low")}
        ${row("Served in the hour", r => r.served, id, "high")}
        ${row("Walked away", r => r.lost, id, "low")}
        ${row("Median wait", r => r.wait, mmss, "low")}
        ${row("Hand-overs", r => r.hand, id, "none", mode === "share")}
        ${row("Cost a day", r => r.cost, money, "low", sp)}
        <tr class="sub"><td colspan="3">Mean of ${SEEDS} runs</td></tr>
        ${row("Walked away", r => r.res && r.res.lostShare, x => pct(x, 1), "low")}
        ${row("Median wait", r => r.res && r.res.medianWait, mmss, "low")}</table>
        <p class="say">${say}. Green = better on that row.</p>`;
      const pt = $(panel, ".ptop"); endBox.style.top = `${pt.offsetTop + pt.offsetHeight + 4}px`;
      endBox.classList.add("open");
    }
    function sync() {
      $(ctl, "[data-k=play]").textContent = st.playing ? "❚❚ Pause" : "▶ Play";
      $$(ctl, ".seg .btn").forEach(b => b.classList.toggle("on", +b.dataset.v === st.speed));
      draw(0); draw(1);
    }
    function rebuild(i, keepStaff = false, toMinute = 0) {
      const idx = i == null ? [0, 1] : [i];
      for (const j of idx) { const o = st.o[j];
        if (!keepStaff) o.staff = startStaff(o);
        if (conf(o).setup === "all_machine") o.staff = 0;
        head(j); fresh(j, toMinute); mean(j); }
      if (i == null || i === 0) table();
      st.playing = false; sync();
    }
    // both sides restart together so they keep seeing the same customers
    const restartBoth = () => { for (const j of [0, 1]) fresh(j); sync(); };
    panel.addEventListener("change", e => {
      const f = e.target.dataset.f, i = +e.target.closest(".opt")?.dataset.o; if (!f) return;
      if (f === "share") st.o[i].share = e.target.value;
      if (f === "split" && e.target.value) st.o[i].robots = [...PRESETS[e.target.value].robots];
      endBox.classList.remove("open"); rebuild(i, f === "share"); restartBoth();
    });
    panel.addEventListener("click", e => {
      const b = e.target.closest("button"), optEl = e.target.closest(".opt");
      if (b && b.closest(".cctl")) {
        if (b.dataset.k === "play") { endBox.classList.remove("open"); if (minute(st.o[0].S) >= 60) restartBoth(); st.playing = !st.playing; }
        else if (b.dataset.k === "step") { st.playing = false; for (const o of st.o) { const S = o.S, end = S.t + 30; while (S.t < end - 1e-9) S.step(0.5); } }
        else if (b.dataset.k === "reset") { st.playing = false; endBox.classList.remove("open"); restartBoth(); return; }
        else if (b.dataset.k === "end") { st.playing = false; for (const o of st.o) { const S = o.S, end = S.measureFrom + 3600; while (S.t < end - 1e-9) S.step(0.5); } sync(); showEnd(); return; }
        else if (b.dataset.v) st.speed = +b.dataset.v;
        sync(); return;
      }
      if (!optEl) return;
      const i = +optEl.dataset.o, o = st.o[i];
      if (b && (b.dataset.f === "minus" || b.dataset.f === "plus")) {
        o.staff = Math.max(SMIN, Math.min(SMAX, o.staff + (b.dataset.f === "plus" ? 1 : -1))); rebuild(i, true); restartBoth(); return;
      }
      if (b && b.dataset.f === "sh") { o.share = b.dataset.v; rebuild(i, true); restartBoth(); return; }
      const stn = e.target.closest(".st");                    // GM slide: click a station to switch robot / person
      if (mode === "split" && stn) {
        const id = P.stations[+stn.dataset.k];
        o.robots = o.robots.includes(id) ? o.robots.filter(x => x !== id) : [...o.robots, id];
        rebuild(i); restartBoth();
      }
    });
    BUS.fns.push(() => { endBox.classList.remove("open"); rebuild(); });
    let last = null;
    (function frame(ts) {
      if (st.playing && slides[cur] === slide && last != null) {
        const sec = Math.min(0.1, (ts - last) / 1000) * st.speed;
        for (const o of st.o) { const S = o.S, end = S.t + sec; while (S.t < end - 1e-9) S.step(Math.min(0.25, end - S.t)); }
        const done = minute(st.o[0].S) >= 60;
        if (done) st.playing = false;
        sync(); if (done) showEnd();
      }
      last = ts; requestAnimationFrame(frame);
    })();
    printers.push(() => { endBox.classList.remove("open"); st.o = init(); rebuild(null, false, SB.print_minute.value); });
    rebuild(null, false, SB.print_minute.value);                // first frame, and the printed one
  }
  $$(document, '.panel[data-kind="compare"]').forEach(compareWidget);

  /* ---------------------------------------------------------------- 05 new-store forecast (sim/sitepick.js) */
  steppers.filter(x => x.p.dataset.kind === "site").forEach(({ p, S }) => {
    const Site = window.ChageeSite, GEO = window.STORY.GEO, SP = RAW.sitepick, svg = $(p, ".msvg");
    const side = $(p.closest(".slide"), ".cards"), ctlEl = $(side, ".sitectl"), fc = $(side, ".fc");
    const EV = Site.events(Sim, RAW, GEO);
    const sl = [["epsKm", "Cluster radius (DBSCAN)", "dbscan_eps_km", 0.1, v => `${v.toFixed(1)} km`],
                ["minPts", "Searches to form a cluster", "dbscan_min_points", 1, v => `${v}`],
                ["walkKm", "How far people walk to collect", "walk_km", 0.1, v => `${v.toFixed(1)} km`]];
    const par = Object.fromEntries(sl.map(([k, , key]) => [k, SP[key].value]));
    ctlEl.innerHTML = `<span class="lab">Inputs</span>` + sl.map(([k, lab, key, step, f]) =>
      `<label>${lab}<span class="val" data-v="${k}">${f(par[k])}</span><input type="range" data-k="${k}" min="${SP[key].range[0]}" max="${SP[key].range[1]}" step="${step}" value="${par[k]}"></label>`).join("");
    svg.innerHTML = `<image href="${window.STORY.MAP}" x="0" y="0" width="1672" height="640"/><g></g>`;
    const mapImg = $(svg, "image"), layer = $(svg, "g");
    let M = null, pin = null, userPin = false, step = S.N, sel = null;
    const tip = $(p, ".maptip"), search = $(p, ".sitesearch");
    const HUBS = SP.hubs.value;
    $(p, "#sitelist").innerHTML = GEO.outlets.map((o, j) => `<option value="${GEO.numbers[j]} · ${GEO.names[j]}">`).join("") +
      HUBS.map(h => `<option value="${h.name} (town)">`).join("");
    const goStep4 = () => { if (S.cur < 4) S.go(4, true); else draw(); };
    search.addEventListener("change", () => {
      const v = search.value.trim().toLowerCase(); if (!v) return;
      const j = GEO.outlets.findIndex((o, k) => `${GEO.numbers[k]} · ${GEO.names[k]}`.toLowerCase() === v || GEO.names[k].toLowerCase() === v || String(GEO.numbers[k]) === v);
      const jj = j >= 0 ? j : GEO.names.findIndex(n => n.toLowerCase().includes(v));
      const h = HUBS.find(h => `${h.name} (town)`.toLowerCase() === v || h.name.toLowerCase() === v);
      if (h && j < 0) { sel = null; pin = { x: h.x, y: h.y }; userPin = true; goStep4(); }
      else if (jj >= 0) { sel = jj; goStep4(); }
      search.blur();
    });
    svg.addEventListener("mousemove", e => {
      const g = e.target.closest?.(".ol"); if (!g) { tip.style.display = "none"; return; }
      const j = +g.dataset.j, box = $(p, ".visual").getBoundingClientRect(), r = g.getBoundingClientRect(), k = box.width / $(p, ".visual").offsetWidth;
      tip.innerHTML = `<b>${oname(j)}</b> · about ${Math.round(M.storeCups[j])} cups a day today<small>click to see this outlet</small>`;
      tip.style.left = `${(r.left + r.width / 2 - box.left) / k}px`; tip.style.top = `${(r.top - box.top) / k}px`; tip.style.display = "block";
    });
    svg.addEventListener("mouseleave", () => (tip.style.display = "none"));
    fc.addEventListener("click", e => {
      if (e.target.closest("[data-act=testnew]") && sel != null) {
        const [x, y] = GEO.outlets[sel]; pin = { x: x + 6, y }; userPin = true; sel = null; search.value = ""; goStep4();
      }
    });
    const oname = j => `${GEO.numbers[j]} · ${GEO.names[j]}`;
    const CL = [COL.red, "#8E5BA8", "#D07A2D", "#2E8B7A", "#B8860B", "#C0457A", "#5470A8"];
    const avg = RAW.store.cups_per_store_per_year.value / RAW.store.open_days_per_year.value;
    function rebuild() {
      M = Site.model(Sim, RAW, GEO, { ...par, events: EV });
      if (!userPin) pin = M.candidates[0] ? { x: M.candidates[0].x, y: M.candidates[0].y } : { x: 990, y: 300 };
      draw();
      if (cmpv?.classList.contains("open")) openCmp();
    }
    function draw() {
      const f = Site.forecast(M, pin), walkPx = M.walkKm / M.kmpx;
      mapImg.setAttribute("opacity", step >= 1 ? 0.55 : 0.8);                // the map image stays; only the layer is redrawn
      let s = "";
      if (step >= 1) M.ev.forEach((e, i) => {
        const lab = M.labels[i];
        const c = !M.unmet[i] ? COL.gold : step >= 2 ? (lab >= 0 ? CL[lab % CL.length] : "#B9B2A6") : COL.red;
        s += `<circle cx="${e.x.toFixed(0)}" cy="${e.y.toFixed(0)}" r="${M.unmet[i] && step >= 2 && lab >= 0 ? 4 : 3}" fill="${c}" opacity="${M.unmet[i] ? 0.8 : 0.45}"/>`;
      });
      if (step >= 2) M.clusters.forEach(c => (s += `<circle cx="${c.x}" cy="${c.y}" r="${Math.max(14, c.r)}" fill="none" stroke="${CL[c.id % CL.length]}" stroke-width="2" stroke-dasharray="6 5"/>`));
      // existing outlets: hover for name and the model's cups a day today (a click still drops a new pin)
      if (sel != null) { const [x, y] = GEO.outlets[sel];
        s += `<circle cx="${x}" cy="${y - 14}" r="${walkPx}" fill="rgba(36,64,107,.08)" stroke="${COL.navy}" stroke-width="2" stroke-dasharray="8 6"/>` +
             `<circle cx="${x}" cy="${y - 14}" r="24" fill="none" stroke="${COL.red}" stroke-width="5"/>`; }
      GEO.outlets.forEach(([x, y], j) => (s += `<g class="ol" data-j="${j}">` +
        `<circle cx="${x}" cy="${y - 14}" r="14" fill="${COL.navy}" stroke="#fff" stroke-width="3"/>` +
        T(x, y - 9, GEO.numbers[j], `font-size="14" font-weight="700" fill="#fff" text-anchor="middle"`) + `</g>`));
      if (step >= 3) {                                                     // suggested sites, labels placed so they do not overlap
        const placed = [], W = 210, H = 34;
        const hits = (r) => placed.some(q => r.x < q.x + q.w && q.x < r.x + r.w && r.y < q.y + q.h && q.y < r.y + r.h);
        M.candidates.slice(0, SP.candidates_shown.value).forEach((c, k) => {
          placed.push({ x: c.x - 24, y: c.y - 24, w: 48, h: 48 });
          const opts = [[30, -17], [30, 26], [30, -60], [-30 - W, -17], [-30 - W, 26]];
          const [dx, dy] = opts.find(([dx, dy]) => !hits({ x: c.x + dx, y: c.y + dy, w: W, h: H })) || opts[0];
          placed.push({ x: c.x + dx, y: c.y + dy, w: W, h: H });
          s += `<g><circle cx="${c.x}" cy="${c.y}" r="22" fill="#fff" stroke="${COL.navy}" stroke-width="4"/>` +
               T(c.x, c.y + 9, k + 1, `font-size="26" font-weight="700" fill="${COL.navy}" text-anchor="middle"`) +
               `<rect x="${c.x + dx}" y="${c.y + dy}" width="${W}" height="${H}" rx="8" fill="#fff" stroke="${COL.navy}" stroke-width="2"/>` +
               T(c.x + dx + W / 2, c.y + dy + 24, `+${Math.round(c.f.netNew)} cups for Chagee`, `font-size="20" font-weight="700" fill="${COL.navy}" text-anchor="middle"`) + `</g>`;
        });
      }
      if (step >= 4 && sel == null) {
        s += `<circle cx="${pin.x}" cy="${pin.y}" r="${walkPx}" fill="rgba(184,50,43,.08)" stroke="${COL.red}" stroke-width="2"/>`;
        f.hit.slice(0, 4).forEach(h => (s += `<line x1="${pin.x}" y1="${pin.y}" x2="${h.x}" y2="${h.y - 14}" stroke="${COL.red}" stroke-width="${Math.max(2, Math.min(10, h.cups / 12))}" opacity=".6"/>`));
        s += `<path d="M${pin.x} ${pin.y} l-13 -30 a14 14 0 1 1 26 0 z" fill="${COL.red}" stroke="#fff" stroke-width="2.5"/><circle cx="${pin.x}" cy="${pin.y - 36}" r="5" fill="#fff"/>`;
      }
      layer.innerHTML = s;
      const pf = C.forecastDay(Sim, { ...P, cupsYear: f.cups * P.days }, "none");
      const near = GEO.outlets.map(([x, y], j) => ({ j, km: Math.hypot(x - pin.x, y - pin.y) * M.kmpx })).sort((a, b) => a.km - b.km)[0];
      const share = f.cups > 0 ? f.netNew / f.cups : 0, V = SP.verdict.value;
      const [vcls, vtxt] = share >= V.strong_new_share ? ["good", "Strong site: mostly new cups"] : share < V.weak_new_share ? ["bad", "Weak site: mostly moves cups"] : ["mid", "Mixed: adds some, moves some"];
      const who = userPin ? "Your pin" : "Suggested site 1";
      if (sel != null) {                                                 // an existing outlet, found by search or click
        const o = Site.outlet(M, sel);
        fc.innerHTML = `<div class="t">Existing outlet · ${oname(sel)}</div>
          <div class="big">${Math.round(o.cups)}<small>cups a day today (model) · ${(o.cups / avg).toFixed(1)}× an average outlet</small></div>
          <dl><dt>From customers within ${M.walkKm.toFixed(1)} km</dt><dd>${pct(o.nearShare)}</dd>
              <dt>Nearest other outlet: ${oname(o.neighbour.j)}</dt><dd>${o.neighbour.km.toFixed(1)} km</dd>
              <dt>Unserved app demand within ${(2 * M.walkKm).toFixed(1)} km</dt><dd>${Math.round(o.unmetNearby)} a day</dd></dl>
          <button class="btn primary screenonly" data-act="testnew">Test a new store beside it</button>`;
        return;
      }
      fc.innerHTML = `<div class="t">${who} · ${near.km < 0.05 ? "on" : near.km.toFixed(1) + " km from"} ${oname(near.j)}</div>
        <span class="verdict ${vcls}">${vtxt}</span>
        <div class="big">+${Math.round(f.netNew).toLocaleString("en-SG")}<small>cups a day for Chagee</small></div>
        <div class="why2">The new store sells ${Math.round(f.cups)} a day (${(f.cups / avg).toFixed(1)}× an average outlet). ${Math.round(f.cannibal)} of those move from outlets nearby${f.hit.length ? ":" : "."}</div>
        <dl>${f.hit.slice(0, 2).map(h => `<dt title="${Math.round(M.storeCups[h.j])} → ${Math.round(M.storeCups[h.j] - h.cups)} cups a day">${oname(h.j)}, ${h.km.toFixed(1)} km</dt><dd>−${Math.round(h.cups)}</dd>`).join("")}</dl>
        <div class="peak">Peak hour ${hourLabel(pf.peak)}: <b>${Math.round(pf.peakCups)} cups</b> → <b>${pf.peakStaff} ${pf.peakStaff === 1 ? "person" : "people"}</b> on today's counter (slides 06–07).</div>`;
      $$(ctlEl, "[data-v]").forEach(el => { const d = sl.find(x => x[0] === el.dataset.v); el.textContent = d[4](par[d[0]]); });
    }
    ctlEl.addEventListener("input", e => { const k = e.target.dataset.k; if (!k) return; par[k] = +e.target.value;
      clearTimeout(ctlEl.tm); ctlEl.tm = setTimeout(rebuild, 60); $$(ctlEl, "[data-v]").forEach(el => { const d = sl.find(x => x[0] === el.dataset.v); el.textContent = d[4](par[d[0]]); }); });
    svg.addEventListener("click", e => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse());
      const g = e.target.closest?.(".ol");                               // a navy pin: show that existing outlet
      if (g) { sel = +g.dataset.j; search.value = oname(sel); tip.style.display = "none"; goStep4(); return; }
      pin = { x: q.x, y: q.y }; userPin = true; sel = null; search.value = "";
      goStep4();
    });
    // Without AI / With AI on the map, side by side: the site that sells most (a store beside the median outlet,
    // as in the band) against the top app-search site. Live from the same model, so it matches the band at the defaults.
    const cmpv = document.createElement("div"); cmpv.className = "cmpv"; $(p, ".visual").append(cmpv);
    const wi = $(p.closest(".slide"), ".vs .wi");
    if (wi) { const b = document.createElement("button"); b.className = "btn vsb screenonly"; b.innerHTML = "◧ See it on the map";
      b.title = "Show both sites side by side on the map"; b.onclick = () => (cmpv.classList.contains("open") ? cmpv.classList.remove("open") : openCmp()); wi.append(b); }
    function sideSvg(pp, f, accent, fr) {
      const W = 500, H = 300, x0 = Math.max(0, Math.min(1672 - W, fr.x - W / 2)), y0 = Math.max(0, Math.min(640 - H, fr.y - H / 2));
      const inV = (x, y) => x > x0 - 30 && x < x0 + W + 30 && y > y0 - 30 && y < y0 + H + 30, walkPx = M.walkKm / M.kmpx;
      let s = `<image href="${window.STORY.MAP}" x="0" y="0" width="1672" height="640" opacity=".5"/>`;
      M.ev.forEach((e, i) => { if (inV(e.x, e.y)) s += `<circle cx="${e.x.toFixed(0)}" cy="${e.y.toFixed(0)}" r="3.2" fill="${M.unmet[i] ? COL.red : COL.gold}" opacity="${M.unmet[i] ? 0.75 : 0.45}"/>`; });
      s += `<circle cx="${pp.x}" cy="${pp.y}" r="${walkPx}" fill="${accent}" fill-opacity=".07" stroke="${accent}" stroke-width="2" stroke-dasharray="7 5"/>`;
      f.hit.slice(0, 3).forEach(h => (s += `<line x1="${pp.x}" y1="${pp.y}" x2="${h.x}" y2="${h.y - 14}" stroke="${COL.red}" stroke-width="${Math.max(2.5, Math.min(12, h.cups / 10))}" opacity=".55"/>`));
      GEO.outlets.forEach(([x, y], j) => { if (!inV(x, y)) return;
        s += `<circle cx="${x}" cy="${y - 14}" r="14" fill="${COL.navy}" stroke="#fff" stroke-width="3"/>` + T(x, y - 9, GEO.numbers[j], `font-size="14" font-weight="700" fill="#fff" text-anchor="middle"`); });
      f.hit.slice(0, 2).forEach(h => (s += `<g><rect x="${h.x + 16}" y="${h.y - 44}" width="66" height="26" rx="6" fill="#fff" stroke="${COL.red}" stroke-width="2"/>` +
        T(h.x + 49, h.y - 25, `−${Math.round(h.cups)}`, `font-size="18" font-weight="700" fill="${COL.red}" text-anchor="middle"`) + `</g>`));
      s += `<path d="M${pp.x} ${pp.y} l-15 -34 a16 16 0 1 1 30 0 z" fill="${accent}" stroke="#fff" stroke-width="3"/><circle cx="${pp.x}" cy="${pp.y - 41}" r="6" fill="#fff"/>`;
      return `<svg viewBox="${x0} ${y0} ${W} ${H}" preserveAspectRatio="xMidYMid slice">${s}</svg>`;
    }
    function openCmp() {
      const top = M.candidates[0];                                    // same new store, same neighbourhood: beside the nearest outlet vs the AI site
      const j = GEO.outlets.map(([x, y], k) => [Math.hypot(x - top.x, y - top.y), k]).sort((a, b) => a[0] - b[0])[0][1];
      const nd = { x: GEO.outlets[j][0] + 3, y: GEO.outlets[j][1] };
      const frame = { x: (nd.x + top.x) / 2, y: (nd.y + top.y) / 2 };
      const hub = HUBS.reduce((a, h) => (Math.hypot(h.x - top.x, h.y - top.y) < Math.hypot(a.x - top.x, a.y - top.y) ? h : a)).name;
      const fN = Site.forecast(M, nd), fT = Site.forecast(M, top);
      const col = (cls, lab, title, pp, f, accent, ghost) => `<div class="cv ${cls}"><div class="ch"><b>${lab}</b>${title}</div>${sideSvg(pp, f, accent, frame).replace("</svg>", ghost + "</svg>")}` +
        `<div class="cn"><span>Sells <b>${Math.round(f.cups)}</b></span><span>Moved from outlets <b class="mv">−${Math.round(f.cannibal)}</b></span>` +
        `<span class="net">For Chagee <b>+${Math.round(f.netNew)}</b></span></div></div>`;
      const km = (Math.hypot(GEO.outlets[j][0] - top.x, GEO.outlets[j][1] - top.y) * M.kmpx).toFixed(1), nn = GEO.numbers.length + 1;
      const ghost = (q, lab) => `<path d="M${q.x} ${q.y} l-15 -34 a16 16 0 1 1 30 0 z" fill="#fff" fill-opacity=".85" stroke="${COL.ink2}" stroke-width="2.5" stroke-dasharray="5 4"/>` +
        `<rect x="${q.x - 58}" y="${q.y + 6}" width="116" height="22" rx="5" fill="#fff" stroke="${COL.ink2}" stroke-dasharray="4 3"/>` +
        T(q.x, q.y + 22, lab, `font-size="13" font-weight="600" fill="${COL.ink2}" text-anchor="middle"`);
      cmpv.innerHTML = col("wo", "Without AI · our assumed baseline", `Outlet ${nn} beside ${oname(j)}`, nd, fN, COL.ink2, ghost(top, "the AI site")) +
        col("wi", "With AI · our proposal", `Same outlet ${nn}, ${km} km away, near ${hub}`, top, fT, COL.navy, ghost(nd, "the baseline site")) +
        `<button class="btn cx" title="Back to the map">✕</button><p class="cmpn">Same new store, same map frame; only the pin moves. Cups a day at the current inputs; red: cups moved from existing outlets; dashed: the other side's site.</p>`;
      $(cmpv, ".cx").onclick = () => cmpv.classList.remove("open");
      cmpv.classList.add("open");
    }
    S.hooks.push(k => { step = k; if (M) draw(); });
    printers.push(() => { cmpv.classList.remove("open"); userPin = false; sel = null; search.value = ""; sl.forEach(([k, , key]) => (par[k] = SP[key].value)); $$(ctlEl, "input").forEach(i => (i.value = par[i.dataset.k])); rebuild(); });
    rebuild();
  });


  /* ---------------------------------------------------------------- DBSCAN walkthrough (slide 05) and the appendix figure */
  const TOY = window.ChageeSite.toy(Sim, RAW), TCL = ["#8E5BA8", "#D07A2D", "#2E8B7A", "#B8860B", "#C0457A"];
  const TN = TOY.trace.length, NOISE = "#B9B2A6";
  function toyDraw(svg, f, annot) {
    const t = TOY, kind = [], lab = [];
    t.trace.slice(0, Math.min(f, TN)).forEach(e => { kind[e.i] = e.kind; lab[e.i] = e.c; });
    const ev = f >= 1 && f <= TN ? t.trace[f - 1] : null;
    svg.setAttribute("viewBox", `0 0 ${t.width} ${t.height}`);
    const ring = (p, r, a) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" ${a}/>`;
    let s = "";
    if (ev) {
      const p = t.pts[ev.i];
      s += ring(p, t.eps, `fill="rgba(36,64,107,.07)" stroke="${COL.navy}" stroke-width="1.5" stroke-dasharray="5 4"`);
      (ev.nb || []).filter(j => j !== ev.i).forEach(j => (s += `<line x1="${p.x}" y1="${p.y}" x2="${t.pts[j].x}" y2="${t.pts[j].y}" stroke="${COL.navy}" stroke-width="1.2" opacity=".45"/>`));
    }
    t.pts.forEach((p, i) => {
      const k = kind[i], c = TCL[lab[i] % TCL.length];
      s += !k ? ring(p, 5, `fill="#fff" stroke="${NOISE}" stroke-width="1.5"`)
         : k === "noise" ? ring(p, 5, `fill="${NOISE}"`)
         : k === "core" ? ring(p, 7, `fill="${c}"`)
         : ring(p, 5.5, `fill="#fff" stroke="${c}" stroke-width="2.5"`);
    });
    if (ev) s += ring(t.pts[ev.i], 11, `fill="none" stroke="${COL.ink}" stroke-width="2"`);
    if (f > TN) t.centres.forEach(c => (s += ring(c, 15, `fill="#fff" stroke="${COL.navy}" stroke-width="3"`) +
      T(c.x, c.y + 6, c.c + 1, `font-size="17" font-weight="700" fill="${COL.navy}" text-anchor="middle"`)));
    if (annot) {                                                       // the appendix figure names one of each kind
      const pick = k => t.trace.find(e => e.kind === k && (k !== "noise" || t.labels[e.i] === -1));
      const dc = e => Math.min(...t.centres.map(c => Math.hypot(t.pts[e.i].x - c.x, t.pts[e.i].y - c.y)));
      const core = t.pts[t.trace.filter(e => e.kind === "core").reduce((a, b) => (dc(b) > dc(a) ? b : a)).i];   // clear of the centre marks
      s += ring(core, t.eps, `fill="none" stroke="${COL.navy}" stroke-width="1.5" stroke-dasharray="5 4"`) +
           `<line x1="${core.x}" y1="${core.y}" x2="${core.x + t.eps}" y2="${core.y}" stroke="${COL.navy}" stroke-width="1.5"/>` +
           T(core.x + t.eps / 2, core.y - 5, "ε", `font-size="16" font-style="italic" fill="${COL.navy}" text-anchor="middle"`);
      [["core", core], ["border", t.trace.filter(e => e.kind === "border").map(e => t.pts[e.i]).reduce((a, b) => (Math.hypot(b.x - core.x, b.y - core.y) > Math.hypot(a.x - core.x, a.y - core.y) ? b : a))], ["noise", t.pts[pick("noise").i]]].forEach(([w, p]) => { s += T(p.x + 10, p.y + 18, w, `font-size="13" fill="${COL.ink}" font-weight="600"`);
      });
    }
    svg.innerHTML = s;
  }
  const toyKey = `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="#fff" stroke="${NOISE}" stroke-width="1.5"/></svg><span>Not visited yet</span>` +
    `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="${TCL[0]}"/></svg><span>Core: enough searches within ε</span>` +
    `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="#fff" stroke="${TCL[0]}" stroke-width="2.5"/></svg><span>Border: joins a cluster, does not spread it</span>` +
    `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="${NOISE}"/></svg><span>Noise: no cluster reaches it</span>`;
  $$(document, '.toysvg[data-static]').forEach(svg => toyDraw(svg, TN + 1, true));
  $$(document, "#c5 .howto").forEach(box => {
    const svg = $(box, ".toysvg"), say = $(box, ".say"), no = $(box, ".stepno"), bar = $(box, ".bar i"), play = $(box, '[data-h="play"]');
    const mp = TOY.min_points, nNoise = TOY.labels.filter(l => l === -1).length;
    $(box, ".toykey").innerHTML = toyKey;
    let f = 0, tm = null;
    const text = () => {
      if (f === 0) return `<b>${TOY.pts.length} app searches</b> with no outlet within walking distance. DBSCAN visits them one at a time with two settings: a radius ε (the dashed circle) and a minimum of <b>${mp}</b> searches inside it, counting itself.`;
      if (f > TN) return `<b>${TOY.centres.length} clusters</b> and ${nNoise} noise points; nobody chose the number of clusters. Each cluster's centre (numbered) is a candidate site. On the map, each is then scored: cups it sells minus cups it moves from nearby outlets.`;
      const e = TOY.trace[f - 1], c = e.c + 1, n = e.nb ? e.nb.length : 0;
      if (e.kind === "noise") return `Only <b>${n}</b> within ε, fewer than ${mp}: <b>noise</b> for now. A cluster may still reach it later.`;
      if (e.kind === "core" && e.seed) return `<b>${n}</b> within ε, at least ${mp}: a <b>core point</b>. Cluster ${c} starts here.`;
      if (e.kind === "core") return `Reached by cluster ${c}, and <b>${n}</b> within ε: another <b>core point</b>, so its neighbours join cluster ${c} and are checked next.`;
      return e.nb ? `Reached by cluster ${c}, but only <b>${n}</b> within ε: a <b>border point</b>. It joins but does not spread the cluster.`
                  : `Marked noise earlier, but cluster ${c} reaches it: it becomes a <b>border point</b>.`;
    };
    const go = k => {
      f = Math.max(0, Math.min(TN + 1, k)); toyDraw(svg, f);
      no.textContent = f === 0 ? "Start" : f > TN ? "Result" : `Step ${f} of ${TN}`;
      bar.style.width = `${(100 * f) / (TN + 1)}%`; say.innerHTML = text();
    };
    const stop = () => { clearInterval(tm); tm = null; play.textContent = "▶ Play"; };
    const start = () => { if (f > TN) go(0); play.textContent = "❚❚ Pause";
      tm = setInterval(() => { go(f + 1); if (f > TN) stop(); }, reduce ? 1200 : 650); };
    const close = () => { stop(); box.classList.remove("open"); };
    $(box.closest(".panel"), ".howb").onclick = () => { box.classList.add("open"); go(0); };
    box.addEventListener("click", e => {
      const h = e.target.closest("[data-h]")?.dataset.h; if (!h) return;
      if (h === "close") close();
      else if (h === "play") tm ? stop() : start();
      else if (h === "prev") { stop(); go(f - 1); }
      else if (h === "next") { stop(); go(f + 1); }
      else if (h === "end") { stop(); go(TN + 1); }
      else if (h === "apx") { close(); show(slides.indexOf(document.getElementById("a2"))); }
    });
    addEventListener("keydown", e => {                                 // while open, arrows step the walkthrough
      if (!box.classList.contains("open") || !box.closest(".slide").classList.contains("active")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") { stop(); go(f + 1); }
      else if (e.key === "ArrowLeft") { stop(); go(f - 1); }
      else return;
      e.preventDefault(); e.stopPropagation();
    }, true);
  });

  /* ---------------------------------------------------------------- 08 machine ladder (sim/ladder.js, machine_tiers.json) */
  // Decision view: net gain a month against all by hand, across cups a day, for each option; three insight cards.
  (function ladder() {
    const sl = $(document, "#cm"); if (!sl) return;
    const L = window.ChageeLadder, TI = window.STORY.TIERS, cr = RAW.costs, VR0 = DATA.ladder.volumes;
    const svg = $(sl, ".lchart"), ins = $(sl, ".ins"), ctl = $(sl, ".ladctl"), atP = $(sl, ".at"), lad = $(sl, ".lad2");
    const money = (x, sign = false) => `${x < 0 ? "−" : sign ? "+" : ""}S$${Math.abs(Math.round(x)).toLocaleString("en-SG")}`;
    const D0 = DATA.ladder.at, o = { ...D0 };
    const IN = [["cupsDay", "Cups a day", VR0.lo, VR0.hi, 1, v => `${v}`],
                ["wage", "Wage an hour", ...cr.labour_cost_per_hour.range, 0.01, v => `S$${v.toFixed(2)}`],
                ["unitMonth", "Machine, per unit a month", ...cr.machine_cost_per_unit_per_month.range, 1, v => money(v)]];
    ctl.innerHTML = IN.map(([k, lab, lo, hi, st, f]) =>
      `<label>${lab}<span class="val" data-v="${k}">${f(o[k])}</span><input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${st}" value="${o[k]}"></label>`).join("");
    // the ladder, compact: every rung, its example, price as published and source tag; bars = steps on machines
    const TAG = { "company claim": "claim", "vendor page": "vendor", press: "press", "our assumption": "" };
    const EX = { semi: "Gong Cha Singapore", platform: "Gong cha Super Wu", single: "Amacha, one shop", arm: "Richtech ADAM", barista: "Oli; coffee-first" };
    const NM = { semi: "Semi-automation", platform: "Beverage platform", single: "Milk-tea machine", arm: "Robot arm", barista: "Robot barista" };
    const price = c => c.kind === "not_disclosed" ? `<div class="pr nd">Not disclosed${c.note ? ", rental only" : ""}</div>`
      : c.kind === "purchase" ? `<div class="pr">S$${c.purchase.toLocaleString("en-SG")} to buy</div>`
      : `<div class="pr">US$${c.lease_month.toLocaleString("en-SG")}/mo lease</div>`;
    lad.innerHTML = TI.tiers.map((t, i) => { const e = t.examples[0];
      return `<div class="r"><div class="nm"><i>${i + 1}</i>${NM[t.id]}</div><div>${EX[t.id]}</div>${price(e.cost)}` +
        `<span class="tagr ${TAG[e.reliability] ?? ""}">${e.reliability}</span><div class="st">${P.stations.map(st => `<span class="${t.replaces.includes(st) ? "m" : ""}"></span>`).join("")}</div></div>`; }).join("");
    // the chart's options: net = labour saved - cost; cost at the model's rate per unit, or Oli's lease per setup
    const SER = [["single", "One machine (tea and milk)", "#2F6B45", "model"], ["semi", "Semi-automation (kiosk and sealer)", "#B8860B", "model"],
                 ["today", "Today's split (3 stations)", COL.navy, "model"], ["barista", "Robot barista at Oli's lease", COL.red, "lease"]];
    let key = "", series = null;
    function compute() {
      const k = `${o.wage}|${o.unitMonth}`; if (k === key) return; key = k;
      const vols = []; for (let v = VR0.lo; v <= VR0.hi; v += 3) vols.push(v);
      series = { vols, lines: SER.map(([id]) => vols.map(v => { const r = L.evaluate(Sim, C, RAW, P, TI, { ...o, cupsDay: v }).find(x => x.id === id);
        return id === "barista" ? r.leaseMargin : r.modelMargin; })) };
    }
    function chart() {
      const W = 740, H = 232, l = 62, r = 196, t = 14, b = 30, { vols, lines } = series;
      const all = lines.flat().concat(0), lo = Math.min(...all), hi = Math.max(...all);
      const X = v => l + (v - vols[0]) / (vols[vols.length - 1] - vols[0]) * (W - l - r), Y = y => t + (hi - y) / (hi - lo || 1) * (H - t - b);
      let s = `<rect x="${l}" y="${t}" width="${W - l - r}" height="${Y(0) - t}" fill="#EEF5F0"/>` +
        `<text x="${l + 6}" y="${t + 13}" font-size="11" fill="#2F6B45" font-weight="600">Pays (above the line)</text>` +
        `<text x="${l + 6}" y="${H - b - 6}" font-size="11" fill="${COL.red}" font-weight="600">Costs more than all by hand</text>`;
      const step = Math.max(1000, Math.ceil((hi - lo) / 4 / 1000) * 1000);
      for (let y = Math.ceil(lo / step) * step; y <= hi; y += step)
        s += `<line x1="${l}" x2="${W - r}" y1="${Y(y)}" y2="${Y(y)}" stroke="${y === 0 ? COL.ink2 : COL.line}" stroke-width="${y === 0 ? 1.5 : 1}"/>` + T(l - 6, Y(y) + 4, money(y), `font-size="10" text-anchor="end" fill="${COL.taupe}"`);
      [vols[0], 400, 556, 700, vols[vols.length - 1]].filter((v, i, a) => a.indexOf(v) === i && v >= vols[0] && v <= vols[vols.length - 1]).forEach(v =>
        (s += T(X(v), H - b + 15, v, `font-size="10" text-anchor="middle" fill="${COL.taupe}"`)));
      s += T((l + W - r) / 2, H - 3, "cups a day at your outlet", `font-size="10" text-anchor="middle" fill="${COL.taupe}"`);
      const ends = [];
      lines.forEach((ys, i) => {
        const [, lab, col] = SER[i];
        s += `<path d="${ys.map((y, k) => `${k ? "L" : "M"}${X(vols[k]).toFixed(1)} ${Y(y).toFixed(1)}`).join("")}" fill="none" stroke="${col}" stroke-width="${i === 0 ? 3 : 2}"${SER[i][0] === "today" ? ' stroke-dasharray="6 4"' : ""}/>`;
        ends.push({ y: Y(ys[ys.length - 1]), lab, col });
      });
      ends.sort((a, c) => a.y - c.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 14) e.y = arr[i - 1].y + 14; });
      ends.forEach(e => (s += T(W - r + 8, e.y + 4, e.lab, `font-size="11" fill="${e.col}" font-weight="600"`)));
      s += `<line x1="${X(o.cupsDay)}" x2="${X(o.cupsDay)}" y1="${t}" y2="${H - b}" stroke="${COL.red}" stroke-width="1.5"/>` +
        T(X(o.cupsDay) + 4, t + 26, "your outlet", `font-size="10" fill="${COL.red}"`);
      svg.innerHTML = s;
    }
    function cards() {
      const E = Object.fromEntries(L.evaluate(Sim, C, RAW, P, TI, o).map(r => [r.id, r]));
      const one = E.single, td = E.today, rb = E.barista, V = L.volumes(Sim, C, RAW, P, TI, o), more = V.rungs.find(x => x.id === "barista").moreBands[0];
      const pb = one.payback[0], mh = P.minStaff.all_human, mm = P.minStaff.mixed;
      ins.innerHTML =
        `<div class="ic ${one.modelMargin >= 0 ? "good" : "bad"}"><div class="k">Start here</div><h4>One machine on the tea and milk</h4>` +
        `<div class="big">${money(one.modelMargin, true)}<small>a month vs all by hand</small></div>` +
        `<p>Saves ${one.hoursDay} person-hours a day (${money(one.saved)} a month) for one ${money(o.unitMonth)} unit. Simple payback, if it lets the roster drop one person-shift: ${pb.months.toFixed(1)} months on ${pb.name.split(" (")[0]}'s S$${pb.priceRaw.toLocaleString("en-SG")}.</p></div>` +
        `<div class="ic ${td.modelMargin >= 0 ? "good" : "bad"}"><div class="k">Watch</div><h4>Today's ${td.units}-station split</h4>` +
        `<div class="big">${money(td.modelMargin, true)}<small>a month vs all by hand</small></div>` +
        `<p>Saves ${td.hoursDay} person-hours a day (${money(td.saved)}) but pays for ${td.units} units (${money(td.modelCost)}).</p></div>` +
        `<div class="ic wait"><div class="k">Wait for volume</div><h4>Robots: arm or barista</h4>` +
        `<div class="big">${more ? `${more[0]}+` : "–"}<small>cups a day before they save more labour than today's split (labour only, not a cost break-even)</small></div>` +
        `<p>At ${o.cupsDay} cups, Oli's lease (${money(rb.lease.lease)}) is ${rb.leaseMargin >= 0 ? `${money(rb.leaseMargin)} better` : `${money(-rb.leaseMargin)} a month worse`}; a robot setup would need to cost under ${money(rb.breakEvenSetup)} a month. The arm's price is not disclosed.</p></div>` +
        `<div class="asm"><b>Model assumption that drives all three:</b> minimum crew ${mh} by hand, ${mm} with machines, off-peak. Station speeds are the model's, not vendor claims. Rosters step in whole people, so results flip with volume and wage.</div>`;
      atP.textContent = `Shown at ${o.cupsDay} cups a day, wage S$${o.wage.toFixed(2)} an hour, ${money(o.unitMonth)} a month per machine unit (sliders on screen).`;
      $$(ctl, "[data-v]").forEach(el => { const d = IN.find(x => x[0] === el.dataset.v); el.textContent = d[5](o[d[0]]); });
    }
    function draw() { compute(); chart(); cards(); }
    ctl.addEventListener("input", e => { const k = e.target.dataset.k; if (!k) return; o[k] = +e.target.value;
      $$(ctl, "[data-v]").forEach(el => { const d = IN.find(x => x[0] === el.dataset.v); el.textContent = d[5](o[d[0]]); });
      clearTimeout(ctl.tm); ctl.tm = setTimeout(draw, 60); });
    printers.push(() => { Object.assign(o, D0); $$(ctl, "input").forEach(i => (i.value = o[i.dataset.k])); draw(); });
    draw();
  })();

  /* ---------------------------------------------------------------- 10 benefit (sim/benefit.js) */
  (function benefit() {
    const sl = $(document, "#ab"); if (!sl) return;
    const B = window.ChageeBenefit, BD = DATA.benefit, N = RAW.facts.sg_outlets.value, SBk = RAW.storyboard;
    const Ps = Object.fromEntries(Object.entries(BD.P).map(([k, p]) => [k, { ...P, ...p }]));
    const e0 = B.econ(RAW, P), e = { ...e0, days: { ...e0.days } };
    const $m = x => `${x < 0 ? "−" : ""}S$${Math.abs(Math.round(x)).toLocaleString("en-SG")}`, $n = x => `${x < 0 ? "−" : ""}${Math.abs(Math.round(x)).toLocaleString("en-SG")}`;
    const ctl = $(sl, ".daysctl"), DAYS_IN = [["busy", "Busy days a year"], ["event", "Event days a year"]];
    ctl.innerHTML = DAYS_IN.map(([k, l]) => `<label>${l}<span class="val" data-v="${k}">${e.days[k]}</span><input type="range" data-k="${k}" min="0" max="${P.days}" step="1" value="${e.days[k]}"></label>`).join("");
    function draw() {
      const S = B.summary(BD.runs, Ps, RAW, e), b = S.base, Y = b.year, pm = SBk.price_per_cup.value;
      // per day: orders kept and revenue lead; profit second; the counter's labour saving on its own line
      $(sl, ".daycards").innerHTML = [["event", "Event day"], ["busy", "Busy day"], ["normal", "Normal day"]].map(([k, lab]) => {
        const x = b.per[k].abE;
        return `<div class="dc"><div class="k">${lab}</div><div class="big">${x.orders.toFixed(x.orders < 10 ? 1 : 0)}<small>orders kept</small></div>
          <div class="l2">Revenue ${$m(x.revenue)} <span style="color:${COL.taupe}">(× S$${pm.toFixed(2)})</span> · profit ${$m(x.profit)}</div><div class="l3">Counter: labour saved − machine ${$m(x.counterNet)}</div></div>`;
      }).join("");
      const rng = (a, f = $m) => `<span class="s">range ${f(a[0])} to ${f(a[1])}</span>`;
      $(sl, ".ytab").innerHTML = `<tr><th>A year</th><th>Per outlet</th><th>${N} outlets, if all looked like this model</th></tr>` +
        `<tr class="lead"><td>Orders kept<span class="s">peak hour, busy and event days</span></td><td>${$n(Y.abE.orders)}${rng(S.orders, $n)}</td><td>${$n(Y.abE.orders * N)}</td></tr>` +
        `<tr class="lead"><td>Revenue<span class="s">orders × price</span></td><td>${$m(Y.abE.revenue)}${rng(S.revenue)}</td><td>${$m(Y.abE.revenue * N)}</td></tr>` +
        `<tr><td>Profit<span class="s">margin ${pct(SBk.gross_margin_per_cup.range[0])}–${pct(SBk.gross_margin_per_cup.range[1])}: ${$m(S.contribution[0] - Y.abE.contribution)} to +${$m(S.contribution[1] - Y.abE.contribution)}</span></td><td>${$m(Y.abE.profit)}</td><td>${$m(Y.abE.profit * N)}</td></tr>` +
        `<tr class="sep"><td>Labour saving, counter<span class="s">labour saved − machine cost; shown on its own</span></td><td>${$m(Y.abE.counterNet)}</td><td>${$m(Y.abE.counterNet * N)}</td></tr>`;
      const pair = x => `${$n(x.orders)} · ${$m(x.profit)}`, TY = S.today.year;
      $(sl, ".ltab").innerHTML = `<tr><th>Orders · profit a year</th><th>Walk-away rule</th><th>Economic rule</th></tr>` +
        [["Forecast crew", Y.a, Y.aE], ["Machine", Y.b, Y.b], ["Both, one run", Y.ab, Y.abE]].map(([l, x, z], i) =>
          `<tr class="${i === 2 ? "lead" : ""}"><td>${l}</td><td>${pair(x)}</td><td>${pair(z)}</td></tr>`).join("") +
        `<tr><td>Both, today's split<span class="s">counter ${$m(TY.b.counterNet / 12)}/month</span></td><td>${pair(TY.ab)}</td><td>${pair(TY.abE)}</td></tr>`;
      $(sl, ".rules").textContent = `Walk-away rule: fewest people keeping peak-hour walk-aways within ${pct(SB.walkaway_target.value)} (the forecast crew at ${BD.cups} cups a day). Economic rule: add a person only when orders kept × price × margin beat the extra labour.`;
      const M = x => `S$${(x / 1e6).toFixed(2)}m`, sp = S.split.L;
      $(sl, ".hstrip").innerHTML = `<span>Profit a year, ${N} outlets: <b>${M(sp.total * N)}</b></span>` +
        `<span>= counter automation, physical AI <b>${M(sp.automation * N)}</b> <small>(depends on the minimum-crew rule)</small></span>` +
        `<span class="ai">+ forecast roster, predictive AI <b>${M(sp.forecast * N)}</b></span>` +
        `<span class="rg">Without / with the minimum-crew rule: <b>${M(S.minCrew[0] * N)} to ${M(S.minCrew[1] * N)}</b></span>`;
      $(sl, ".ixnote").textContent = `"Both" is one run, not a sum: the levers keep many of the same orders, and with the machine the forecast crew needs fewer extra hours (${S.interaction.profit >= 0 ? "+" : ""}${$m(S.interaction.profit)} profit against the sum). Headline figures use the economic rule.`;
      $(sl, ".rng").innerHTML = `Profit a year, one outlet: low <b>${$m(S.low.year.abE.profit)}</b> · base <b>${$m(Y.abE.profit)}</b> · high <b>${$m(S.high.year.abE.profit)}</b>`;
      const T = S.tornado.slice().sort((a, c) => Math.abs(c.hi - c.lo) - Math.abs(a.hi - a.lo));
      const all = T.flatMap(t => [t.lo, t.hi]).concat(Y.abE.profit), lo = Math.min(0, ...all), hi = Math.max(...all);
      const X = v => 92 + (v - lo) / (hi - lo || 1) * 198, rh = 15;
      $(sl, ".torn").innerHTML = T.map((t, i) => {
        const a = Math.min(t.lo, t.hi), c = Math.max(t.lo, t.hi), y = 4 + i * rh;
        return `<text x="88" y="${y + 11}" font-size="10" text-anchor="end" fill="${COL.ink2}">${t.label}</text>` +
          `<rect x="${X(a)}" y="${y + 2}" width="${Math.max(1, X(c) - X(a))}" height="10" fill="${COL.navy}" opacity=".75"/>`;
      }).join("") + `<line x1="${X(Y.abE.profit)}" x2="${X(Y.abE.profit)}" y1="2" y2="${4 + T.length * rh}" stroke="${COL.red}" stroke-width="1.5"/>` +
        (lo < 0 ? `<line x1="${X(0)}" x2="${X(0)}" y1="2" y2="${4 + T.length * rh}" stroke="${COL.taupe}" stroke-dasharray="2 2"/>` : "") +
        `<text x="${X(Y.abE.profit)}" y="${12 + T.length * rh}" font-size="9" text-anchor="middle" fill="${COL.red}">base</text>`;
      const mh = P.minStaff.all_human, mm = P.minStaff.mixed, F = S.fragile.year.abE;
      $(sl, ".frag").innerHTML = `The counter lever rests on the model's minimum crew off-peak: ${mh} by hand, ${mm} with machines. ` +
        `Profit a year per outlet: ${$m(Y.abE.profit)} with it; ${$m(F.profit)} with ${mm} either way.`;
      $(sl, ".bdays").textContent = `Calendar: ${e.days.busy} busy days (weekend days) and ${e.days.event} event days (Singapore public holidays) a year: an illustrative definition, to confirm with Chagee; sliders on screen.`;
      $$(ctl, "[data-v]").forEach(el => (el.textContent = e.days[el.dataset.v]));
    }
    ctl.addEventListener("input", ev => { const k = ev.target.dataset.k; if (!k) return;
      e.days[k] = Math.min(+ev.target.value, P.days - e.days[k === "busy" ? "event" : "busy"]); ev.target.value = e.days[k]; draw(); });
    printers.push(() => { e.days = { ...e0.days }; $$(ctl, "input").forEach(i => (i.value = e.days[i.dataset.k])); draw(); });
    draw();
  })();

  /* ---------------------------------------------------------------- 09 benefit, simple: bars (economic rule throughout) */
  (function benefitBars() {
    const el = $(document, "#c9 .bars"); if (!el) return;
    const S = DATA.benefit.summary, Y = S.base.year, N = RAW.facts.sg_outlets.value, F = S.fragile.year.abE, mm = P.minStaff.mixed;
    const M = x => `${x < 0 ? "−" : ""}S$${(Math.abs(x) / 1e6).toFixed(2)}m`, n = x => Math.round(x).toLocaleString("en-SG");
    const rows = [
      ["Forecast roster only", `economic rule, all by hand · ${n(Y.aE.orders * N)} orders kept`, Y.aE.profit, COL.navy, ""],
      ["One tea-and-milk machine only", `flat crew · ${n(Y.b.orders * N)} orders kept`, Y.b.profit, "#2F6B45", ""],
      ["Machine + forecast roster", `the proposed scenario · ${n(Y.abE.orders * N)} orders kept`, Y.abE.profit, COL.red, "tot"],
      ["Same, without the minimum-crew assumption", `${mm} person either way`, F.profit, COL.taupe, "frag"]];
    const max = Math.max(...rows.map(r => r[2]), S.pilot.profit);
    const bar = ([nm, sub, v, col, cls]) => { const w = Math.max(0.6, 100 * Math.max(0, v) / max * 0.7);
      return `<div class="row ${cls}"><div class="nm">${nm}<small>${sub}</small></div><div class="tr">` +
        `<div class="b" style="width:${w}%;background:${cls === "frag" ? `repeating-linear-gradient(45deg,${col} 0 6px,#CFC8BC 6px 12px)` : col}"></div>` +
        `<span class="v" style="left:calc(${w}% + 10px)">${M(v * N)}</span></div></div>`; };
    el.innerHTML = `<div class="grp">Against the illustrative all-hand baseline (flat normal-day roster)</div>` + rows.map(bar).join("") +
      `<div class="grp">Pilot comparison: the proposed scenario against today's split (our scenario), both on the economic rule</div>` +
      bar(["One machine against today's split", `difference between the two pilot arms · ${n(S.pilot.orders * N)} more orders kept`, S.pilot.profit, COL.ink2, "pil"]);
  })();

  /* ---------------------------------------------------------------- 08 playbook */
  (function playbook() {
    const tb = $(document, "#c8 .pb"); if (!tb) return;
    const normal = C.forecastDay(Sim, P, "none").peakStaff;
    tb.innerHTML = `<tr><th>Day</th><th>Forecast peak, cups per hour</th><th>People at the peak</th><th>Walk-aways, forecast roster and brigade</th><th>Walk-aways, normal-day roster</th></tr>` +
      DAYS.map(d => {
        const g = DATA.grid[d], F = g.forecast;
        return `<tr><td><b>${DAY_LABEL[d]}</b></td><td>${Math.round(F.peakCups)}</td><td><b>${F.peakStaff}</b></td>` +
               `<td>${pct(g.staff[F.peakStaff].brigade.lostShare, 1)}</td><td class="${g.staff[normal].brigade.lostShare > 0.05 ? "bad" : ""}">${pct(g.staff[normal].brigade.lostShare, 1)}</td></tr>`;
      }).join("");
    const calc = $(document, "#c8 .calc"), inp = $(calc, "input"), out = $(calc, ".out");
    const maxPeak = Math.max(...DAYS.map(d => DATA.grid[d].forecast.peakCups));
    inp.max = Math.ceil(maxPeak * 1.5); inp.value = Math.round(DATA.grid[DAY0].forecast.peakCups);
    const pl = Sim.plan(P, "mixed");
    const upd = () => { const c = +inp.value, k = Math.max(P.minStaff.mixed, Math.ceil(c / 60 * P.margin / pl.perWorker - 1e-9));
      out.textContent = `${c} cups → ${k} ${k === 1 ? "person" : "people"}`; };
    inp.oninput = upd; upd();
  })();

  /* ---------------------------------------------------------------- 04b network effects */
  // Click a loop or a card to pair them. The congestion card follows the shared day type (the counter grid,
  // DATA.grid); the cannibalisation card switches between slide 05's two sites (DATA.site).
  (function networkFx() {
    const sl = $(document, "#c1b"); if (!sl) return;
    const panel = $(sl, ".nfx"); let sel = null;
    const mark = () => { $$(sl, "[data-fx]").forEach(el => el.classList.toggle("hl", el.dataset.fx === sel)); panel.classList.toggle("pick", !!sel); };
    $$(sl, "[data-fx]").forEach(el => el.addEventListener("click", ev => {
      if (ev.target.closest(".nfw")) return;                                   // the cards' own controls
      sel = sel === el.dataset.fx ? null : el.dataset.fx; mark();
    }));
    // congestion: normal-day roster against the forecast crew, both with a bucket brigade, peak hour
    const G = DATA.grid, normal = G.none.forecast.peakStaff, bars = $(sl, ".nfbars"), copy = $(sl, ".nfcopy");
    $(sl, ".nfday").append(daySeg(setDay));
    const congest = d => {
      const F = G[d].forecast.peakStaff, a = G[d].staff[String(normal)].brigade.lostShare, b = G[d].staff[String(F)].brigade.lostShare, mx = Math.max(a, b, 0.01);
      const row = (lab, v, col) => `<div class="r"><span>${lab}</span><span class="b"><i style="width:${(100 * v / mx).toFixed(1)}%;background:${col}"></i></span><span class="v">${pct(v, v < 0.1 ? 1 : 0)}</span></div>`;
      bars.innerHTML = row(`Normal-day roster (${normal})`, a, COL.red) + row(`Forecast crew (${F}) + brigade`, b, "#2F6B45");
      copy.innerHTML = `Forecast crew plus a bucket brigade: ${DAY_LABEL[d].toLowerCase()} walk-aways <b>${pct(a, a < 0.1 ? 1 : 0)}</b> → <b>${pct(b, 1)}</b> of peak-hour orders.`;
    };
    BUS.fns.push(congest); congest(BUS.day);
    // cannibalisation: the app-search site against a store beside the outlet nearest it (slide 05)
    const ST = DATA.site, SITES = { top: ["App-search site", ST.top], beside: ["Beside an outlet", ST.besideTop] };
    const seg = $(sl, ".nfsite"), stack = $(sl, ".nfstack"), copy2 = $(sl, ".nfcopy2");
    let site = "top";
    seg.innerHTML = Object.entries(SITES).map(([k, [l]]) => `<button class="btn" data-k="${k}">${l}</button>`).join("");
    const cannibal = () => {
      const f = SITES[site][1], mx = Math.max(ST.top.cups, ST.besideTop.cups), moved = Math.round(f.cups) - Math.round(f.netNew);
      $$(seg, "button").forEach(b => b.classList.toggle("on", b.dataset.k === site));
      stack.innerHTML = `<div class="sb" style="width:${(100 * f.cups / mx).toFixed(1)}%"><i style="width:${(100 * f.netNew / f.cups).toFixed(1)}%;background:${COL.navy}"></i><i style="flex:1;background:${COL.red}"></i></div>` +
        `<div><b style="color:${COL.navy}">+${Math.round(f.netNew)}</b> added for Chagee · <b style="color:${COL.red}">${moved}</b> moved from nearby outlets</div>`;
      copy2.innerHTML = `Of ${Math.round(f.cups)} cups at ${site === "top" ? "the new site" : "a store beside an outlet"}, <b>${moved}</b> (${pct(moved / f.cups)}) move from nearby outlets. The score subtracts them.`;
    };
    seg.onclick = ev => { const b = ev.target.closest("[data-k]"); if (b) { site = b.dataset.k; cannibal(); } };
    cannibal();
    printers.push(() => { sel = null; mark(); site = "top"; cannibal(); });
  })();

  /* ---------------------------------------------------------------- 08b the supervised model (sim/sitemodel.js) */
  // Ridge regression on the synthetic outlets (DATA.siteModel), retrained and tested by leave-one-out on every toggle.
  // The new-market card scores a site with only the inputs a market with no Chagee history has.
  (function siteModel() {
    const sl = $(document, "#x1b"); if (!sl) return;
    const SMm = window.ChageeSiteModel, D = DATA.siteModel, X = RAW.site_ext, F = SMm.FEATURES, lam = D.lambda;
    const NM = X.new_market_inputs.value, R = X.residents_radius_km.value, RING = X.ring_km.value, DEL = X.model.value.delivery_km;
    const UNIT = { pop: `within ${R} km`, hubKm: "km", area: `within ${DEL} km`, unmet: `within ${RING} km`, own: `within ${RING} km`, nearKm: `km, capped at ${D.cap}` };
    const NMK = { yes: "new market: has it", maybe: "new market: to confirm", no: "new market: none" };
    const on = new Set(F.map(f => f.key));
    const S = steppers.find(x => x.p.closest("#x1b"))?.S; let step = S ? S.cur : 4;
    const fixedNM = { unmet: 0, own: 0, nearKm: D.cap };            // what a market with no Chagee history looks like
    const pre = $(sl, ".smpre");
    pre.innerHTML = `<button class="btn" data-p="all">All inputs</button><button class="btn" data-p="nm">New-market inputs</button>`;
    pre.onclick = ev => { const b = ev.target.closest("[data-p]"); if (!b) return; on.clear(); (b.dataset.p === "all" ? F.map(f => f.key) : NM).forEach(k => on.add(k)); draw(); };
    const tiles = $(sl, ".smf");
    tiles.onclick = ev => { const t = ev.target.closest(".t[data-k]"); if (!t) return; const k = t.dataset.k; on.has(k) ? on.delete(k) : on.add(k); draw(); };
    let cache = {};
    const run = keys => { const id = keys.join(","); if (!cache[id]) cache[id] = { m: SMm.fit(D.rows, keys, lam), L: SMm.loo(D.rows, keys, lam) }; return cache[id]; };
    const near = (a, b) => a.length === b.length && a.every(k => b.includes(k));
    function draw() {
      const keys = F.map(f => f.key).filter(k => on.has(k)), { m, L } = run(keys), all = run(F.map(f => f.key)), nm = run(NM), none = run([]);
      // preset buttons
      $$(pre, "button").forEach(b => b.classList.toggle("on", b.dataset.p === "all" ? keys.length === F.length : near(keys, NM)));
      // input tiles with each input's standardised weight (the forecast moves by this many cups per standard deviation)
      const bmax = Math.max(1, ...m.beta.map(Math.abs));
      tiles.innerHTML = F.map(f => { const i = keys.indexOf(f.key), b = i >= 0 ? m.beta[i] : 0, w = 50 * Math.abs(b) / bmax;
        return `<div class="t${i < 0 ? " off" : ""}" data-k="${f.key}" title="${f.unit}"><span class="cb">${i < 0 ? "" : "✓"}</span>` +
          `<span class="nm" title="${UNIT[f.key]}: ${f.unit}"><b>${f.label}</b><span class="nmk ${f.newMarket}">${NMK[f.newMarket]}</span></span>` +
          `<span class="cf" title="${i < 0 ? "off" : `${b >= 0 ? "+" : "−"}${Math.abs(Math.round(b))} cups per standard deviation`}">${i < 0 ? "" : `<i style="${b >= 0 ? `left:50%;width:${w}%;background:${COL.navy}` : `left:${50 - w}%;width:${w}%;background:${COL.red}`}"></i>`}</span></div>`; }).join("") +
        [["Competitors within " + X.competition_radius_m.value + " m"], ["Rent per sq ft"]].map(([l]) =>
          `<div class="t nodata"><span class="cb" style="border-style:dashed;border-color:${COL.taupe}"></span><span class="nm"><b>${l}</b><span class="nmk" style="color:${COL.taupe}">not in our data</span></span></div>`).join("");
      // chart: each outlet's cups a day against the held-out prediction (before step 3: the labels alone)
      const W = 280, H = 176, l = 38, r = 6, t = 18, b = 26, ys = D.rows.map(q => q.y), pr = step >= 3 ? L.pred : ys;
      const lo = Math.min(...ys, ...pr) * 0.95, hi = Math.max(...ys, ...pr) * 1.03;
      const Xs = v => l + (v - lo) / (hi - lo) * (W - l - r), Ys = v => H - b - (v - lo) / (hi - lo) * (H - t - b);
      let g = `<line x1="${Xs(lo)}" y1="${Ys(lo)}" x2="${Xs(hi)}" y2="${Ys(hi)}" stroke="${COL.taupe}" stroke-dasharray="4 3"/>`;
      [lo, (lo + hi) / 2, hi].forEach(v => { const vv = Math.round(v / 50) * 50;
        g += T(Math.min(Xs(vv), W - r), H - b + 13, vv, `font-size="9.5" text-anchor="${Xs(vv) > W - r - 12 ? "end" : "middle"}" fill="${COL.taupe}"`) + T(l - 5, Ys(vv) + 3, vv, `font-size="9.5" text-anchor="end" fill="${COL.taupe}"`); });
      g += T((l + W - r) / 2, H - 2, "outlet's cups a day (synthetic label)", `font-size="9.5" text-anchor="middle" fill="${COL.ink2}"`) +
        T(10, (t + H - b) / 2, step >= 3 ? "predicted, held out" : "the label", `font-size="9.5" text-anchor="middle" fill="${COL.ink2}" transform="rotate(-90 12 ${(t + H - b) / 2})"`);
      D.rows.forEach((q, i) => { const x = Xs(q.y), y = Ys(pr[i]);
        if (step >= 3) g += `<line x1="${x.toFixed(1)}" y1="${Ys(q.y).toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${COL.red}" stroke-opacity=".35"/>`;
        g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.8" fill="${step >= 3 ? COL.navy : COL.taupe}"/>`; });
      if (step >= 3) g += T(l, 10, `Tested on held-out outlets · average miss ±${Math.round(L.mae)}`, `font-size="9.5" font-weight="700" fill="${COL.navy}"`);
      $(sl, ".smsvg").innerHTML = g;
      // accuracy on held-out outlets, against the two presets and the average-outlet guess
      $(sl, ".smacc").innerHTML = `<div class="k">Tested on outlets it has not seen</div><div class="big">±${Math.round(L.mae)}<small>cups a day, average miss</small></div>` +
        `<div style="font:11px var(--sans);color:${COL.ink2}">R² ${L.r2.toFixed(2)} with ${keys.length ? `${keys.length} input${keys.length > 1 ? "s" : ""}` : "no inputs"}</div>` +
        `<table><tr class="${keys.length === F.length ? "cur" : ""}"><td>All inputs (Singapore)</td><td>±${Math.round(all.L.mae)} · R² ${all.L.r2.toFixed(2)}</td></tr>` +
        `<tr class="${near(keys, NM) ? "cur" : ""}"><td>New-market inputs only</td><td>±${Math.round(nm.L.mae)} · R² ${nm.L.r2.toFixed(2)}</td></tr>` +
        `<tr class="${keys.length ? "" : "cur"}"><td>No inputs: guess the average outlet</td><td>±${Math.round(none.L.mae)}</td></tr></table>`;
      city(keys, m, L);
    }
    // the hypothetical new city: forecast at every grid spot (inputs the city has), the k best at least the ring apart
    const CT = D.city, Ext = window.ChageeSiteExt, e0 = Ext.econ(RAW, P), dp = { Sim, C, P, TIERS: window.STORY.TIERS };
    const netAt = c => Ext.appraise(dp, e0, 0, c).month.net;
    const beCups = (() => { let a = 1, z = 3000; for (let i = 0; i < 40; i++) { const mid = (a + z) / 2; if (netAt(mid) > 0) z = mid; else a = mid; } return z; })();
    let K = CT.stores_default, probe = null, sendTo = null;
    let used = [];                                                    // the inputs switched on: only they can be out of range
    const inRange = f => used.every(k => f[k] >= D.ranges[k][0] - 1e-9 && f[k] <= D.ranges[k][1] + 1e-9);
    function city(keys, m, L) {
      used = keys;
      const P0 = SMm.pick(CT.grid, m.predict, K, RING), picks = P0.picks, mae = L.mae, stuck = keys.filter(k => k in fixedNM);
      sendTo = picks[0];
      const W = 280, H = 176, pad = 2, top = 13, s = Math.min((W - 2 * pad) / CT.width_km, (H - top - pad) / CT.height_km);
      const ox = (W - CT.width_km * s) / 2, X = x => ox + x * s, Y = y => top + y * s, g = CT.grid_km * s;
      const lo = Math.min(...P0.scored.map(c => c.cups)), hi = Math.max(...P0.scored.map(c => c.cups));
      let h = T(pad, 10, "Hypothetical new city · shaded where the forecast beats break-even", `font-size="9.5" font-weight="600" fill="${COL.ink2}"`) +
        `<rect x="${X(0)}" y="${Y(0)}" width="${CT.width_km * s}" height="${CT.height_km * s}" fill="#FBF9F5" stroke="${COL.line}"/>`;
      P0.scored.forEach(c => { if (c.cups <= beCups) return; const u = (c.cups - beCups) / (hi - beCups || 1);
        h += `<rect x="${(X(c.x) - g / 2).toFixed(1)}" y="${(Y(c.y) - g / 2).toFixed(1)}" width="${g.toFixed(1)}" height="${g.toFixed(1)}" fill="${COL.navy}" fill-opacity="${(0.12 + 0.6 * u).toFixed(3)}"/>`; });
      CT.dots.forEach(([x, y]) => (h += `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r=".8" fill="${COL.taupe}" fill-opacity=".55"/>`));
      CT.towns.forEach(t => (h += T(X(t.x), Y(t.y) - 8, t.name, `font-size="8.5" text-anchor="middle" fill="${COL.ink}" stroke="#FBF9F5" stroke-width="2.4" paint-order="stroke"`)));
      picks.forEach((c, i) => (h += `<circle cx="${X(c.x)}" cy="${Y(c.y)}" r="${RING * s}" fill="none" stroke="${COL.red}" stroke-dasharray="3 2" stroke-opacity=".7"/>` +
        `<circle cx="${X(c.x)}" cy="${Y(c.y)}" r="6.5" fill="${COL.red}"/>` + T(X(c.x), Y(c.y) + 3, i + 1, `font-size="8.5" font-weight="700" text-anchor="middle" fill="#fff"`)));
      if (probe) h += `<circle cx="${X(probe.x)}" cy="${Y(probe.y)}" r="5" fill="none" stroke="${COL.gold}" stroke-width="2"/>`;
      $(sl, ".smcity").innerHTML = h;
      $(sl, ".smcity")._map = { X0: ox, top, s };
      // the card: the picks, their forecast band, and whether they clear break-even at Singapore costs
      const town = c => CT.towns.reduce((a, t) => (Math.hypot(t.x - c.x, t.y - c.y) < Math.hypot(a.x - c.x, a.y - c.y) ? t : a)).name;
      const n = x => Math.round(x).toLocaleString("en-SG");
      const row = (c, i) => { const lo_ = c.cups - mae, be = lo_ > beCups ? `<span class="ok">above break-even even at ${n(lo_)}</span>` : c.cups > beCups ? `<span class="no">break-even only if forecast holds: pilot</span>` : `<span class="no">below break-even: skip</span>`;
        return `<li><i>${i + 1}</i><span>${town(c)}: <b>≈ ${n(c.cups)}</b> ± ${n(mae)} · ${be}${inRange(c.f) ? "" : ` · <span class="no">beyond what it learned</span>`}</span></li>`; };
      let pr = "";
      if (probe) pr = `<div class="probe">Your spot near ${town(probe)}: ≈ ${n(m.predict(probe.f))} ± ${n(mae)} cups a day${inRange(probe.f) ? "" : " (beyond what it learned)"}.</div>`;
      $(sl, ".smnew").innerHTML = `<div class="k">Where to open in the new city</div>` +
        `<label class="screenonly" style="display:grid;grid-template-columns:1fr auto;font:11px var(--sans);color:${COL.ink2}">Stores to place<span class="val">${K}</span><input type="range" data-k="K" min="1" max="${CT.stores_max}" step="1" value="${K}" style="grid-column:1/-1;accent-color:${COL.navy}"></label>` +
        `<ol>${picks.map(row).join("")}</ol>` + pr +
        (stuck.length ? `<p class="warn">${stuck.map(k => F.find(x => x.key === k).label).join(", ")}: the city has none, so these inputs push the forecast outside what the model learned. Switch ${stuck.length > 1 ? "them" : "it"} off.</p>` : "") +
        `<p style="font:10.5px/1.35 var(--sans);color:${COL.taupe};margin:3px 0 0">Cups a day, forecast ± average miss. Break-even ≈ ${n(beCups)} at Singapore costs (slide 09), a stand-in. Picks ≥ ${RING} km apart.</p>` +
        `<button class="btn use screenonly" data-act="use">Send site 1 to slide 09 →</button>`;
    }
    $(sl, ".smcity").addEventListener("click", ev => {
      const svg = ev.currentTarget, mp = svg._map, pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse()), x = (q.x - mp.X0) / mp.s, y = (q.y - mp.top) / mp.s;
      if (x < 0 || y < 0 || x > CT.width_km || y > CT.height_km) return;
      const rRes = X.residents_radius_km.value, rDel = X.model.value.delivery_km; let pop = 0, area = 0;
      CT.dots.forEach(([a, b]) => { const z = Math.hypot(a - x, b - y); if (z <= rRes) pop++; if (z <= rDel) area++; });
      probe = { x, y, f: { pop, area, hubKm: Math.min(...CT.towns.map(t => Math.hypot(t.x - x, t.y - y))), unmet: 0, own: 0, nearKm: D.cap } }; draw();
    });
    $(sl, ".smnew").addEventListener("input", ev => { if (ev.target.dataset.k !== "K") return; K = +ev.target.value; draw(); });
    $(sl, ".smnew").addEventListener("click", ev => { const b = ev.target.closest("[data-act=use]"); if (!b || !sendTo) return;
      const keys = F.map(f => f.key).filter(k => on.has(k)), c = run(keys).m.predict(sendTo.f), got = window.ChageeX?.setCups(c);
      b.textContent = got != null ? `Sent: ${Math.round(got)} cups a day${Math.round(got) !== Math.round(c) ? " (range end)" : ""}` : "Slide 09 not found"; });
    // step 4 is the new market: entering it keeps only the inputs that market has; stepping back restores all inputs
    const preset = keys => { on.clear(); keys.forEach(k => on.add(k)); };
    if (S) S.hooks.push(k => { if (k === 4 && step < 4) preset(NM); else if (k < 4 && step === 4) preset(F.map(f => f.key)); step = k; draw(); });
    printers.push(() => { preset(NM); K = CT.stores_default; probe = null; step = 4; draw(); });
    draw();
  })();

  /* ---------------------------------------------------------------- 08 / 09 extension: site selection (sim/siteext.js) */
  // One shared state: the pin (precomputed from the slide 05 engine), the hand-set scores and slide 09's inputs.
  // Slide 08 steps pin -> attributes -> scores -> cannibalisation -> site score; slide 09 recomputes net profit live.
  (function siteExt() {
    const s8 = $(document, "#x1"), s9 = $(document, "#x2"); if (!s8 || !s9) return;
    const E = window.ChageeSiteExt, XD = DATA.siteExt, X = RAW.site_ext, TI = window.STORY.TIERS;
    const PIN = Object.fromEntries(XD.pins.map(p => [p.id, p]));
    const PIN_LAB = { A: ["Site A", "top app-search cluster"], C: ["Site C", "an outlet inside the ring"], D: ["Site D", "beside an outlet"] };
    const e0 = E.econ(RAW, P), sc0 = { ...X.scores.value }, W = X.score_weights.value, ringKm = X.ring_km.value;
    const st = { pin: "A", sc: { ...sc0 }, cups: e0.cups.base, rent: e0.rent, deliveryShare: e0.deliveryShare, setup: e0.setup };
    const sm = (x, sign = false) => `${x < 0 ? "−" : sign ? "+" : ""}S$${Math.abs(Math.round(x)).toLocaleString("en-SG")}`;
    const fns = [], redraw = () => fns.forEach(f => f());
    $$(document, ".xpins").forEach(seg => {
      seg.innerHTML = XD.pins.map(p => `<button class="btn" data-p="${p.id}" title="${PIN_LAB[p.id][1]}">${PIN_LAB[p.id][0]}</button>`).join("");
      seg.onclick = ev => { const b = ev.target.closest("[data-p]"); if (b) { st.pin = b.dataset.p; redraw(); } };
      fns.push(() => $$(seg, "button").forEach(b => b.classList.toggle("on", b.dataset.p === st.pin)));
    });
    const score = () => E.siteScore(st.sc, W);

    // slide 08: the schematic map, redrawn per step and pin (positions are schematic; distances and shares are the engine's)
    const S8 = steppers.find(x => x.p.closest("#x1"))?.S, svg = $(s8, ".xsvg");
    let step8 = S8 ? S8.cur : 5;
    const PX = 190, PY = 128, R = 74;
    function map() {
      const p = PIN[st.pin], nb = p.neighbour, d = Math.max(16, Math.min(250, R * nb.km / ringKm)), a = -20 * Math.PI / 180;
      const bx = PX + d * Math.cos(a), by = PY + d * Math.sin(a), txt = (x, y, s, at = "") => T(x, y, s, `font-size="10.5" stroke="#FBF9F5" stroke-width="3" paint-order="stroke" ${at}`);
      let s = `<rect width="470" height="250" rx="8" fill="#FBF9F5"/><path d="M0 55H470M0 135H470M0 205H470M90 0V250M210 0V250M330 0V250M420 0V250" stroke="#ECE6DA"/>` +
        `<g fill="#E6DCC8"><rect x="34" y="18" width="60" height="32" rx="3"/><rect x="300" y="14" width="64" height="34" rx="3"/><rect x="40" y="186" width="66" height="38" rx="3"/><rect x="360" y="168" width="58" height="34" rx="3"/><rect x="250" y="196" width="54" height="32" rx="3"/></g>` +
        `<path d="M0 146 L470 108" stroke="#7E9B82" stroke-width="5" fill="none"/><g fill="#fff" stroke="#7E9B82" stroke-width="2"><circle cx="120" cy="136" r="5"/><circle cx="270" cy="124" r="5"/><circle cx="400" cy="113" r="5"/></g>`;
      if (step8 >= 2) {
        const rc = R * X.competition_radius_m.value / 1000 / ringKm, n = p.ring;
        s += `<circle cx="${PX}" cy="${PY}" r="${R}" fill="rgba(184,50,43,.07)" stroke="${COL.red}" stroke-width="1.5" stroke-dasharray="5 4"/>` +
          `<circle cx="${PX}" cy="${PY}" r="${rc.toFixed(1)}" fill="none" stroke="${COL.gold}" stroke-width="1.2" stroke-dasharray="2 3"/>` +
          [[-0.6, 0.5], [0.8, -0.2], [0.1, 0.9]].map(([u, v]) => `<rect x="${(PX + u * rc - 3).toFixed(1)}" y="${(PY + v * rc - 3).toFixed(1)}" width="6" height="6" fill="${COL.gold}"/>`).join("") +
          txt(PX, PY + R + 14, `${ringKm} km ring: ${n ? `${n} Chagee outlet${n > 1 ? "s" : ""} inside` : "no Chagee outlet inside"}`, `text-anchor="middle" fill="${COL.red}"`) +
          txt(PX - rc - 5, PY - rc + 4, `competitors within ${X.competition_radius_m.value} m`, `text-anchor="end" fill="#8A6A12" font-size="9.5"`) +
          `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="7" fill="${COL.navy}"/>`;
      }
      if (step8 >= 4) {
        const lx = Math.min(430, Math.max(70, bx)), right = bx < 300;
        s = s.replace(/(<circle cx="[\d.]+" cy="[\d.]+" r="7")/, `<line x1="${PX}" y1="${PY}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${COL.taupe}" stroke-width="1.4" stroke-dasharray="4 4"/>$1`) +
          txt(lx, Math.max(14, by - 13), "Neighbour outlet B", `text-anchor="middle" font-size="11.5" font-weight="600" fill="${COL.navy}"`) +
          txt(right ? bx + 12 : bx - 12, by + 4, `${nb.km.toFixed(1)} km · loses ${pct(nb.share)} of its sales`, `text-anchor="${right ? "start" : "end"}" fill="${COL.ink2}"`);
      }
      s += `<path d="M${PX} ${PY - 22}c-9 0-15 7-15 14 0 11 15 24 15 24s15-13 15-24c0-7-6-14-15-14z" fill="${COL.red}"/><circle cx="${PX}" cy="${PY - 8}" r="5" fill="#fff"/>` +
        T(PX, PY + 30, `Candidate ${PIN_LAB[st.pin][0].replace("Site", "site")} (hypothetical)`, `text-anchor="middle" font-size="12" font-weight="600" fill="${COL.red}"`);
      svg.innerHTML = s;
    }
    if (S8) S8.hooks.push(k => { step8 = k; map(); });
    // score rows: drag a hand-set bar; the cannibalisation row follows the pin; the site score follows the bars
    $$(s8, ".row[data-sc]").forEach(row => {
      const k = row.dataset.sc, inp = $(row, "input");
      if (inp) inp.addEventListener("input", () => { st.sc[k] = +inp.value; redraw(); });
    });
    function rows() {
      ["demand", "delivery", "competition"].forEach(k => { const r = $(s8, `.row[data-sc="${k}"]`);
        $(r, ".bar i").style.width = `${st.sc[k]}%`; $(r, ".val").textContent = st.sc[k]; $(r, "input").value = st.sc[k]; });
      const p = PIN[st.pin], rc = $(s8, '.row[data-sc="cannibal"]');
      $(rc, ".bar i").style.width = pct(p.share); $(rc, ".val").textContent = `−${Math.round(100 * p.share)}`;
      $(rc, ".cw").textContent = `${PIN_LAB[st.pin][0]}: ${pct(p.share)} of its cups would move from existing Chagee outlets; neighbour outlet B loses ${pct(p.neighbour.share)}. Deducted so the result is net to Chagee.`;
      const t = $(s8, ".row.tot"), v = score();
      $(t, ".bar i").style.width = `${v}%`; $(t, ".val").textContent = Math.round(v);
      const moved = Object.keys(sc0).some(k => st.sc[k] !== sc0[k]);
      $(t, ".sv").textContent = moved ? "bars moved: a what-if, not data" : "";
    }
    fns.push(map, rows);

    // slide 09: sliders on the decision inputs, a live waterfall and the call
    const ctl = $(s9, ".xctl"), svg9 = $(s9, ".xwf"), rec = $(s9, ".xrec"), rangeP = $(s9, ".xrange");
    const IN = [["cups", "Cups a day (slide 11's range)", Math.round(e0.cups.lo), Math.round(e0.cups.hi), 1, v => `${Math.round(v)}`],
                ["rent", "Rent a month", ...X.rent_per_month.range, 500, v => sm(v)],
                ["deliveryShare", "Share of cups via delivery apps", ...X.delivery_share_of_cups.range, 0.01, v => pct(v)],
                ["setup", "Set-up cost (one-off)", ...X.setup_cost.range, 5000, v => sm(v)]];
    ctl.innerHTML = `<span class="lab">Decision inputs · assumptions</span>` + IN.map(([k, lab, lo, hi, s]) =>
      `<label>${lab}<span class="val" data-v="${k}"></span><input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${s}" value="${st[k]}"></label>`).join("");
    ctl.addEventListener("input", ev => { const k = ev.target.dataset.k; if (!k) return; st[k] = +ev.target.value; redraw(); });
    function profit() {
      const p = PIN[st.pin], e = { ...e0, rent: st.rent, deliveryShare: st.deliveryShare, setup: st.setup }, dp = { Sim, C, P, TIERS: TI };
      const A = E.appraise(dp, e, p.share, st.cups), m = A.month, hi = E.appraise(dp, e, p.share, e0.cups.hi).month.net;
      IN.forEach(([k, , , , , f]) => { $(ctl, `[data-v="${k}"]`).textContent = f(st[k]); $(ctl, `[data-k="${k}"]`).value = st[k]; });
      $(s9, ".xpin").textContent = `${PIN_LAB[st.pin][0]}, ${PIN_LAB[st.pin][1]}`;
      // waterfall: contribution, then each deduction, then the net
      const bars = [["Cups × price × margin", m.contribution, "start"], ["Neighbours' lost profit", -m.moved, "red"], ["Delivery fees", -m.delivery, "cost"],
                    ["Counter staff + one machine", -m.counter, "cost"], ["Rent", -m.rent, "cost"], ["Utilities", -m.utilities, "cost"], ["Net to Chagee", m.net, "net"]];
      const w = 700, h = 214, l = 8, t = 20, b = 44, n = bars.length, bw = (w - l * 2) / n;
      let run = 0; const pts = bars.map(([lab, v, k]) => { const y0 = k === "net" ? 0 : run, y1 = k === "net" ? v : run + v; if (k !== "net") run = y1; return { lab, v, k, y0, y1 }; });
      const hiV = Math.max(...pts.map(q => Math.max(q.y0, q.y1))), loV = Math.min(0, ...pts.map(q => Math.min(q.y0, q.y1)));
      const Y = v => t + (hiV - v) / (hiV - loV || 1) * (h - t - b);
      const colr = { start: COL.navy, red: COL.red, cost: "#B7AFA0", net: m.net > 0 ? "#2F6B45" : COL.red };
      let s = `<line x1="0" x2="${w}" y1="${Y(0)}" y2="${Y(0)}" stroke="${COL.ink2}"/>`;
      pts.forEach((q, i) => {
        const x = l + i * bw + 8, bwi = bw - 16, top = Math.min(Y(q.y0), Y(q.y1)), hh = Math.max(1.5, Math.abs(Y(q.y0) - Y(q.y1)));
        s += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bwi.toFixed(1)}" height="${hh.toFixed(1)}" rx="3" fill="${colr[q.k]}"/>`;
        if (i < n - 1 && q.k !== "net") s += `<line x1="${(x + bwi).toFixed(1)}" x2="${(x + bw).toFixed(1)}" y1="${Y(q.y1).toFixed(1)}" y2="${Y(q.y1).toFixed(1)}" stroke="${COL.taupe}" stroke-dasharray="2 2"/>`;
        s += T(x + bwi / 2, top - 5, sm(q.v), `font-size="11.5" font-weight="700" text-anchor="middle" fill="${q.k === "net" ? colr.net : COL.ink}"`);
        const words = q.lab.split(" "), half = Math.ceil(words.length / 2), l1 = words.length > 2 ? words.slice(0, half).join(" ") : q.lab, l2 = words.length > 2 ? words.slice(half).join(" ") : "";
        s += T(x + bwi / 2, h - b + 16, l1, `font-size="10.5" text-anchor="middle" fill="${COL.ink2}"`) + (l2 ? T(x + bwi / 2, h - b + 29, l2, `font-size="10.5" text-anchor="middle" fill="${COL.ink2}"`) : "");
      });
      svg9.innerHTML = s;
      rangeP.innerHTML = `At ${Math.round(e0.cups.lo)}–${Math.round(e0.cups.hi)} cups a day: <b>${sm(A.netLo)}</b> to <b>${sm(hi)}</b> a month. Neighbour outlet B, ${PIN[st.pin].neighbour.km.toFixed(1)} km away, loses ${pct(PIN[st.pin].neighbour.share)} of its sales. ` +
        `Delivery fees: ${pct(st.deliveryShare)} of cups × ${pct(e0.commission)} commission. Counter: the one-machine setup, normal-day roster (counter model).`;
      const why = A.rec === "skip" ? `net profit is not positive at ${Math.round(st.cups)} cups a day` : A.rec === "open" ? `positive even at ${Math.round(e0.cups.lo)} cups a day, the low end of the range`
        : `positive at ${Math.round(st.cups)} cups a day, negative at ${Math.round(e0.cups.lo)}, the low end: test it before a full lease`;
      ["open", "pilot", "skip"].forEach(k => rec.classList.toggle(k, k === A.rec));
      rec.innerHTML = `<div class="k">Step 6 · Recommendation</div><div class="call">${A.rec[0].toUpperCase() + A.rec.slice(1)}</div><div>${why}.</div>` +
        `<dl><dt>Site score</dt><dd>${Math.round(score())} / 100 (slide 08)</dd>` +
        `<dt>Payback</dt><dd>${A.payback ? `≈ ${Math.round(A.payback.base)} months on ${sm(st.setup)}` : "none: not profitable"}</dd></dl>`;
    }
    fns.push(profit);
    // slide 08b's "Use on slide 09": its forecast becomes slide 09's cups a day, within slide 11's range
    window.ChageeX = { setCups: c => { st.cups = Math.max(e0.cups.lo, Math.min(e0.cups.hi, c)); redraw(); return st.cups; } };
    printers.push(() => { Object.assign(st, { pin: "A", sc: { ...sc0 }, cups: e0.cups.base, rent: e0.rent, deliveryShare: e0.deliveryShare, setup: e0.setup }); step8 = 5; redraw(); });
    redraw();
  })();

  /* ---------------------------------------------------------------- expand an explainer to full screen */
  // The explainer panel is enlarged in place, over the rest of the slide, so the slide's own styles and every
  // control keep working; the browser goes full screen too. Esc or the button returns. On slide 05 the pin's
  // forecast card floats over the map's artwork so a click still shows its result.
  const ZOOM = { el: null, ownFs: false };
  function zoomClose() {
    const z = ZOOM.el; if (!z) return;
    z.classList.remove("zoomed"); z.closest(".slide").classList.remove("zooming");
    $$(z.closest(".slide"), ".zfloat").forEach(x => x.classList.remove("zfloat"));
    ["position", "left", "top", "width", "height", "transform", "transformOrigin", "zIndex"].forEach(k => (z.style[k] = ""));
    $$(z, ".zb").forEach(b => { b.innerHTML = "⤢"; b.title = "Expand this explainer to full screen (Esc to return)"; });
    ZOOM.el = null;
    if (ZOOM.ownFs && document.fullscreenElement) { ZOOM.ownFs = false; document.exitFullscreen().catch(() => {}); }
  }
  function zoomOpen(body) {
    if (ZOOM.el) zoomClose();
    const w = body.offsetWidth, h = body.offsetHeight, top = 26, pad = 20;
    const s = Math.min((1280 - 2 * pad) / w, (720 - top - pad) / h);
    Object.assign(body.style, { position: "absolute", width: `${w}px`, height: `${h}px`, transformOrigin: "0 0", transform: `scale(${s})`,
      left: `${(1280 - w * s) / 2}px`, top: `${top + (720 - top - pad - h * s) / 2}px`, zIndex: 50 });
    body.classList.add("zoomed"); body.closest(".slide").classList.add("zooming");
    if (body.dataset.kind === "site") $(body.closest(".slide"), ".fc")?.classList.add("zfloat");
    $$(body, ".zb").forEach(b => { b.innerHTML = "✕"; b.title = "Back to the slide (Esc)"; });
    ZOOM.el = body;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      ZOOM.ownFs = true; document.documentElement.requestFullscreen().catch(() => (ZOOM.ownFs = false));
    }
  }
  $$(document, ".slide .body > .panel").forEach(body => {
    const top = $(body, ".ptop"); if (!top) return;
    const b = document.createElement("button");
    b.className = "btn zb screenonly"; b.innerHTML = "⤢"; b.title = "Expand this explainer to full screen (Esc to return)"; b.setAttribute("aria-label", "Expand to full screen");
    b.onclick = () => (ZOOM.el === body ? zoomClose() : zoomOpen(body));
    top.append(b);
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && ZOOM.ownFs) { ZOOM.ownFs = false; zoomClose(); } });
  addEventListener("keydown", e => {                                 // while expanded: Esc returns, arrows step the explainer
    if (!ZOOM.el || e.target.closest?.("input,select,textarea")) return;
    if (e.key === "Escape") zoomClose();
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const k = e.key === "ArrowRight" ? "next" : "prev"; $(ZOOM.el, `.ctl [data-k="${k}"]`)?.click(); }
    else if (!["PageDown", "PageUp", " ", "Home", "End"].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  addEventListener("beforeprint", zoomClose);
  $$(document, "#prev,#next").forEach(b => b.addEventListener("click", zoomClose, true));

  /* ---------------------------------------------------------------- print */
  function preparePrint() {
    PRINTING = true;
    if (BUS.day !== DAY0) setDay(DAY0);
    steppers.forEach(({ S }) => { S.stop(); S.go(S.N, true); });
    printers.forEach(f => f());
  }
  addEventListener("beforeprint", preparePrint);
  addEventListener("afterprint", () => (PRINTING = PRINT));
  if (Q.has("notes")) {
    document.body.classList.add("printnotes");
    slides.forEach(s => {
      const n = $(s, "aside.notes"); if (!n) return;
      const d = document.createElement("div"); d.className = "notespage";
      d.innerHTML = `<h6>Speaker notes · ${s.dataset.title || ""}</h6>${n.innerHTML}`;
      s.after(d);
    });
  }
  steppers.forEach(({ S }) => S.go(S.N, true));
  setReveal(revealAll, false);
  if (PRINT) { document.body.classList.add("print"); preparePrint(); }
  else { fit(); show(Math.max(0, (parseInt(location.hash.slice(1), 10) || 1) - 1)); }
})();
