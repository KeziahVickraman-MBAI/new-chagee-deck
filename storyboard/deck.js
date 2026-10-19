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
    $(document, "#count").textContent = `${cur + 1} / ${slides.length}`;
    const n = $(slides[cur], "aside.notes");
    $(document, "#notes .nb").innerHTML = n ? n.innerHTML : "";
    history.replaceState(null, "", `${location.search}#${cur + 1}`);
  }
  const editingNow = () => document.body.classList.contains("editing");
  function next() { const st = slides[cur]._stepper; if (st && st.cur < st.N && !revealAll && !editingNow()) st.go(st.cur + 1); else if (cur < slides.length - 1) show(cur + 1); }
  function prev() { const st = slides[cur]._stepper; if (st && st.cur > 1 && !revealAll && !editingNow()) st.go(st.cur - 1); else if (cur > 0) show(cur - 1, true); }
  /* ---------------------------------------------------------------- toolbar (as in the previous deck) */
  const toast = m => { const t = $(document, "#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 2200); };
  const MODE_KEY = "opim639-storyboard-reveal";
  let revealAll = false;
  try { revealAll = localStorage.getItem(MODE_KEY) === "all"; } catch (e) {}
  function setReveal(all, say) {
    revealAll = all; try { localStorage.setItem(MODE_KEY, all ? "all" : "one"); } catch (e) {}
    const b = $(document, "#modeb"); b.textContent = all ? "Reveal: all at once" : "Reveal: one by one"; b.classList.toggle("on", all);
    const st = slides[cur]._stepper; if (st) st.go(all ? st.N : st.cur, true);
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
  const EDIT_SEL = ".kicker,.head,.sub,.card h4,.card p,.takeaway span:not(.lab),.caps li span:not(.n),.ptitle,.move .k,.move p," +
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
    const ctl = $(panel, ".ctl");
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
  const steppers = $$(document, ".panel.stepper").map(p => ({ p, S: stepper(p) }));

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
      if (mode === "split") { const k = presetOf(o), row = k && DATA.splits[BUS.day][k];
        if (row && row.meets) { o.share = row.mode === "fixed" ? "fixed_best" : "brigade"; return row.staff; } }
      return forecastStaff(o);
    };
    const presetOf = o => Object.keys(PRESETS).find(k => sameSet(PRESETS[k].robots, conf(o).robots)) || null;
    const runOpts = o => ({ day: BUS.day, staff: o.staff, walkBack: WB, robots: o.robots,
                            mode: o.share === "brigade" ? "brigade" : "fixed", assign: o.share === "fixed_worst" ? "worst" : "best" });

    ctl.innerHTML = `<button class="btn primary" data-k="play">▶ Play</button><button class="btn" data-k="step">Step +30 s</button>
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
      $(el, ".ostat.live").innerHTML = `<span>minute <b>${mi.toFixed(0)}</b></span><span>served <b>${S.servedInHour}</b></span><span>walked away <b>${S.lost}</b></span>` +
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
        const D = DATA.splits[BUS.day];
        tb.innerHTML = `<tr><th>${DAY_LABEL[BUS.day]}</th><th>People</th><th>Walked away</th><th>Wait</th><th>Cost/day</th></tr>` +
          Object.keys(PRESETS).map(k => { const r = D[k];
            return `<tr class="${k === D._cheapest ? "best pick" : ""}"><td>${r.label}</td><td>${r.setup === "all_machine" ? "–" : r.meets ? `${r.staff}${r.mode === "fixed" ? " fixed" : ""}` : "over limit"}</td>` +
                   `<td>${r.meets ? pct(r.lostShare, 1) : "–"}</td><td>${r.meets ? mmss(r.medianWait) : "–"}</td><td>${money(r.cost.total)}</td></tr>`; }).join("") +
          `<tr><td colspan="5" style="text-align:left;color:${COL.taupe};font-size:11px">✓ cheapest within the limit · fastest: ${D[D._fastest] ? D[D._fastest].label : "–"}</td></tr>`;
      }
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
      rebuild(i, f === "share"); restartBoth();
    });
    panel.addEventListener("click", e => {
      const b = e.target.closest("button"), optEl = e.target.closest(".opt");
      if (b && b.closest(".cctl")) {
        if (b.dataset.k === "play") { if (minute(st.o[0].S) >= 60) restartBoth(); st.playing = !st.playing; }
        else if (b.dataset.k === "step") { st.playing = false; for (const o of st.o) { const S = o.S, end = S.t + 30; while (S.t < end - 1e-9) S.step(0.5); } }
        else if (b.dataset.k === "reset") { st.playing = false; restartBoth(); return; }
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
    BUS.fns.push(() => rebuild());
    let last = null;
    (function frame(ts) {
      if (st.playing && slides[cur] === slide && last != null) {
        const sec = Math.min(0.1, (ts - last) / 1000) * st.speed;
        for (const o of st.o) { const S = o.S, end = S.t + sec; while (S.t < end - 1e-9) S.step(Math.min(0.25, end - S.t)); }
        if (minute(st.o[0].S) >= 60) st.playing = false;
        sync();
      }
      last = ts; requestAnimationFrame(frame);
    })();
    printers.push(() => { st.o = init(); rebuild(null, false, SB.print_minute.value); });
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
    let M = null, pin = null, userPin = false, step = S.N;
    const oname = j => `${GEO.numbers[j]} · ${GEO.names[j]}`;
    const CL = [COL.red, "#8E5BA8", "#D07A2D", "#2E8B7A", "#B8860B", "#C0457A", "#5470A8"];
    const avg = RAW.store.cups_per_store_per_year.value / RAW.store.open_days_per_year.value;
    function rebuild() {
      M = Site.model(Sim, RAW, GEO, { ...par, events: EV });
      if (!userPin) pin = M.candidates[0] ? { x: M.candidates[0].x, y: M.candidates[0].y } : { x: 990, y: 300 };
      draw();
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
      GEO.outlets.forEach(([x, y], j) => (s += `<g><title>${oname(j)}: about ${Math.round(M.storeCups[j])} cups a day today (model)</title>` +
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
      if (step >= 4) {
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
      pin = { x: q.x, y: q.y }; userPin = true;
      if (S.cur < 4) S.go(4, true); else draw();
    });
    S.hooks.push(k => { step = k; if (M) draw(); });
    printers.push(() => { userPin = false; sl.forEach(([k, , key]) => (par[k] = SP[key].value)); $$(ctlEl, "input").forEach(i => (i.value = par[i.dataset.k])); rebuild(); });
    rebuild();
  });


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
