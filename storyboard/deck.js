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
                ink2: css("--ink2"), cream: css("--cream"), line: css("--line"), blue: css("--blue"), ice: css("--ice") };
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
  let cur = 0, jump = false;                                       // jump: an explicit link or slide number, which may open an auxiliary view
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
    // an auxiliary view (data-aux="its home slide", e.g. the illustrative explanation behind 04) is off the Next/Previous path:
    // stepping passes over it, and stepping out of it, either way, returns to its home slide as it was left
    const home = slides[cur]?.dataset.aux;
    if (!jump && Math.abs(i - cur) === 1) {
      const from = slides[cur], to = slides[i];
      if (from?.dataset.aux) i = slides.indexOf(document.getElementById(from.dataset.aux));
      else if (to?.dataset.aux) i += i > cur ? 1 : -1;
    }
    jump = false;
    const kept = home && slides[i]?.id === home ? slides[i]._b ?? -1 : null;   // back from an auxiliary view: its home's reveal state
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => s.classList.toggle("active", k === cur));
    buildTo(slides[cur], fromEnd || revealAll || editingNow() ? Infinity : kept ?? -1);
    slides[cur]._intro?.enter(fromEnd);                             // a slide with its own steps (03 to 05, 10, the earlier online page) starts there
    const gt = $(document, "#goto"); if (document.activeElement !== gt) gt.value = cur + 1; $(document, "#count .tot").textContent = `/ ${slides.length}`;
    const n = $(slides[cur], "aside.notes");
    $(document, "#notes .nb").innerHTML = n ? n.innerHTML : "";
    history.replaceState(null, "", `${location.search}#${cur + 1}`);
    runRace(slides[cur]);
  }
  // the appendix pickup race (#p1r, from the reference deck): it plays each time the slide opens (screen only); Replay runs it again
  function runRace(sl) { const r = sl && $(sl, ".race"); if (!r || PRINT) return; r.classList.remove("run"); void r.offsetWidth; r.classList.add("run"); }
  $$(document, ".rt-play").forEach(b => (b.onclick = () => { b.blur(); runRace(b.closest(".slide")); }));
  const editingNow = () => document.body.classList.contains("editing");
  // a band revealed by click (.vs.clickrev, slide 05): 0 hidden, 1 Without AI, 2 both; arrows step it after the panel's steps
  function setRev(el, r) { el._r = r; el.classList.toggle("r1", r >= 1); el.classList.toggle("r2", r >= 2); }
  $$(document, ".vs.clickrev").forEach(el => { setRev(el, 2); el.addEventListener("click", ev => { if (!ev.target.closest(".vsb")) setRev(el, Math.min(2, (el._r || 0) + 1)); }); });
  /* slide build, one-by-one mode: the kicker and headline open the slide; each Next brings in the next block in reading
     order (business problem, the explainer panel and its own steps, each card, the reveal band, takeaway or decision
     strip, transition line). A slide-level stepper (.inner.stepper) keeps driving its own [data-s] elements as one block. */
  const KEEP = ".kicker,.head,.sub,.revctl,.leafart,.keep";
  function unitsOf(sl) {
    if (sl._units) return sl._units;
    const U = [], inner = $(sl, ".inner"), ss = sl.classList.contains("content") && sl.dataset.chapter !== "Appendix" && sl.dataset.reveal !== "all" && inner;   // data-reveal="all": the whole slide at once
    if (ss) {
      const slideStep = inner.classList.contains("stepper") ? sl._stepper : null;
      let pend = [];                                                // keys and labels that belong to the next block (.aikey)
      const add = (els, o = {}) => { U.push({ els: [...pend, ...els], ...o }); pend = []; };
      const kids = [...inner.children].filter(c => !c.matches(KEEP) && !c.matches("aside"));
      if (slideStep) {                                              // blocks before the first stepped element, then the stepper
        const i = kids.findIndex(c => c.matches("[data-s]") || c.querySelector("[data-s]"));
        kids.slice(0, i < 0 ? kids.length : i).forEach(c => add([c]));
        if (i >= 0) add(kids.slice(i), { S: slideStep, rv: $(inner, ".vs.clickrev") });
      } else kids.forEach(c => {
        if (c.matches(".aikey")) { pend.push(c); return; }
        if (c.matches(".body")) {
          let panelU = null;
          [...c.children].forEach(b => {
            if (b.matches(".panel")) { add([b], { S: b.matches(".stepper") ? b._S : null }); panelU = U[U.length - 1]; }
            else if (b.matches(".cards")) [...b.children].forEach(k => {
              if (panelU && k.matches(".cset,.screenonly,.printonly,.pnlside")) panelU.els.push(k);     // the panel's own controls
              else add([k]);
            });
            else add([b]);
          });
        } else if (c.matches(".rec3")) [...c.children].forEach(k => add([k]));
        else if (c.querySelector("[data-chunk]")) {                // a block revealed in chunks (slide 01's farm to cup): one Next per data-chunk value
          const g = {}; $$(c, "[data-chunk]").forEach(e => (g[e.dataset.chunk] ||= []).push(e));
          Object.keys(g).sort().forEach(k => add(g[k]));
        }
        else add([c], { rv: c.matches(".vs.clickrev") ? c : null });
      });
    }
    return (sl._units = U);
  }
  // show the first n + 1 blocks (n = -1: headline only; Infinity: everything, steps and bands complete)
  function buildTo(sl, n) {
    const U = unitsOf(sl), all = n === Infinity; sl._b = Math.min(n, U.length - 1);
    U.forEach((u, k) => { u.els.forEach(e => e.classList.toggle("bh", k > sl._b));
      if (u.S) u.S.go(all ? u.S.N : 1, true); if (u.rv) setRev(u.rv, all ? 2 : 0); });
    if (!U.length) { const st = sl._stepper; if (st) st.go(all || sl.dataset.chapter === "Appendix" ? st.N : 1, true); }   // appendix pages open complete
  }
  const stepping = () => !revealAll && !editingNow();
  function next() { const sl = slides[cur], U = unitsOf(sl), u = U[sl._b];
    if (sl._intro?.next()) return;
    if (!stepping() || !U.length) { const st = sl._stepper; if (stepping() && st && st.cur < st.N) return st.go(st.cur + 1); return cur < slides.length - 1 && show(cur + 1); }
    if (u && u.S && u.S.cur < u.S.N) return u.S.go(u.S.cur + 1);
    if (u && u.rv && u.rv._r < 2) return setRev(u.rv, u.rv._r + 1);
    if (sl._b < U.length - 1) { sl._b++; U[sl._b].els.forEach(e => e.classList.remove("bh")); return; }
    if (cur < slides.length - 1) show(cur + 1); }
  function prev() { const sl = slides[cur], U = unitsOf(sl), u = U[sl._b];
    if (sl._intro?.prev()) return;
    if (!stepping() || !U.length) { const st = sl._stepper; if (stepping() && st && st.cur > 1) return st.go(st.cur - 1); return cur > 0 && show(cur - 1, true); }
    if (u && u.rv && u.rv._r > 0) return setRev(u.rv, u.rv._r - 1);
    if (u && u.S && u.S.cur > 1) return u.S.go(u.S.cur - 1);
    if (sl._b >= 0) { u.els.forEach(e => e.classList.add("bh")); sl._b--; return; }
    if (cur > 0) show(cur - 1, true); }
  /* ---------------------------------------------------------------- toolbar (as in the previous deck) */
  const toast = m => { const t = $(document, "#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("on"), 2200); };
  const MODE_KEY = "opim639-storyboard-reveal";
  let revealAll = false;
  try { revealAll = localStorage.getItem(MODE_KEY) === "all"; } catch (e) {}
  function setReveal(all, say) {
    revealAll = all; try { localStorage.setItem(MODE_KEY, all ? "all" : "one"); } catch (e) {}
    const b = $(document, "#modeb"); b.textContent = all ? "Reveal: all at once" : "Reveal: one by one"; b.classList.toggle("on", all);
    if (all) buildTo(slides[cur], Infinity);
    if (say) toast((all ? "Every block and step shown" : "One block at a time: Next brings in each part") + " · every slide");
  }
  const toggleFull = () => { try { const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); p && p.catch && p.catch(() => {}); } catch (e) {} };
  const toggleNotes = () => { document.body.classList.toggle("shownotes"); $(document, "#notesb").classList.toggle("on", document.body.classList.contains("shownotes")); fit(); };
  const doPrint = () => { preparePrint(); window.print(); };
  $(document, "#prev").onclick = prev; $(document, "#next").onclick = next;
  // the slide number box: type a number and press Enter to jump; Escape or leaving the box restores the current number
  (function gotoBox() {
    const gt = $(document, "#goto"), reset = () => { gt.value = cur + 1; gt.classList.remove("bad"); };
    gt.addEventListener("focus", () => gt.select());
    gt.addEventListener("input", () => { gt.value = gt.value.replace(/\D/g, "").slice(0, 3); gt.classList.remove("bad"); });
    gt.addEventListener("keydown", e => {
      e.stopPropagation();
      if (e.key === "Enter") { const n = parseInt(gt.value, 10);
        if (n >= 1 && n <= slides.length) { jump = true; show(n - 1); gt.blur(); } else { gt.classList.add("bad"); gt.select(); } }
      else if (e.key === "Escape") { reset(); gt.blur(); }
    });
    gt.addEventListener("blur", reset);
  })();
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
    if (on) slides.forEach(sl => buildTo(sl, Infinity));                                // edit mode shows every block and step
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
    else if (e.key === "g" || e.key === "G") { e.preventDefault(); $(document, "#goto").focus(); }
  });
  let idle; const wake = () => { document.body.classList.remove("idle"); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add("idle"), 2500); };
  addEventListener("mousemove", wake); addEventListener("keydown", wake); wake();
  $$(document, ".agenda li[data-go]").forEach(li => (li.onclick = () => show(slides.indexOf(document.getElementById(li.dataset.go)))));
  // agenda numbers follow the deck: the kicker number of the line's first slide (data-go) to its last (data-to); an
  // unnumbered slide in the main run (Q&A) takes the number after the last numbered slide before it
  const noOf = el => { const m = el && $(el, ".kicker")?.textContent.match(/^\s*(\d\d)\b/); return m ? m[1] : null; };
  const slideNo = id => { const el = document.getElementById(id); if (!el) return null; const n = noOf(el); if (n) return n;
    for (let i = slides.indexOf(el) - 1; i >= 0; i--) { const p = noOf(slides[i]); if (p) return String(+p + 1).padStart(2, "0"); } return null; };
  $$(document, ".agenda li[data-go]").forEach(li => { const no = $(li, ".no"); if (!no || no.textContent.trim()) return;
    const a = slideNo(li.dataset.go), b = li.dataset.to && slideNo(li.dataset.to); no.textContent = a ? (b && b !== a ? `${a}–${b}` : a) : "+"; });
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
    panel._S = S;
    return S;
  }
  const steppers = $$(document, ".panel.stepper, .inner.stepper").map(p => ({ p, S: stepper(p) }));

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
  // the pickup race's phone: Switch or Keep confirms the choice, as on slide 05; Undo restores the suggestion
  $$(document, ".rt-phone").forEach(ph => {
    const hd = $(ph, ".hd h3"), bd = $(ph, ".bd"), hd0 = hd.textContent, bd0 = bd.innerHTML, { near, far } = ph.dataset;
    const set = a => {
      if (a === "sw") { hd.textContent = "Switched"; bd.innerHTML = `<div class="crd sug"><small class="tag">Confirmed · simulated</small><h5 style="margin-top:3px">Collect at Raffles City in about ${far} min</h5><p>Complimentary carrier bag added, if you need one.</p></div><button class="cta ghost" data-rr="undo">Undo</button>`; }
      else if (a === "kp") { hd.textContent = "Your tea"; bd.innerHTML = `<div class="crd sug"><small class="tag">Confirmed · simulated</small><h5 style="margin-top:3px">Collect at Suntec City in about ${near} min</h5><p>You kept your outlet; nothing else changes.</p></div><button class="cta ghost" data-rr="undo">Undo</button>`; }
      else { hd.textContent = hd0; bd.innerHTML = bd0; } };
    ph.addEventListener("click", e => { const b = e.target.closest("[data-rr]"); if (b) { b.blur(); set(b.dataset.rr); } });
    printers.push(() => set("undo"));
  });
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
    // the AI layer alone (counter.aiLayer): the normal-day roster against the day's forecast roster, each side's robots,
    // customers and sharing rule held; precomputed for the named splits, run live (and cached) for a custom split
    const aiCache = {}, band = $(slide, ".vs.ai");
    const aiKey = o => { const c = conf(o); return [BUS.day, c.robots.join("+"), c.setup === "all_machine" ? "brigade" : o.share].join("|"); };
    function aiOf(o, live) {
      const c = conf(o), rule = c.setup === "all_machine" ? "brigade" : o.share, k = presetOf(o);
      const pre = k && DATA.aiLayer[BUS.day][k] && DATA.aiLayer[BUS.day][k][rule]; if (pre) return pre;
      const key = aiKey(o); if (!aiCache[key] && live)
        aiCache[key] = C.aiLayer(Sim, Store, P, { day: BUS.day, robots: c.robots, walkBack: WB, seeds: SEEDS,
          mode: rule === "brigade" ? "brigade" : "fixed", assign: rule === "fixed_worst" ? "worst" : "best" });
      return aiCache[key] || null;
    }
    const sideName = o => mode === "share" ? SHARE.find(x => x[0] === o.share)[1] : (presetOf(o) ? PRESETS[presetOf(o)].label : "Custom split");
    const ppl = n => `${n} ${n === 1 ? "person" : "people"}`;
    const dPts = (a, b) => { const x = Math.round((b - a) * 1000) / 10; return x === 0 ? "no change" : `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(1)} pts`; };
    function aiBand(live = PRINTING) {
      if (!band) return;
      const L = st.o.map(o => aiOf(o, live));
      const cell = (o, i, w) => { const x = L[i]; if (!x) return `<b>${"AB"[i]}</b> ${sideName(o)}: running ${SEEDS} peak hours…`;
        const r = x[w], v = `${x.setup === "all_machine" ? "no one on the line" : ppl(r.staff)} · away <b>${pct(r.lostShare, 1)}</b> · wait ${mmss(r.medianWait)} · ${money(r.cost)}/day`;
        if (w === "without") return `<b>${"AB"[i]}</b> ${sideName(o)}: ${v}`;
        const same = x.with.staff === x.without.staff;
        const why = BUS.day === "none" ? "normal day: same as the normal roster"
          : x.setup === "all_machine" ? "no crew to set" : same ? "the forecast adds no one here"
          : `${x.with.staff > x.without.staff ? "+" : "−"}${Math.abs(x.with.staff - x.without.staff)} staff, ${dPts(x.without.lostShare, x.with.lostShare)} away, ${x.with.cost >= x.without.cost ? "+" : "−"}${money(Math.abs(x.with.cost - x.without.cost))}`;
        return `<b>${"AB"[i]}</b> ${v} <small class="aid">· ${why}</small>`; };
      $(band, ".ai-without").innerHTML = st.o.map((o, i) => cell(o, i, "without")).join("<br>");
      $(band, ".ai-with").innerHTML = st.o.map((o, i) => cell(o, i, "with")).join("<br>");
      $$(slide, ".ai-day").forEach(e => (e.textContent = DAY_LABEL[BUS.day]));
      if (!live && L.some(x => !x)) { clearTimeout(st.aiTm); st.aiTm = setTimeout(() => aiBand(true), 60); }
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
      const tb = $(slide, ".res");
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
        // the readable comparison beside the counter: cost a day, cheapest first; faded = misses the walk-away limit
        const sb = $(slide, ".sbars");
        if (sb) { const ks = Object.keys(PRESETS).sort((a, b) => SPLITROW(BUS.day, a).cost.total - SPLITROW(BUS.day, b).cost.total), mx = Math.max(...ks.map(k => SPLITROW(BUS.day, k).cost.total));
          sb.innerHTML = ks.map(k => { const r = SPLITROW(BUS.day, k);
            return `<div class="r${k === best ? " best" : ""}${r.meets ? "" : " miss"}"><span>${PRESETS[k].label}${k === best ? " ✓" : ""}</span><b>${money(r.cost.total)}</b><span class="bar" style="width:${(r.cost.total / mx * 100).toFixed(0)}%"></span></div>`; }).join("") +
            `<p class="note">✓ cheapest that keeps walk-aways within ${pct(SB.walkaway_target.value)}${ks.some(k => !SPLITROW(BUS.day, k).meets) ? "; faded: misses the limit" : ""}. Full table: Numbers.</p>`; }
        // the normal day as well, so the headline's "on a normal day, people are still cheaper" is on the page
        const nd = $(slide, ".normday"), NB = DATA.decisions.automate.perDay.none.cheapest, ks = Object.keys(PRESETS).filter(k => SPLITROW("none", k).meets);
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
      aiBand();
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

  /* ---------------------------------------------------------------- 10 sharing the work: fixed responsibilities (A) against
     flexible assistance (B, counter.js mode "assist", not the brigade). Same crew, robots, customers (seed), drink times and
     walking speed; only who may do which step changes. One demand control; the three metrics are the mean of the seeded
     runs (precomputed at the day types' peaks, run live in between); the animation is one seeded run. */
  (function shareWidget() {
    const sl = document.getElementById("sh"), SHR = RAW.sharing, SHD = DATA.sharing; if (!sl || !SHD) return;
    const AS = { trigger: SHR.assist_trigger_cups.value, handoverSec: SHR.assist_handover_sec.value }, UP = SHR.upper_percentile.value;
    const robots = SHD.robots, staff = SHD.staff, day = SHR.crew_day.value, [DMIN, DMAX] = SHR.demand_per_hour_range.value;
    const LV = Object.entries(SHD.levels), h0 = DATA.counter.firstHour + DATA.counter.peakHour, GREEN = "#2F6B45";
    const SIDES = [["fixed", "Fixed responsibilities", "each person stays on their own steps"], ["assist", "Flexible assistance", "a free person helps a queued step"]];
    const PH = [["Order received", ["ticket"]], ["Cup preparation", ["cup_ice"]], ["Dispensing", ["tea_milk", "topping_finish"]], ["Finishing and sealing", ["shake_seal"]], ["Collection", ["handover"]]];
    const isM = k => robots.includes(k), secOf = k => (isM(k) ? P.machineSec[k] * P.machineMult : P.humanSec[k] * P.humanMult);
    const T0 = DATA.sharing_times;
    // the counter as a sequence: who does each step (illustrative setup)
    $(sl, ".shflow").innerHTML = PH.map(([lab, ks]) => `<div class="ph"><b>${lab}</b><span>${ks.map(k => `<i class="${isM(k) ? "m" : "p"}">${isM(k) ? "machine" : "person"}</i> ${Math.round(secOf(k))} s`).join(" + ")}</span></div>`).join('<span class="ar">→</span>') +
      `<div class="vd"><b>Illustrative counter setup, to validate with Chagee.</b> Hand-over is an assumed ${Math.round(T0.handover)} s step, not a drink's make time. All by hand a cup is ${Math.round(T0.all_human)} s of work; here people do ${Math.round(T0.hand_here)} s.</div>`;
    const st = { per: SHD.levels[day].perHour, playing: false, speed: 10, S: [null, null], cache: {} };
    LV.forEach(([, L]) => (st.cache[L.perHour.toFixed(3)] = L));
    const clock = sec => { const t = h0 * 3600 + Math.max(0, sec); return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor(t / 60) % 60).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`; };
    const minute = S => (S.t - S.measureFrom) / 60;
    function fresh(toMinute = 0) {
      st.S = SIDES.map(([mode]) => C.create(Sim, Store, P, { robots, staff, day, walkBack: WB, seed: P.seed, mode, assign: "best", assist: AS, perHour: st.per }));
      for (const S of st.S) { const end = S.t + toMinute * 60; while (S.t < end - 1e-9) S.step(0.5); }
    }
    const cupI = (x, y, c = COL.gold) => `<path d="M${(x - 4).toFixed(1)} ${(y - 5.5).toFixed(1)}h8l-1.3 10.5h-5.4z" fill="${c}" stroke="#fff" stroke-width=".8"/>`;
    const Y0 = 6, RH = 30;
    function drawSide(i) {
      const S = st.S[i], el = $$(sl, ".shopt")[i], n = S.stations.length;
      const top = S.stations.map((o, k) => (o.machine ? -1 : o.queue.length)), qk = top.indexOf(Math.max(...top)), hot = top[qk] >= AS.trigger ? qk : -1;
      let s = "";
      PH.forEach(([lab, ks]) => { const k0 = P.stations.indexOf(ks[0]), y = Y0 + k0 * RH;
        s += `<rect x="2" y="${y}" width="3" height="${ks.length * RH - 6}" rx="1.5" fill="${COL.gold}"/>` + T(10, y + 15, lab, `font-size="11.5" font-weight="600" fill="${COL.ink2}"`); });
      S.stations.forEach((o, k) => {
        const y = Y0 + k * RH, m = o.machine, hq = k === hot;
        s += `<rect x="128" y="${y}" width="140" height="${RH - 6}" rx="6" fill="${m ? COL.navy : "#fff"}" stroke="${hq ? COL.red : m ? COL.navy : "#CFC6B5"}" stroke-width="${hq ? 2.5 : 1.3}"/>` +
             T(135, y + 11.5, NAME[o.id], `font-size="11" font-weight="600" fill="${m ? "#fff" : COL.ink}"`) +
             T(135, y + 21.5, m ? `machine · ${Math.round(o.sec)} s` : `person · ${Math.round(o.sec)} s`, `font-size="9.5" fill="${m ? "#C9D3E6" : COL.taupe}"`);
        if (m) o.busy.forEach((b, j) => (s += `<rect x="134" y="${y + RH - 9 - j * 3}" width="${128 * (1 - Math.max(0, b.left) / o.sec)}" height="2" fill="${COL.gold}"/>`));
        o.queue.slice(0, 6).forEach((c, j) => (s += cupI(282 + j * 10, y + 13, hq ? COL.red : COL.gold)));
        if (o.queue.length > 6) s += T(343, y + 17, `+${o.queue.length - 6}`, `font-size="10" fill="${COL.taupe}"`);
        if (hq) s += T(282, y + RH - 1, `queue: ${o.queue.length} cups`, `font-size="9.5" font-weight="700" fill="${COL.red}"`);
      });
      S.workers.forEach(w => {
        const near = S.workers.filter(o => o.i < w.i && Math.abs(o.x - w.x) < 0.45).length, x = 384 + near * 62, y = Y0 + Math.min(n - 0.5, w.x) * RH + 10;
        const free = w.mode === "idle", help = w.mode === "work" && w.helping, walking = w.mode === "walk";
        const ring = free ? GREEN : help ? COL.gold : null, tag = free ? "free" : help ? "helping" : walking ? "walking" : "";
        s += `<g opacity="${walking ? 0.55 : 1}">${w.cup ? cupI(x - 17, y) : ""}<circle cx="${x}" cy="${y.toFixed(1)}" r="10" fill="${COL.red}"/>` +
             (ring ? `<circle cx="${x}" cy="${y.toFixed(1)}" r="13.5" fill="none" stroke="${ring}" stroke-width="3"/>` : "") +
             T(x, y + 3.5, w.v.toFixed(1), `font-size="9" font-weight="700" fill="#fff" text-anchor="middle"`) +
             (tag ? T(x + 17, y + 4, tag, `font-size="10.5" font-weight="700" fill="${ring || COL.taupe}"`) : "") + `</g>`;
      });
      s += T(128, Y0 + n * RH + 5, "→ collection", `font-size="9.5" fill="${COL.taupe}"`);
      $(el, "svg").innerHTML = s;
      const t0 = S.measureFrom, ready = S.done.filter(c => c.out <= S.t).length, prog = S.cups.filter(c => c.born >= t0).length;
      $(el, ".live").innerHTML = `<span>orders placed <b>${S.arrived}</b></span><span>ready <b>${ready}</b></span><span>in progress <b>${prog}</b></span><span>walked away <b>${S.lost}</b></span>`;
    }
    function head() {
      $$(sl, ".shopt").forEach((el, i) => (el.innerHTML = `<div class="oh"><span class="badge">${"AB"[i]}</span>${SIDES[i][1]}<small>${SIDES[i][2]} · ${staff} people</small></div>` +
        `<svg viewBox="0 0 470 ${Y0 + P.stations.length * RH + 8}" preserveAspectRatio="xMidYMid meet" aria-label="Counter ${"AB"[i]}: steps, queued cups and the crew"></svg><div class="live"></div>`));
    }
    function sync() {
      const S = st.S[0], mi = Math.max(0, Math.min(60, minute(S)));
      $(sl, ".shclock .clk").textContent = clock(mi * 60);
      $(sl, ".shclock .sub").textContent = `simulated · minute ${Math.floor(mi)} of 60 · ${PRINTING ? "printed frame" : st.playing ? (st.speed === 1 ? "real time" : `×${st.speed}`) : "paused"}`;
      $(sl, '[data-s="play"]').textContent = st.playing ? "❚❚ Pause" : "▶ Play";
      $$(sl, ".shspd .btn").forEach(b => b.classList.toggle("on", +b.dataset.v === st.speed));
      drawSide(0); drawSide(1);
    }
    // the three metrics: mean of the seeded runs at this demand
    const opts = per => ({ robots, staff, day, walkBack: WB, seeds: SEEDS, upper: UP, assist: AS, perHour: per });
    function metrics(live = PRINTING) {
      const key = st.per.toFixed(3); let R = st.cache[key];
      if (!R && live) R = st.cache[key] = C.shareCompare(Sim, Store, P, opts(st.per));
      const box = $(sl, ".shmet");
      if (!R) { box.innerHTML = `<p class="note">Running ${SEEDS} simulated peak hours at ${Math.round(st.per)} orders an hour…</p>`; clearTimeout(st.tm); st.tm = setTimeout(() => metrics(true), 60); return; }
      const a = R.fixed, b = R.assist, win = (x, y, lowBetter, tol) => (Math.abs(x - y) < tol ? [false, false] : lowBetter ? [x < y, y < x] : [x > y, y > x]);
      const [wm0, wm1] = win(a.median, b.median, true, 5), [wp0, wp1] = win(a.p90, b.p90, true, 5), [wc0, wc1] = win(a.completed, b.completed, false, 1);
      const cell = (i, txt, w) => `<span>${"AB"[i]}</span><span class="${w ? "w" : ""}">${txt}</span>`;
      box.innerHTML =
        `<div class="m"><span class="l">Order-to-ready · median / ${Math.round(UP * 100)}th percentile</span><div class="v">${cell(0, `<b>${mmss(a.median)}</b> / ${mmss(a.p90)}`, false)}${cell(1, `<b>${mmss(b.median)}</b> / ${mmss(b.p90)}`, wm1 || wp1)}</div></div>` +
        `<div class="m"><span class="l">Orders completed in the peak hour</span><div class="v">${cell(0, `<b>${a.completed.toFixed(0)}</b> of ${a.arrived.toFixed(0)} · ${a.unfinished.toFixed(0)} unfinished · ${a.lost.toFixed(0)} away`, wc0)}${cell(1, `<b>${b.completed.toFixed(0)}</b> of ${b.arrived.toFixed(0)} · ${b.unfinished.toFixed(0)} unfinished · ${b.lost.toFixed(0)} away`, wc1)}</div></div>` +
        `<div class="m"><span class="l">Paid labour for the hour</span><div class="v">${cell(0, `<b>${money(a.labour)}</b> · ${staff} people`, false)}${cell(1, `<b>${money(b.labour)}</b> · the same crew`, false)}</div></div>` +
        `<p class="note">Mean of ${SEEDS} simulated peak hours at ${Math.round(st.per)} orders an hour · orders placed ${clock(0).slice(0, 5)}–${clock(3600).slice(0, 5)}, timed from order to collection · green: better.</p>`;
      $(sl, ".shdemp").textContent = `Demand shown: ${Math.round(st.per)} orders an hour.`;
      // takeaway: what this demand says, without forcing a winner
      const dm = a.median - b.median, dp = a.p90 - b.p90, both = Math.max(a.p90, b.p90) < 2 * 60 + 30;
      const t = $(sl, ".shtake .t");
      t.innerHTML = Math.abs(dm) < 10 && Math.abs(dp) < 10 && both
        ? `At ${Math.round(st.per)} orders an hour both rules keep up: no step is overloaded, so changing how work is shared changes little.`
        : dp > 10 && dm >= 0
        ? `At ${Math.round(st.per)} orders an hour the same ${staff} people, sharing flexibly: median ${mmss(a.median)} → <b>${mmss(b.median)}</b>, ${Math.round(UP * 100)}th percentile ${mmss(a.p90)} → <b>${mmss(b.p90)}</b>, ${a.completed.toFixed(0)} → <b>${b.completed.toFixed(0)}</b> orders completed, same paid hour. A simulation result under our assumptions.`
        : `At ${Math.round(st.per)} orders an hour flexible assistance does not clearly help (${mmss(a.p90)} against ${mmss(b.p90)} at the ${Math.round(UP * 100)}th percentile): the queue needs more staff (the forecasting page) or equipment (the equipment page).`;
    }
    function how() {
      const rows = LV.map(([k, L]) => `<tr><td>${DAY_LABEL[k]} peak · ${Math.round(L.perHour)}/h</td>` + ["fixed", "assist"].map(m => { const r = L[m];
        return `<td>${mmss(r.median)} / ${mmss(r.p90)} · ${r.completed.toFixed(0)} done · ${r.unfinished.toFixed(0)} unfinished · ${r.lost.toFixed(0)} away</td>`; }).join("") + `</tr>`).join("");
      $(sl, ".shhow1").innerHTML = `<h5>Three different times</h5><p><b>Work content</b>: seconds of work in one cup. All by hand it is ${Math.round(T0.all_human)} s; in this setup people do ${Math.round(T0.hand_here)} s and machines the rest. Hand-over is one ${Math.round(T0.handover)} s step of it.</p>` +
        `<p><b>Time between finished cups</b>: how often a cup leaves the counter, set by the busiest step and the crew on it. <b>Order-to-ready</b>: what the customer feels, the work plus every wait in a queue.</p>` +
        `<h5>The two rules</h5><p><b>A, fixed responsibilities</b>: each person keeps their own steps, using the split that balances the work best (the faster person takes the heavier steps).</p>` +
        `<p><b>B, flexible assistance</b>: when a person's own steps have nothing waiting, they walk to another hand step with at least ${AS.trigger} cups waiting and help, paying the walk and ${AS.handoverSec} s of coordination on every cup they make there; they go back as soon as their own steps have work. Not the bucket brigade, which is in the appendix.</p>` +
        `<h5>The measurement window</h5><p>Orders placed ${clock(0).slice(0, 5)}–${clock(3600).slice(0, 5)} (simulated). <b>Completed</b>: ready within the hour. <b>Unfinished</b>: still at the counter at ${clock(3600).slice(0, 5)}; they are followed until ready for the order-to-ready times. <b>Walked away</b>: left on arrival because more than ${P.targetWait} minutes of work was already queued (the model's rule).</p>`;
      $(sl, ".shhow2").innerHTML = `<h5>Held on both sides</h5><p>${staff} people (the event-day forecast crew), the same machines, the same orders (same random seed), drink mix, step times, walking speed and walk-away rule. Machine investment (the equipment page) and forecast staffing (the forecasting page) are separate comparisons.</p>` +
        `<h5>Mean of ${SEEDS} runs at each day type's peak · median / ${Math.round(UP * 100)}th</h5><table class="res"><tr><th>Demand</th><th>A · fixed</th><th>B · flexible</th></tr>${rows}</table>` +
        `<h5>To validate with Chagee</h5><p>Which steps machines do; actual task times and equipment cycles; who is trained on which step; walking distances and movement limits behind the counter; the coordination cost of helping; order arrivals and order-to-ready times.</p>`;
    }
    // controls
    const sp = $(sl, ".shspd"); sp.innerHTML = SHR.playback_speeds.value.map(v => `<button class="btn" data-v="${v}" title="${v === 1 ? "one simulated second per second" : `${v} simulated seconds per second`}">${v === 1 ? "Real time" : `×${v}`}</button>`).join("");
    const rng = $(sl, 'input[data-s="dem"]'); Object.assign(rng, { min: DMIN, max: DMAX, step: 1, value: st.per });
    $(sl, ".shdem .marks").innerHTML = LV.map(([k, L]) => `<button data-per="${L.perHour}" style="left:${((L.perHour - DMIN) / (DMAX - DMIN) * 100).toFixed(1)}%">${DAY_LABEL[k].replace(" day", "").toLowerCase()}</button>`).join("");
    const setPer = per => { st.per = per; st.playing = false; rng.value = per; $(sl, ".shdem .val").textContent = `${Math.round(per)}`; fresh(0); sync(); metrics(); };
    $(sl, ".shdem .val").textContent = `${Math.round(st.per)}`;
    sl.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || !b.closest(".shbar")) return; b.blur();
      if (b.dataset.s === "play") { if (minute(st.S[0]) >= 60) fresh(0); st.playing = !st.playing; }
      else if (b.dataset.s === "reset") { st.playing = false; fresh(0); }
      else if (b.dataset.v) st.speed = +b.dataset.v;
      else if (b.dataset.per) return setPer(+b.dataset.per);
      sync(); });
    rng.addEventListener("input", () => { $(sl, ".shdem .val").textContent = rng.value; clearTimeout(st.dt); st.dt = setTimeout(() => setPer(+rng.value), 200); });
    let last = null;
    (function frame(ts) {
      if (st.playing && slides[cur] === sl && last != null) {
        const sec = Math.min(0.1, (ts - last) / 1000) * st.speed;
        for (const S of st.S) { const end = S.t + sec; while (S.t < end - 1e-9) S.step(Math.min(0.25, end - S.t)); }
        if (minute(st.S[0]) >= 60) st.playing = false;
        sync();
      }
      last = ts; requestAnimationFrame(frame);
    })();
    printers.push(() => { st.playing = false; st.per = SHD.levels[day].perHour; rng.value = st.per; fresh(SB.print_minute.value); sync(); metrics(true); });
    head(); how(); fresh(SB.print_minute.value); sync(); metrics();
  })();

  /* ---------------------------------------------------------------- 05 P&L view and its print companion (sim/pnl.js) */
  const PNL = window.ChageePnl, PE0 = PNL.inputs(RAW, P), PR = RAW.pnl;
  const sgd = x => `${x < 0 ? "−" : ""}S$${Math.round(Math.abs(x)).toLocaleString("en-SG")}`;
  const sgk = x => Math.abs(x) >= 1e6 ? `${x < 0 ? "−" : ""}S$${(Math.abs(x) / 1e6).toFixed(1)}m` : `${x < 0 ? "−" : ""}S$${Math.round(Math.abs(x) / 1e3)}k`;
  const yrs = x => { if (x == null) return null; const m = Math.max(1, Math.round(x * 12)); return x < 1 ? `${m} month${m === 1 ? "" : "s"}` : `${x.toFixed(1)} years`; };
  const PMET = { rev: ["Revenue", "Annual incremental revenue to Chagee", r => r.netRev, "S$ a year"],
                 op: ["Operating profit", "Annual incremental operating profit", r => r.opProfit, "S$ a year"],
                 cum: ["Cumulative operating profit", "Cumulative incremental operating profit", r => r.cumOp, "S$, cumulative from opening"] };
  const PLAB = { wo: ["Without AI-assisted", "site selection"], wi: ["With AI-assisted", "site selection"] }, PCOL = { wo: COL.taupe, wi: COL.navy };
  const VOLS = ["low", "base", "high"];
  function pnlChart(svg, X, metric) {
    const W = svg.viewBox.baseVal.width || 760, H = svg.viewBox.baseVal.height || 226, L = 70, Rr = 150, Tp = 10, B = 36, f = PMET[metric][2], n = X.wo.base.years.length;
    const val = (k, v) => X[k][v].years.map(f), inv = metric === "cum" ? [X.wo.base.invest, X.wi.base.invest] : [];
    const all = ["wo", "wi"].flatMap(k => VOLS.flatMap(v => val(k, v))).concat(inv);
    let y0 = Math.min(0, ...all), y1 = Math.max(0, ...all);
    const step = (() => { const r = (y1 - y0) / 4, m = 10 ** Math.floor(Math.log10(r || 1)); return [1, 2, 2.5, 5, 10].map(q => q * m).find(q => q >= r); })();
    y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
    const X_ = i => L + i / (n - 1) * (W - L - Rr), Y = v => Tp + (y1 - v) / (y1 - y0) * (H - Tp - B);
    let s = "";
    for (let v = y0; v <= y1 + 1e-6; v += step) s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${v === 0 ? COL.ink2 : COL.line}" stroke-width="${v === 0 ? 1.2 : 1}"/>` +
      T(L - 7, Y(v) + 3.5, sgk(v), `font-size="10.5" fill="${COL.taupe}" text-anchor="end"`);
    for (let i = 0; i < n; i++) s += T(X_(i), H - B + 16, `Year ${i + 1}`, `font-size="11" fill="${COL.ink2}" text-anchor="middle"`);
    s += T((L + W - Rr) / 2, H - 4, "Years from opening · same opening date at both sites", `font-size="10.5" fill="${COL.taupe}" text-anchor="middle"`);
    s += `<text transform="translate(12 ${(Tp + H - B) / 2}) rotate(-90)" font-size="10.5" fill="${COL.taupe}" text-anchor="middle">${PMET[metric][3]}</text>`;
    if (metric === "cum") { const v = X.wo.base.invest;
      s += `<line x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${COL.red}" stroke-dasharray="5 4"/>` +
           T(L + 6, Y(v) - 5, `set-up ${sgk(v)}: above the line, paid back`, `font-size="10.5" fill="${COL.red}"`); }
    const ends = [];
    ["wo", "wi"].forEach(k => {
      const lo = val(k, "low"), hi = val(k, "high"), b = val(k, "base");
      const up = lo.map((x, i) => Math.max(x, hi[i])), dn = lo.map((x, i) => Math.min(x, hi[i]));
      s += `<polygon points="${up.map((v, i) => `${X_(i).toFixed(1)},${Y(v).toFixed(1)}`).concat(dn.map((v, i) => `${X_(i).toFixed(1)},${Y(v).toFixed(1)}`).reverse()).join(" ")}" fill="${PCOL[k]}" opacity=".12"/>`;
      s += `<polyline points="${b.map((v, i) => `${X_(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${PCOL[k]}" stroke-width="3"/>` +
           b.map((v, i) => `<circle cx="${X_(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.6" fill="${PCOL[k]}"/>`).join("");
      ends.push({ k, y: Y(b[n - 1]) });
    });
    if (Math.abs(ends[0].y - ends[1].y) < 30) { const [a, b] = ends[0].y < ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]]; const m = (a.y + b.y) / 2; a.y = m - 15; b.y = m + 15; }
    ends.forEach(({ k, y }) => (s += T(W - Rr + 10, y - 2, PLAB[k][0], `font-size="11.5" font-weight="700" fill="${PCOL[k]}"`) + T(W - Rr + 10, y + 11, PLAB[k][1], `font-size="11.5" font-weight="700" fill="${PCOL[k]}"`)));
    for (let i = 0; i < n; i++) s += `<rect class="hz" data-i="${i}" x="${(X_(i) - (W - L - Rr) / (n - 1) / 2).toFixed(1)}" y="${Tp}" width="${((W - L - Rr) / (n - 1)).toFixed(1)}" height="${H - Tp - B}" fill="transparent"/>`;
    svg.innerHTML = s;
    svg._pnl = { X, metric, xOf: X_, yOf: Y };
  }
  function pnlHover(svg, tip, host) {
    svg.addEventListener("mousemove", e => {
      const r = e.target.closest?.(".hz"), d = svg._pnl; if (!r || !d) { tip.style.display = "none"; return; }
      const i = +r.dataset.i, f = PMET[d.metric][2], a = f(d.X.wo.base.years[i]), b = f(d.X.wi.base.years[i]);
      const box = host.getBoundingClientRect(), sb = svg.getBoundingClientRect(), k = sb.width / svg.viewBox.baseVal.width, kk = box.width / host.offsetWidth;
      tip.innerHTML = `<b>Year ${i + 1} · ${PMET[d.metric][1].toLowerCase()}</b><br>Without AI-assisted site selection ${sgd(a)}<br>With AI-assisted site selection ${sgd(b)}<br>Difference <b>${b - a >= 0 ? "+" : "−"}${sgd(Math.abs(b - a)).replace("−", "")}</b>`;
      tip.style.left = `${(sb.left - box.left + d.xOf(i) * k) / kk}px`; tip.style.top = `${(sb.top - box.top + Math.min(d.yOf(a), d.yOf(b)) * k - 8) / kk}px`; tip.style.display = "block";
    });
    svg.addEventListener("mouseleave", () => (tip.style.display = "none"));
  }
  function pnlBridge(X, sites) {
    const a = X.wo.base.total, b = X.wi.base.total, n = X.wo.base.years.length;
    const rows = [["New-store sales", t => t.revNew], ["− Sales displaced from nearby Chagee outlets", t => -t.revMoved],
      ["= Net additional network sales (incremental revenue)", t => t.netRev, "tot"],
      ["− New-store ingredients, packaging and delivery commission", t => -(t.cogs + t.delivery)],
      ["− New-store labour (same staffing rule)", t => -t.labour], ["− Machines, rent, utilities, maintenance", t => -(t.machine + t.rent + t.utilities + t.maint)],
      ["+ Nearby outlets' variable costs saved (their rent and staff stay)", t => t.revMoved - t.lostContrib],
      ["− AI recurring cost (allocated)", t => -t.aiRec],
      ["= Incremental operating profit, before depreciation, interest and tax", t => t.opProfit, "tot"]];
    const c = v => `<td class="${v < 0 ? "neg" : ""}">${sgk(v)}</td>`;
    return `<tr><th>${n} years, base scenario</th><th title="${Math.round(sites.wo.sells)} sold − ${Math.round(sites.wo.moved)} moved a day">Without AI · +${Math.round(sites.wo.sells - sites.wo.moved)}</th><th title="${Math.round(sites.wi.sells)} sold − ${Math.round(sites.wi.moved)} moved a day">With AI · +${Math.round(sites.wi.sells - sites.wi.moved)}</th><th>Difference</th></tr>` +
      rows.map(([l, f, cls]) => `<tr class="${cls || ""}"><td>${l}</td>${c(f(a))}${c(f(b))}${c(f(b) - f(a))}</tr>`).join("");
  }
  function pnlResults(X) {
    const a = X.wo.base, b = X.wi.base, n = a.years.length;
    const up = v => X.wi[v].total.opProfit - X.wo[v].total.opProfit;
    return `<div class="bc pnlres"><div class="k">${n}-year results · base · illustrative</div>
      <p class="big2"><span>Revenue uplift</span><b>${sgk(b.total.netRev - a.total.netRev)}</b></p>
      <p class="big2"><span>Operating-profit uplift</span><b>${sgk(b.total.opProfit - a.total.opProfit)}</b></p>
      <p class="big2"><span>Payback, with AI</span><b>${yrs(b.payback) || `beyond year ${n}`}</b></p>
      <p class="big2"><span>Payback, without AI</span><b>${yrs(a.payback) || `beyond year ${n}`}</b></p>
      <p class="rng">Cumulative cash flow after the ${sgk(a.invest)} set-up (AI site ${sgk(b.invest)}). AI cost ${X.aiPayback == null ? `not repaid within ${n} years` : `repaid in ${yrs(X.aiPayback)}`}. Volume range: ${sgk(Math.min(up("low"), up("high")))} to ${sgk(Math.max(up("low"), up("high")))} profit uplift.</p></div>`;
  }
  function pnlAssump(E) {
    const nw = `<span class="nw">new</span>`;
    return `<div class="bc"><div class="k">Assumptions · S$ · reused unless marked new</div><ul class="pnlas">
      <li>${E.days} days · S$${E.price.toFixed(2)} a cup, held flat · ingredients and packaging ${pct(1 - E.margin)}</li>
      <li>delivery ${pct(E.delShare)} of cups at ${pct(E.commission)} · wage S$${E.wage.toFixed(2)} an hour, same staffing rule</li>
      <li>rent ${sgd(E.rent)}, utilities ${sgd(E.utilities)}, maintenance ${sgd(E.maint)}${nw} a month · same machines</li>
      <li>year-one ramp-up ${pct(E.ramp[0])}${nw} · growth ${pct(E.growth, 1)}${nw} · cost inflation ${pct(E.inflation, 1)}${nw}</li>
      <li>AI ${sgk(E.aiImpl)} to build, ${sgk(E.aiRec)} a year, ${pct(E.aiShare)} on this outlet${nw} · set-up ${sgk(E.setup)}, outside operating costs</li></ul></div>`;
  }
  function pnlSay(X, sites, who) {
    const a = X.wo.base.total, b = X.wi.base.total, n = X.wo.base.years.length;
    return { wo: `Beside the nearest outlet: <b>+${Math.round(sites.wo.sells - sites.wo.moved)}</b> net cups a day → about <b>${sgk(a.netRev)}</b> of network sales over ${n} years, and <b>${sgk(a.opProfit)}</b> operating profit: ${a.opProfit < 0 ? "the contribution lost at its neighbours outweighs what it makes." : "its neighbours lose part of it."}`,
             wi: `${who}: <b>+${Math.round(sites.wi.sells - sites.wi.moved)}</b> net cups a day → about <b>${sgk(b.netRev)}</b> and <b>${sgk(b.opProfit)}</b> after the AI costs: <b>${sgk(Math.abs(b.opProfit - a.opProfit))}</b> ${b.opProfit >= a.opProfit ? "more" : "less"} profit than the baseline. Illustrative, not a proven causal gain.` };
  }
  // the printed companion (appendix): defaults, the suggested site
  (function pnlCompanion() {
    const ap = document.getElementById("ap"); if (!ap || !DATA.pnl) return;
    const X = DATA.pnl, say = pnlSay(X, X.sites, "With AI-assisted site selection");
    pnlChart($(ap, ".pxa"), X, "rev"); pnlChart($(ap, ".pxc"), X, "cum");
    $(ap, ".pxb").innerHTML = pnlBridge(X, X.sites);
    $(ap, ".pxs").innerHTML = pnlResults(X) + pnlAssump(PE0) + `<div class="bc"><div class="k">Takeaway</div><p>${say.wo} ${say.wi}</p></div>`;
  })();

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
      if (e.target.closest("[data-act=pnl]")) { pnlOpen(); return; }
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
        <div class="peak">Peak hour ${hourLabel(pf.peak)}: <b>${Math.round(pf.peakCups)} cups</b> → <b>${pf.peakStaff} ${pf.peakStaff === 1 ? "person" : "people"}</b> on today's counter (counter pages, appendix).</div>
        <button class="btn primary screenonly pnlb" data-act="pnl" title="Five years of this outlet here against beside the nearest outlet">What does this mean for P&amp;L?</button>`;
      if (pnlOn) pnlRender();
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
    const wi = $(p.closest(".slide"), ".takeaway");                   // the button sits on the takeaway that names both sites
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
    // "What does this mean for P&L?": the map gives way to five years of the same outlet at two sites, in the same panel;
    // without AI = beside the existing outlet nearest the selected site (as in the band), with AI = the selected site
    const slideEl = p.closest(".slide"), pside = $(side, ".pnlside"), pctl = $(p, ".pnlctl"), psvg = $(p, ".pnlsvg"), ptitle = $(p, ".ptitle");
    const bandSpans = $$(slideEl, ".vs > div > span:not(.lab)"), bandOrig = bandSpans.map(x => x.innerHTML), titleOrig = ptitle.textContent;
    let pnlOn = false, pmet = "rev", pE = { ...PE0, ramp: [...PE0.ramp] };
    pnlHover(psvg, $(p, ".pnltip"), $(p, ".pnlv"));
    const PSL = [["ramp1", "Ramp-up, year one", PR.ramp_up.range, 0.05, () => pE.ramp[0], v => pct(v), v => (pE.ramp = [v, ...PE0.ramp.slice(1)])],
      ["growth", "Demand growth", PR.demand_growth.range, 0.005, () => pE.growth, v => pct(v, 1), v => (pE.growth = v)],
      ["inflation", "Cost inflation", PR.cost_inflation.range, 0.005, () => pE.inflation, v => pct(v, 1), v => (pE.inflation = v)],
      ["aiImpl", "AI build cost", PR.ai_implementation_cost.range, 5000, () => pE.aiImpl, v => sgk(v), v => (pE.aiImpl = v)],
      ["aiRec", "AI a year", PR.ai_recurring_per_year.range, 1000, () => pE.aiRec, v => sgk(v), v => (pE.aiRec = v)],
      ["aiShare", "AI on this outlet", PR.ai_cost_share_to_outlet.range, 0.05, () => pE.aiShare, v => pct(v), v => (pE.aiShare = v)]];
    function pnlSitesNow() {
      const f = Site.forecast(M, pin), j = GEO.outlets.map(([x, y], k) => [Math.hypot(x - pin.x, y - pin.y), k]).sort((a, b) => a[0] - b[0])[0][1];
      const fN = Site.forecast(M, { x: GEO.outlets[j][0] + 3, y: GEO.outlets[j][1] });
      return { wo: { sells: fN.cups, moved: fN.cannibal }, wi: { sells: f.cups, moved: f.cannibal }, j };
    }
    function pnlRender() {
      const sites = pnlSitesNow(), X = PNL.compare({ Sim, C, P }, pE, sites.wo, sites.wi), who = userPin ? "Your pin, in place of the AI-suggested site" : "Suggested site 1, with AI-assisted site selection";
      pnlChart(psvg, X, pmet);
      $(p, ".pnlbr").innerHTML = pnlBridge(X, sites);
      $$(pctl, "[data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === pmet));
      if (!pside.dataset.built) {
        pside.dataset.built = 1;
        pside.innerHTML = `<div class="pr"></div><div class="pnltab screenonly"><span class="seg"><button class="btn on" data-t="pa">Assumptions</button><button class="btn" data-t="pt">Test them</button></span><button class="btn pnlfull" data-x="full" title="Every line and assumption of this P&L, in the appendix">Full calculation breakdown →</button></div>` +
          `<div class="pnlsl pt" style="display:none">` +
          PSL.map(([k, lab, [lo, hi], st, get, f]) => `<label>${lab}<span class="val" data-v="${k}">${f(get())}</span><input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${st}" value="${get()}"></label>`).join("") +
          `<button class="btn" data-k="reset" style="grid-column:1/-1;justify-self:start;height:22px;font-size:11px">Reset</button></div><div class="pa"></div>`;
      }
      $(pside, ".pr").innerHTML = pnlResults(X);
      $(pside, ".pa").innerHTML = pnlAssump(pE);
      PSL.forEach(([k, , , , get, f]) => { const el = $(pside, `.val[data-v="${k}"]`); if (el) el.textContent = f(get()); });
      const say = pnlSay(X, sites, who);
      bandSpans[0].innerHTML = `Beside ${oname(sites.j)}, the same outlet: ` + say.wo.replace("Beside the nearest outlet: ", "");
      bandSpans[1].innerHTML = say.wi;
    }
    function pnlOpen() {
      pnlOn = true; p.classList.add("pnl"); slideEl.classList.add("pnlmode"); cmpv.classList.remove("open");
      ptitle.textContent = `Five-year P&L · the same new outlet at two sites · illustrative`;
      pctl.innerHTML = `<span class="seg">${Object.entries(PMET).map(([k, m]) => `<button class="btn" data-m="${k}">${m[0]}</button>`).join("")}</span><button class="btn" data-x="back" title="Back to the map (Esc)">← Back to map</button>`;
      pnlRender();
    }
    function pnlClose() {
      if (!pnlOn) return; pnlOn = false; p.classList.remove("pnl"); slideEl.classList.remove("pnlmode");
      ptitle.textContent = titleOrig; bandSpans.forEach((x, i) => (x.innerHTML = bandOrig[i])); $(p, ".pnltip").style.display = "none";
    }
    pctl.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.x === "back") pnlClose(); else if (b.dataset.m) { pmet = b.dataset.m; pnlRender(); } });
    pside.addEventListener("input", e => { const d = PSL.find(x => x[0] === e.target.dataset?.k); if (!d) return; d[6](+e.target.value); pnlRender(); });
    pside.addEventListener("click", e => { const t = e.target.closest("[data-t]");
      if (e.target.closest("[data-x=full]")) { e.stopPropagation(); e.target.closest("button").blur(); jump = true; show(slides.indexOf(document.getElementById("ap"))); return; }
      if (t) { $$(pside, "[data-t]").forEach(b => b.classList.toggle("on", b === t)); $(pside, ".pa").style.display = t.dataset.t === "pa" ? "" : "none"; $(pside, ".pt").style.display = t.dataset.t === "pt" ? "" : "none"; return; }
      if (e.target.closest("[data-k=reset]")) { pE = { ...PE0, ramp: [...PE0.ramp] };
      PSL.forEach(([k, , , , get]) => { const i = $(pside, `input[data-k="${k}"]`); if (i) i.value = get(); }); pnlRender(); } });
    addEventListener("keydown", e => { if (e.key === "Escape" && pnlOn && slides[cur] === slideEl) { e.preventDefault(); e.stopPropagation(); pnlClose(); } }, true);
    slideEl._pnl = () => { if (!pnlOn) pnlOpen(); };                 // the appendix P&L page's Back to P&L: the view as it was left
    S.hooks.push(k => { step = k; if (M) draw(); });
    printers.push(() => { pnlClose(); pE = { ...PE0, ramp: [...PE0.ramp] }; pmet = "rev"; $$(pside, "input").forEach(i => { const d = PSL.find(x => x[0] === i.dataset.k); if (d) i.value = d[4](); }); });
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
  // DATA.grid); the cannibalisation card switches between slide 10's two sites (DATA.site).
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
    // cannibalisation: the app-search site against a store beside the outlet nearest it (slide 10)
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
        `<p style="font:10.5px/1.35 var(--sans);color:${COL.taupe};margin:3px 0 0">Cups a day, forecast ± average miss. Break-even ≈ ${n(beCups)} at Singapore costs (the pin-to-profit slide), a stand-in. Picks ≥ ${RING} km apart.</p>` +
        `<button class="btn use screenonly" data-act="use">Send site 1 to pin to profit →</button>`;
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
    const IN = [["cups", "Cups a day (the benefit slide's range)", Math.round(e0.cups.lo), Math.round(e0.cups.hi), 1, v => `${Math.round(v)}`],
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
        `<dl><dt>Site score</dt><dd>${Math.round(score())} / 100 (four scores)</dd>` +
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

  /* ---------------------------------------------------------------- 8A-8D new-market worked example (sim/newmarket.js; A$) */
  (function newMarket() {
    const NM = window.ChageeNewMarket, NMD = DATA.newMarket, NMR = RAW.new_market; if (!NM || !NMD) return;
    const AREAS = NMR.areas.value, FEAT = NMR.features.value, R = NMD.runs, WTS = NMD.dayWeights, ERR = NMR.forecast_error.value;
    const LAB = { all_hand: "Human-only", heading: "Machine-made drink" }, SETS = NMR.setups.value;
    const aud = x => `${x < 0 ? "−" : ""}A$${Math.round(Math.abs(x)).toLocaleString("en-AU")}`;
    const area = id => AREAS.find(a => a.id === id);
    const errLab = e => (e === 0 ? "exact" : `${e > 0 ? "+" : "−"}${pct(Math.abs(e))}`);
    const FC = [COL.navy, COL.red, COL.gold, COL.blue, "#2F6B45", COL.taupe, "#9A7FB5"];
    const NB = { pilot: NMD.pilot, fns: [] };                        // the pilot area, shared by 8B, 8C and 8D
    const setPilot = id => { if (id === NB.pilot) return; NB.pilot = id; NB.fns.forEach(f => f()); };
    const stepHook = (id, f) => steppers.filter(x => x.p.closest("#" + id)).forEach(({ S }) => S.hooks.push(f));
    const fmtF = (k, v) => k === "rent_month" ? aud(v) : k === "transit_index" ? v.toFixed(2) : k.endsWith("_k") ? `${v}k` : `${v}`;
    const slider = (k, lab, [lo, hi], step, val, f) =>
      `<label>${lab}<span class="val" data-v="${k}">${f(val)}</span><input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${val}"></label>`;

    // 8A: the profile table, columns revealed step by step
    const s1 = document.getElementById("n1");
    if (s1) {
      const tb = $(s1, ".nmprof");
      tb.innerHTML = `<tr><th>Feature</th><th class="c1">Stands in for</th>${AREAS.map(a => `<th class="c2" title="${a.name}">${a.id}</th>`).join("")}<th class="c3">A real value would come from</th><th class="c3">Value here</th></tr>` +
        FEAT.map(f => `<tr><td><b>${f.label}</b></td><td class="c1"><span class="chip px">proxy</span> ${f.proxy_for}</td>${AREAS.map(a => `<td class="c2">${fmtF(f.key, a[f.key])}</td>`).join("")}` +
          `<td class="c3">${f.planned_source}</td><td class="c3"><span class="chip as">assumption</span></td></tr>`).join("");
      $(s1, ".nmareas").innerHTML = `<b>Areas (archetypes):</b> ` + AREAS.map(a => `${a.id} ${a.name}`).join(" · ");
      $(s1, ".nmexcl").innerHTML = NMR.excluded.value.map(x => `<li><b>${x.label}</b>: ${x.why}</li>`).join("");
      stepHook("n1", k => (tb.dataset.k = k));
    }

    // 8B: suitability ranking, weights, sensitivity, first or next opening
    const s2 = document.getElementById("n2");
    if (s2) {
      const W0 = NMR.weights.value, st = { w: { ...W0 }, next: false }, svg = $(s2, ".nmbars"), wr = NMR.weights.range;
      const short = { residents_k: "Residents", workers_k: "Workers", students_k: "Students", income_index: "Income", transit_index: "Transit", competitors: "Competitors", rent_month: "Rent" };
      $(s2, ".nmw").innerHTML = `<span class="lab" style="grid-column:1/-1">Weights</span>` + FEAT.map(f => slider(f.key, short[f.key], wr, 0.25, st.w[f.key], v => (+v).toFixed(2))).join("") +
        `<button class="btn" data-k="reset" style="grid-column:1/-1;justify-self:start;height:24px;font-size:11px">Reset weights</button>`;
      $(s2, ".nmleg").innerHTML = FEAT.map((f, i) => `<span style="white-space:nowrap"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${FC[i]};margin-right:4px"></span>${short[f.key]}</span>`).join(" · ") + ` · bar = score; rank range across the weight check`;
      const seg = $(s2, ".nmopen");
      function draw() {
        const S = NM.score(RAW, st.w), sens = NM.sensitivity(RAW, st.w), pilot = S[0].id, can = NM.cannibal(RAW, st.next ? pilot : null);
        seg.innerHTML = `<button class="btn${st.next ? "" : " on"}" data-n="0">First opening</button><button class="btn${st.next ? " on" : ""}" data-n="1">Next, after a pilot in ${pilot}</button>`;
        const x0 = 196, bw = 250, rh = 40;
        let s = "";
        S.forEach((o, i) => {
          const y = 8 + i * rh; let x = x0;
          s += T(0, y + 14, `${o.id} · ${o.name}`, `font-size="12.5" font-weight="600" fill="${COL.ink}"`);
          const b = sens.byArea[o.id];
          s += T(0, y + 28, `rank ${b.best === b.worst ? b.best : `${b.best}–${b.worst}`} across ${sens.variants} weightings · first in ${b.top}`, `font-size="10" fill="${COL.taupe}"`);
          s += `<rect x="${x0}" y="${y + 6}" width="${bw}" height="18" rx="3" fill="${COL.cream}"/>`;
          FEAT.forEach((f, j) => { const w = bw * o.parts[f.key] / 100; if (w > 0.2) s += `<rect x="${x.toFixed(1)}" y="${y + 6}" width="${w.toFixed(1)}" height="18" fill="${FC[j]}"/>`; x += w; });
          s += T(x0 + bw + 8, y + 20, o.score.toFixed(0), `font-size="15" font-weight="700" fill="${COL.ink}"`);
          const c = can[o.id], tag = c === null ? "the pilot" : `cannibalisation ${pct(c, c > 0 && c < 0.1 ? 1 : 0)}`;
          s += T(x0 + bw + 40, y + 20, tag, `font-size="10.5" fill="${c ? COL.red : COL.taupe}"${c === null ? ' font-weight="700"' : ""}`);
        });
        svg.innerHTML = s;
        $(s2, ".nmsens").innerHTML = `<div class="k">Weight check · ${sens.variants} weightings</div><p>Each weight dropped, then doubled, one at a time. ` +
          S.map(o => { const b = sens.byArea[o.id]; return `<b>${o.id}</b> first in ${b.top}`; }).join(", ") + `. ` +
          (S.filter(o => sens.byArea[o.id].top > 0).length > 1 ? `The top spot is not robust: treat the leaders as a shortlist.` : `${S[0].id} stays first in every weighting.`) + `</p>`;
        $(s2, ".nmwp").innerHTML = `<div class="k">Weights used</div><p>` + FEAT.map(f => `${short[f.key]} ${(+st.w[f.key]).toFixed(2)}`).join(" · ") + `. Competitors and rent count against.</p>`;
        setPilot(pilot);
      }
      s2.addEventListener("input", e => { const k = e.target.dataset?.k; if (!k || !(k in st.w)) return;
        st.w[k] = +e.target.value; $(s2, `.val[data-v="${k}"]`).textContent = (+e.target.value).toFixed(2); draw(); });
      s2.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.n != null) { st.next = b.dataset.n === "1"; draw(); }
        if (b.dataset.k === "reset") { st.w = { ...W0 }; $$(s2, ".nmw input").forEach(i => { i.value = st.w[i.dataset.k]; $(s2, `.val[data-v="${i.dataset.k}"]`).textContent = (+i.value).toFixed(2); }); draw(); } });
      stepHook("n2", k => { if (k < 4 && st.next) { st.next = false; draw(); } });
      printers.push(() => { st.w = { ...W0 }; st.next = false; $$(s2, ".nmw input").forEach(i => (i.value = st.w[i.dataset.k])); draw(); });
      draw();
    }

    // 8C: which setup, demand scenarios through the counter simulation; AI layer in the band
    const s3 = document.getElementById("n3");
    const E0 = NM.econ(RAW), cst = { scen: "base", day: DAY0, err: "0", wage: E0.wage, machine: E0.machineMonth };
    const econ = () => ({ ...E0, wage: cst.wage, machineMonth: cst.machine });
    const rent = id => area(id || NB.pilot).rent_month;
    const contrib = (r, k, id) => NM.money(r, econ(), rent(id), R.setups[k].units, P.days).contribution;
    const beOf = (k, id) => NM.breakEven({ Sim, C, RAW, P }, econ(), rent(id), k);
    if (s3) {
      const ctl = $(s3, ".nmctl"), svg = $(s3, ".nmchart"), band = $(s3, ".nmband");
      const segs = (k, opts) => `<span class="seg">${opts.map(([v, l]) => `<button class="btn" data-f="${k}" data-v="${v}">${l}</button>`).join("")}</span>`;
      ctl.innerHTML = `<div class="row"><span class="lab">Demand</span>${segs("scen", [["low", "Low"], ["base", "Base"], ["high", "High"]])}</div>` +
        `<div class="row"><span class="lab">Day</span>${segs("day", DAYS.map(d => [d, DAY_LABEL[d].replace(" day", "")]))}</div>` +
        `<div class="row"><span class="lab">Forecast</span>${segs("err", ERR.map(e => [String(e), errLab(e)]))}</div>` +
        slider("wage", "Wage, A$ an hour", NMR.wage_per_hour.range, 0.5, cst.wage, v => `A$${(+v).toFixed(2)}`) +
        slider("machine", "Machine unit, A$ a month", NMR.machine_cost_per_unit_per_month.range, 50, cst.machine, v => aud(+v));
      function chart() {
        const sc = R.setups[SETS[0]].scan.none.map(x => x.ai.cups), W = 600, H = 150, L = 50, Rr = 118, Tp = 10, B = 24;
        const ys = Object.fromEntries(SETS.map(k => [k, R.setups[k].scan.none.map((_, i) => NM.yearAvg(WTS, d => contrib(R.setups[k].scan[d][i].ai, k)))]));
        const all = Object.values(ys).flat(), y0 = Math.min(0, ...all), y1 = Math.max(...all);
        const X = c => L + (c - sc[0]) / (sc[sc.length - 1] - sc[0]) * (W - L - Rr), Y = v => Tp + (y1 - v) / (y1 - y0) * (H - Tp - B);
        let s = `<line x1="${L}" x2="${W - Rr}" y1="${Y(0)}" y2="${Y(0)}" stroke="${COL.ink2}" stroke-width="1"/>` + T(L - 6, Y(0) + 3.5, "A$0", `font-size="9.5" fill="${COL.taupe}" text-anchor="end"`);
        [y1].forEach(v => (s += T(L - 6, Y(v) + 3.5, aud(v), `font-size="9.5" fill="${COL.taupe}" text-anchor="end"`)));
        Object.entries(R.demand).forEach(([n, c]) => { const on = n === cst.scen;
          s += `<line x1="${X(c)}" x2="${X(c)}" y1="${Tp}" y2="${H - B}" stroke="${on ? COL.red : COL.line}" stroke-dasharray="3 3"/>` +
               T(X(c), H - B + 12, `${n} · ${Math.round(c)}`, `font-size="9.5" fill="${on ? COL.red : COL.taupe}" text-anchor="middle"${on ? ' font-weight="700"' : ""}`); });
        s += T((L + W - Rr) / 2, H - 1, "realised cups a day", `font-size="9.5" fill="${COL.taupe}" text-anchor="middle"`);
        const col = { all_hand: COL.red, heading: COL.navy };
        SETS.forEach(k => { const pts = sc.map((c, i) => `${X(c).toFixed(1)},${Y(ys[k][i]).toFixed(1)}`).join(" ");
          s += `<polyline points="${pts}" fill="none" stroke="${col[k]}" stroke-width="2.4"/>` + T(W - Rr + 6, Y(ys[k][ys[k].length - 1]) + 4, LAB[k], `font-size="11" font-weight="600" fill="${col[k]}"`); });
        // where the preferred setup changes along the demand axis, if it does
        const d = sc.map((_, i) => ys[SETS[1]][i] - ys[SETS[0]][i]);
        for (let i = 1; i < d.length; i++) if (d[i - 1] * d[i] < 0) { const c = sc[i - 1] + (sc[i] - sc[i - 1]) * d[i - 1] / (d[i - 1] - d[i]);
          s += `<circle cx="${X(c)}" cy="${Y(ys[SETS[0]][i])}" r="4" fill="${COL.gold}"/>` + T(X(c), Tp + 8, `switch at about ${Math.round(c)}`, `font-size="10" font-weight="700" fill="${COL.ink}" text-anchor="middle"`); }
        svg.innerHTML = s;
        return d;
      }
      function table() {
        const rows = SETS.map(k => { const a = R.setups[k].at[cst.scen][cst.day];
          const line = (nm, r, on) => `<tr class="${on ? "best" : ""}"><td>${nm}</td><td>${r.staff}</td><td>${mmss(r.medianWait)}</td><td>${pct(r.lostShare, 1)}</td><td>${aud(contrib(r, k))}</td></tr>`;
          return `<tr class="grp"><td colspan="5">${LAB[k]} · ${R.setups[k].units ? `${R.setups[k].units} machine units` : "no machines"}</td></tr>` +
            line("Without AI · one crew all day", a.without, false) + ERR.map(e => line(`With AI · forecast ${errLab(e)}`, a.ai[String(e)], String(e) === cst.err)).join(""); }).join("");
        $(s3, ".nmtab").innerHTML = `<tr><th>${DAY_LABEL[cst.day]}, ${cst.scen} demand (${Math.round(R.demand[cst.scen])} cups)</th><th>Peak crew</th><th>Median wait</th><th>Walk away</th><th>A$ a day</th></tr>` + rows;
      }
      function cards(d) {
        const be = SETS.map(k => ({ k, b: beOf(k) }));
        $(s3, ".nmbe").innerHTML = `<div class="k">Break-even, cups a day · area ${NB.pilot}</div><p>` +
          be.map(({ k, b }) => `<b>${LAB[k]}</b> ${b.withAI} with AI, ${Math.round(b.withoutAI)} without`).join("; ") +
          `. Normal day, no walk-aways; low scenario ${Math.round(R.demand.low)}.</p>`;
        const w = NM.worst(R, econ(), rent(), WTS, P.days), best = SETS.reduce((a, b) => (w[b] > w[a] ? b : a));
        const fm = NM.flipMachine(R, econ(), rent(), WTS, P.days), fw = NM.flipWage(R, econ(), rent(), WTS, P.days, NMR.wage_per_hour.range);
        const win = n => { const ys = SETS.map(k => NM.yearAvg(WTS, dd => contrib(R.setups[k].at[n][dd].ai["0"], k))); return LAB[SETS[ys[1] > ys[0] ? 1 : 0]].toLowerCase(); };
        $(s3, ".nmpref").innerHTML = `<div class="k">Preferred setup · worst case</div><p>Worst year-average day, any scenario and forecast error: ` +
          SETS.map(k => `${LAB[k].toLowerCase()} <b>${aud(w[k])}</b>`).join(", ") + `. <b>${LAB[best]}</b> is safer; ` +
          (fm ? `the two cross at a machine unit of about <b>${aud(fm)}</b> a month (now ${aud(cst.machine)})` : "they do not cross on the machine cost") + `; ` +
          (fw ? `on the wage, at about A$${fw.toFixed(2)} an hour.` : `they do not cross within the wage range.`) +
          (() => { const ws = ["low", "base", "high"].map(win); return ws.every(x => x === ws[0]) ? ` With an exact forecast, ${ws[0]} leads at low, base and high demand.`
            : ` With an exact forecast: low ${ws[0]}, base ${ws[1]}, high ${ws[2]}.`; })() + `</p>`;
      }
      function bandFill() {
        const cell = (k, w) => { const a = R.setups[k].at[cst.scen][cst.day], r = w === "without" ? a.without : a.ai[cst.err];
          const v = `${r.staff} ${r.staff === 1 ? "person" : "people"} · away <b>${pct(r.lostShare, 1)}</b> · wait ${mmss(r.medianWait)} · ${aud(contrib(r, k))}/day`;
          if (w === "without") return `<b>${LAB[k]}</b>: ${v}`;
          const o = a.without, ds = r.staff - o.staff, dc = contrib(r, k) - contrib(o, k);
          const why = ds === 0 && Math.abs(dc) < 0.5 ? "same crew: the forecast changes nothing here"
            : `${ds ? `${ds > 0 ? "+" : "−"}${Math.abs(ds)} at the peak, ` : ""}${r.labourHours - o.labourHours >= 0 ? "+" : "−"}${Math.abs(r.labourHours - o.labourHours)} staff hours, ${dc >= 0 ? "+" : "−"}${aud(Math.abs(dc))}`;
          return `<b>${LAB[k]}</b> (forecast ${errLab(+cst.err)}): ${v} <small class="aid">· ${why}</small>`; };
        $(band, ".ai-without").innerHTML = SETS.map(k => cell(k, "without")).join("<br>");
        $(band, ".ai-with").innerHTML = SETS.map(k => cell(k, "with")).join("<br>");
        $(s3, ".ai-day").textContent = `${DAY_LABEL[cst.day]}, ${cst.scen} demand`;
        $(s3, ".nmctlp").innerHTML = `<div class="k">Shown</div><p>${DAY_LABEL[cst.day]}, ${cst.scen} demand, forecast ${errLab(+cst.err)} in the band. Wage A$${cst.wage}, machine unit ${aud(cst.machine)} a month, rent ${aud(rent())} a month (${area(NB.pilot).name}).</p>`;
      }
      function draw() {
        $$(ctl, "[data-f]").forEach(b => b.classList.toggle("on", String(cst[b.dataset.f]) === b.dataset.v));
        cards(chart()); table(); bandFill();
      }
      ctl.addEventListener("click", e => { const b = e.target.closest("[data-f]"); if (!b) return; cst[b.dataset.f] = b.dataset.v; draw(); });
      ctl.addEventListener("input", e => { const k = e.target.dataset?.k; if (!k) return; cst[k] = +e.target.value;
        $(ctl, `.val[data-v="${k}"]`).textContent = k === "wage" ? `A$${cst.wage.toFixed(2)}` : aud(cst.machine); draw(); });
      NB.fns.push(draw);
      printers.push(() => { Object.assign(cst, { scen: "base", day: DAY0, err: "0", wage: E0.wage, machine: E0.machineMonth });
        $$(ctl, "input").forEach(i => (i.value = cst[i.dataset.k])); draw(); });
      draw();
    }

    // 8D: try a pilot result against the evidence rules
    const s4 = document.getElementById("n4");
    if (s4) {
      const Qn = NMD.quote, rb = Qn.robust, D = R.demand, target = SB.walkaway_target.value, weeks = NMR.trigger_weeks.value;
      const t0 = { cups: Math.round(D.base), away: 0, quote: E0.machineMonth }, tr = { ...t0 };
      const box = $(s4, ".nmtry");
      box.innerHTML = `<span class="lab">Try a pilot result · illustrative</span>` +
        slider("cups", "Cups a day, observed", [Math.round(D.low / 2), Math.round(D.high * 1.2)], 5, tr.cups, v => `${v}`) +
        slider("away", "Peak-hour walk-aways", [0, 0.2], 0.005, tr.away, v => pct(+v, 1)) +
        slider("quote", "Machine quote, A$ a unit a month", NMR.machine_cost_per_unit_per_month.range, 50, tr.quote, v => aud(+v));
      function draw() {
        const be = beOf(rb).withAI, nx = Qn.next.slice().sort((a, b) => b.score - a.score)[0];
        const c = NM.cannibal(RAW, NB.pilot)[nx.id] ?? 0, beN = beOf(rb, nx.id).withAI, fm = NM.flipMachine(R, econ(), rent(), WTS, P.days);
        const T_ = (cls, h, p) => `<p class="t ${cls}"><i></i><span><b>${h}</b> ${p}</span></p>`;
        const keep = tr.cups >= be, staff = tr.away > target, flip = fm != null && tr.quote > fm, open = keep && tr.cups * (1 - c) >= beN;
        $(s4, ".nmtrig").innerHTML = `<div class="k">Evidence to act · held ${weeks} weeks in a row</div><p class="printonly" style="font-size:10.5px;color:${COL.taupe}">Example result, illustrative: ${tr.cups} cups a day, ${pct(tr.away, 1)} peak walk-aways, a quote of ${aud(tr.quote)}.</p>` +
          T_(keep ? "go" : "warn", keep ? "Keep the pilot running." : "Below break-even.", `${tr.cups} cups a day against about ${be} (${LAB[rb].toLowerCase()}, ${area(NB.pilot).name}).`) +
          T_(staff ? "warn" : "", staff ? "Add staff in the busy hours." : "No extra staff.", `Peak walk-aways ${pct(tr.away, 1)} against the ${pct(target)} limit.`) +
          T_(flip ? "warn" : "go", flip ? "Revisit the setup: human-only." : `Keep ${LAB[rb].toLowerCase()}.`, `Quote ${aud(tr.quote)} against the flip at about ${fm ? aud(fm) : "–"} a month.`) +
          T_(open ? "go" : "", open ? `Open the next outlet, ${area(nx.id).name}.` : "Not yet another outlet.", `It keeps ${Math.round(tr.cups * (1 - c))} cups after ${pct(c, 1)} cannibalisation, against about ${beN} to break even.`);
      }
      box.addEventListener("input", e => { const k = e.target.dataset?.k; if (!k) return; tr[k] = +e.target.value;
        $(box, `.val[data-v="${k}"]`).textContent = k === "away" ? pct(tr.away, 1) : k === "quote" ? aud(tr.quote) : `${tr.cups}`; draw(); });
      stepHook("n4", k => ($(s4, ".nmmeas").dataset.k = k));
      NB.fns.push(draw);
      printers.push(() => { Object.assign(tr, t0); $$(box, "input").forEach(i => (i.value = tr[i.dataset.k])); draw(); });
      draw();
    }
  })();

  /* ---------------------------------------------------------------- M1-M3 members, candidate chapter (sim/members.js) */
  (function members() {
    const MB = window.ChageeMembers, MR = RAW.members, MD = DATA.members; if (!MB || !MD) return;
    const SC = MR.scenarios.value, SD = MR.slider_defaults.value, SR = MR.slider_ranges.value, NR = MR.rounds.value, LV = MB.levers(RAW);
    const GREEN = "#2F6B45", RX = MR.example_interest.value, f2 = x => x.toFixed(2);
    const MBS = { p: SD.p, k: SD.k, z0: SD.z0, fns: [] };                 // the model state M1 sets and M2 reads
    const setMB = o => { Object.assign(MBS, o); MBS.fns.forEach(f => f()); };
    const ends = (p, k, z0) => MB.rounds(z0, p, k, 60)[60];
    function rounds(svg, path, eq) {
      const vb = svg.viewBox.baseVal, W = vb.width, H = vb.height, L = 34, R = 10, Tp = 10, B = 24, N = path.length - 1;
      const X = i => L + i / N * (W - L - R), Y = v => Tp + (1 - v) * (H - Tp - B), up = path[N] > 0.01;
      let s = [0, 0.5, 1].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v ? COL.line : COL.ink2}"/>` + T(L - 5, Y(v) + 3.5, pct(v), `font-size="10" fill="${COL.taupe}" text-anchor="end"`)).join("");
      s += T((L + W - R) / 2, H - 4, "adoption round", `font-size="9.5" fill="${COL.taupe}" text-anchor="middle"`);
      if (eq) [["low", "z′", COL.ink], ["high", "z″", GREEN]].forEach(([q, l, c]) => (s += `<line x1="${L}" x2="${W - R}" y1="${Y(eq[q])}" y2="${Y(eq[q])}" stroke="${c}" stroke-dasharray="4 4" opacity=".7"/>` + T(W - R, Y(eq[q]) - 3, `${l} ${pct(eq[q])}`, `font-size="10" fill="${c}" text-anchor="end"`)));
      s += `<polyline points="${path.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${up ? GREEN : COL.red}" stroke-width="2.6"/>` +
           path.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.8" fill="${up ? GREEN : COL.red}"/>`).join("");
      svg.innerHTML = s;
    }

    // M1: one customer's rule, then the equilibrium curve, the crossings and the rounds
    const m1 = document.getElementById("m1");
    if (m1) {
      const panel = $(m1, ".panel"), S = panel.closest(".slide")._stepper, ctl = $(m1, ".mbctl"), big = $(m1, ".mbbig");
      let step = S ? S.cur : 5;
      const eqs = $$(m1, ".mbeq .e");
      eqs[0].innerHTML = `Join when <b>perceived benefit ≥ effort</b>`;
      eqs[1].innerHTML = `One customer: <b>r × k × z ≥ p</b>`;
      eqs[2].innerHTML = `Equilibrium, interest r = 1 − x across customers: <b>p = k z (1 − z)</b>`;
      const SL = [["p", "Effort score, p", 0.01, f2, "big"], ["k", "Value of friends, k", 0.05, f2, ""], ["z0", "Starting participation, z0", 0.01, v => pct(v), ""]];
      ctl.innerHTML = `<span class="lab">Effort of joining or progressing</span>` +
        SL.map(([k, lab, st, f, cls], i) => (i === 1 ? `<div class="sep"></div>` : "") + `<label class="${cls}">${lab}<span class="val" data-v="${k}">${f(MBS[k])}</span><input type="range" data-k="${k}" min="${SR[k][0]}" max="${SR[k][1]}" step="${st}" value="${MBS[k]}"></label>` +
          (i === 0 ? `<p class="scale">An illustrative index from none to one: one is the whole benefit a fully interested customer gets with every friend on (k = 1). Not money, not a Chagee metric.</p>` : "")).join("") +
        `<button class="btn" data-k="reset" style="height:24px;font-size:11px">Reset</button>`;
      function draw() {
        const { p, k, z0 } = MBS, eq = MB.equilibria(p, k), kd = MB.kind(p, k), W = 560, H = 250, L = 42, R = 14, Tp = 14, B = 30;
        const ym = Math.max(k / 4 * 1.3, p * 1.15, step < 3 ? RX * k * 1.05 : 0), X = z => L + z * (W - L - R), Y = v => Tp + (1 - v / ym) * (H - Tp - B);
        let s = `<defs><marker id="mba" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L6 3L0 6z" fill="context-stroke"/></marker></defs>`;
        s += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="${COL.ink2}"/><line x1="${L}" x2="${L}" y1="${Tp}" y2="${Y(0)}" stroke="${COL.line}"/>` +
          [0, 0.25, 0.5, 0.75, 1].map(z => T(X(z), H - B + 14, pct(z), `font-size="10.5" fill="${COL.taupe}" text-anchor="middle"`)).join("") +
          T((L + W - R) / 2, H - 3, "z, share of a customer's friends participating", `font-size="10.5" fill="${COL.taupe}" text-anchor="middle"`) +
          `<text transform="translate(12 ${(Tp + H - B) / 2}) rotate(-90)" font-size="10.5" fill="${COL.taupe}" text-anchor="middle">benefit and effort, index</text>`;
        // one customer's benefit, r k z: the subject of steps one and two, greyed once the equilibrium curve appears
        const zi = p / (RX * k);
        const ze = Math.min(1, ym / (RX * k));                            // clipped where it leaves the chart
        s += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(ze)}" y2="${Y(RX * k * ze)}" stroke="${step < 3 ? COL.ink2 : "#B9B2A6"}" stroke-width="${step < 3 ? 2.4 : 1.6}"${step < 3 ? "" : ' stroke-dasharray="5 4"'}/>` +
             T(X(ze) - 4, Y(RX * k * ze) + (ze < 1 ? 14 : -6), `one customer, r = ${RX}: benefit r k z`, `font-size="10.5" fill="${step < 3 ? COL.ink : COL.taupe}" text-anchor="end"`);
        if (step < 3 && zi <= 1) s += `<circle cx="${X(zi)}" cy="${Y(p)}" r="5" fill="${COL.gold}"/>` + `<line x1="${X(zi)}" x2="${X(zi)}" y1="${Y(p)}" y2="${Y(0)}" stroke="${COL.gold}" stroke-dasharray="3 3"/>` +
             T(X(zi) + 7, Y(p) + 16, `joins once ${pct(zi)} of friends are on`, `font-size="11" font-weight="700" fill="${COL.ink}"`);
        if (step >= 3) {
          if (step >= 4 && eq && kd === "two") s += `<rect x="${X(eq.low)}" y="${Tp}" width="${X(eq.high) - X(eq.low)}" height="${Y(0) - Tp}" fill="${GREEN}" opacity=".08"/>`;
          s += `<polyline points="${Array.from({ length: 61 }, (_, i) => { const z = i / 60; return `${X(z).toFixed(1)},${Y(k * z * (1 - z)).toFixed(1)}`; }).join(" ")}" fill="none" stroke="${COL.navy}" stroke-width="3"/>` +
               `<circle cx="${X(0.5)}" cy="${Y(k / 4)}" r="3" fill="${COL.navy}"/>` + T(X(0.5), Y(k / 4) - 7, `equilibrium curve k z (1 − z) · peak k/4 = ${f2(k / 4)}`, `font-size="10.5" font-weight="600" fill="${COL.navy}" text-anchor="middle"`);
        }
        s += `<line x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}" stroke="${COL.red}" stroke-width="2" stroke-dasharray="6 4"/>` + T(L + 4, Y(p) - 5, `effort p = ${f2(p)}`, `font-size="11" font-weight="700" fill="${COL.red}"`);
        if (step >= 4) {
          const ar = (a, b, c) => `<line x1="${X(a)}" x2="${X(b)}" y1="${Y(0) - 9}" y2="${Y(0) - 9}" stroke="${c}" stroke-width="2" marker-end="url(#mba)"/>`;
          if (kd === "two") {
            [["low", "tipping point z′", COL.ink, "#fff"], ["high", "stable level z″", GREEN, GREEN]].forEach(([q, lab, c, fill], i) => { const z = eq[q];
              s += `<line x1="${X(z)}" x2="${X(z)}" y1="${Y(p)}" y2="${Y(0)}" stroke="${c}" stroke-dasharray="2 3"/><circle cx="${X(z)}" cy="${Y(p)}" r="6" fill="${fill}" stroke="${c}" stroke-width="2.4"/>` +
                   T(X(z), Y(0) - 18 - (i ? 0 : 13), `${lab} ${pct(z)}`, `font-size="11" font-weight="700" fill="${c}" text-anchor="middle"`); });
            s += ar(eq.low * 0.8, eq.low * 0.2, COL.red) + ar(eq.low + (eq.high - eq.low) * 0.25, eq.low + (eq.high - eq.low) * 0.75, GREEN) + ar(eq.high + (1 - eq.high) * 0.85, eq.high + (1 - eq.high) * 0.2, COL.ink2);
          } else if (kd === "merged") {
            s += `<circle cx="${X(0.5)}" cy="${Y(p)}" r="6" fill="#fff" stroke="${COL.red}" stroke-width="2.4"/>` + T(X(0.5), Y(0) - 18, "the two points merge at 50%: a knife-edge", `font-size="11" font-weight="700" fill="${COL.red}" text-anchor="middle"`) + ar(0.4, 0.1, COL.red);
          } else s += T((L + W - R) / 2, Y(0) - 18, `effort above the peak (${f2(k / 4)}): no positive equilibrium, participation falls to zero`, `font-size="11" font-weight="700" fill="${COL.red}" text-anchor="middle"`) + ar(0.7, 0.3, COL.red);
        }
        if (step >= 5) s += `<path d="M${X(z0)} ${Y(0) + 2} l-6 9 h12 z" fill="${COL.gold}"/>` + T(X(z0), Y(0) + 23, "", "");
        big.innerHTML = s;
        rounds($(m1, ".mbtraj"), MB.rounds(z0, p, k, NR), eq && kd !== "none" ? eq : null);
        const fin = ends(p, k, z0);
        $(m1, ".mbtake .t").innerHTML = step < 3
          ? (zi <= 1 ? `This customer, interest ${RX}, joins once <b>${pct(zi)}</b> of friends are on; a customer with less interest needs more friends on, one with more needs fewer.`
                     : `Even with every friend on, this customer's benefit stays below the effort of ${f2(p)}: they do not join.`)
          : step < 4 ? `Interest varies, so the share who would join depends on how many are already on. The hump is that equilibrium curve; its peak is <b>${f2(k / 4)}</b>.`
          : kd === "none"
          ? `At an effort of <b>${f2(p)}</b> the effort line sits above the curve's peak, <b>${f2(k / 4)}</b>: no positive equilibrium, so participation falls to zero from any start. Lower the effort or raise k to get a tipping point.`
          : kd === "merged" ? `At an effort of <b>${f2(p)}</b> the tipping point and the stable level merge at <b>50%</b>: participation holds only from a start at or above it, and any slip fades.`
          : `Tipping point <b>${pct(eq.low)}</b>, stable level <b>${pct(eq.high)}</b>. Starting at ${pct(z0)}, participation ${fin > 0.01 ? `rises to about <b>${pct(fin)}</b>` : `<b>falls to zero</b>: too few friends are on for joining to feel worth it`}. Illustrative.`;
        $(m1, ".mbctlp").innerHTML = `<div class="k">Shown</div><p>Effort score ${f2(p)} (an illustrative index, not money), value of friends k ${f2(k)}, starting participation ${pct(z0)}.</p>`;
        $$(ctl, "input").forEach(i => { i.value = MBS[i.dataset.k]; $(ctl, `.val[data-v="${i.dataset.k}"]`).textContent = SL.find(x => x[0] === i.dataset.k)[3](MBS[i.dataset.k]); });
      }
      ctl.addEventListener("input", e => { const k = e.target.dataset?.k; if (!k) return; setMB({ [k]: +e.target.value }); });
      ctl.addEventListener("click", e => { if (e.target.closest("[data-k=reset]")) setMB({ p: SD.p, k: SD.k, z0: SD.z0 }); });
      if (S) S.hooks.push(k => { step = k; draw(); });
      MBS.fns.push(draw);
      printers.push(() => { MBS.p = SD.p; MBS.k = SD.k; MBS.z0 = SD.z0; step = 5; MBS.fns.forEach(f => f()); });
      draw();
    }

    // M2: the proposed squad experience on a phone, and the same model state as M1, without and with squads
    const m2 = document.getElementById("m2");
    if (m2) {
      const AR = MR.app_rules.value, price = RAW.storyboard.price_per_cup.value, credit = MR.group_credit_share.value, [sqLo, sqHi] = MR.squad_size.value;
      const PPL = AR.people, AVC = [COL.red, COL.navy, "#2E8B7A", "#B8860B"], DR = ["Jasmine milk tea", "Oolong milk tea", "Fresh fruit tea", "Black milk tea"];
      const cr = price * credit, n = PPL.length, mine = AR.points_own_drink + n * AR.points_per_squad_drink, after = AR.points_now + mine;
      const av = (i, off) => `<span class="av${off ? " off" : ""}" style="background:${AVC[i]}">${PPL[i][0]}</span>`;
      const bar = (a, b, sq) => `<div class="prog"><i class="${sq ? "sq" : ""}" style="width:${Math.min(100, 100 * a / b)}%"></i></div>`;
      const top = (t, h) => `<div class="bar"><span>9:41</span><span>●●●</span></div><div class="hd"><small>${t}</small><h3>${h}</h3></div>`;
      const PR = AR.prefs, me = PPL[0], gift = PPL[1];
      // the member's own choice on screen 3 (accept, customise or dismiss the suggestion) and one feedback tag; Aisha confirms last
      const ch = { pick: null, fb: null, sugar: "50%", ice: "Regular", aisha: false };
      const myDrink = () => ch.pick === "accept" ? PR[me].suggest : ch.pick === "custom" ? `${PR[me].suggest.split(" · ")[0]} · ${ch.sugar} sugar · ${ch.ice.toLowerCase()} ice` : PR[me].usual;
      const JR = ["See your progress and start a squad", "Invite friends from the share sheet", "Choose your drink: your usual, or a suggestion", "Each friend confirms their own drink", "Collect the order: everyone's progress moves", "Send a friend a drink", "The friend picks from suggestions made for them"];
      const opt = (k, v, cur) => `<button class="chip${cur === v ? " on" : ""}" data-${k}="${v}">${v}</button>`;
      const SCR = [
        () => top("Members · illustrative", `${AR.tier_now} member`) + `<div class="bd"><div class="crd"><h5>${AR.points_now} / ${AR.points_next} points to ${AR.tier_next}</h5>${bar(AR.points_now, AR.points_next)}<p>${AR.points_own_drink} points for each drink you buy.</p></div>
          <div class="crd"><h5>Start a squad</h5><p>Squads of ${sqLo} to ${sqHi}. Every drink in a squad's group order earns <b>${AR.points_per_squad_drink} points for every member</b>, and ${pct(credit)} back as credit.</p><button class="cta" data-go="1">Create a squad</button></div></div>`,
        () => top(`${AR.squad_name} · 1 of ${sqHi}`, "Invite your friends") + `<div class="bd"><div class="crd"><h5>${AR.squad_name}</h5><div class="avs">${PPL.map((_, i) => av(i, i > 0)).join("")}</div><p>Only you so far.</p></div></div>
          <div class="sheet"><div class="grab"></div><b>Share invite to ${AR.squad_name}</b><div class="apps"><span><i>✉</i>Messages</span><span><i>⧉</i>Copy link</span><span><i>@</i>Email</span><span><i>…</i>More</span></div>
          <button class="cta" data-go="2">Send invite</button><span class="sim">Simulated: no message is sent.</span></div>`,
        () => top(`${AR.squad_name} · group order`, "Your drink") + `<div class="bd">
          <div class="crd usual${ch.pick === "dismiss" ? " sel" : ""}"><small class="tag">Your usual</small> <b>${PR[me].usual}</b></div>
          <div class="crd sug${ch.pick === "accept" || ch.pick === "custom" ? " sel" : ""}"><small class="tag ai">Suggested for you</small><h5 style="margin-top:2px">${PR[me].suggest}</h5><p>Because ${PR[me].why}.</p>
            <div class="acts"><button class="mini${ch.pick === "accept" ? " on" : ""}" data-pick="accept">Accept</button><button class="mini${ch.pick === "custom" ? " on" : ""}" data-pick="custom">Customise</button><button class="mini${ch.pick === "dismiss" ? " on" : ""}" data-pick="dismiss">Dismiss</button></div>
            ${ch.pick === "custom" ? `<div class="cust">Sugar ${["25%", "50%", "70%"].map(v => opt("sugar", v, ch.sugar)).join("")}<br>Ice ${["Less", "Regular", "No"].map(v => opt("ice", v, ch.ice)).join("")}</div>` : ""}
            <div class="fbk">${["More like this", "Not for me", "Buying for someone else"].map(v => opt("fb", v, ch.fb)).join("")}</div></div>
          <button class="cta" data-go="3"${ch.pick ? "" : " disabled"}>${ch.pick ? `Confirm: ${myDrink().split(" · ")[0]}` : "Choose a drink first"}</button></div>`,
        () => top(`${AR.squad_name} · shared basket`, "Each friend confirms") + `<div class="bd"><div class="crd">
          ${PPL.map((p, i) => { const d = i === 0 ? myDrink() : PR[p].usual, wait = p === "Aisha" && !ch.aisha;
            return `<div class="row"><span>${av(i, wait)} <b>${p}</b> · ${wait ? "<i>still choosing</i>" : d.split(" · ")[0]}</span><span>${wait ? `<button class="mini" data-aisha="1">confirm</button>` : `<span class="ok">✓</span>`}</span></div>`; }).join("")}
          <p style="margin-top:4px">${ch.aisha ? n : n - 1} confirmed · only confirmed drinks enter the basket. ${me} pays; each preference is saved to the friend who chose it, not the payer.</p></div>
          <button class="cta" data-go="4"${ch.aisha ? "" : " disabled"}>${ch.aisha ? "Place group order" : "Waiting for Aisha"}</button><span class="sim">Simulated: no payment is taken.</span></div>`,
        () => top("Order collected · simulated", "Everyone moved up") + `<div class="bd"><div class="crd"><h5>You: ${after} / ${AR.points_next} points</h5>${bar(after, AR.points_next)}<p>+${AR.points_own_drink} for your drink, +${n * AR.points_per_squad_drink} from the squad's ${n} drinks.</p></div>
          <div class="crd"><h5>Each friend: +${mine} points too</h5><div class="avs">${PPL.map((_, i) => av(i)).join("")}</div></div>
          <div class="crd"><h5>S$${cr.toFixed(2)} credit each</h5><p>${pct(credit)} of each drink in the group order, for your next order.</p></div><button class="cta ghost" data-go="5">Next: gift a drink</button></div>`,
        () => top(AR.squad_name, "Gift a drink") + `<div class="bd"><div class="crd"><h5>Send ${gift} a drink</h5><div class="avs">${av(1)}</div><p>${gift} chooses from suggestions made for ${gift}. You will not see ${gift}'s order history, only whether the gift was collected.</p>
          <button class="cta" data-go="6">Send gift</button><span class="sim">Simulated: nothing is bought or sent.</span></div></div>`,
        () => top(`${gift}'s app · a gift from ${me}`, "Picked for you") + `<div class="bd"><div class="crd">${PR[gift].gift_options.map((d, i) => `<div class="row"><span>${i ? "○" : "●"} ${d}</span></div>`).join("")}
          <p style="margin-top:4px">Ranked from ${gift}'s own past choices. ${me} sees none of them.</p></div>
          <div class="crd"><p>When ${gift} collects it, it counts as a squad drink: ${AR.points_per_squad_drink} points for every member.</p></div>
          <button class="cta" data-go="0">Redeem for pickup</button><span class="sim">Simulated: no drink is ordered.</span></div>`];
      const WHY = [
        ["Shared", "Nothing yet: you see your own progress."], ["Shared", "An invite link to the squad, only to the friends you pick."],
        ["Baseline and AI", "Recalling your last order is the baseline. The proposed AI part ranks other drinks from your own choices, acceptances and dismissals. Your feedback teaches it; \"Buying for someone else\" keeps that drink out of your profile."],
        ["Shared", "Who is in the squad and what each confirmed. Private order history stays private."], ["Progress", `Everyone in the squad: your drink gives you ${AR.points_own_drink}; each drink in the order gives every member ${AR.points_per_squad_drink}.`],
        ["Privacy", `The sender never sees the recipient's history.`], ["Reward", "A gifted drink counts as a squad drink when collected, so it moves the whole squad."]];
      const WHY2 = ["Your progress is yours; the squad is how friends' orders start to count for you.", "Joining is one tap for a friend: the effort, p, the squad has to keep low.",
        "Easier choices may lower the effort, p, further. A hypothesis to test, like k.", "A drink counts only once its chooser confirms it: that is the confirmed demand the group-orders slide forecasts from.",
        `The reward: ${AR.points_per_squad_drink} points a squad drink to every member, and ${pct(credit)} credit on each group-order drink.`, "Gifting brings a friend in without asking them to set anything up.",
        "An unredeemed gift is not a drink yet; only redemption confirms it."];
      let cur2 = 2;
      const scr = $(m2, ".scr"), jour = $(m2, ".mbjour"), why = $(m2, ".mbwhy"), nav = $(m2, ".mbnav");
      jour.innerHTML = JR.map((t, i) => `<li data-i="${i}"><span class="n">${i + 1}</span><span>${t}</span></li>`).join("");
      nav.innerHTML = `<button class="btn" data-d="-1" aria-label="Previous screen">◀</button><button class="btn" data-d="1" aria-label="Next screen">▶</button>`;
      function screen(i) {
        cur2 = (i + SCR.length) % SCR.length; scr.innerHTML = SCR[cur2]();
        $$(jour, "li").forEach((li, j) => li.classList.toggle("on", j === cur2));
        why.innerHTML = `<div class="bc"><div class="k">${WHY[cur2][0]}</div><p>${WHY[cur2][1]}</p></div><div class="bc"><div class="k">Why it matters</div><p>${WHY2[cur2]}</p></div>` +
          `<p class="lnote">Proposed experience with illustrative data and rules, not Chagee's; nothing is learned from real customers.</p>`;
      }
      scr.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b || b.disabled) return;
        if (b.dataset.pick) { ch.pick = b.dataset.pick; if (ch.pick === "dismiss") ch.fb = ch.fb || "Not for me"; return screen(cur2); }
        if (b.dataset.fb) { ch.fb = ch.fb === b.dataset.fb ? null : b.dataset.fb; return screen(cur2); }
        if (b.dataset.sugar) { ch.sugar = b.dataset.sugar; return screen(cur2); }
        if (b.dataset.ice) { ch.ice = b.dataset.ice; return screen(cur2); }
        if (b.dataset.aisha) { ch.aisha = true; return screen(cur2); }
        if (b.dataset.go != null) screen(+b.dataset.go);
      });
      jour.addEventListener("click", e => { const li = e.target.closest("li"); if (li) screen(+li.dataset.i); });
      nav.addEventListener("click", e => { const b = e.target.closest("[data-d]"); if (b) screen(cur2 + +b.dataset.d); });
      const inc = $(m2, ".mbinc input");
      function model() {
        const { p, k } = MBS, pw = Math.max(0.001, p - (inc.checked ? LV.dp : 0)), kw = k + LV.dk, e0 = MB.equilibria(p, k), e1 = MB.equilibria(pw, kw);
        const svg = $(m2, ".mbws"), W = 260, H = 170, L = 28, R = 16, Tp = 18, B = 22, ym = Math.max(kw / 4, p) * 1.25;
        const X = z => L + z * (W - L - R), Y = v => Tp + (1 - v / ym) * (H - Tp - B);
        const curve = (kk, c, w, dash) => `<polyline points="${Array.from({ length: 41 }, (_, i) => { const z = i / 40; return `${X(z).toFixed(1)},${Y(kk * z * (1 - z)).toFixed(1)}`; }).join(" ")}" fill="none" stroke="${c}" stroke-width="${w}"${dash ? ' stroke-dasharray="5 4"' : ""}/>`;
        let s = `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="${COL.ink2}"/>` + [0, 0.5, 1].map(z => T(X(z), H - B + 13, pct(z), `font-size="9.5" fill="${COL.taupe}" text-anchor="middle"`)).join("");
        s += curve(k, "#B9B2A6", 2, true) + curve(kw, COL.navy, 2.6, false);
        s += `<line x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}" stroke="${COL.red}" stroke-width="1.6" stroke-dasharray="5 4"/>`;
        if (inc.checked) s += `<line x1="${L}" x2="${W - R}" y1="${Y(pw)}" y2="${Y(pw)}" stroke="${COL.gold}" stroke-width="1.6" stroke-dasharray="5 4"/>`;
        if (e0) s += `<circle cx="${X(e0.low)}" cy="${Y(p)}" r="4.5" fill="#fff" stroke="${COL.taupe}" stroke-width="2"/>`;
        if (e1) s += `<circle cx="${X(e1.low)}" cy="${Y(pw)}" r="4.5" fill="#fff" stroke="${COL.navy}" stroke-width="2.4"/>`;
        s += T(L, 11, "without squads", `font-size="10" fill="${COL.taupe}"`) + T(L + 84, 11, "with squads", `font-size="10" font-weight="700" fill="${COL.navy}"`) + T(W - R, 11, `effort ${f2(pw)}`, `font-size="10" fill="${COL.red}" text-anchor="end"`);
        svg.innerHTML = s;
        const tp = e => (e ? pct(e.low) : "none (stalls)");
        $(m2, ".mbtake .t").innerHTML = `At the members slide's effort of <b>${f2(p)}</b>, squads (assumed k ${f2(k)} → ${f2(kw)})${inc.checked ? ` plus a launch incentive (effort → ${f2(pw)})` : ""} would move the tipping point from <b>${tp(e0)}</b> to <b>${tp(e1)}</b>` +
          (!e0 && e1 ? `: without squads the app never takes off; with them it can.` : e0 && e1 ? `: fewer friends need to be on before joining feels worth it.` : `.`) + ` Assumptions to test, not measured effects.`;
      }
      inc.addEventListener("change", model);
      MBS.fns.push(model);
      printers.push(() => { inc.checked = false; Object.assign(ch, { pick: "accept", fb: "More like this", sugar: "50%", ice: "Regular", aisha: false }); screen(2); model(); });
      screen(2); model();
    }

    // M3, the CRM manager's decision: contribution per member a month against extra orders, after the reward (credit) and,
    // from step 4, personalisation's running cost (members.ai_cost_per_member_month)
    const m3 = document.getElementById("m3");
    if (m3) {
      const S = m3._stepper, ctl = $(m3, ".mbpctl"), svg = $(m3, ".mbpay");
      const o0 = { credit: MR.group_credit_share.value, base: MR.base_group_orders_per_member_month.value, ai: MR.ai_cost_per_member_month.value }, o = { ...o0 };
      const Er = MR.extra_orders_per_member_month.range, mg = RAW.storyboard.gross_margin_per_cup;
      let step = S ? S.cur : 4;
      const SL = [["credit", "Reward: group-order credit, share of price", MR.group_credit_share.range, 0.005, v => pct(v, 1), "big"],
                  ["base", "Group orders a month anyway", MR.base_group_orders_per_member_month.range, 0.5, v => v.toFixed(1), ""],
                  ["ai", "AI cost per member a month", MR.ai_cost_per_member_month.range, 0.01, v => `S$${v.toFixed(2)}`, ""]];
      ctl.innerHTML = `<span class="lab">Reward level and costs</span>` + SL.map(([k, lab, [lo, hi], st, f, cls], i) => (i ? `<div class="sep"></div>` : "") +
        `<label class="${cls}">${lab}<span class="val" data-v="${k}">${f(o[k])}</span><input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${st}" value="${o[k]}"></label>`).join("") +
        `<button class="btn" data-k="reset" style="height:24px;font-size:11px">Reset</button>`;
      ctl.classList.add("mbctl");
      function draw() {
        const sq = { credit: o.credit, base: o.base }, b = MB.breakEven(RAW, sq), bA = MB.breakEven(RAW, o), hur = MB.aiHurdle(RAW, o);
        const W = 640, H = 214, L = 58, R = 20, Tp = 16, B = 34, top = Math.max(b.mid.extraNeeded ?? Infinity, step >= 4 ? bA.mid.extraNeeded ?? Infinity : 0);
        const xm = isFinite(top) ? Math.min(Er[1], Math.max(1, Math.ceil(top * 2.5 * 2) / 2)) : Er[1], dx = xm <= 1.5 ? 0.25 : 0.5;   // zoom to the break-even
        const f = (E, m) => MB.perMember(RAW, sq, E, m), fA = (E, m) => MB.perMember(RAW, o, E, m);
        const ys = [mg.range[0], mg.value, mg.range[1]].flatMap(m => [f(0, m), f(xm, m), fA(0, m)]);
        let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys); const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
        const X = E => L + E / xm * (W - L - R), Y = v => Tp + (y1 - v) / (y1 - y0) * (H - Tp - B);
        let s = "";
        const st = (() => { const r = (y1 - y0) / 5, m = 10 ** Math.floor(Math.log10(r)); return [1, 2, 2.5, 5, 10].map(q => q * m).find(q => q >= r); })();
        for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${Math.abs(v) < 1e-9 ? COL.ink2 : COL.line}" stroke-width="${Math.abs(v) < 1e-9 ? 1.6 : 1}"/>` +
          T(L - 6, Y(v) + 3.5, `${v < 0 ? "−" : ""}S$${Math.abs(v).toFixed(2)}`, `font-size="10.5" fill="${COL.taupe}" text-anchor="end"`);
        for (let E = 0; E <= xm + 1e-9; E += dx) s += T(X(E), H - B + 15, dx < 0.5 ? E.toFixed(2) : E.toFixed(1), `font-size="10.5" fill="${COL.taupe}" text-anchor="middle"`);
        // shaded zones: above zero the reward pays for itself, below it costs more than it earns
        s = `<rect x="${L}" y="${Tp}" width="${W - R - L}" height="${Y(0) - Tp}" fill="${GREEN}" opacity=".06"/><rect x="${L}" y="${Y(0)}" width="${W - R - L}" height="${H - B - Y(0)}" fill="${COL.red}" opacity=".06"/>` + s +
             T(L + 8, Tp + 13, "reward pays for itself", `font-size="11" font-weight="600" fill="${GREEN}"`) + T(W - R - 6, H - B - 7, "reward costs more than it earns", `font-size="11" font-weight="600" fill="${COL.red}" text-anchor="end"`);
        s += T((L + W - R) / 2, H - 3, "extra orders per member a month that squads create", `font-size="10.5" fill="${COL.taupe}" text-anchor="middle"`) +
             `<text transform="translate(13 ${(Tp + H - B) / 2}) rotate(-90)" font-size="10.5" fill="${COL.taupe}" text-anchor="middle">S$ gained or lost per member a month</text>`;
        if (step >= 2) s += `<polygon points="${[[0, mg.range[1]], [xm, mg.range[1]], [xm, mg.range[0]], [0, mg.range[0]]].map(([E, m]) => `${X(E)},${Y(f(E, m))}`).join(" ")}" fill="${COL.navy}" opacity=".1"/>`;
        s += `<line x1="${X(0)}" y1="${Y(f(0))}" x2="${X(step >= 2 ? xm : 0.0001)}" y2="${Y(f(step >= 2 ? xm : 0.0001))}" stroke="${COL.navy}" stroke-width="3"/>` +
             `<circle cx="${X(0)}" cy="${Y(f(0))}" r="5" fill="${COL.red}"/>` + T(X(0) + 9, Y(f(0)) + 15, `no extra orders: −S$${Math.abs(f(0)).toFixed(2)}, credit on orders they place anyway`, `font-size="11" font-weight="600" fill="${COL.red}" stroke="${COL.cream}" stroke-width="4" paint-order="stroke"`);
        if (step >= 2) s += T(X(xm) - 4, Y(f(xm)) - 10, "squads alone", `font-size="11.5" font-weight="600" fill="${COL.navy}" text-anchor="end" stroke="#fff" stroke-width="4" paint-order="stroke"`);
        if (step >= 4) s += `<line x1="${X(0)}" y1="${Y(fA(0))}" x2="${X(xm)}" y2="${Y(fA(xm))}" stroke="${COL.gold}" stroke-width="3" stroke-dasharray="7 4"/>` +
             T(X(xm) - 4, Y(fA(xm)) + 18, `squads + personalised suggestions (AI)`, `font-size="11.5" font-weight="600" fill="#8A6416" text-anchor="end" stroke="#fff" stroke-width="4" paint-order="stroke"`);
        const mark = (Es, col, lab, dy, left) => Es == null ? T((L + W - R) / 2, Tp + 14 + dy, "credit at or above the margin: the line never reaches zero, no break-even", `font-size="12" font-weight="700" fill="${COL.red}" text-anchor="middle"`)
          : Es > xm ? T(W - R, Tp + 14 + dy, `${lab} beyond ${xm} extra orders a month`, `font-size="12" font-weight="700" fill="${COL.red}" text-anchor="end"`)
          : `<line x1="${X(Es)}" x2="${X(Es)}" y1="${Y(0)}" y2="${H - B}" stroke="${col}" stroke-dasharray="3 3"/><circle cx="${X(Es)}" cy="${Y(0)}" r="6" fill="${col}" stroke="#fff" stroke-width="2"/>` +
            T(X(Es) + (left ? -10 : 10), Y(0) + dy, `${lab}: ${Es.toFixed(2)}`, `font-size="11.5" font-weight="700" fill="${col}" text-anchor="${left ? "end" : "start"}" stroke="#fff" stroke-width="4" paint-order="stroke"`);
        if (step >= 3) s += mark(b.mid.extraNeeded, GREEN, "break-even, squads alone", -34);
        if (step >= 4 && bA.mid.extraNeeded != null) s += mark(bA.mid.extraNeeded, "#8A6416", "with AI", 20);
        svg.innerHTML = s;
        const Es = b.mid.extraNeeded, EA = bA.mid.extraNeeded;
        $(m3, ".mbact").innerHTML = Es == null ? `At a <b>${pct(o.credit, 1)}</b> credit, at or above the margin, the reward never pays for itself: lower it before any pilot.`
          : `Three arms in Singapore (today's membership, squads, squads with suggestions) at a <b>${pct(o.credit, 1)}</b> credit: squads must add <b>${Es.toFixed(2)}</b> orders a member a month, suggestions <b>${hur.toFixed(2)}</b> more.`;
        $(m3, ".mbhow").innerHTML = `<div class="k">How to read it</div><ol>` +
          `<li><b>Start</b>: no extra orders costs <b>S$${Math.abs(f(0)).toFixed(2)}</b> a member a month, the credit on orders placed anyway.</li>` +
          `<li><b>Rise</b>: each extra order earns its margin (band: ${pct(mg.range[0])}–${pct(mg.range[1])}).</li>` +
          (Es == null ? `<li><b>No break-even</b>: at this credit the line never reaches zero.</li>`
            : `<li><b>Break-even</b>: <b>${Es.toFixed(2)}</b> extra orders a member a month, about one every ${Math.max(1, Math.round(1 / Es))} months.</li>`) +
          (EA == null ? "" : `<li><b>AI</b> adds S$${o.ai.toFixed(2)} a month, so <b>${hur.toFixed(2)}</b> more.</li>`) + `</ol>`;
        $(m3, ".mbpctlp").innerHTML = `<div class="k">Shown</div><p>Credit ${pct(o.credit, 1)} of the S$${b.price.toFixed(2)} price; ${o.base.toFixed(1)} group orders a month anyway; AI cost S$${o.ai.toFixed(2)} a member a month; margin ${pct(mg.value)} (band ${pct(mg.range[0])}–${pct(mg.range[1])}).</p>`;
        $$(ctl, "input").forEach(i => { i.value = o[i.dataset.k]; $(ctl, `.val[data-v="${i.dataset.k}"]`).textContent = SL.find(x => x[0] === i.dataset.k)[4](o[i.dataset.k]); });
      }
      ctl.addEventListener("input", e => { const k = e.target.dataset?.k; if (!k) return; o[k] = +e.target.value; if (k === "ai" && S && S.cur < 4) S.go(4); else draw(); });
      ctl.addEventListener("click", e => { if (e.target.closest("[data-k=reset]")) { Object.assign(o, o0); draw(); } });
      if (S) S.hooks.push(k => { step = k; draw(); });
      printers.push(() => { Object.assign(o, o0); step = 4; draw(); });
      draw();
    }

    // appendix: the network check chart
    const am1 = document.getElementById("am1");
    if (am1) {
      const net = MD.network.filter(n => n.closed != null && n.sim != null), svg = $(am1, ".mbnet"), W = 400, L = 128, R = 14, rh = 19;
      const X = v => L + v / 0.6 * (W - L - R);
      let s = [0, 0.2, 0.4, 0.6].map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="4" y2="${8 + net.length * rh}" stroke="${COL.line}"/>` + T(X(v), 18 + net.length * rh, pct(v), `font-size="9.5" fill="${COL.taupe}" text-anchor="middle"`)).join("");
      net.forEach((n, i) => { const y = 14 + i * rh, big = Math.abs(n.sim - n.closed) > 0.05;
        s += T(0, y + 3.5, SC.find(x => x.id === n.id).label, `font-size="10.5" fill="${COL.ink}"`) + `<line x1="${X(n.closed)}" x2="${X(n.sim)}" y1="${y}" y2="${y}" stroke="${big ? COL.red : COL.taupe}" stroke-width="2"/>` +
             `<circle cx="${X(n.closed)}" cy="${y}" r="4.5" fill="${COL.navy}"/><circle cx="${X(n.sim)}" cy="${y}" r="4.5" fill="#fff" stroke="${COL.red}" stroke-width="2"/>`; });
      s += T(W - R, 126, "● formula · ○ simulation", `font-size="9.5" fill="${COL.taupe}" text-anchor="end"`);
      svg.innerHTML = s;
    }
  })();

  /* ---------------------------------------------------------------- 06b group orders to forecasts (sim/squadcast.js, synthetic) */
  (function squadcast() {
    const sl = document.getElementById("m2b"), Q = window.ChageeSquadcast, D = DATA.squadcast; if (!sl || !Q || !D) return;
    const SR = RAW.squadcast, E0 = Q.inputs(RAW, P), GREEN = "#2F6B45", DAYN = ["Quiet day", "Typical day", "Busy day", "Squad rush"], RUSH = 3;
    const t0 = DATA.counter.firstHour + E0.hour, win = `${String(t0).padStart(2, "0")}:00 to ${String(t0).padStart(2, "0")}:${String(E0.W).padStart(2, "0")}`;
    $$(sl, ".sqwin").forEach(e => (e.textContent = win));
    // what the experience records: documented today, to confirm, or proposed (needs collection and consent)
    const SIG = [["Completed purchases", "documented", "doc"], ["Selected outlet and in-app order", "documented", "doc"], ["Drinks and customisations", "to confirm", "cf"],
                 ["Pickup time chosen", "to confirm", "cf"], ["Group size, confirmed quantities", "proposed", "pr"], ["Suggestion accepted, edited, dismissed", "proposed", "pr"], ["Gift sent and redeemed", "proposed", "pr"]];
    $(sl, ".sqsig").innerHTML = SIG.map(([l, t, c]) => `<li><span>${l}</span><span class="tg ${c}">${t}</span></li>`).join("");
    const pl = Sim.plan(P, "mixed"), make = P.stations.reduce((a, s) => a + (P.mixedMachine.includes(s) ? P.machineSec[s] : P.humanSec[s]), 0) / 60;
    const st = { day: RUSH, s: E0.s, t: -E0.lead, reveal: false, timer: null };
    let E, H, w, last = {};
    const rebuild = () => { E = { ...E0, s: st.s }; H = Q.learn(E, Sim); w = Q.simulate(E, D.days[st.day], Sim); };
    const ctl = $(sl, ".sqctl");
    ctl.innerHTML = `<span class="lab">Example day · synthetic</span><span class="seg">${DAYN.map((d, i) => `<button class="btn" data-day="${i}">${d}</button>`).join("")}</span>` +
      `<label>Squad share of the window's cups<span class="val" data-v="s"></span><input type="range" data-k="s" min="${SR.social_share.range[0]}" max="${SR.social_share.range[1]}" step="0.05" value="${st.s}"></label>` +
      `<label>Minutes before pickup<span class="val" data-v="t"></span><input type="range" data-k="t" min="${-E0.lead}" max="0" step="1" value="${st.t}"></label>` +
      `<span style="display:flex;gap:6px"><button class="btn primary" data-x="play">▶ Play</button><button class="btn" data-x="reveal">Reveal actual</button><button class="btn" data-x="reset">Reset</button></span>`;
    function act(f) {
      const F = f.enhanced, drinks = Object.keys(E.mix), cnt = Object.fromEntries(drinks.map(d => [d, 0]));
      f.drinks.forEach(d => cnt[d]++);
      drinks.forEach(d => (cnt[d] += Math.max(0, F - f.confirmed) * E.mix[d]));
      const top = drinks.sort((a, b) => cnt[b] - cnt[a]).slice(0, 3).map(d => `${d.split(" ")[0]} ${Math.round(cnt[d])}`).join(" · ");
      const rate = F / E.W, k = Math.max(P.minStaff.mixed, Math.ceil(rate * P.margin / pl.perWorker - 1e-9)), rho = rate / (k * pl.perWorker);
      const wait = make / (1 - Math.min(rho, 0.95));
      const out = { prep: top, staff: `${k} ${k === 1 ? "person" : "people"}, ${win}`, counter: `${k > 1 ? `a bucket brigade of ${k}` : "one person"}, machines on tea and milk · load ${pct(rho)}`, pickup: `ready in about ${Math.max(1, Math.round(wait))} min` };
      $(sl, ".sqact").innerHTML = [["prep", "Prepare", "drinks to have ready"], ["staff", "Staff", "the window's crew"], ["counter", "Counter", "how the line is run"], ["pickup", "Pickup estimate", "shown to customers (rough)"]]
        .map(([k2, h, sub]) => `<div class="o${last[k2] !== undefined && last[k2] !== out[k2] ? " pulse" : ""}"><b>${h}</b>${out[k2]}<br><small style="color:${COL.taupe}">${sub}</small></div>`).join("");
      last = out; setTimeout(() => $$(sl, ".sqact .o.pulse").forEach(o => o.classList.remove("pulse")), 650);
    }
    function draw() {
      const f = Q.forecast(E, H, w, st.t), L = 44, Rr = 120, Tp = 22, B = 34, W = 760, Hh = 178, x1 = 15;
      const path = []; for (let t = -E.lead; t <= st.t; t++) path.push([t, Q.forecast(E, H, w, t).enhanced]);
      const ym = Math.max(E.base, w.actual, ...path.map(p => p[1])) * 1.2, X = t => L + (t + E.lead) / (E.lead + x1) * (W - L - Rr), Y = v => Tp + (1 - v / ym) * (Hh - Tp - B);
      let s = `<rect x="${X(0)}" y="${Tp}" width="${X(x1) - X(0)}" height="${Y(0) - Tp}" fill="${COL.cream}"/>` + T((X(0) + X(x1)) / 2, Tp + 11, "pickups", `font-size="10" fill="${COL.taupe}" text-anchor="middle"`);
      for (let v = 0; v <= ym; v += 10) s += `<line x1="${L}" x2="${X(x1)}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v ? COL.line : COL.ink2}"/>` + T(L - 6, Y(v) + 3.5, v, `font-size="10" fill="${COL.taupe}" text-anchor="end"`);
      for (let t = -E.lead; t <= 0; t += 30) s += T(X(t), Hh - B + 13, t ? `${t} min` : "pickup", `font-size="10" fill="${COL.taupe}" text-anchor="middle"`);
      s += `<text transform="translate(12 ${(Tp + Hh - B) / 2}) rotate(-90)" font-size="10" fill="${COL.taupe}" text-anchor="middle">forecast cups</text>`;
      // signals as they arrive (below the axis)
      const yS = Hh - B + 22, mk = { open: (x) => `<circle cx="${x}" cy="${yS}" r="3.2" fill="none" stroke="${COL.navy}" stroke-width="1.4"/>`, confirm: x => `<circle cx="${x}" cy="${yS}" r="2.6" fill="${GREEN}"/>`,
        gift: x => `<rect x="${x - 3}" y="${yS - 3}" width="6" height="6" fill="none" stroke="${COL.gold}" stroke-width="1.4"/>`, redeem: x => `<rect x="${x - 3}" y="${yS - 3}" width="6" height="6" fill="${COL.gold}"/>` };
      w.events.filter(e => e.t <= st.t).forEach(e => (s += mk[e.kind](X(e.t).toFixed(1))));
      s += `<line x1="${L}" x2="${X(x1)}" y1="${Y(E.base)}" y2="${Y(E.base)}" stroke="${COL.taupe}" stroke-width="2" stroke-dasharray="6 4"/>`;
      s += `<polyline points="${path.map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${COL.navy}" stroke-width="2.6"/>` +
           `<circle cx="${X(st.t)}" cy="${Y(f.enhanced)}" r="4.5" fill="${COL.navy}"/><line x1="${X(st.t)}" x2="${X(st.t)}" y1="${Tp}" y2="${Y(0)}" stroke="${COL.navy}" stroke-dasharray="2 3" opacity=".5"/>`;
      if (st.reveal) s += `<line x1="${X(0)}" x2="${X(x1)}" y1="${Y(w.actual)}" y2="${Y(w.actual)}" stroke="${COL.red}" stroke-width="3"/>` + T((X(0) + X(x1)) / 2, Y(w.actual) - 6, `actual ${w.actual}`, `font-size="11" font-weight="700" fill="${COL.red}" text-anchor="middle"`);
      const ly = 12;
      s += `<line x1="${L}" x2="${L + 22}" y1="${ly - 4}" y2="${ly - 4}" stroke="${COL.taupe}" stroke-width="2" stroke-dasharray="6 4"/>` + T(L + 27, ly, "History only (calendar)", `font-size="11" fill="${COL.ink2}"`) +
           `<line x1="${L + 168}" x2="${L + 190}" y1="${ly - 4}" y2="${ly - 4}" stroke="${COL.navy}" stroke-width="2.6"/>` + T(L + 195, ly, "Updated with squad signals", `font-size="11" font-weight="600" fill="${COL.navy}"`) +
           T(L + 372, ly, "○ basket opened · ● drink confirmed · □ gift sent · ■ redeemed", `font-size="10" fill="${COL.taupe}"`);
      s += T(X(x1) + 6, Y(E.base) + 4, `history ${E.base.toFixed(0)}`, `font-size="11" fill="${COL.taupe}"`) + T(X(x1) + 6, Y(f.enhanced) - 6, `with squads ${f.enhanced.toFixed(0)}`, `font-size="11" font-weight="700" fill="${COL.navy}"`);
      $(sl, ".sqsvg").innerHTML = s;
      // predict box
      const tot = f.enhanced, seg = (v, c) => v > 0.05 ? `<i style="width:${(100 * v / tot).toFixed(1)}%;background:${c}"></i>` : "";
      $(sl, ".sqbar").innerHTML = seg(f.nonSquad, COL.taupe) + seg(f.confirmed, GREEN) + seg(f.predicted, COL.gold);
      const key = (c, v, lab) => `<span class="sqk"><i style="background:${c}"></i><b>${v}</b> ${lab}</span>`;
      $(sl, ".sqsum").innerHTML = `<b class="sqtot">${tot.toFixed(0)} cups</b> expected at ${st.t} min = ` +
        key(COL.taupe, f.nonSquad.toFixed(0), "usual, from history") + " + " + key(GREEN, f.confirmed, "confirmed in squads") + " + " + key(COL.gold, f.predicted.toFixed(1), "likely");
      $(sl, ".sqpred").innerHTML = `<b>Likely</b>: invites not yet confirmed and gifts not yet redeemed, each counted at the chance it converted in past windows (${pct(f.pc)} and ${pct(f.pr)}), plus baskets not yet opened.`;
      act(f);
      $(ctl, '[data-v="s"]').textContent = pct(st.s); $(ctl, '[data-v="t"]').textContent = `${st.t} min`;
      $(ctl, 'input[data-k="s"]').value = st.s; $(ctl, 'input[data-k="t"]').value = st.t;
      $$(ctl, "[data-day]").forEach(b => b.classList.toggle("on", +b.dataset.day === st.day));
      const eB = Math.abs(E.base - w.actual), eS = Math.abs(f.enhanced - w.actual), often = `Across ${D.nWin} synthetic windows the squad forecast was closer on ${pct(D.winShare)} of them.`;
      $(sl, ".mbtake .t").innerHTML = st.reveal
        ? `${DAYN[st.day]}: actual <b>${w.actual}</b> cups. At ${st.t} min the history-only forecast was off by <b>${eB.toFixed(1)}</b>, the squad forecast by <b>${eS.toFixed(1)}</b>` +
          (eS > eB ? `: worse today, because walk-in demand moved and squads cannot see it. ${often}` : `: ${st.day === RUSH ? "squad orders showed the rush coming before history could" : "closer"}. ${often}`)
        : `Better social experience → richer customer signals → better demand forecasts → better service.`;
      $(sl, ".sqctlp").innerHTML = `<div class="k">Shown</div><p>${DAYN[st.day]} (synthetic), squad share ${pct(st.s)}, forecast at ${st.t} min, actual revealed. Window ${win}.</p>`;
    }
    const stop = () => { clearInterval(st.timer); st.timer = null; $(ctl, '[data-x="play"]').textContent = "▶ Play"; };
    ctl.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.day) { stop(); st.day = +b.dataset.day; st.reveal = false; rebuild(); draw(); }
      if (b.dataset.x === "reveal") { stop(); st.reveal = true; draw(); }
      if (b.dataset.x === "reset") { stop(); Object.assign(st, { s: E0.s, t: -E0.lead, reveal: false }); rebuild(); draw(); }
      if (b.dataset.x === "play") { if (st.timer) return stop(); if (st.t >= 0) st.t = -E0.lead; st.reveal = false; b.textContent = "❚❚ Pause";
        st.timer = setInterval(() => { st.t = Math.min(0, st.t + 2); draw(); if (st.t >= 0) { stop(); setTimeout(() => { st.reveal = true; draw(); }, 600); } }, reduce ? 160 : 90); } });
    ctl.addEventListener("input", e => { const k = e.target.dataset?.k; if (!k) return; stop();
      if (k === "s") { st.s = +e.target.value; st.reveal = false; rebuild(); } else st.t = +e.target.value; draw(); });
    printers.push(() => { stop(); Object.assign(st, { day: RUSH, s: E0.s, t: -30, reveal: true }); rebuild(); last = {}; draw(); });
    rebuild(); st.t = -30; draw();
  })();

  /* ---------------------------------------------------------------- 08 demand by the hour against the roster (counter.js) */
  (function opsProblem() {
    const sl = document.getElementById("o1"), FE = DATA.forecastErr; if (!sl || !FE) return;
    const S = sl._stepper, GREEN = "#2F6B45", ERR = SB.forecast_error_scenarios.value, pl = Sim.plan(P, "mixed");
    const per = pl.perWorker * 60 / P.margin;                     // cups an hour one person serves within the staffing rule's margin
    const rosterOf = (cups, e) => cups.map(x => Math.max(P.minStaff.mixed, Math.ceil(x * (1 + e) / 60 * P.margin / pl.perWorker - 1e-9)));
    const st = { day: "moderate", e: 0 }; let step = S ? S.cur : 4;
    const errLab = e => (e === 0 ? "exact" : `${e > 0 ? "+" : "−"}${pct(Math.abs(e))}${e > 0 ? " high" : " low"}`);
    $(sl, ".opseg").innerHTML = DAYS.map(d => `<button class="btn" data-d="${d}">${DAY_LABEL[d]}</button>`).join("");
    const ctl = $(sl, ".opctl");
    ctl.innerHTML = `<label class="big">Forecast error<span class="val" data-v="e"></span><input type="range" data-k="e" min="${ERR[0]}" max="${ERR[ERR.length - 1]}" step="${ERR[1] - ERR[0]}" value="0"></label>` +
      `<p class="lnote" style="margin:2px 0 0">The roster follows the forecast; the customers are the day's actual ones.</p>`;
    function draw() {
      const F = C.forecastDay(Sim, P, st.day), cups = F.cups, n = cups.length, norm = rosterOf(C.forecastDay(Sim, P, "none").cups, 0);
      const fc = rosterOf(cups, step >= 4 ? st.e : 0), act = step >= 3 ? fc : norm;
      const W = 700, H = 240, L = 44, R = 132, Tp = 14, B = 30, ym = Math.ceil(Math.max(...cups, ...act.map(k => k * per), ...norm.map(k => k * per)) * 1.1 / 25) * 25;
      const bw = (W - L - R) / n, X = h => L + h * bw, Y = v => Tp + (1 - v / ym) * (H - Tp - B);
      let s = "";
      for (let v = 0; v <= ym; v += 25) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v ? COL.line : COL.ink2}"/>` + T(L - 6, Y(v) + 3.5, v, `font-size="10" fill="${COL.taupe}" text-anchor="end"`);
      cups.forEach((c, h) => { s += `<rect x="${X(h) + 5}" y="${Y(c)}" width="${bw - 10}" height="${Y(0) - Y(c)}" rx="2" fill="${COL.ice}" stroke="${COL.blue}" stroke-width=".8"/>`;
        if (h % 2 === 0) s += T(X(h) + bw / 2, H - B + 14, hourLabel(h), `font-size="10" fill="${COL.taupe}" text-anchor="middle"`); });
      s += `<text transform="translate(12 ${(Tp + H - B) / 2}) rotate(-90)" font-size="10" fill="${COL.taupe}" text-anchor="middle">cups an hour</text>`;
      let short = 0, maxShort = 0, idleH = 0;
      if (step >= 2) act.forEach((k, h) => { const cap = k * per, c = cups[h];
        if (c > cap) { short++; maxShort = Math.max(maxShort, c - cap); s += `<rect x="${X(h) + 5}" y="${Y(c)}" width="${bw - 10}" height="${Y(cap) - Y(c)}" fill="${COL.red}" opacity=".75"/>`; }
        else { if (c < cap / 2) idleH++; s += `<rect x="${X(h) + 5}" y="${Y(cap)}" width="${bw - 10}" height="${Y(c) - Y(cap)}" fill="#B9B2A6" opacity=".35"/>`; } });
      const line = (ks, col, dash, w) => `<path d="${ks.map((k, h) => `${h ? "L" : "M"}${X(h)} ${Y(k * per)} H${X(h + 1)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
      const crew = (ks, col, dy) => ks.map((k, h) => (h === 0 || k !== ks[h - 1] ? T(X(h) + 4, Y(k * per) + dy, `${k}`, `font-size="10" font-weight="700" fill="${col}"`) : "")).join("");
      if (step >= 2) s += line(norm, COL.taupe, "5 4", 2) + (step < 3 ? crew(norm, COL.ink2, -4) : "");
      if (step >= 3) s += line(fc, GREEN, "", 2.6) + crew(fc, GREEN, -4);
      const lx = W - R + 10; let ly = Tp + 8;
      const key = (sw, txt) => { const o = sw + T(lx + 22, ly + 4, txt, `font-size="10.5" fill="${COL.ink2}"`); ly += 18; return o; };
      s += key(`<rect x="${lx}" y="${ly - 5}" width="16" height="10" rx="2" fill="${COL.ice}" stroke="${COL.blue}"/>`, `forecast cups`);
      if (step >= 2) { s += key(`<line x1="${lx}" x2="${lx + 16}" y1="${ly}" y2="${ly}" stroke="${COL.taupe}" stroke-width="2" stroke-dasharray="5 4"/>`, "normal-day roster");
        if (step >= 3) s += key(`<line x1="${lx}" x2="${lx + 16}" y1="${ly}" y2="${ly}" stroke="${GREEN}" stroke-width="2.6"/>`, step >= 4 && st.e ? `roster, forecast ${errLab(st.e)}` : "forecast roster");
        s += key(`<rect x="${lx}" y="${ly - 5}" width="16" height="10" fill="${COL.red}" opacity=".75"/>`, "short: queue") + key(`<rect x="${lx}" y="${ly - 5}" width="16" height="10" fill="#B9B2A6" opacity=".5"/>`, "idle capacity");
        s += T(lx, ly + 8, "numbers on the lines:", `font-size="9.5" fill="${COL.taupe}"`) + T(lx, ly + 20, "people on shift", `font-size="9.5" fill="${COL.taupe}"`); }
      $(sl, ".opsvg").innerHTML = s;
      // the sensitivity table: the day's precomputed runs (counter.forecastError)
      const rows = FE[st.day], z = rows.find(r => r.e === 0), cur = rows.find(r => Math.abs(r.e - st.e) < 1e-9);
      $(sl, ".fetab").innerHTML = `<tr><th>Forecast</th><th>Crew</th><th>Away</th><th>Wait</th><th>S$/day</th><th>Cups/pp</th></tr>` +
        rows.map(r => `<tr class="${step >= 4 && r === cur ? "on" : ""}${r.e === 0 ? " z" : ""}"><td>${errLab(r.e)}</td><td>${r.staff}</td><td>${pct(r.lostShare, 1)}</td><td>${mmss(r.medianWait)}</td><td>${Math.round(r.cost)}</td><td>${r.perPerson == null ? "–" : Math.round(r.perPerson)}</td></tr>`).join("");
      $$(sl, ".opday").forEach(e => (e.textContent = DAY_LABEL[st.day]));
      $$(sl, ".opseg button").forEach(b => b.classList.toggle("on", b.dataset.d === st.day));
      $(ctl, "input").value = st.e; $(ctl, '[data-v="e"]').textContent = errLab(st.e);
      const pk = cups.indexOf(Math.max(...cups));
      $(sl, ".optake .t").innerHTML = step < 2 ? `${DAY_LABEL[st.day]}: the forecast peaks at <b>${Math.round(cups[pk])}</b> cups at ${hourLabel(pk)}, about ${(cups[pk] / Math.min(...cups)).toFixed(1)}× the quietest hour.`
        : step < 3 ? (short ? `With the normal-day roster, <b>${short}</b> hour${short > 1 ? "s run" : " runs"} short by up to <b>${Math.round(maxShort)}</b> cups, while ${idleH} hours use less than half the crew's capacity.`
                            : `On a ${DAY_LABEL[st.day].toLowerCase()} the normal-day roster covers the peak, but ${idleH} hours use less than half the crew's capacity.`)
        : step < 4 ? `The forecast roster puts <b>${fc[pk]}</b> on at ${hourLabel(pk)}. Forecasting estimates the capacity needed; the sharing and equipment pages compare ways of providing it.`
        : st.e === 0 ? `Exact forecast: <b>${z.staff}</b> at the peak, <b>${pct(z.lostShare, 1)}</b> walk away, S$${Math.round(z.cost)} a day. Move the forecast error to see what a wrong forecast costs.`
        : `Forecast ${errLab(st.e)}: <b>${cur.staff}</b> at the peak, <b>${pct(cur.lostShare, 1)}</b> walk away, S$${Math.round(cur.cost)} a day; peak-hour contribution <b>S$${Math.round(cur.contribution)}</b> against S$${Math.round(z.contribution)} with an exact forecast.`;
      $(sl, ".opctlp").innerHTML = `<div class="k">Shown</div><p>${DAY_LABEL[st.day]}, today's split, forecast ${errLab(st.e)}. Other days: the deck's interactive version.</p>`;
    }
    sl.addEventListener("click", e => { const b = e.target.closest(".opseg button"); if (b) { st.day = b.dataset.d; draw(); } });
    ctl.addEventListener("input", e => { if (e.target.dataset?.k !== "e") return; st.e = Math.round(+e.target.value * 100) / 100; if (S && S.cur < 4) S.go(4); else draw(); });
    if (S) S.hooks.push(k => { step = k; draw(); });
    printers.push(() => { Object.assign(st, { day: "moderate", e: ERR.find(e => e < 0 && e > ERR[0]) ?? 0 }); step = 4; draw(); });
    draw();
  })();

  /* ---------------------------------------------------------------- 09 Simulation / Visual: the rendered counter video */
  (function counterVideo() {
    const sl = document.getElementById("c7"), seg = sl && $(sl, ".vidseg"); if (!seg) return;
    const panel = seg.closest(".panel"), vid = $(panel, "video");
    // neither source plays (the last <source> errors): say so, instead of an empty player
    $$(vid, "source").pop().addEventListener("error", () => { if (!vid.currentSrc || vid.networkState === 3) $(panel, ".vidv").classList.add("fail"); });
    const mode = m => { panel.classList.toggle("vidmode", m === "vid"); $$(seg, "button").forEach(b => b.classList.toggle("on", b.dataset.v === m));
      if (m === "vid") { vid.currentTime = 0; vid.play().catch(() => {}); } else vid.pause(); };
    seg.addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) mode(b.dataset.v); });
    new MutationObserver(() => { if (!sl.classList.contains("active")) vid.pause(); }).observe(sl, { attributes: true, attributeFilter: ["class"] });
    printers.push(() => mode("sim"));
  })();

  /* ---------------------------------------------------------------- 09b the operations manager's decision (counter.aiLayer) */
  (function opsDecision() {
    const sl = document.getElementById("o2"), AL = DATA.aiLayer; if (!sl || !AL) return;
    const price = SB.price_per_cup.value, gm = SB.gross_margin_per_cup.value;
    $(sl, ".dslot").replaceWith(daySeg(setDay));
    // one lever per column: the forecast changes only the crew, the machine only the equipment
    const COLS = [["Today", "normal-day roster · today's split", d => AL[d].today, "without"],
                  ["+ forecast", "forecast roster · today's split", d => AL[d].today, "with"],
                  ["+ one machine", "forecast roster · tea-and-milk machine", d => AL[d].single, "with"]];
    function draw() {
      const d = BUS.day, cols = COLS.map(([h, sub, f, k]) => ({ h, sub, r: f(d).brigade[k], fb: f(d).fixed_best?.[k], fw: f(d).fixed_worst?.[k] }));
      const contrib = r => r.served * price * gm - r.staff * P.wage;
      const ROWS = [["Crew at the peak", r => `${r.staff}`], ["Median wait", r => mmss(r.medianWait)], ["Walk-aways", r => pct(r.lostShare, 1)],
                    ["Cups served per person, peak hour", r => (r.staff ? Math.round(r.served / r.staff) : "–")],
                    ["Peak-hour contribution", r => `S$${Math.round(contrib(r))}`], ["Cost a day: roster and machines", r => `S$${Math.round(r.cost)}`]];
      // the last column is the proposed pilot: forecast roster, brigade, one tea-and-milk machine
      const rc = i => (i === cols.length - 1 ? ` class="pick"` : "");
      $(sl, ".o2tab").innerHTML = `<tr><th>Criterion</th>${cols.map((c, i) => `<th${rc(i)}>${i === cols.length - 1 ? `<span class="rtag">Proposed pilot</span>` : ""}${c.h}<br><small style="text-transform:none;letter-spacing:0">${c.sub}</small></th>`).join("")}</tr>` +
        ROWS.map(([lab, f]) => `<tr><td>${lab}</td>${cols.map((c, i) => `<td${rc(i)}>${f(c.r)}</td>`).join("")}</tr>`).join("") +
        `<tr><td>Flexible sharing, same crew: median ready time (sharing page)</td>${["today", "forecast", "single"].map((k, i) => { const x = DATA.sharing.decision[d][k];
          return `<td${rc(i)}>${x.fixed.staff < 2 ? "one person, no one to help" : `${mmss(x.fixed.median)} → ${mmss(x.assist.median)}`}</td>`; }).join("")}</tr>`;
      $$(sl, ".o2day").forEach(e => (e.textContent = DAY_LABEL[d]));
    }
    BUS.fns.push(draw); printers.push(draw); draw();
  })();

  /* ---------------------------------------------------------------- three-step overviews (slides 04 and 12), then the
     slide's interactive panel. Next steps 1 → 2 → 3, then opens the panel at its starting state; Previous from there
     returns to step 3; "← Overview" goes back to step 1. Print: the panel prints on the slide's page, a static copy of the
     overview on the page before it. */
  function stepIntro(sl, openLabel, onOpen) {
    const box = sl && $(sl, ".c5intro"); if (!box) return null;
    const N = $$(box, ".c5s").length, I = { on: false, st: 1 };
    const play = () => { box.classList.remove("play"); void box.offsetWidth; box.classList.add("play"); };
    const paint = () => {
      box.dataset.st = I.st; $(box, ".c5n").textContent = `${I.st} / ${N}`;
      $(box, '[data-c5="prev"]').disabled = I.st === 1;
      $(box, '[data-c5="next"]').textContent = I.st < N ? "Next ▶" : `${openLabel} ▶`;
      play();
    };
    I.open = st => { I.on = true; I.st = st; sl.classList.add("c5ov"); if (stepping()) buildTo(sl, -1); paint(); };
    I.close = () => { I.on = false; sl.classList.remove("c5ov"); box.classList.remove("play"); buildTo(sl, stepping() ? 0 : Infinity); onOpen?.(); };
    I.enter = fromEnd => { if (fromEnd) { I.on = false; sl.classList.remove("c5ov"); } else I.open(1); };
    I.next = () => { if (!I.on) return false; if (I.st < N) { I.st++; paint(); } else I.close(); return true; };
    I.prev = () => {
      if (I.on) { if (I.st > 1) { I.st--; paint(); return true; } return false; }
      const u0 = unitsOf(sl)[0];
      if (!stepping() || (sl._b <= 0 && (!u0?.S || u0.S.cur <= 1))) { I.open(N); return true; }
      return false;
    };
    sl._intro = I;
    box.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return; b.blur();     // so the arrow keys keep driving the slide
      if (b.dataset.c5 === "next") I.next(); else if (b.dataset.c5 === "prev") I.prev(); else if (b.dataset.c5 === "replay") play();
      else if (b.classList.contains("c5card")) {
        $$(box, ".c5card").forEach(c => c.classList.toggle("on", c === b));
        $(box, ".c5why").innerHTML = `<b>${$(b, ".lb").textContent}</b>: ${b.dataset.why}`;
      }
    });
    $(sl, ".c5back").addEventListener("click", e => { e.currentTarget.blur(); I.open(1); });
    I.printCopy = () => {
      const pg = document.createElement("section"); pg.className = "slide content"; pg.id = `${sl.id}p`; pg.dataset.chapter = sl.dataset.chapter;
      pg.innerHTML = `<div class="leafart" aria-hidden="true"></div><div class="inner"></div>`;
      [".kicker", ".head", ".bprob"].forEach(q => $(pg, ".inner").appendChild($(sl, q).cloneNode(true)));
      $$(sl, ":scope > .edge").forEach(e => pg.appendChild(e.cloneNode(true)));   // the margin labels go with the print copy
      const ov = box.cloneNode(true); ov.className = "c5intro static"; ov.removeAttribute("data-st");
      $$(ov, ".c5nav").forEach(n => n.remove()); $$(ov, ".c5k").forEach((k, i) => (k.textContent = `${i + 1}`));
      $(pg, ".inner").appendChild(ov); pg.appendChild($(sl, ".foot").cloneNode(true)); sl.before(pg);
    };
    printers.push(() => sl.classList.remove("c5ov"));
    addEventListener("afterprint", () => { if (I.on) sl.classList.add("c5ov"); });
    return I;
  }
  stepIntro(document.getElementById("c5"), "Open the forecaster")?.printCopy();

  /* ---------------------------------------------------------------- 13 online retailing optimisation: pickup planning.
     Each outlet prepares in short slots with a capacity (staff and equipment). Cups already waiting fill the first slots;
     forecast incoming cups take their share of every slot; an order goes into the first slot with room. Preparation and
     the walk run together, so the customer collects at whichever ends later. The app offers three optional choices;
     a confirmed order keeps its slot whatever happens to demand later. All values: assumptions.json, pickup (illustrative). */
  (function pickupPlan() {
    const sl = document.getElementById("ol"), PK = RAW.pickup; if (!sl || !PK) return;
    const O = PK.outlets.value, SLT = PK.slot_minutes.value, NS = PK.slots.value, CUPS = PK.order_cups.value, PREF = PK.preferred_after_min.value;
    const [h0, m0] = PK.now_clock.value.split(":").map(Number), clock = m => { const t = h0 * 60 + m0 + Math.round(m); return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
    const MR = PK.demand_multiplier, GREEN = "#2F6B45";
    const st = { m: MR.value, mine: [], pick: null, done: false };
    // per outlet and slot: confirmed cups come first (already waiting, b, and the demo's own orders), then the forecast (f)
    // takes what is left; "full" marks a slot where forecast demand does not fit. Room = what a new order can use.
    const load = (o, S = st) => { const inc = Math.round(O[o].incoming_per_slot * S.m); let left = O[o].backlog_cups;
      return Array.from({ length: NS }, (_, t) => { const cap = O[o].cap_per_slot, b = Math.min(cap, left); left -= b;
        const mine = S.mine.filter(x => x.o === o && x.t === t).length * CUPS, f = Math.max(0, Math.min(inc, cap - b - mine));
        return { cap, b, f, mine, room: cap - b - mine - f, full: inc > cap - b - mine }; }); };
    const slotFrom = (o, from, S) => { const L = load(o, S); for (let t = from; t < NS; t++) if (L[t].room >= CUPS) return t; return null; };
    const plan = (o, t) => t == null ? null : { o, t, ready: (t + 1) * SLT, at: Math.max(O[o].walk_min, (t + 1) * SLT) };
    function options(S = st) {
      const byWalk = O.map((_, o) => o).sort((a, b) => O[a].walk_min - O[b].walk_min);
      const near = plan(byWalk[0], slotFrom(byWalk[0], 0, S));
      const all = O.map((_, o) => plan(o, slotFrom(o, 0, S))).filter(Boolean);
      const early = all.length ? all.reduce((a, b) => (b.at < a.at || (b.at === a.at && O[b.o].walk_min < O[a.o].walk_min) ? b : a)) : null;
      const pt = Math.max(0, Math.ceil(PREF / SLT) - 1); let later = null;
      for (const o of byWalk) { const p = plan(o, slotFrom(o, pt, S)); if (p) { later = { ...p, win: true }; break; } }
      return [["near", "Nearby", near], ["early", "Earliest collection", early], ["later", "Later pickup", later]];
    }
    const detail = (k, p, same) => !p ? `<span class="d no">No slot with room in the next hour</span>`
      : same ? `<span class="d">Same as Nearby: the closest outlet is also the fastest</span>`
      : `<span class="d">${O[p.o].name} · walk ${O[p.o].walk_min} min</span><span class="d">${k === "later" ? `collect ${clock(p.at)}–${clock(p.at + SLT)}` : `drink ready ${clock(p.ready)}${p.at > p.ready ? `; you arrive ${clock(p.at)}` : ""}`}</span>`;
    const card = (k, lab, p, sel, i, ops) => { const n = ops[0][2], same = k === "early" && p && n && p.o === n.o && p.t === n.t;
      return `<button class="olopt${sel ? " sel" : ""}" data-k="${k}" style="--i:${i}"${p ? "" : " disabled"}><span class="t">${lab}<em>${p ? clock(p.at) : "–"}</em></span>${detail(k, p, same)}</button>`; };
    const bars = (o, S, hi) => { const L = load(o, S), cap = O[o].cap_per_slot;
      return `<div class="olw"><span class="n">${O[o].name}<small>walk ${O[o].walk_min} min · ${cap} cups a window</small></span><span class="olbars" style="--ns:${NS}">` +
        L.map((x, t) => `<span class="s${x.full ? " over" : ""}" title="${clock(t * SLT)}–${clock((t + 1) * SLT)}: ${x.b} waiting, ${x.f} forecast, ${x.mine} demo, room ${x.room}${x.full ? ", forecast does not fit" : ""}">` +
          `<i class="b" style="height:${100 * x.b / cap}%"></i><i class="m${hi === t ? " fly" : ""}" style="height:${100 * x.mine / cap}%"></i><i class="f" style="height:${100 * x.f / cap}%"></i></span>`).join("") + `</span></div>`; };
    const drinkline = `${PK.drink.value} · ${CUPS} cup${CUPS > 1 ? "s" : ""}`;
    $$(sl, '[data-pk="drink"]').forEach(e => (e.textContent = drinkline));
    $$(sl, '[data-pk="pref"]').forEach(e => (e.textContent = `around ${clock(PREF)}`));
    $$(sl, '[data-pk="drinkline"]').forEach(e => (e.textContent = `${drinkline} · now ${clock(0)}`));
    // the overview's step 3: the default options, the earliest one chosen, the order landing in that outlet's workload
    (() => { const S0 = { m: MR.value, mine: [] }, ops = options(S0), pick = ops[1][2];
      $(sl, '[data-pk="opts3"]').innerHTML = ops.map(([k, lab, p], i) => card(k, lab, p, k === "early", i, ops)).join("");
      if (pick) { $(sl, '[data-pk="conf3"]').textContent = `Collect at ${O[pick.o].name}, ${clock(pick.at)}. Not a real order.`;
        $(sl, '[data-pk="wl3"]').innerHTML = bars(pick.o, { ...S0, mine: [{ o: pick.o, t: pick.t }] }, pick.t); } })();
    // the map: the office, the three outlets, walking paths; the chosen outlet's path in red
    function map(ops) {
      const off = { x: 300, y: 196 }, chosen = st.done ? st.mine[st.mine.length - 1] : st.pick && ops.find(x => x[0] === st.pick)?.[2];
      let s = `<rect width="560" height="320" rx="12" fill="#F1EADB"/>` +
        [60, 140, 220, 300].map(y => `<path d="M0 ${y} H560" stroke="#fff" stroke-width="12"/>`).join("") + [110, 230, 370, 490].map(x => `<path d="M${x} 0 V320" stroke="#fff" stroke-width="12"/>`).join("") +
        `<rect x="380" y="20" width="90" height="34" rx="6" fill="#DCE8D6"/><text x="425" y="42" font-size="11" fill="${GREEN}" text-anchor="middle">park</text>`;
      O.forEach((x, o) => { const on = chosen && chosen.o === o;
        s += `<path d="M${off.x} ${off.y} Q${(off.x + x.x) / 2} ${Math.min(off.y, x.y) - 30} ${x.x} ${x.y}" fill="none" stroke="${on ? COL.red : COL.taupe}" stroke-width="${on ? 3.5 : 2}" stroke-dasharray="5 6"/>` +
          `<g transform="translate(${x.x} ${x.y})"><path d="M0 0 c-9 -12 -13 -17 -13 -24 a13 13 0 0 1 26 0 c0 7 -4 12 -13 24 Z" fill="${on ? COL.red : COL.navy}"/><circle cy="-24" r="5" fill="#fff"/></g>` +
          T(x.x, x.y + 18, x.name, `font-size="13" font-weight="600" fill="${COL.ink}" text-anchor="middle" stroke="#F1EADB" stroke-width="4" paint-order="stroke"`) +
          T(x.x, x.y + 33, `walk ${x.walk_min} min`, `font-size="11.5" fill="${COL.ink2}" text-anchor="middle" stroke="#F1EADB" stroke-width="4" paint-order="stroke"`); });
      s += `<rect x="${off.x - 22}" y="${off.y - 34}" width="44" height="40" rx="4" fill="#fff" stroke="${COL.navy}" stroke-width="2.5"/>` +
        [0, 1].map(r => [0, 1, 2].map(c => `<rect x="${off.x - 16 + c * 12}" y="${off.y - 28 + r * 13}" width="8" height="8" rx="1" fill="${COL.ice}"/>`).join("")).join("") +
        `<circle cx="${off.x}" cy="${off.y + 16}" r="8" fill="${GREEN}"/>` + T(off.x, off.y + 40, "You · office", `font-size="12.5" font-weight="600" fill="${GREEN}" text-anchor="middle" stroke="#F1EADB" stroke-width="4" paint-order="stroke"`);
      $(sl, ".olmsvg").innerHTML = s;
    }
    const slider = $(sl, 'input[data-ol="m"]'); Object.assign(slider, { min: MR.range[0], max: MR.range[1], step: 0.1, value: st.m });
    function draw() {
      const ops = options(), scr = $(sl, ".olphd .olscr");
      $(sl, '[data-pk="opts"]').innerHTML = ops.map(([k, lab, p], i) => card(k, lab, p, st.pick === k, i, ops)).join("");
      $(sl, '[data-ol="confirm"]').disabled = !(st.pick && ops.find(x => x[0] === st.pick)?.[2]);
      scr.classList.toggle("done", st.done);
      $(sl, '[data-pk="wl"]').innerHTML = O.map((_, o) => bars(o, st)).join("");
      $(sl, '[data-pk="mult"]').textContent = `×${st.m.toFixed(1)}`; slider.value = st.m;
      map(ops);
      const over = O.reduce((a, _, o) => a + load(o).filter(x => x.full).length, 0), last = st.mine[st.mine.length - 1];
      if (last) $(sl, '[data-pk="conf"]').textContent = `Collect at ${O[last.o].name}, ${clock(last.at)}. It keeps this slot even if demand changes. Not a real order.`;
      $(sl, '[data-pk="now"]').innerHTML = `Online demand ×${st.m.toFixed(1)} the forecast. Options: ` + ops.map(([, lab, p]) => `${lab.toLowerCase()} ${p ? `${clock(p.at)} at ${O[p.o].name}` : "none with room"}`).join("; ") +
        `. Demo orders confirmed: <b>${st.mine.length}</b>; slots where forecast demand does not fit: <b>${over}</b>${over ? " (confirmed orders keep their slots; new customers see other outlets or times)" : ""}. Made-up values.`;
    }
    sl.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b || !b.closest(".oldemo")) return; b.blur();
      if (b.classList.contains("olopt") && !st.done) { st.pick = b.dataset.k; draw(); }
      else if (b.dataset.ol === "confirm") { const p = options().find(x => x[0] === st.pick)?.[2]; if (p) { st.mine.push({ ...p }); st.done = true; draw(); } }
      else if (b.dataset.ol === "again") { st.done = false; st.pick = null; draw(); }
      else if (b.dataset.ol === "reset") { Object.assign(st, { m: MR.value, mine: [], pick: null, done: false }); draw(); }
    });
    slider.addEventListener("input", () => { st.m = +slider.value; draw(); });
    printers.push(() => { Object.assign(st, { m: MR.value, mine: [], pick: "early", done: false }); draw(); });
    draw();
    stepIntro(sl, "Open the app demo")?.printCopy();
  })();

  /* ---------------------------------------------------------------- the earlier online slides (appendix). The offer a
     member sees in each scenario (proposed policy, online_case.offer_policy); 06: the pickup checkout for each journey;
     07: the business case waterfall by scenario (DATA.online, sim/online.js) and the proposed plan */
  (function onlineRetail() {
    const OC = RAW.online_case, ON = DATA.online; if (!OC || !ON) return;
    const POL = OC.offer_policy.value, hs = RAW.store.hourly_demand_share.value, h0 = DATA.counter.firstHour;
    const sgd = x => `S$${x.toFixed(2)}`, pc = x => `${Math.round(100 * x)}%`, hh = h => `${String(h).padStart(2, "0")}:00`;
    const sk = x => `${x < 0 ? "−" : ""}S$${Math.round(Math.abs(x) / 1000).toLocaleString("en-GB")}k`;
    // the quietest two open hours after the lunch peak, and the first hour after the peak the customer orders in
    let qi = 3; for (let i = 3; i < hs.length - 2; i++) if (hs[i] + hs[i + 1] < hs[qi] + hs[qi + 1]) qi = i;
    const quiet = `${hh(h0 + qi)}–${hh(h0 + qi + 2)}`, peakSet = [...hs.keys()].sort((a, b) => hs[b] - hs[a]).slice(0, OC.peak_hours.value);
    const [nh] = RAW.pickup.now_clock.value.split(":").map(Number); let after = nh - h0; while (peakSet.includes(after)) after++;
    const drink = RAW.pickup.drink.value, B = ON.scenarios.base;

    const od = document.getElementById("od");
    if (od) {
      const SC = [
        { k: "offpeak", lab: "Off-peak", ctx: `Weekday · ${hh(h0 + qi)} · a quiet window`,
          offers: [[sgd(POL.offpeak.off) + " off", `a featured drink: the ${POL.offpeak.what}`]],
          win: `<b>Eligible</b> today, ${quiet}, one app order`,
          why: "Spare capacity in a quiet window. An offer pays only if it brings orders that would not otherwise happen; a model estimates who that is likely to be.",
          row: [`up to ${sgd(POL.offpeak.off)}, ${POL.offpeak.what}`, "quiet windows"] },
        { k: "peak", lab: "Peak", ctx: `Weekday · ${RAW.pickup.now_clock.value} · peak`,
          offers: [["No discount now", "the counter is near capacity", true], [sgd(POL.peak_preorder.off) + " off a pre-order", `if you collect from ${hh(h0 + after)}, when there is room`]],
          win: "<b>Proposed</b> Grab delivery limited while slots are full, as Grab's merchant tools allow (to confirm)",
          why: "At the peak a discount would subsidise orders that come anyway. A pre-order discount helps only if it moves collection into a window with room: ordering earlier alone does not cut the peak's production workload.",
          row: [`none; ${sgd(POL.peak_preorder.off)} off a pre-order collected later`, "busiest hours"] },
        { k: "weather", lab: "Weather or event", ctx: "Hot afternoon · no nearby event",
          offers: [[sgd(POL.hot_weather.off) + " off", "a cold drink"]],
          win: `<b>Rules</b> normal weather or rain ${sgd(POL.normal_or_rain.off)} off · nearby event: no offer`,
          why: "Hot weather already lifts demand, so a smaller offer; none near events, when demand is already high. A model would estimate those lifts from weather and event data rather than assume them.",
          row: [`${sgd(POL.hot_weather.off)} hot; ${sgd(POL.normal_or_rain.off)} normal or rain; none at events`, "by forecast"] },
        { k: "dormant", lab: "Inactive member", ctx: "Member · no orders lately",
          offers: [[sgd(POL.dormant.off) + " off your favourite", drink]],
          win: `<b>Eligible</b> for ${POL.dormant.days} days · then a free upsize for ${POL.dormant.upsize_after_days} more days`,
          why: "Win back a member before they lapse. A model scores who is lapsing and who would return only with an offer; members who would come back anyway should not get one.",
          row: [`up to ${sgd(POL.dormant.off)} off a favourite; then a free upsize`, `${POL.dormant.days} days, then ${POL.dormant.upsize_after_days} more`] },
      ];
      const seg = $(od, ".odseg"); let cur = 0;
      seg.innerHTML = SC.map((s, i) => `<button class="btn${i ? "" : " on"}" data-i="${i}">${s.lab}</button>`).join("");
      const draw = () => { const s = SC[cur];
        $$(seg, ".btn").forEach((b, i) => b.classList.toggle("on", i === cur));
        $(od, '[data-od="phone"]').innerHTML = `<div class="olbar"><b>Offers for you</b><span>Chagee app · illustrative</span></div><div class="odscr-b">
          <div class="odctx">${s.ctx}</div>${s.offers.map(([a, b, none]) => `<div class="odoff${none ? " none" : ""}"><b>${a}</b><span>${b}</span></div>`).join("")}
          <div class="odwin">${s.win}</div><div class="odctx" style="margin-top:auto">Proposed policy · discount only</div></div>`;
        $(od, '[data-od="why"]').textContent = s.why;
        $(od, '[data-od="tab"]').innerHTML = `<tr><th>Scenario</th><th>Offer</th><th>When</th></tr>` + SC.map((x, i) => `<tr class="${i === cur ? "cur" : ""}"><td>${x.lab}</td><td>${x.row[0]}</td><td>${x.row[1]}</td></tr>`).join("");
        $(od, '[data-od="printsc"]').textContent = `Printed: the ${s.lab.toLowerCase()} scenario; all four are in the table.`; };
      seg.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) { cur = +b.dataset.i; draw(); } });
      printers.push(() => { cur = 0; draw(); }); draw();
    }

    const os = document.getElementById("os");
    if (os) {
      const D = B.i3.delivery, G = B.i3.grabPickup, rw = sgd(OC.pickup_reward.value), comm = RAW.site_ext.delivery_commission_share.value;
      const out = RAW.pickup.outlets.value[0].name, sel = (t, d) => `<div class="osopt sel"><b>${t}</b>${d}</div>`, opt = (t, d) => `<div class="osopt"><b>${t}</b>${d}</div>`;
      const J = [
        { lab: "Delivery → pickup", title: "Delivery → Chagee-app pickup · changes fulfilment",
          what: "The order leaves delivery for in-app pickup: no rider and no platform commission. Its revenue moves channel; it is not added unless the customer buys more.",
          val: `Chagee gains about <b>${sgd(D.perOrder)}</b> an order: ${sgd(RAW.storyboard.price_per_cup.value)} × (${pc(comm)} commission − ${pc(OC.app_payment_cost.value)} payment) − ${rw} reward. Assumptions, not Chagee's terms.`,
          steps: [`<div class="odctx">How would you like it?</div>${opt("Delivery · via Grab", "a rider brings it to you")}${sel("Pickup in the CHAGEE app", `${out} · ready while you walk`)}`,
                  `<div class="odctx">Your savings, shown up front</div><div class="ossave"><span>Delivery fee</span><b>none</b></div><div class="ossave"><span>Pickup reward (proposed)</span><b>${rw} voucher</b></div><div class="ossave"><span>Rewards on this order</span><b>earn and redeem</b></div>`,
                  `<div class="osrw"><b>Reward added</b>${rw} off your next app pickup · proposed</div><div class="odctx">Order confirmed · simulated</div>`] },
        { lab: "Grab pickup → app", title: "Grab self-pickup → Chagee-app pickup · changes the channel",
          what: "Same outlet, same collection: only where the order is placed changes. Chagee avoids Grab's pickup commission, which is not public.",
          val: `At an assumed ${pc(OC.grab_pickup_commission.value)} pickup commission it gains <b>${sgd(G.perOrder)}</b> an order after the ${rw} reward: it pays only above <b>${(100 * G.breakEvenComm).toFixed(1)}%</b>.`,
          steps: [`<div class="odctx">Collecting it yourself?</div>${opt("Self-pickup on Grab", "same outlet")}${sel("Pickup in the CHAGEE app", "same outlet, same time")}`,
                  `<div class="odctx">Why the app</div><div class="ossave"><span>Rewards on this order</span><b>earn and redeem</b></div><div class="ossave"><span>Pickup reward (proposed)</span><b>${rw} voucher</b></div>`,
                  `<div class="osrw"><b>Reward added</b>${rw} off your next app pickup · proposed</div><div class="odctx">Order confirmed · simulated</div>`] },
        { lab: "Concept", title: "Concept · reward Grab self-pickup through membership",
          what: "The brief's idea: the order stays on Grab and the reward lands in CHAGEE membership. No commission is saved, so the reward is a cost unless it later moves the customer to the app. Not in the totals.",
          val: "To confirm before any pilot: account linking (exists for earning on GrabFood orders), proof that a Grab order was self-pickup, and reward eligibility rules.",
          steps: [`<div class="oscon">Proposed integration · concept, not live</div>${sel("GrabFood self-pickup", "CHAGEE membership linked on GrabFood")}`,
                  `<div class="oscon">Concept</div><div class="ossave"><span>Self-pickup verified</span><b>to confirm</b></div><div class="ossave"><span>Bonus for collecting</span><b>proposed</b></div>`,
                  `<div class="oscon">Concept</div><div class="osrw"><b>Bonus credited</b>to your CHAGEE account · concept only</div>`] },
      ];
      const seg = $(os, ".osseg"); let j = 0, k = 0;
      seg.innerHTML = J.map((s, i) => `<button class="btn${i ? "" : " on"}" data-i="${i}">${s.lab}</button>`).join("");
      const draw = () => { const s = J[j];
        $$(seg, ".btn").forEach((b, i) => b.classList.toggle("on", i === j));
        $(os, '[data-os="phone"]').innerHTML = `<div class="olbar"><b>Checkout</b><span>${j === 2 ? "Grab with CHAGEE membership · concept" : "Chagee app · illustrative"}</span></div><div class="odscr-b">${s.steps[k]}</div>`;
        $(os, '[data-os="step"]').textContent = `Step ${k + 1} of ${s.steps.length}`;
        $(os, '[data-os="jt"]').textContent = s.title; $(os, '[data-os="jwhat"]').textContent = s.what; $(os, '[data-os="jval"]').innerHTML = s.val;
        $(os, '[data-os="printj"]').textContent = `Printed: ${s.title.split(' · ')[0].toLowerCase()}, the savings step; the other journeys are in the notes.`; };
      seg.addEventListener("click", e => { const b = e.target.closest("[data-i]"); if (b) { j = +b.dataset.i; k = 0; draw(); } });
      $(os, '[data-os="next"]').onclick = () => { k = Math.min(J[j].steps.length - 1, k + 1); draw(); };
      $(os, '[data-os="prev"]').onclick = () => { k = Math.max(0, k - 1); draw(); };
      printers.push(() => { j = 0; k = 1; draw(); }); draw();
    }

    const oe = document.getElementById("oe");
    if (oe) {
      const svg = $(oe, ".oewf"), seg = $(oe, ".oeseg"), L = { low: "Low", base: "Base", high: "High" }; let s = "base";
      seg.innerHTML = Object.keys(L).map(k => `<button class="btn${k === s ? " on" : ""}" data-s="${k}">${L[k]}</button>`).join("");
      const draw = () => { const A = ON.scenarios[s];
        $$(seg, ".btn").forEach(b => b.classList.toggle("on", b.dataset.s === s));
        const steps = [["Capacity-aware ordering", A.i1.contrib], ["Targeted discounts", A.i2.contrib], ["Pickup rewards", A.i3.contrib], ["Gross contribution", A.gross, "t"],
                       [`Team (${OC.run_team_people.value} people)`, -A.team], ["Cloud", -A.cloud], ["Operating result", A.operating, "t"]];
        let run = 0; const bars = steps.map(([lab, v, t]) => { const a = t ? 0 : run, b2 = t ? v : run + v; if (!t) run += v; return { lab, v, t, lo: Math.min(a, b2), hi: Math.max(a, b2) }; });
        const top = Math.max(...bars.map(b => b.hi)), bot = Math.min(0, ...bars.map(b => b.lo)), Y0 = 22, H = 178, y = v => Y0 + (top - v) / (top - bot) * H;
        const W = 640, bw = 62, gap = (W - 30 - bw * bars.length) / (bars.length - 1);
        svg.innerHTML = `<line x1="16" x2="${W - 8}" y1="${y(0)}" y2="${y(0)}" stroke="#9A9387" stroke-width="1"/>` + bars.map((b, i) => {
          const x = 22 + i * (bw + gap), col = b.t ? "#24406B" : b.v >= 0 ? "#2F6B45" : "#B8322B", yl = y(b.hi) - 6;
          const words = b.lab.split(" "), l1 = words.slice(0, Math.ceil(words.length / 2)).join(" "), l2 = words.slice(Math.ceil(words.length / 2)).join(" ");
          return `<rect x="${x}" y="${y(b.hi)}" width="${bw}" height="${Math.max(1.5, y(b.lo) - y(b.hi))}" rx="3" fill="${col}"/>` +
            `<text x="${x + bw / 2}" y="${yl}" font-size="12.5" font-weight="700" fill="${col}" text-anchor="middle">${sk(b.v)}</text>` +
            `<text x="${x + bw / 2}" y="${Y0 + H + 22}" font-size="11" fill="#4A4A4A" text-anchor="middle">${l1}</text><text x="${x + bw / 2}" y="${Y0 + H + 36}" font-size="11" fill="#4A4A4A" text-anchor="middle">${l2}</text>`;
        }).join("");
        const C = ON.cash[s];
        $(oe, '[data-oe="note"]').innerHTML = `${L[s]} scenario. Moved orders shift revenue and count only the commission avoided, less rewards. Gross: ${sk(ON.scenarios.low.gross)} low to ${sk(ON.scenarios.high.gross)} high. Implementation spend ${sk(C.implementation)}; payback: ${C.payback ? `month ${C.payback}` : `none within ${RAW.business_case.horizon_years.value} years`}.`; };
      seg.addEventListener("click", e => { const b = e.target.closest("[data-s]"); if (b) { s = b.dataset.s; draw(); } });
      const RM = OC.roadmap.value, GT = OC.gates.value, team = OC.team.value;
      $(oe, '[data-oe="road"]').innerHTML = `<div class="oerd">${RM.map(p => `<div class="ph">${p.phase}<small>months ${p.from}–${p.to} · ${team.filter(r => r.from_month <= p.from).reduce((a, r) => a + r.people, 0)} people</small></div>`).join("")}</div>
        <div class="oegt">${GT.map(g => `<span><b>${g.name}</b> · month ${g.month}: ${g.test}</span>`).join("")}</div>`;
      printers.push(() => { s = "base"; draw(); }); draw();
    }
  })();

  /* ---------------------------------------------------------------- slides 03 to 05: Proposal 1, AI-enabled demand management.
     03: five points, one per Next, each lighting its part of a looping scene; 04: three steps in the .c5intro look, the last
     Next goes to 05; 05: the pickup and delivery phones and the execution steps panel. Times are demand_mgmt's illustrative
     scenario (the team's reference deck), not Chagee data. */
  /* ---------------------------------------------------------------- 11 further application: an existing outlet temporarily
     unavailable, on the slide 10 demand model run in reverse (sitepick.unavailable): a panel on the decision slide, and the
     same view as an appendix page for print. An illustrative scenario, never a closure recommendation. */
  /* ---------------------------------------------------------------- 09 the expansion manager's decision, as charts: bar widths
     and the five-year profit range from the same results the table (#e2t) prints (DATA.site, DATA.pnl); the labels in the
     bars are the template's. The slide's stepper shows the three steps; CSS grows each step's marks in. */
  (function decisionCharts() {
    const sl = document.getElementById("e2"), svg = sl && $(sl, ".e2rng"); if (!svg) return;
    const top = DATA.site.top, bt = DATA.site.besideTop, PN = DATA.pnl, GEO = window.STORY.GEO;
    const w = (k, x) => ($(sl, `[data-k="${k}"]`).style.width = pct(x, 2));
    w("wo", bt.fromUnmet / bt.cups); w("wi", top.fromUnmet / top.cups);
    const mx = Math.max(bt.cups, top.cups) / 0.8;                      // the larger store fills 80% of the row; "sold" follows
    w("wo-net", bt.netNew / mx); w("wo-mv", bt.cannibal / mx); w("wi-net", top.netNew / mx); w("wi-mv", top.cannibal / mx);
    // the range chart: one row per site, low to high volume as a bar, base volume as a dot, the opening investment dashed
    const rows = [["wo", `Beside ${GEO.numbers[bt.j]} · ${GEO.names[bt.j]}`, "#DDD6CA", "#8F8676"], ["wi", `Cluster near ${top.hub}`, "#C9D3E6", COL.navy]].map(([k, name, rg, dot]) =>
      ({ name, rg, dot, lo: PN[k].low.total.opProfit, base: PN[k].base.total.opProfit, hi: PN[k].high.total.opProfit, inv: PN[k].base.invest }));
    const all = rows.flatMap(r => [r.lo, r.hi, r.inv]), H = 5e5;
    const d0 = Math.floor((Math.min(0, ...all) - 1e5) / H) * H, d1 = Math.ceil((Math.max(...all) + 1e5) / H) * H;   // half a million either side, with room
    const L = 8, R = 512, X = v => L + (v - d0) / (d1 - d0) * (R - L), AX = 246;
    const m = v => `${v < 0 ? "−" : ""}${(Math.abs(v) / 1e6).toFixed(Math.abs(v) < 1e5 ? 2 : 1)}`;
    const tk = t => t === 0 ? "S$0" : `${t < 0 ? "−" : ""}S$${Math.abs(t / 1e6)}m`, cw = s => s.length * 6.3;
    let s = `<rect x="${L}" y="6" width="${X(0) - L}" height="${AX - 6}" fill="#FBEFEE"/>`;
    for (let t = Math.ceil(d0 / 1e6) * 1e6; t <= d1; t += 1e6)
      s += `<line x1="${X(t)}" y1="6" x2="${X(t)}" y2="${AX}" stroke="#EEEAE2" stroke-width="1"/>` + T(X(t), AX + 16, tk(t), `font-size="11.5" fill="${COL.taupe}" text-anchor="middle"`);
    s += `<line x1="${X(0)}" y1="6" x2="${X(0)}" y2="${AX}" stroke="${COL.ink}" stroke-width="2"/>` +
         T(X(0) - 6, 20, "LOSES MONEY", `font-size="9.5" font-weight="700" letter-spacing="1.2" fill="${COL.red}" text-anchor="end"`) +
         T(X(0) + 6, 20, "MAKES MONEY", `font-size="9.5" font-weight="700" letter-spacing="1.2" fill="#2F6B45"`);
    rows.forEach((r, i) => {
      const y = 84 + i * 100, xl = X(r.lo), xh = X(r.hi), lo = `low ${m(r.lo)}`, hi = `high ${m(r.hi)}`;
      const clash = xl + cw(lo) + 8 > xh - cw(hi);                      // a short bar: the high label drops a line
      s += T(L + 10, y - 34, r.name, `font-size="13.5" font-weight="500" fill="${COL.ink}" stroke="#fff" stroke-width="4" paint-order="stroke"`) +
           `<rect class="rg" x="${xl}" y="${y - 7}" width="${xh - xl}" height="14" rx="7" fill="${r.rg}"/>` +
           `<line class="iv" x1="${X(r.inv)}" y1="${y - 17}" x2="${X(r.inv)}" y2="${y + 17}" stroke="${COL.ink2}" stroke-width="2" stroke-dasharray="4 3"/>` +
           `<circle class="bd" cx="${X(r.base)}" cy="${y}" r="8" fill="${r.dot}" stroke="#fff" stroke-width="2.5"/>` +
           `<g class="vl">` + T(X(r.base), y - 15, `base ${m(r.base)}`, `font-size="12" font-weight="600" fill="${COL.ink}" text-anchor="middle"`) +
           T(xl, y + 25, lo, `font-size="11.5" fill="${COL.ink2}"`) + T(xh, y + (clash ? 40 : 25), hi, `font-size="11.5" fill="${COL.ink2}" text-anchor="end"`) + `</g>`;
    });
    svg.innerHTML = s;
  })();

  (function existingOutlets() {
    const Site = window.ChageeSite, GEO = window.STORY.GEO; if (!Site?.unavailable) return;
    const M = Site.model(Sim, RAW, GEO), oname = j => `${GEO.numbers[j]} · ${GEO.names[j]}`;
    const nn = j => Site.outlet(M, j).neighbour.km, J0 = GEO.outlets.map((o, j) => j).sort((a, b) => nn(a) - nn(b))[0];
    const km = x => `${x.toFixed(1)} km`, n = x => Math.round(x).toLocaleString("en-SG");
    function mount(box, live) {
      const S = { j: J0, on: !live }, svg = $(box, ".exosvg"), side = $(box, ".exoside");
      svg.innerHTML = `<image href="${window.STORY.MAP}" x="0" y="0" width="1672" height="640" opacity=".6"/><g></g>`;
      const layer = $(svg, "g");
      const draw = () => {
        const u = Site.unavailable(M, S.j), [ox, oy] = GEO.outlets[S.j], top = u.recv.slice(0, 3);
        let s = "";
        if (S.on) {
          s += `<circle cx="${ox}" cy="${oy - 14}" r="${M.walkKm / M.kmpx}" fill="rgba(184,50,43,.10)" stroke="${COL.red}" stroke-width="2" stroke-dasharray="7 6"/>`;
          top.forEach(r => { const [x, y] = GEO.outlets[r.j];
            s += `<line class="fl" pathLength="1" x1="${ox}" y1="${oy - 14}" x2="${x}" y2="${y - 14}" stroke="#2F6B45" stroke-width="${Math.max(4, Math.min(16, r.cups / 12))}" stroke-linecap="round" opacity=".75"/>`; });
        }
        GEO.outlets.forEach(([x, y], j) => {
          const me = j === S.j, off = me && S.on;
          s += `<g class="ol" data-j="${j}"><circle cx="${x}" cy="${y - 14}" r="${me ? 22 : 17}" fill="${off ? "#B9B2A6" : me ? COL.red : COL.navy}" stroke="#fff" stroke-width="3"/>` +
               T(x, y - 8, GEO.numbers[j], `font-size="${me ? 19 : 16}" font-weight="700" fill="#fff" text-anchor="middle"`) + `</g>`;
        });
        // each label sits beyond its outlet, pointing away from the unavailable one, nudged outward until it clears
        // the unavailable outlet, every outlet marker and the labels already placed
        const w = 96, h = 34, hit = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
        const busy = GEO.outlets.map(([x, y]) => ({ x, y: y - 14, w: 34, h: 34 })); busy.push({ x: ox, y: oy - 14, w: 60, h: 60 });
        if (S.on) top.forEach(r => { const [x, y] = GEO.outlets[r.j], dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy) || 1;
          let b;
          for (let k = 0; k < 14; k++) {
            b = { x: Math.max(w / 2, Math.min(1672 - w / 2, x + dx / d * (66 + 18 * k))), y: Math.max(h / 2, Math.min(640 - h / 2, y - 14 + dy / d * (40 + 18 * k))), w, h };
            if (!busy.some(o => hit(b, o))) break;
          }
          busy.push(b);
          s += `<g class="rv"><line x1="${x}" y1="${y - 14}" x2="${b.x}" y2="${b.y}" stroke="#2F6B45" stroke-width="1.5" opacity=".6"/>` +
               `<rect x="${b.x - w / 2}" y="${b.y - h / 2}" width="${w}" height="${h}" rx="8" fill="#fff" stroke="#2F6B45" stroke-width="2.5"/>` +
               T(b.x, b.y + 8, `+${n(r.cups)}`, `font-size="23" font-weight="700" fill="#2F6B45" text-anchor="middle"`) + `</g>`; });
        if (S.on) s += `<path class="rv" d="M${ox - 13} ${oy - 27} l26 26 M${ox + 13} ${oy - 27} l-26 26" stroke="${COL.red}" stroke-width="5" stroke-linecap="round"/>`;
        layer.innerHTML = s;
        const m = (l, v, cls = "") => `<dt>${l}</dt><dd class="${cls}">${S.on ? v : "—"}</dd>`;
        side.innerHTML = `<div class="exosel"><span class="t">Selected outlet</span><b>${oname(S.j)}${S.on ? ` <em class="exoun">temporarily unavailable</em>` : ""}</b><small>about ${n(u.cups)} cups a day today (model) · nearest outlet ${km(nn(S.j))} away</small></div>
          ${live ? `<button class="btn ${S.on ? "" : "primary "}exogo" data-exo="go">${S.on ? "↺ Back to today" : "Explore temporary unavailability"}</button>` : ""}
          <span class="exoscn">Illustrative scenario · not a closure recommendation</span>
          <dl class="exom${S.on ? "" : " off"}">
            ${m("Demand potentially retained by nearby outlets", `${n(u.retained)} a day · ${pct(u.retained / u.cups)}`)}
            ${m("Demand potentially lost to Chagee", `${n(u.lost)} a day · ${pct(u.lost / u.cups)}`, "lost")}
            ${m("Customer travel, for those who move", `${km(u.travelBeforeKm)} → ${km(u.travelAfterKm)}`)}
            ${m("Additional workload at receiving outlets", top.length ? "" : "none")}
            ${S.on ? top.map(r => `<dt>&nbsp;&nbsp;${oname(r.j)}</dt><dd>+${n(r.cups)} · ${pct(r.cups / r.today)} more</dd>`).join("") : ""}
            <small>Same demand model as the new-store forecast, run in reverse; it has no capacity limit, so receiving outlets' service levels need checking.</small></dl>
          <div class="exodec"><span class="lab">Manager's decision · expansion manager</span><p>Does this location need operational improvement, relocation or a deeper consolidation review?</p></div>`;
        box.classList.remove("go"); if (S.on && live) { void box.offsetWidth; box.classList.add("go"); }
      };
      svg.addEventListener("click", e => { const g = e.target.closest(".ol"); if (!g || !live) return; S.j = +g.dataset.j; S.on = false; draw(); });
      box.addEventListener("click", e => { const b = e.target.closest("[data-exo=go]"); if (b) { b.blur(); S.on = !S.on; draw(); } });
      draw();
      return { reset: () => { S.j = J0; S.on = false; draw(); } };
    }
    // one live overlay (on slide 09); a What about existing outlets? button on any slide (09, and the table in the appendix)
    // moves it into that slide and opens it, so Back to the decision returns to the slide it was opened from
    const ov = $(document, "#e2 .exo"), hosts = slides.filter(s => $(s, "[data-exo=open]"));
    if (ov) {
      const V = mount(ov, true);
      const close = () => ov.classList.remove("open"), mo = new MutationObserver(close);
      hosts.forEach(sl => {
        sl.addEventListener("click", e => { const b = e.target.closest("[data-exo=open],[data-exo=close]"); if (!b) return; b.blur();
          if (b.dataset.exo === "open") { $(sl, ".inner").appendChild(ov); V.reset(); ov.classList.add("open"); } else close(); });
        mo.observe(sl, { attributes: true, attributeFilter: ["class"] });
      });
      addEventListener("keydown", e => { if (e.key === "Escape") close(); });
      printers.push(close);
    }
    const ap = document.getElementById("xo"); if (ap) mount($(ap, ".exo"), false);
  })();

  (function demandMgmt() {
    const DMr = RAW.demand_mgmt; if (!DMr) return;
    const v = k => DMr[k].value, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const B = v("busy_outlet"), AL = v("alt_outlet"), THR = DMr.wait_threshold_min;

    const pp = document.getElementById("p1p");
    if (pp) {
      const panel = $(pp, ".p1panel"), sc = $(pp, ".p1scene"), tip = $(pp, ".p1tip"), rows = $$(pp, ".p1row"), N = rows.length + 1;
      const TIPS = {
        walker: ["Drop-off", "A customer checks the wait and walks away: a sale lost before an order is placed."],
        queue: ["Crowding", "Those who stay fill the outlet, so it sells less and delivery orders slow down too."],
        wait: ["Long wait", "The wait is longer than customers expected, and the experience suffers."],
        riders: ["Riders waiting", "Delivery customers cannot see the queue, so orders keep arriving and riders wait at the collection shelf."],
        notif: ["Orders keep arriving", "New app and delivery orders reach the counter whatever the queue."],
        store: ["The store experience", "Chagee's stores are part of the brand; a frustrated crowd at the door undoes the experience they are built for."] };
      let k = 1;
      const paint = () => {
        panel.dataset.k = k; if (k < N) sc.dataset.f = k; else delete sc.dataset.f;
        rows.forEach((r, i) => { r.classList.toggle("seen", i < k); r.classList.toggle("cur", i === k - 1); });
        $$(pp, ".p1dots i").forEach((d, i) => d.classList.toggle("on", i < k));
        $(pp, ".p1n").textContent = `${k} / ${N}`; $(pp, '[data-p1="next"]').textContent = k < N ? "Next ▶" : "Next slide ▶"; tip.innerHTML = "";
        $(pp, '[data-p1="end"]').hidden = k >= N;                                    // Skip to end: gone once there
      };
      const setPlay = on => { sc.classList.toggle("paused", !on); $(pp, '[data-p1="play"]').textContent = on ? "❚❚ Pause" : "▶ Play"; };
      pp._intro = { enter: fromEnd => { k = fromEnd ? N : 1; paint(); },
        next: () => { if (k < N) { k++; paint(); return true; } return false; },
        prev: () => { if (k > 1) { k--; paint(); return true; } return false; } };
      pp.addEventListener("click", e => {
        const b = e.target.closest("[data-p1]"), row = e.target.closest(".p1row"), hs = e.target.closest(".hs");
        if (b) { b.blur(); const a = b.dataset.p1;
          if (a === "next") { if (!pp._intro.next()) show(cur + 1); }
          else if (a === "play") setPlay(sc.classList.contains("paused"));
          else if (a === "end") { k = N; paint(); }
          else if (a === "replay") { const s = $(sc, "svg"); s.replaceWith(s.cloneNode(true)); k = 1; paint(); setPlay(!still); } }
        else if (row) { k = rows.indexOf(row) + 1; paint(); }
        else if (hs && TIPS[hs.dataset.hs]) { const [h, t] = TIPS[hs.dataset.hs]; tip.innerHTML = `<b>${h}</b>${t}`; }
      });
      printers.push(() => { k = N; paint(); }); paint(); setPlay(!still);
    }

    const pb = document.getElementById("p1b");
    if (pb) {
      const box = $(pb, ".c5intro"), N = $$(box, ".c5s").length, pop = $(box, ".pop"); let st = 1;
      $$(pb, '[data-p1b="busy"]').forEach(e => (e.textContent = B)); $$(pb, '[data-p1b="alt"]').forEach(e => (e.textContent = AL));
      const DET = {
        app: ["App and sales", "Orders by outlet and time are recorded today. Customer location, only with permission, shows which outlets someone could reach; margin per drink keeps suggestions sensible. Location and margins: access to confirm."],
        ops: ["Outlet operations", "Open orders show the work already committed; crew on shift and machine status show how fast each outlet can prepare. Crew and machine data: access to confirm."],
        dlv: ["Delivery apps", "Delivery orders and how long riders wait at the collection shelf. The platforms hold this data; what they would share is to confirm."],
        past: ["Past outcomes", "Earlier recommendations, what customers and managers decided, and what happened next. Not logged today; it would have to be built."],
        pred: ["Prediction", `Forecasts of the wait at each outlet, from orders, crew and machines, with a range of uncertainty. The trigger, ${THR.value} minutes here, is illustrative: a setting managers would choose and test, not a validated rule.`],
        rec: ["The AI's proposal", "Within rules managers approve: suggest a nearby outlet only where it saves the customer enough time, walk included, and only while that outlet has room."],
        exp: ["Explanation", "Generative AI turns the structured recommendation into plain words. It must not invent readiness times, incentives or reasons: every figure comes from the models and the approved rules."],
        cust: ["Customer", "The customer decides before paying; nothing changes without acceptance, and keeping the original pickup is always an option."],
        mgr: ["Zone manager", "Delivery-channel actions, a short pause or a promotion of the outlet with room, go to the zone manager to approve or decline. The platforms control their own ranking; permissions are to confirm."],
        placed: ["Placed orders stay", "Orders already confirmed stay where they were placed; only new orders see the suggestion."],
        load: ["Spare capacity, while it lasts", "The busy outlet stays busy, just less so. If the support outlet would fill up, the time saved shrinks and the suggestion is withdrawn. Workloads shown are illustrative."],
        fb: ["Evaluate outcomes and update the model", "Each recommendation, decision and outcome is logged, to check whether it helped and to update the model periodically. More data alone does not guarantee better recommendations."],
        shape: ["Demand shaping", "Options and small incentives move some demand in place and time, from the busy outlet to one with room. Customers keep the choice."],
        pool: ["Capacity pooling", "Nearby outlets act as one pool of capacity, limited by walking time, delivery coverage and how many customers are willing to switch."],
        bott: ["Bottleneck management", "Act where the queue builds, before it peaks: the busy outlet's counter and collection shelf."] };
      const closePop = () => { pop.classList.remove("on"); $$(box, ".src.on,.con.on").forEach(e => e.classList.remove("on")); };
      const play = () => { box.classList.remove("play"); void box.offsetWidth; box.classList.add("play"); $(box, "svg.flw").setCurrentTime?.(0); $(box, ".p1tc").classList.remove("now"); };
      const paint = () => {
        box.dataset.st = st; $(box, ".c5n").textContent = `${st} / ${N}`; $(box, '[data-c5="prev"]').disabled = st === 1;
        $$(box, ".sx li").forEach((l, i) => { l.classList.toggle("cur", i === st - 1); l.classList.toggle("done", i < st - 1); });
        $(box, '[data-c5="next"]').textContent = st < N ? "Next ▶" : "Try the customer experience →"; closePop(); play();
      };
      pb._intro = { enter: fromEnd => { st = fromEnd ? N : 1; paint(); },
        next: () => { if (st < N) { st++; paint(); return true; } return false; },
        prev: () => { if (st > 1) { st--; paint(); return true; } return false; } };
      box.addEventListener("click", e => {
        const b = e.target.closest("button,[data-d],[data-s]"); if (!b) return closePop(); b.blur?.();
        if (b.dataset.c5 === "next") { if (!pb._intro.next()) show(cur + 1); }
        else if (b.dataset.c5 === "prev") pb._intro.prev();
        else if (b.dataset.c5 === "replay") { closePop(); play(); }
        else if (b.dataset.s) { st = +b.dataset.s; paint(); }
        else if (b.classList.contains("x")) closePop();
        else if (DET[b.dataset.d]) { const [h, t] = DET[b.dataset.d]; closePop(); b.classList.add("on"); $(pop, "b").textContent = h; $(pop, "p").textContent = t;
          // beside the item clicked: below it in the top half of the panel, above it in the bottom half
          const R = box.getBoundingClientRect(), r = b.getBoundingClientRect(), s = R.width / box.offsetWidth;
          pop.style.left = `${Math.max(12, Math.min(box.offsetWidth - 482, (r.left - R.left) / s))}px`;
          if ((r.top + r.bottom) / 2 - R.top < R.height / 2) { pop.style.top = `${(r.bottom - R.top) / s + 8}px`; pop.style.bottom = ""; }
          else { pop.style.bottom = `${(R.bottom - r.top) / s + 8}px`; pop.style.top = ""; }
          pop.classList.add("on"); }
      });
      // the trigger: the illustrative predicted wait rising past the threshold
      const W = v("predicted_wait"), [h0, m0] = v("now_clock").split(":").map(Number), svg = $(pb, ".p1tc"), th = THR.value;
      const clk = i => { const t = h0 * 60 + m0 + i * 10; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
      const inp = $(pb, '[data-p1b="thr"]'); inp.min = THR.range[0]; inp.max = THR.range[1]; inp.step = v("threshold_step"); inp.value = th;
      const chart = () => {
        const th = +inp.value, top = Math.max(70, ...W), x = i => 30 + i * (330 / (W.length - 1)), y = m => 126 - m / top * 112, hit = W.findIndex(w => w >= th);
        svg.innerHTML = `<line x1="30" x2="360" y1="126" y2="126" stroke="#C9C2B6"/>` +
          W.map((w, i) => i % 2 ? "" : `<text x="${x(i)}" y="144" font-size="11" fill="#9A9387" text-anchor="middle">${clk(i)}</text>`).join("") +
          `<path d="${W.map((w, i) => `${i ? "L" : "M"}${x(i)},${y(w * 1.15)}`).join(" ")} ${[...W].reverse().map((w, j) => `L${x(W.length - 1 - j)},${y(w * 0.85)}`).join(" ")} Z" fill="#24406B" opacity=".08"/>` +
          `<line x1="30" x2="360" y1="${y(th)}" y2="${y(th)}" stroke="#B8322B" stroke-width="1.6" stroke-dasharray="5 4"/><text x="32" y="${y(th) - 6}" font-size="11.5" fill="#B8322B">trigger · ${th} min, illustrative</text>` +
          `<polyline class="ln" pathLength="1" points="${W.map((w, i) => `${x(i)},${y(w)}`).join(" ")}"/>` +
          (hit >= 0 ? `<circle class="hit" cx="${x(hit)}" cy="${y(W[hit])}" r="6.5" fill="#B8322B"/><text x="${x(hit)}" y="${y(W[hit]) + 20}" font-size="11" font-weight="700" fill="#B8322B" text-anchor="middle">${clk(hit)}</text>`
                    : `<text x="195" y="70" font-size="12" fill="#B8322B" text-anchor="middle">no alert: the forecast stays below</text>`);
        $(pb, '[data-p1b="th"]').textContent = `${th} min`; $(pb, ".al").style.visibility = hit >= 0 ? "" : "hidden";
      };
      inp.addEventListener("input", () => { svg.classList.add("now"); chart(); }); chart();
      printers.push(() => { st = N; paint(); }); paint();
    }

    const pa = document.getElementById("p1a");
    if (pa) {
      const S = { pick: null, fill: false, dec: null, ord: false }, inc = v("switch_incentive"), minSave = v("min_saving_min");
      const bt = v("busy_travel_min"), br = v("busy_ready_min"), at = v("alt_travel_min");
      $(pa, '[data-cx="scen"]').textContent = `${B} is swamped and ${AL}, nearby, has room. The outlets are the reference deck's example; every time is illustrative.`;
      $$(pa, '[data-cx="clock"]').forEach(e => (e.textContent = "9:41"));
      const render = () => {
        // pickup: collection is the later of walking there and the drink being ready; a switch is offered only if it saves enough
        const ar = S.fill ? v("alt_ready_when_full_min") : v("alt_ready_min"), bc = Math.max(bt, br), ac = Math.max(at, ar), save = bc - ac, offer = save >= minSave;
        let ph = `<div class="brand"><i class="emi"></i>CHAGEE</div><div class="ctx">Pickup · ${B}</div>`;
        if (S.pick === "switch") ph += `<div class="hero">Switched</div><div class="pc ok"><span class="chip">Confirmed · simulated</span><b>Collect at ${AL} in about ${ac} min</b>Switch perk added: ${inc.toLowerCase()}.</div><button class="pb alt sm" data-cx="undo">Undo</button>`;
        else if (S.pick === "keep") ph += `<div class="hero">Your tea</div><div class="pc ok"><span class="chip">Confirmed · simulated</span><b>Collect at ${B} in about ${bc} min</b>You kept your outlet; nothing else changes.</div><button class="pb alt sm" data-cx="undo">Undo</button>`;
        else if (offer) ph += `<div class="hero">Your tea, sooner</div><div class="pc sug"><span class="chip">Suggested for you</span><b>Collect at ${AL} in about ${ac} min</b>instead of ${bc} min at ${B}.</div>
          <div class="pc perk"><span class="chip">Switch perk</span>${inc}.</div><button class="pb go" data-cx="sw">Switch to ${AL}</button><button class="pb alt" data-cx="kp">Keep ${B}</button>`;
        else ph += `<div class="hero">Your tea</div><div class="pc no"><span class="chip">No suggestion right now</span><b>Collect at ${B} in about ${bc} min</b>${AL} is busy too, so no switch is offered.</div><button class="pb alt" data-cx="kp">Continue at ${B}</button>`;
        $(pa, '[data-cx="pphone"]').innerHTML = ph;
        $(pa, '[data-cx="ptext"]').innerHTML = `<h4>${offer || S.pick ? "A faster outlet, offered" : "No faster outlet, no offer"}</h4>
          <p>${offer || S.pick ? `${B} is swamped, so the app suggests ${AL} and explains why.` : `${AL} has filled up too, so the suggestion is withdrawn.`}</p>
          ${offer ? `<div class="big"><b>${save} min sooner</b><span>collect in about ${ac} min instead of ${bc}, walk included</span></div>`
                  : `<div class="big mute"><b>Saves only ${save} min</b><span>below the ${minSave}-minute minimum, so nothing is offered</span></div>`}
          <div class="dyn"><i>Dynamic pricing</i>A voucher or a carrier bag nudges and rewards the switch, offered only while ${B} is swamped.</div>
          <p class="who"><b>Customer chooses</b> before paying.<br><button class="lnk" data-cx="fill">${S.fill ? `${AL} has room again` : `What if ${AL} fills up?`}</button></p>`;
        // delivery: nothing changes for customers until the zone manager decides
        const D = S.dec, paused = D === "pause", nudged = D === "pause" || D === "promo";
        const store = (n, cls, badges) => `<div class="st ${cls}"><i class="emi"></i><div><b>CHAGEE · ${n}</b>${badges}</div></div>`;
        let dp = `<div class="dhd">Delivery<span>Chagee</span></div>`;
        if (S.ord) dp += `<div class="res">Your order</div><div class="pc ok"><span class="chip">Placed · simulated</span><b>CHAGEE · ${AL} is preparing it</b>A rider collects from the outlet with room, not the busy counter.</div><button class="pb alt sm" data-cx="ordx">Back to results</button>`;
        else dp += `<div class="res">Results near you</div>` +
          store(B, paused ? "off" : "", paused ? `<span class="bd off">Not taking orders right now</span><br>Very busy · try again later` : `<span class="bd busy">Open · very busy</span><br>Long wait for riders`) +
          store(AL, nudged ? "hi" : "", `<span class="bd on">Open · taking orders</span>${nudged ? `<span class="bd v">Voucher · discount today</span>` : ""}`);
        if (nudged && !S.ord) dp += `<button class="pb gr" data-cx="ord">Order from ${AL}</button>`;
        dp += `<div class="mock">Illustrative mock-up, not the real app.</div>`;
        $(pa, '[data-cx="dphone"]').innerHTML = dp;
        const call = { pause: ["Orders flow to " + AL, "no riders stuck at the busy counter"], promo: ["Demand nudged to " + AL, `${B} stays open; the voucher draws orders`],
                       decline: ["No change", `${B} stays listed as usual`] }[D] || ["Awaiting the zone manager", "nothing changes for customers until a decision"];
        const btn = (d, l) => `<button class="btn${D === d ? " on" : ""}" data-cx="dec" data-v="${d}">${l}</button>`;
        $(pa, '[data-cx="dtext"]').innerHTML = `<h4>The busy outlet steps back</h4>
          <p>The agent recommends pausing ${B} on delivery apps and redirecting demand; the zone manager reviews and approves.</p>
          <div class="big${D && D !== "decline" ? "" : " mute"}"><b>${call[0]}</b><span>${call[1]}</span></div>
          <button class="dyn${D === "promo" ? " on" : ""}" data-cx="dec" data-v="promo"><i>Dynamic pricing</i>Instead of closing ${B} on delivery altogether, a voucher at ${AL} can draw demand to the outlet with room.</button>
          <div class="who"><b>Zone manager approves</b> the pause and redirection.<div class="acts">${btn("pause", "Approve pause")}${btn("promo", "Voucher only")}${btn("decline", "Decline")}</div>
            <span class="fine">Placed orders stay put; platform permissions to confirm.</span></div>`;
      };
      pa.addEventListener("click", e => {
        const b = e.target.closest("[data-cx]"); if (!b) return; const a = b.dataset.cx; b.blur?.();
        if (a === "sw") S.pick = "switch"; else if (a === "kp") S.pick = "keep"; else if (a === "undo") S.pick = null;
        else if (a === "fill") { S.fill = !S.fill; S.pick = null; }
        else if (a === "dec") { S.dec = S.dec === b.dataset.v ? null : b.dataset.v; S.ord = false; }
        else if (a === "ord") S.ord = true; else if (a === "ordx") S.ord = false;
        else if (a === "reset") Object.assign(S, { pick: null, fill: false, dec: null, ord: false });
        else if (a === "exec") { $(pa, ".cxw").classList.add("exec"); return; } else if (a === "back") { $(pa, ".cxw").classList.remove("exec"); return; }
        else return;
        render();
      });
      printers.push(() => { Object.assign(S, { pick: null, fill: false, dec: "pause", ord: false }); $(pa, ".cxw").classList.remove("exec"); render(); });
      render();
    }
  })();

  /* ---------------------------------------------------------------- 06 to 08: Proposal 2, the manager's bottleneck tool. 06 a
     clickable counter at the rush; 07 three steps; 08 the tablet. The recommendation is crewtool's projection and rules (AI
     predicts, rules compare feasible actions); the comparison is its seeded simulation, run live, with the same drinks for every
     allocation, so the recommended move can lose. The manager decides. All values: assumptions.json ops_tool. */
  /* ---------------------------------------------------------------- slides 06 to 08: can the same crew absorb toppings? (sim/toppings.js)
     06 the counter at the peak, one simulated run under fixed responsibilities: standard drinks, toppings come in, cups wait for Ben
     while Ana has time to spare, the manager's question, the proposal. 07 one bucket-brigade hand-over cycle, played slowly from the
     same model, then what it needs and the roles. 08 fixed responsibilities against the brigade: two live counters on the same
     orders, the outcomes over the seeds, the assumptions behind them */
  /* ---------------------------------------------------------------- slides 06 and 07: Proposal 2, as on the reference deck
     (chagee-deck.vercel.app, slides 8 and 9): the Today / With AI toggle on 06's chart; on 07 the dashboard's Zone / Store filter,
     its refresh button, and the recommendations report and assistant opening over the slide (close button, a click outside, Esc) */
  (function planning() {
    const s6 = document.getElementById("p2p"), s7 = document.getElementById("p2b");
    if (s6) $$(s6, ".p2tg").forEach(tg => $$(tg, "button[data-v]").forEach(b => (b.onclick = () => {
      const box = $(tg.closest(".p2-chart"), ".p2tog"); box.dataset.v = b.dataset.v;
      $$(tg, "button").forEach(x => x.classList.toggle("on", x === b)); })));
    if (!s7) return;
    $$(s7, ".db-rep").forEach(b => {
      const rep = $(s7, b.classList.contains("db-ask") ? ".db-chat" : ".db-report"); if (!rep) return;
      const close = () => rep.classList.remove("open");
      b.onclick = () => rep.classList.add("open");
      $(rep, ".dr-x, .dc-x").onclick = close;
      rep.addEventListener("click", e => { if (e.target === rep) close(); });
      addEventListener("keydown", e => { if (e.key === "Escape" && rep.classList.contains("open")) { e.stopPropagation(); close(); } }, true);
    });
    $$(s7, ".db-win").forEach(w => {
      const vw = $(w, ".db-vw"), pick = $(w, ".db-pick");
      const apply = () => { vw.textContent = w.dataset.f === "zone" ? "Zone View" : `Store View · ${w.dataset.o}`; };
      $$(w, ".db-seg button").forEach(b => (b.onclick = () => {
        w.dataset.f = b.dataset.f; $$(w, ".db-seg button").forEach(x => x.classList.toggle("on", x === b)); apply(); }));
      if (pick) pick.onchange = () => { w.dataset.o = pick.value; apply(); };
      const ref = $(w, ".db-ref"), upd = $(w, ".db-upd");
      if (ref) ref.onclick = () => { ref.classList.remove("spin"); void ref.offsetWidth; ref.classList.add("spin");
        setTimeout(() => { upd.textContent = "Refreshed just now"; }, 800); };
    });
  })();

  (function toppings() {
    const TM = window.ChageeToppings; if (!TM || !RAW.toppings) return;
    const E = TM.inputs(RAW, Sim), TR = RAW.toppings, SC = TR.scene.value, DEF = E.share.value;
    const nm = id => E.crew.find(c => c.id === id).name, LOC = k => E.steps[k].loc;
    const K = id => TM.STEPS.indexOf(id), TOP = K("topping"), FIN = K("finish");
    const advance = (S, to) => { while (S.t < to - 1e-9) S.step(); };
    // steps a simulation at real time x speed while its slide shows; tick(dt) does the stepping and drawing
    function player(sl, tick) {
      let on = false, last = 0, raf = 0;
      const frame = ts => {
        if (!on || !sl.classList.contains("active")) { on = false; return; }
        const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
        if (tick(dt) === false) { on = false; return; }
        raf = requestAnimationFrame(frame);
      };
      return { start() { if (on || reduce || PRINTING) return; on = true; last = performance.now(); raf = requestAnimationFrame(frame); },
               stop() { on = false; cancelAnimationFrame(raf); }, get on() { return on; } };
    }
    const stepBy = (S, dt, speed, cap = Infinity) => { S._acc = (S._acc || 0) + dt * speed; while (S._acc >= E.dt && S.t < cap - 1e-9) { S.step(); S._acc -= E.dt; } };

    /* drawing: people as on slide 06, cups with their order number, three pearls on a cup with toppings */
    const HAIR = { ana: "#3B2F2A", ben: "#2A2220", cai: "#5A3E2B" }, SKIN = { ana: "#F1D3B8", ben: "#E8C4A0", cai: "#F1D3B8" };
    const f1 = x => (+x).toFixed(1);
    const pearls = (x, y, r = 1.7, g = 3.5) => [-g, 0, g].map((d, i) => `<circle cx="${f1(x + d)}" cy="${f1(y + (i === 1 ? .8 : 0))}" r="${r}" fill="#3B2F2A"/>`).join("");
    const cup = (c, x, y, s = 1, lab = true, fs = 8) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${s})"><path d="M-7 0 L-8.5 -15 H8.5 L7 0 Z" fill="${c.top ? "#D9B38C" : "#E3C29B"}" stroke="#fff" stroke-width=".8"/>${c.top ? pearls(0, -3) : ""}</g>` +
      (lab ? `<text x="${f1(x)}" y="${f1(y - 15 * s - 3)}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#24406B" stroke="#fff" stroke-width="2.5" paint-order="stroke">#${c.id}</text>` : "");
    const person = (id, x, foot, s, faded) => `<g transform="translate(${f1(x)} ${f1(foot - 34 * s)}) scale(${s})"${faded ? ' opacity=".55"' : ""}>` +
      `<path d="M-11 34 C-11 18 -7 12 0 12 C7 12 11 18 11 34 Z" fill="#2E3A55"/><path d="M-7 34 L-7 21 Q0 18 7 21 L7 34 Z" fill="#F6ECDD"/><circle cy="2" r="9" fill="${SKIN[id]}"/>` +
      `<path d="M-9 0 C-9 -9 9 -9 9 0 C6 -4 -6 -4 -9 0 Z" fill="${HAIR[id]}"/><circle cx="-3.5" cy="2" r="1.1" fill="#3B2F2A"/><circle cx="3.5" cy="2" r="1.1" fill="#3B2F2A"/></g>`;
    const state = w => w.mode === "work" ? "working" : w.mode === "take" ? "taking over" : ["wait", "idle", "hold"].includes(w.mode) || (w.mode === "go" && Math.abs(w.x - LOC(w.k)) < 1e-6) ? "waiting" : "walking";
    // one counter as a strip: the order screen, five spots, people, the cups they hold, pass shelves (fixed) and the last cups ready
    function strip(S, g) {
      const X = L => g.x0 + L * g.gap, y = g.foot, o = [], s = g.s;
      o.push(`<rect x="${g.x0 - 50}" y="${y}" width="${1000 - g.x0 + 44}" height="6" rx="2" fill="#B8957A"/><rect x="${g.x0 - 46}" y="${y + 6}" width="${1000 - g.x0 + 36}" height="${g.front}" rx="3" fill="#9C7A5B"/>`);
      const bar = S.C.bar, sub = { tea_milk: "machine", topping: bar === 1 ? "one person at a time" : "two people side by side", shake_seal: "machine" };
      [["cup_ice", "Cup and ice"], ["tea_milk", "Tea and milk"], ["topping", "Toppings and finishing"], ["shake_seal", "Sealer"], ["handover", "Hand-over"]].forEach(([id, t]) =>
        o.push(`<text x="${f1(X(LOC(K(id))))}" y="${f1(y + 6 + g.front * .5)}" text-anchor="middle" font-size="${g.lf}" font-weight="700" fill="#FFF8EC">${t}</text>` +
          (sub[id] ? `<text x="${f1(X(LOC(K(id))))}" y="${f1(y + 6 + g.front * .88)}" text-anchor="middle" font-size="${g.lf - 1.5}" fill="#F1E5D2">${sub[id]}</text>` : "")));
      for (const id of ["tea_milk", "shake_seal"]) { const x = X(LOC(K(id))) + g.gap * .27, h = g.mh; o.push(`<rect x="${f1(x - h * .42)}" y="${y - h}" width="${f1(h * .84)}" height="${h}" rx="4" fill="#24406B"/><rect x="${f1(x - h * .3)}" y="${f1(y - h * .86)}" width="${f1(h * .6)}" height="${f1(h * .2)}" rx="2" fill="#3D5C8F"/>`); }
      const bx = X(LOC(TOP)) + g.gap * .2;
      for (let j = 0; j < 3; j++) o.push(`<rect x="${f1(bx + j * 9 * s)}" y="${f1(y - 10 * s)}" width="${f1(8 * s)}" height="${f1(10 * s)}" rx="1.5" fill="#F6ECDD" stroke="#9C7A5B" stroke-width=".8"/><circle cx="${f1(bx + j * 9 * s + 4 * s)}" cy="${f1(y - 7 * s)}" r="${f1(2 * s)}" fill="${["#3B2F2A", "#D99A93", "#C8A96A"][j]}"/>`);
      // the order screen
      const sw = g.sw, sh = g.sh, sy = g.sy;
      o.push(`<rect x="6" y="${sy}" width="${sw}" height="${sh}" rx="6" fill="#24406B"/><rect x="10" y="${sy + 4}" width="${sw - 8}" height="${sh - 8}" rx="3" fill="#EEF1F6"/><text x="16" y="${sy + 15}" font-size="${g.lf - 1}" font-weight="700" letter-spacing="1" fill="#24406B">ORDERS · ${S.screen.length}</text>`);
      S.screen.slice(0, g.rows).forEach((c, j) => { const ry = sy + 20 + j * g.rh;
        o.push(`<rect x="14" y="${ry}" width="${sw - 16}" height="${g.rh - 3}" rx="3" fill="#fff" stroke="#C9D3E3"/><text x="20" y="${ry + g.rh * .62}" font-size="${g.lf - 1}" font-weight="700" fill="#262626">#${c.id}</text>` +
          (c.top ? `${pearls(sw - 18, ry + g.rh * .45, 1.8, 4)}<text x="${sw - 30}" y="${ry + g.rh * .62}" text-anchor="end" font-size="${g.lf - 2}" fill="#4A4A4A">toppings</text>` : `<text x="${sw - 10}" y="${ry + g.rh * .62}" text-anchor="end" font-size="${g.lf - 2}" fill="#9A9387">standard</text>`)); });
      if (S.screen.length > g.rows) o.push(`<text x="${6 + sw / 2}" y="${sy + sh - 6}" text-anchor="middle" font-size="${g.lf - 1.5}" fill="#24406B">+${S.screen.length - g.rows} more</text>`);
      // pass shelves (fixed responsibilities): cups waiting for the next owner
      if (S.mode === "fixed") S.workers.forEach(w => { if (!w.inq.length || w.i === 0) return;
        const x0 = X(LOC(w.seg[0])) - g.gap * .26, n = w.inq.length;
        w.inq.slice(0, 4).forEach((c, j) => o.push(cup(c, x0 - j * 13 * s, y, s * .8, j === 0, g.lf - 2)));
        if (n >= 2) o.push(`<text x="${f1(x0 - 20 * s)}" y="${f1(y - 30 * s)}" text-anchor="middle" font-size="${g.lf - 1}" font-weight="700" fill="${n >= 3 ? "#B8322B" : "#4A4A4A"}">${n} waiting</text>`); });
      // ready
      S.delivered.slice(-2).forEach((c, j, a) => o.push(cup(c, 1000 - 22 - (a.length - 1 - j) * 22 * s, y, s * .8, j === a.length - 1, g.lf - 2)));
      o.push(`<text x="985" y="${f1(y + 6 + g.front * .88)}" text-anchor="end" font-size="${g.lf - 1.5}" fill="#F1E5D2">ready ${S.delivered.length}</text>`);
      // people, side by side when they stand at the same spot
      const xs = S.workers.map(w => X(w.x));
      S.workers.forEach((w, i) => { if (i && xs[i] - xs[i - 1] < 40 * s) xs[i] = xs[i - 1] + 40 * s; });
      S.workers.forEach((w, i) => {
        const x = xs[i], st = state(w);
        o.push(person(w.id, x, y, s, st === "walking"));
        o.push(`<text x="${f1(x)}" y="${f1(y - 34 * s - 12 * s - (g.status ? g.nf * .9 : 0))}" text-anchor="middle" font-size="${g.nf}" font-weight="700" fill="#262626">${w.name}</text>` +
          (g.status && st !== "working" ? `<text x="${f1(x)}" y="${f1(y - 34 * s - 12 * s)}" text-anchor="middle" font-size="${g.nf * .82}" fill="${st === "waiting" ? "#2F6B45" : "#9A9387"}">${st}</text>` : ""));
        if (w.cup) o.push(cup(w.cup, x + 14 * s, y, s * .9, true, g.lf - 1));
      });
      return o.join("");
    }

    /* 06: the counter at the peak, four points and the proposal */
    const sp = document.getElementById("s2p");
    if (sp) {
      const panel = $(sp, ".p2panel"), sc = $(sp, ".p2scene"), tip = $(sp, ".p1tip"), rows = $$(sp, ".p1row"), N = rows.length + 1;
      const TIPS = {
        screen: ["Order screen", "Each order lands with a number. Once toppings come in, some carry the topping icon: those cups need an extra manual step at the topping bar."],
        ben: ["Ben · toppings and finishing", "Also runs tea and milk. Under fixed responsibilities every topping lands on Ben, so cups wait on the shelf in front of Ben."],
        ana: ["Ana · cup and ice", "Trained on toppings and finishing, and has time to spare once toppings arrive: the cups wait elsewhere."],
        cai: ["Cai · sealer and hand-over", "Newer: toppings-and-finishing training not complete."],
        mach: ["Machines", "Tea and milk, and the sealer: whoever carries the cup attends each short cycle, one cup at a time. Which steps machines do is our illustrative split, not Chagee's disclosed setup."],
        mgr: ["The outlet manager", "Sees toppings coming, but not whether the crew can share the extra work, or when dedicated capacity would be needed."] };
      const G = { scr: $(sp, ".dscr"), ana: $(sp, ".dana"), shelf: $(sp, ".dshelf"), ben: $(sp, ".dben"), cai: $(sp, ".dcai"), ready: $(sp, ".dready"), clock: $(sp, ".dclock text") };
      let k = 1, S = null;
      const fresh = () => { S = TM.create(E, Sim, { mode: "fixed", seed: SC.seed, share: 0 }); advance(S, 60); };
      const built = () => { fresh(); advance(S, SC.plain_minutes * 60); S.share = DEF; advance(S, SC.build_minute * 60); };
      function draw() {
        const [ana, ben, cai] = S.workers;
        G.scr.innerHTML = S.orders.filter(c => c.top != null && c.ready == null).slice(0, 5).map((c, j) => `<g class="tk"><rect x="40" y="${94 + 12 * j}" width="116" height="10" rx="3" fill="#fff" stroke="#C9D3E3"/><text x="45" y="${101.5 + 12 * j}" font-size="7.5" font-weight="700" fill="#262626">#${c.id}</text>` +
          (c.top ? `${pearls(146, 98.8 + 12 * j, 1.6, 3.6)}<text x="136" y="${101.5 + 12 * j}" text-anchor="end" font-size="7" fill="#4A4A4A">toppings</text>` : `<text x="152" y="${101.5 + 12 * j}" text-anchor="end" font-size="7" fill="#9A9387">standard</text>`) + "</g>").join("");
        G.ana.innerHTML = ana.cup ? cup(ana.cup, ana.mode === "drop" ? 236 : 222, 226, 1, true, 8) : "";
        G.shelf.innerHTML = ben.inq.slice(0, 5).map((c, j) => cup(c, 300 + 14 * j, 226, .85, false) + `<text x="${300 + 14 * j}" y="${j % 2 ? 199 : 207}" text-anchor="middle" font-size="6.5" font-weight="700" fill="#24406B">#${c.id}</text>`).join("") + (ben.inq.length > 5 ? `<text x="372" y="222" font-size="8" font-weight="700" fill="#B8322B">+${ben.inq.length - 5}</text>` : "");
        G.ben.innerHTML = ben.cup ? cup(ben.cup, ben.k === K("tea_milk") ? 264 : ben.mode === "drop" ? 428 : 424, 226, 1, true, 8) : "";
        G.cai.innerHTML = cai.inq.slice(0, 2).map((c, j) => cup(c, 492 + 14 * j, 226, .85, j === 0, 6.5)).join("") + (cai.cup ? cup(cai.cup, cai.k === K("shake_seal") ? 455 : 578, cai.k === K("shake_seal") ? 224 : 208, 1, true, 8) : "");
        G.ready.innerHTML = S.delivered.slice(-2).map((c, j, a) => cup(c, 614 - (a.length - 1 - j) * 15, 208, .85, j === a.length - 1, 6.5)).join("");
        $(sp, ".free").classList.toggle("on", k >= 3 && ana.mode === "idle");
        $(sp, ".busy").classList.toggle("on", k >= 3 && ben.inq.length >= 3);
        G.clock.textContent = `Simulated peak · minute ${mmss(Math.floor(S.t))} · ${SC.speed}× speed`;
      }
      const P2 = player(sp, dt => { stepBy(S, dt, SC.speed, S.H); draw(); return S.t < S.H; });
      const paint = () => {
        panel.dataset.k = k; if (k < N) sc.dataset.f = k; else delete sc.dataset.f;
        rows.forEach((r, i) => { r.classList.toggle("seen", i < k); r.classList.toggle("cur", i === k - 1); });
        $$(sp, ".p1dots i").forEach((d, i) => d.classList.toggle("on", i < k));
        $(sp, ".p1n").textContent = `${k} / ${N}`; $(sp, '[data-p2="next"]').textContent = k < N ? "Next ▶" : "Next slide ▶"; tip.innerHTML = "";
      };
      // each point sets the run: 1 standard drinks from the start; 2 toppings come in from now; 3 on to the build-up minute
      const go = (to, from) => {
        k = to;
        if (k === 1) fresh();
        else if (k === 2) { if (from !== 1) { fresh(); advance(S, SC.plain_minutes * 60); } S.share = DEF; }
        else if (from < 3) built();
        paint(); draw();
      };
      const setPlay = on => { sc.classList.toggle("paused", !on); $(sp, '[data-p2="play"]').textContent = on ? "❚❚ Pause" : "▶ Play"; on ? P2.start() : P2.stop(); };
      sp._intro = { enter: fromEnd => { go(fromEnd ? N : 1, 0); setPlay(!reduce); },
        next: () => { if (k < N) { go(k + 1, k); return true; } return false; },
        prev: () => { if (k > 1) { go(k - 1, k); return true; } return false; } };
      sp.addEventListener("click", e => {
        const b = e.target.closest("[data-p2]"), row = e.target.closest(".p1row"), hs = e.target.closest(".hs");
        if (b) { b.blur(); const a = b.dataset.p2;
          if (a === "next") { if (!sp._intro.next()) show(cur + 1); }
          else if (a === "play") setPlay(sc.classList.contains("paused"));
          else if (a === "replay") { go(1, 0); setPlay(!reduce); } }
        else if (row) go(rows.indexOf(row) + 1, k);
        else if (hs && TIPS[hs.dataset.hs]) { const [h, t] = TIPS[hs.dataset.hs]; tip.innerHTML = `<b>${h}</b>${t}`; }
      });
      printers.push(() => { P2.stop(); k = N; built(); paint(); draw(); });
      go(1, 0);
    }

    /* 07: one hand-over cycle, what it needs, AI against the rule */
    const sr = document.getElementById("s2r");
    if (sr) {
      const box = $(sr, ".c5intro"), N = $$(box, ".c5s").length, g = $(sr, '[data-r="strip"]'), capEl = $(sr, '[data-r="cap"]'), rules = $$(sr, ".rules li");
      const GEO = { x0: 238, gap: 168, foot: 236, front: 58, s: 3.3, lf: 15, nf: 19, mh: 66, sw: 172, sh: 160, sy: 60, rows: 4, rh: 32, status: true };
      let st = 1, S = null, phase = 0, end = null;
      const cyc = () => {
        S = TM.create(E, Sim, { mode: "brigade", share: 0, events: true }); S.stage(TR.cycle_stage.value); phase = 0; end = null;
        const [ana, ben, cai] = S.workers;
        S._open = `Cai is handing over #${cai.cup.id}; Ben is adding toppings to #${ben.cup.id}; Ana is on cup and ice with #${ana.cup.id}; #${S.screen[0].id} waits on the screen.`;
      };
      const ev = (type, w) => S.events.find(e => e.type === type && e.who === w);
      function caption() {
        const r = ev("ready", "cai"), pc = ev("pass", "cai"), pb = ev("pass", "ben"), sa = ev("start", "ana"), cai = S.workers[2];
        let c = S._open, on = 1;
        if (r) { c = `<i>①</i> Cai hands #${r.order} to the customer and walks back.`; on = 2; }
        if (r && !pc && cai.mode === "wait" && cai.zone.lo > 0) c = `<i>①</i> Cai stops at the sealer: not yet trained on toppings and finishing, so Cai waits there for Ben's cup.`;
        if (pc) { c = `<i>②</i> Ben finishes the step in hand; Cai takes over #${pc.order}. Ben walks back.`; on = 3; }
        if (pb) { c = `<i>③</i> Ben takes over #${pb.order} from Ana at a safe point. Ana walks back.`; on = 3; }
        if (sa) { c = `Ana starts #${sa.order}. One cycle: everyone moved back to earlier work, and nobody was told where to help.`; on = 4; if (end == null) end = S.t; }
        capEl.innerHTML = c;
        rules.forEach((li, i) => { li.classList.toggle("on", i + 1 === on); li.classList.toggle("done", i + 1 < on); });
      }
      const draw = () => { g.innerHTML = strip(S, GEO); caption(); $(sr, '[data-r="clock"]').textContent = mmss(Math.floor(S.t)); $(sr, '[data-r="speed"]').textContent = `playback ${SC.cycle_speed}×, real time`; };
      const P7 = player(sr, dt => { stepBy(S, dt, SC.cycle_speed); draw(); return end == null || S.t < end + 4; });
      const play = () => { box.classList.remove("play"); void box.offsetWidth; box.classList.add("play"); if (st === 1) { cyc(); draw(); P7.start(); } };
      const paint = () => {
        box.dataset.st = st; $(box, ".c5n").textContent = `${st} / ${N}`; $(box, '[data-c5="prev"]').disabled = st === 1;
        $$(box, ".sx li").forEach((l, i) => { l.classList.toggle("cur", i === st - 1); l.classList.toggle("done", i < st - 1); });
        $(box, '[data-c5="next"]').textContent = st < N ? "Next ▶" : "Compare the two rules →"; if (st !== 1) P7.stop(); play();
      };
      sr._intro = { enter: fromEnd => { st = fromEnd ? N : 1; paint(); },
        next: () => { if (st < N) { st++; paint(); return true; } return false; },
        prev: () => { if (st > 1) { st--; paint(); return true; } return false; } };
      box.addEventListener("click", e => {
        const b = e.target.closest("button,[data-s]"); if (!b) return; b.blur?.();
        if (b.dataset.c5 === "next") { if (!sr._intro.next()) show(cur + 1); }
        else if (b.dataset.c5 === "prev") sr._intro.prev();
        else if (b.dataset.c5 === "replay") play();
        else if (b.dataset.s) { st = +b.dataset.s; paint(); }
      });
      // print: the cycle stopped just after Ben takes over from Ana, every rule shown
      printers.push(() => { P7.stop(); st = 1; box.dataset.st = 1; cyc(); while (!ev("pass", "ben") && S.t < 600) S.step(); draw(); rules.forEach(li => li.classList.add("done")); });
      cyc(); draw();
    }

    /* 08: fixed responsibilities against the brigade */
    const sc8 = document.getElementById("s2c");
    if (sc8) {
      const tc = $(sc8, ".tcmp"), sh = $(sc8, '[data-c="share"]'), asmb = $(sc8, '[data-c="asmb"]');
      const GEO = { x0: 210, gap: 166, foot: 74, front: 30, s: 1.05, lf: 10.5, nf: 11, mh: 26, sw: 140, sh: 70, sy: 4, rows: 2, rh: 19, status: true };
      const SPD = SC.compare_speeds, base = () => ({ share: DEF, toppingSec: E.toppingSec.value, walkSec: E.walkSec.value, handSec: E.handSec.value, bar: E.bar.value,
        speeds: Object.fromEntries(E.crew.map(c => [c.id, c.v])), trained: Object.fromEntries(E.crew.map(c => [c.id, c.trained])) });
      let O = base(), speed = SC.compare_speed, L = null, R = null, t = 0, timer = 0;
      const cache = new Map();
      sh.min = E.share.range[0]; sh.max = E.share.range[1]; sh.step = E.share.step;
      $(sc8, '[data-c="spd"]').innerHTML = SPD.map(v => `<button data-sp="${v}">${v}×</button>`).join("");
      // the two counters on the run's orders, brought to the clock's time (a change of settings keeps the minute)
      const lanes = () => { const H = E.minutes * 60; L = ["fixed", "brigade"].map(mode => TM.create(E, Sim, { ...O, mode, seed: E.seed })); L.forEach(S => advance(S, Math.min(t, H))); };
      const results = () => { const key = JSON.stringify(O); if (!cache.has(key)) cache.set(key, TM.compare(E, Sim, O)); R = cache.get(key); };
      const chip = (d, unit, txt, goodNeg) => Math.abs(d) < unit ? `<em class="dch">about the same</em>` : `<em class="dch ${(d < 0) === goodNeg ? "g" : "r"}">${txt(d)}</em>`;
      function drawLanes() {
        $$(sc8, ".lane").forEach((ln, i) => { const S = L[i], busy = S.orders.filter(c => c.top != null && c.ready == null).length;
          $(ln, "svg g").innerHTML = strip(S, GEO);
          $(ln, ".lr").textContent = `ready ${S.delivered.filter(c => c.ready <= S.H).length} · in progress ${busy}`; });
        const H = E.minutes * 60, tt = Math.min(t, H);
        $(sc8, '[data-c="clock"]').textContent = mmss(Math.floor(tt)); $(sc8, '[data-c="of"]').textContent = `of ${mmss(H)}`;
        $(sc8, '[data-c="pb"]').textContent = tt >= H ? "hour over" : `playback ${speed}×`;
        $$(sc8, "[data-sp]").forEach(b => b.classList.toggle("on", +b.dataset.sp === speed));
      }
      function drawOut() {
        const A = R.fixed, B = R.brigade, ct = R.content, C_ = TM.setup(E, O), barLoad = (C_.sec[FIN] + O.share * C_.sec[TOP]) * C_.perHour / 3600 / O.bar;
        const ms = x => mmss(Math.round(x)), cost = `S$${Math.round(R.cost)}`;
        $(sc8, '[data-c="out"]').innerHTML =
          `<div class="mc"><p class="mh">Order-to-ready time<small>median · 90th percentile</small></p><div class="mv"><span class="a"><i>A</i><b>${ms(A.median)}</b><small>${ms(A.p90)}</small></span><span class="b"><i>B</i><b>${ms(B.median)}</b><small>${ms(B.p90)}</small></span>` +
          chip(B.median - A.median, 5, d => `B ${Math.abs(d) < 60 ? `${Math.round(Math.abs(d))} s` : mmss(Math.round(Math.abs(d)))} ${d < 0 ? "faster" : "slower"}`, true) + `</div></div>` +
          `<div class="mc"><p class="mh">Orders completed in the peak<small>of ${Math.round(A.placed)} placed</small></p><div class="mv"><span class="a"><i>A</i><b>${Math.round(A.completed)}</b></span><span class="b"><i>B</i><b>${Math.round(B.completed)}</b></span>` +
          chip(B.completed - A.completed, 0.5, d => `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d))} with B`, false) + `</div></div>` +
          `<div class="mc"><p class="mh">Paid labour cost, this hour<small>${R.people} people × S$${E.wage.toFixed(2)}</small></p><div class="mv"><span class="a"><i>A</i><b>${cost}</b></span><span class="b"><i>B</i><b>${cost}</b></span><em class="dch">same crew · S$${(R.cost / A.completed).toFixed(2)} vs S$${(R.cost / B.completed).toFixed(2)} an order</em></div></div>`;
        const lim = barLoad >= 0.9 ? `<span class="lim">Topping bar at its limit: it would need ${pct(barLoad)} of its time. Moving people cannot add bar time; ${O.bar === 1 ? "a second position, " : ""}dispensing equipment or a shorter recipe would.</span> ` : "";
        $(sc8, '[data-c="def"]').innerHTML = lim + `<b>Task:</b> toppings add ${Math.round(ct.toppingSec)} s to one step · <b>Work content:</b> ${Math.round(ct.standard)} s standard, ${Math.round(ct.topped)} s with toppings, the same on A and B · <b>Customer waiting:</b> order to ready, including queueing; only this changes · mean of ${E.seeds} simulated peak hours; the animation plays one`;
      }
      function asmForm() {
        const r = (k, lo, hi, st, v, u) => `<label><input type="range" data-a="${k}" min="${lo}" max="${hi}" step="${st}" value="${v}"><b>${v} ${u}</b></label>`;
        const sp = E.crew.map(c => { const opts = [-1, 0, 1].map(d => { const v = +(1 + d * E.spread).toFixed(2); return `<option value="${v}"${Math.abs(v - O.speeds[c.id]) < 1e-9 ? " selected" : ""}>${["slower", "average", "faster"][d + 1]} (${v.toFixed(1)})</option>`; }).join("");
          const own = E.fixed[c.id].some(k => E.steps[k].skill);
          return `<tr><td><b>${c.name}</b></td><td><select data-sp-w="${c.id}">${opts}</select></td><td><label><input type="checkbox" data-tr="${c.id}"${O.trained[c.id] ? " checked" : ""}${own ? " disabled" : ""}> trained on toppings and finishing${own ? " (owns them under A)" : ""}</label></td></tr>`; }).join("");
        const sec = E.steps.filter(s => !s.topping).map(s => `${s.label.toLowerCase()} ${s.sec} s${s.machine ? " (machine)" : ""}`).join(", ");
        asmb.innerHTML = `<div class="ag"><h6>Extra work per topping order</h6>${r("toppingSec", E.toppingSec.range[0], E.toppingSec.range[1], E.toppingSec.step, O.toppingSec, "s")}<p style="margin:2px 0 0">Added only to orders with toppings; finishing applies to every order. No Chagee timing exists.</p></div>` +
          `<div class="ag"><h6>Worker speeds and task eligibility</h6><table>${sp}</table></div>` +
          `<div class="ag"><h6>Walking and hand-over time</h6>${r("walkSec", E.walkSec.range[0], E.walkSec.range[1], E.walkSec.step, O.walkSec, "s")}<span>walking one station, empty-handed or carrying</span>${r("handSec", E.handSec.range[0], E.handSec.range[1], E.handSec.step, O.handSec, "s")}<span>to take a cup from a colleague or the pass shelf</span></div>` +
          `<div class="ag"><h6>Shared preparation space</h6><label><input type="radio" name="tpbar" data-bar="1"${O.bar === 1 ? " checked" : ""}> one person at the topping bar at a time</label><label><input type="radio" name="tpbar" data-bar="2"${O.bar === 2 ? " checked" : ""}> two people side by side</label><p style="margin:2px 0 0">The dispenser and the sealer take one cup at a time on both sides.</p></div>` +
          `<div class="ag fx"><b>Held fixed:</b> ${E.perHour} orders an hour; ${sec}; task-time variation ±${pct(E.cv)}; three people at S$${E.wage.toFixed(2)} an hour. All illustrative, to validate with Chagee.</div>`;
      }
      const P8 = player(sc8, dt => { const H = E.minutes * 60; t = Math.min(H, t + dt * speed); L.forEach(S => advance(S, t)); drawLanes(); return t < H; });
      const setPlay = on => { $(sc8, '[data-c="play"]').textContent = on ? "❚❚" : "▶"; on ? P8.start() : P8.stop(); };
      const update = (delay = 0) => { clearTimeout(timer); lanes(); drawLanes(); $(sc8, '[data-c="sharev"]').textContent = pct(O.share); sh.value = O.share;
        timer = setTimeout(() => { results(); drawOut(); }, delay); };
      sc8._intro = { enter: () => { if (t >= E.minutes * 60) t = 0; update(); setPlay(true); }, next: () => false, prev: () => false };
      sh.addEventListener("input", () => { O.share = +sh.value; update(120); });
      sc8.addEventListener("click", e => {
        const b = e.target.closest("[data-c],[data-sp]"); if (!b || b.disabled) return; b.blur?.();
        if (b.dataset.sp) { speed = +b.dataset.sp; drawLanes(); return; }
        const a = b.dataset.c;
        if (a === "play") setPlay(!P8.on);
        else if (a === "restart") { t = 0; update(); setPlay(true); }
        else if (a === "end") { setPlay(false); t = E.minutes * 60; update(); }
        else if (a === "asm") { tc.classList.toggle("asm"); asmForm(); }
        else if (a === "asmx") tc.classList.remove("asm");
        else if (a === "asmreset") { const s_ = O.share; O = { ...base(), share: s_ }; asmForm(); update(); }
      });
      asmb.addEventListener("input", e => {
        const x = e.target;
        if (x.dataset.a) { O[x.dataset.a] = +x.value; x.nextElementSibling.textContent = `${x.value} s`; }
        else if (x.dataset.spW) O.speeds = { ...O.speeds, [x.dataset.spW]: +x.value };
        else if (x.dataset.tr) O.trained = { ...O.trained, [x.dataset.tr]: x.checked };
        else if (x.dataset.bar) O.bar = +x.dataset.bar;
        update(150);
      });
      addEventListener("keydown", e => { if (e.key === "Escape") tc.classList.remove("asm"); });
      new MutationObserver(() => { if (!sc8.classList.contains("active")) { tc.classList.remove("asm"); P8.stop(); } }).observe(sc8, { attributes: true, attributeFilter: ["class"] });
      printers.push(() => { P8.stop(); O = base(); t = E.minutes * 60; tc.classList.remove("asm"); lanes(); drawLanes(); results(); drawOut(); $(sc8, '[data-c="sharev"]').textContent = pct(O.share); });
      lanes(); drawLanes(); $(sc8, '[data-c="sharev"]').textContent = pct(O.share); sh.value = O.share; results(); drawOut();
    }
  })();

  (function crewTool() {
    const CT = window.ChageeCrewTool; if (!CT || !RAW.ops_tool) return;
    const E = CT.inputs(RAW, Sim), D0 = E.demand.value, OT = RAW.ops_tool, still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lab = k => E.stations[k].label, lc = s => s.charAt(0).toLowerCase() + s.slice(1), kOf = id => E.stations.findIndex(s => s.id === id);
    const who = id => E.crew.find(c => c.id === id), drinks = n => `${n} drink${n === 1 ? "" : "s"}`;
    const KIND = { move: "Reassign", keep: "Keep", escalate: "Escalate" };
    const band = f => ({ lo: CT.project(E, { ...f, perHour: f.perHour * (1 - E.band) }), hi: CT.project(E, { ...f, perHour: f.perHour * (1 + E.band) }) });
    // the recommendation in words: one call, its reason, and why that colleague (or why no one)
    function recCopy(r) {
      const C_ = lab(r.con), c_ = lc(C_), s = r.base.st[r.con], b = r.best, w = b && who(b.worker);
      const others = E.crew.filter(x => !b || x.id !== b.worker).map(x => x.home === r.con ? `${x.name} already works ${c_}`
        : !x.trained.includes(r.con) ? `${x.name} is not yet trained on ${c_}` : r.base.crew.find(c => c.id === x.id).spare < E.spareMin ? `${x.name} has little spare time` : null).filter(Boolean);
      if (r.kind === "keep") return { head: `Keep the current allocation: ${c_} is the busiest step, but its backlog clears within ${E.window} minutes without moving anyone.`,
        short: `${C_}: work due is about ${pct(s.rho)} of its capacity over the next ${E.window} minutes.`, why: [`<b>No move:</b> moving someone would add walking and set-up time for no gain.`, `<b>Review:</b> the tablet keeps predicting; it speaks up if a step starts to build.`] };
      if (r.kind === "move") return { head: `${C_} is building up. Assign ${w.name}, available and trained, to help, then review when the backlog clears.`,
        short: `${C_}: work due is about ${pct(s.rho)} of capacity over the next ${E.window} minutes; ${w.name} has about ${pct(b.spare)} spare at ${lc(lab(w.home))}.`,
        why: [`<b>Why ${w.name}:</b> trained on ${c_}; about ${pct(b.spare)} of ${w.name}'s time is predicted spare at ${lc(lab(w.home))}.`,
              `<b>${w.name}'s own step:</b> ${lc(lab(w.home))} stays ${w.name}'s; ${w.name} goes back whenever ${drinks(E.returnTrigger)} wait there.`,
              `<b>Review:</b> the help ends once ${c_} is down to ${drinks(E.clearLevel)} or fewer.`, others.length ? `<b>Not the others:</b> ${others.join("; ")}.` : ""].filter(Boolean) };
      if (r.cause === "equipment") return { head: `Escalate: the ${c_} is the constraint, and moving people adds no ${c_} capacity. Check the machine; keep the current allocation.`,
        short: `The ${c_}: work due is about ${pct(s.rho)} of its capacity, the highest of any step; it is a machine step.`, why: [`<b>No move:</b> help at another step would only feed the ${c_} faster.`, `<b>Escalate to:</b> maintenance, or the zone manager to steer new orders (Proposal 1).`] };
      if (r.cause === "partial") return { head: `Escalate: ${c_} keeps building even if ${w.name} helps. ${w.name} can help meanwhile; call in cover or ask the zone manager to steer new orders (Proposal 1).`,
        short: `${C_}: work due is about ${pct(s.rho)} of capacity; with ${w.name}'s spare time it still does not clear in ${E.window} minutes.`, why: [`<b>Interim:</b> ${w.name} helps at ${c_}, returning whenever ${drinks(E.returnTrigger)} wait at ${lc(lab(w.home))}.`, `<b>Escalate to:</b> cover from a break or a nearby outlet, or the zone manager (Proposal 1).`] };
      return { head: `Escalate: no one trained on ${c_} has time to spare, so moving someone would only move the queue. Call in cover or ask the zone manager to steer new orders (Proposal 1).`,
        short: `${C_}: work due is about ${pct(s.rho)} of capacity; no colleague trained on it has ${pct(E.spareMin)} of their time spare, and help elsewhere would not clear it.`, why: [`<b>No move:</b> ${others.join("; ") || "no feasible helper"}.`, `<b>Escalate to:</b> cover from a break or a nearby outlet, or the zone manager (Proposal 1).`] };
    }
    const bandLine = r => r.range.holds ? `Holds across the forecast range, ±${pct(E.band)} on incoming drinks.`
      : `Forecast range ±${pct(E.band)}: at the low end, ${lc(KIND[r.range.low])}; at the high end, ${lc(KIND[r.range.high])}.`;
    // the counter as six tiles: drinks waiting now, and predicted load against capacity (bar to 150%, the dashed line is 100%)
    const SCALE = 1.5, w_ = v => (Math.min(v, SCALE) / SCALE * 100).toFixed(1);
    function strip(p, lo, hi, al = {}, cups = 8) {
      return E.stations.map((s, k) => {
        const x = p.st[k], con = k === p.con && x.rho >= 1, n = E.snapshot[k];
        const hp = Object.entries(al).filter(([, t]) => t && kOf(t) === k).map(([id]) => who(id).name);
        const name = s.machine ? "machine" : E.crew.filter(c => c.home === k).map(c => c.name).join(", ");
        return `<div class="stp${con ? " cst" : ""}${k === p.longest ? " long" : ""}" style="--i:${k}">${con ? `<span class="tag">Constraint</span>` : k === p.longest ? `<span class="tag ll">Longest list</span>` : ""}` +
          `<h6>${s.label}</h6><span class="who${s.machine ? " m" : ""}">${name}${hp.length ? ` <span class="hp">+ ${hp.join(", ")}</span>` : ""}</span>` +
          `<span class="wq">${"<i></i>".repeat(Math.min(n, cups))}<em>${n} waiting</em></span>` +
          `<div class="lbar${x.rho >= 1 ? " hi" : ""}"><i style="width:${w_(x.rho)}%"></i><s style="left:${w_(lo.st[k].rho)}%;width:${(w_(hi.st[k].rho) - w_(lo.st[k].rho)).toFixed(1)}%"></s><u style="left:${(100 / SCALE).toFixed(1)}%"></u></div>` +
          `<span class="wl">${pct(x.rho)} of capacity</span></div>`;
      }).join("");
    }

    /* the tablet, how it works (appendix, was slide 07): see the workload, predict the constraint, recommend a feasible response */
    const sb = document.getElementById("s2b");
    if (sb) {
      const box = $(sb, ".c5intro"), N = $$(box, ".c5s").length, pop = $(box, ".pop"), IN = OT.inputs.value; let st = 1;
      $$(sb, ".src[data-in]").forEach(b => { const x = IN[+b.dataset.in]; $(b, "b").textContent = x.label; $(b, "small").textContent = x.detail; $(b, ".tg").textContent = x.tag; b.classList.toggle("prop", x.status !== "recorded"); });
      const f0 = { perHour: D0, alloc: {} }, p0 = CT.project(E, f0), B = band(f0), con = p0.con;
      $(sb, ".strip").innerHTML = strip(p0, B.lo, B.hi);
      const lo = Math.round(B.lo.st[con].end), hi = Math.round(B.hi.st[con].end), dl = Math.round(D0 * (1 - E.band) * E.window / 60), dh = Math.round(D0 * (1 + E.band) * E.window / 60);
      $(sb, '[data-s2b="band"]').innerHTML = `Next ${E.window} minutes: about ${dl}–${dh} drinks expected (forecast range ±${pct(E.band)}). Without help, ${lc(lab(con))} would end the window with ${lo === hi ? `about ${lo}` : `${lo ? `about ${lo}` : "none"} to ${hi}`} drinks still waiting. The ${lc(lab(p0.longest))} shows the longest list, but it is quick.`;
      const R = CT.recommend(E, { perHour: D0 }), cp = recCopy(R);
      const kb = $(sb, '[data-s2b="kind"]'); kb.textContent = KIND[R.kind]; kb.className = `kb ${R.kind}`;
      $(sb, '[data-s2b="rec"]').textContent = cp.head;
      $(sb, '[data-s2b="why"]').innerHTML = cp.why.map(x => `<li>${x}</li>`).join("");
      const w = R.best && who(R.best.worker);
      const decide = d => { $$(sb, "[data-dec]").forEach(b => b.classList.toggle("on", b.dataset.dec === d));
        $(sb, '[data-s2b="dec"]').textContent = d === "yes" ? (w ? `Approved: ${w.name} moves to ${lc(lab(con))}; the tablet reviews when the backlog clears.` : "Approved.")
          : d === "no" ? "Declined: the allocation stays as it is; the decision is logged to evaluate the tool." : "approves or declines; nothing moves until then"; };
      const DET = {
        in0: ["Outstanding orders and drink mix", "Orders placed and the drinks on each sit in Chagee's order data today, as far as we know. Whether drink-level detail reaches the counter in real time is to confirm."],
        in1: ["Task times and equipment status", "When each drink finishes each step, and whether a machine is slow or down. Not recorded today, as far as we know: it needs step timestamps and equipment logs. Proposed."],
        in2: ["Staff assignments and skills", "Who is on which step now, and who is trained for what. A roster may exist; a skills record would have to be built and kept current. Proposed."],
        in3: ["Expected incoming demand", `Drinks expected over the next ${E.window} minutes, with a range, forecast from recorded orders. In this demonstration it is a set value with a ±${pct(E.band)} range, not a trained model.`],
        pred: ["AI predicts workload", `Expected incoming drinks for the next ${E.window} minutes, plus the drinks already waiting, give the work due at each step. In a pilot the forecast would be a model trained on Chagee's order history; here it is an illustrative input.`],
        bott: ["Bottleneck analysis", "For each step, work due (drinks times seconds per drink) against capacity (its machines, or the people assigned and their speed). The step with the highest load is the constraint; adding capacity anywhere else does not help."],
        band: ["Uncertainty", `The tablet projects the low, base and high end of the forecast, ±${pct(E.band)}. If its call changes across the range, it says so. Each bar's whisker is the range.`],
        rule: ["Operational rules, not the AI", `Keep if no step builds up; escalate if the constraint is a machine, or if no trained colleague with at least ${pct(E.spareMin)} of their time spare can clear it; otherwise suggest the one move that leaves the least work waiting. A separate simulation checks the outcome on the next slide.`],
        akeep: ["Keep the current allocation", "When the busiest step still keeps up, a move would only add walking and set-up time. At lower demand the tablet says keep."],
        acrew: ["No one trained has time to spare", "When no colleague trained on the constrained step has time to spare, moving someone only moves the queue. The crew cannot resolve it: escalate for cover, or ask the zone manager to steer new orders to an outlet with room (Proposal 1)."],
        aequip: ["Equipment is the constraint", "If a machine such as the sealer is slow, the queue is the machine's. People cannot add machine capacity, so the tablet escalates rather than moving anyone."],
        cbott: ["Bottleneck analysis", "A line's output is set by its most constrained step. Find it from capacity, not from the longest visible queue."],
        ccap: ["Capacity", "What each step can do in the window: machines by their cycle time, people by their speed and the drinks' work content. The drink mix matters: topped drinks take longer to finish."],
        cbal: ["Workload balancing", "Moving work from busy to less busy people. Week 5's bucket brigade shows how work sharing and hand-overs can let a line balance itself. This tool is not a bucket brigade: it suggests one approved move of one trained colleague, ended by a review."] };
      const closePop = () => { pop.classList.remove("on"); $$(box, ".src.on,.con.on").forEach(e => e.classList.remove("on")); };
      const play = () => { box.classList.remove("play"); void box.offsetWidth; box.classList.add("play"); $(box, "svg.flw").setCurrentTime?.(0); };
      const paint = () => {
        box.dataset.st = st; $(box, ".c5n").textContent = `${st} / ${N}`; $(box, '[data-c5="prev"]').disabled = st === 1;
        $$(box, ".sx li").forEach((l, i) => { l.classList.toggle("cur", i === st - 1); l.classList.toggle("done", i < st - 1); });
        $(box, '[data-c5="next"]').textContent = st < N ? "Next ▶" : "Try the manager's tablet →"; closePop(); play();
      };
      sb._intro = { enter: fromEnd => { st = fromEnd ? N : 1; paint(); },
        next: () => { if (st < N) { st++; paint(); return true; } return false; },
        prev: () => { if (st > 1) { st--; paint(); return true; } return false; } };
      box.addEventListener("click", e => {
        const b = e.target.closest("button,[data-d],[data-s]"); if (!b) return closePop(); b.blur?.();
        if (b.dataset.c5 === "next") { if (!sb._intro.next()) show(cur + 1); }
        else if (b.dataset.c5 === "prev") sb._intro.prev();
        else if (b.dataset.c5 === "replay") { closePop(); play(); }
        else if (b.dataset.dec) decide(b.classList.contains("on") ? null : b.dataset.dec);
        else if (b.dataset.s) { st = +b.dataset.s; paint(); }
        else if (b.classList.contains("x")) closePop();
        else if (DET[b.dataset.d]) { const [h, t] = DET[b.dataset.d]; closePop(); b.classList.add("on"); $(pop, "b").textContent = h; $(pop, "p").textContent = t;
          const Rb = box.getBoundingClientRect(), r = b.getBoundingClientRect(), s = Rb.width / box.offsetWidth;
          pop.style.left = `${Math.max(12, Math.min(box.offsetWidth - 482, (r.left - Rb.left) / s))}px`;
          if ((r.top + r.bottom) / 2 - Rb.top < Rb.height / 2) { pop.style.top = `${(r.bottom - Rb.top) / s + 8}px`; pop.style.bottom = ""; }
          else { pop.style.bottom = `${(Rb.bottom - r.top) / s + 8}px`; pop.style.top = ""; }
          pop.classList.add("on"); }
      });
      printers.push(() => { st = N; decide(null); paint(); }); decide(null); paint();
    }

    /* the tablet (appendix, was slide 08). Demand and the equipment toggle feed the prediction; staff cards set one help step per person (trained
       steps only); Try runs the current allocation against this one, Keep runs the current one alone, Reset restores */
    const tt = document.getElementById("s2t");
    if (tt) {
      const tab = $(tt, ".tab2"), dem = $(tt, '[data-t="dem"]'), slow = $(tt, '[data-t="slow"]');
      dem.min = E.demand.range[0]; dem.max = E.demand.range[1]; dem.step = E.demand.step;
      $(tt, '[data-t="where"]').textContent = `· ${OT.outlet_label.value} · ${OT.clock.value}`;
      $(tt, '[data-t="eqlab"]').textContent = E.equipment.label;
      const S = {};
      const reset = () => Object.assign(S, { per: D0, slow: false, alloc: {}, auto: true, shown: null, res: null });
      const autoFill = () => { if (!S.auto) return; const r = CT.recommend(E, { perHour: S.per, slow: S.slow }); S.alloc = r.best ? { [r.best.worker]: r.best.to } : {}; };
      const delta = (d, unit, fmt, good) => Math.abs(d) < unit ? `<span class="dch">about the same</span>`
        : `<span class="dch ${(d < 0) === good ? "g" : "r"}">${fmt(d)}</span>`;
      const wd = o => `<div class="wd">${E.crew.map((w, i) => { const x = o.crew[i];
        return `<span>${w.name}<i><em style="width:${(100 * x.work).toFixed(1)}%"></em><u style="left:${(100 * x.work).toFixed(1)}%;width:${(100 * x.moving).toFixed(1)}%"></u></i>${pct(x.work + x.moving)}</span>`; }).join("")}</div>`;
      function results() {
        if (!S.shown) return `<p class="ph">Pick a step on a staff card, or keep the tablet's suggestion, then press Try this allocation. It runs ${E.seeds} seeded simulations of the next ${E.window} minutes for each allocation; nothing moves until the manager decides.</p>`;
        const c = S.res.current, t = S.shown === "try" ? S.res.tried : null;
        return `<div class="rg"><div class="h"></div><div class="h">Current allocation</div><div class="h t">${t ? "This allocation" : S.shown === "keep" ? "Kept: no one moves" : "No move to try"}</div>` +
          `<div class="m">Order-to-ready<small>median, min:s</small></div>` +
          `<div class="v"><b>${mmss(c.median)}</b><small>runs ${mmss(c.lo)}–${mmss(c.hi)}</small></div>` +
          `<div class="v">${t ? `<b>${mmss(t.median)}</b>${delta(t.median - c.median, 5, d => `${mmss(Math.abs(d))} ${d < 0 ? "faster" : "slower"}`, true)}<small>runs ${mmss(t.lo)}–${mmss(t.hi)}</small>` : S.shown === "keep" ? `<small>the decision is logged for review</small>` : `<small>pick a step on a staff card to compare</small>`}</div>` +
          `<div class="m">Orders completed<small>in ${E.window} min</small></div>` +
          `<div class="v"><b>${Math.round(c.completed)}</b><small>${Math.round(c.unfinished)} still in progress</small></div>` +
          `<div class="v">${t ? `<b>${Math.round(t.completed)}</b>${delta(t.completed - c.completed, 0.5, d => `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d))}`, false)}<small>${Math.round(t.unfinished)} still in progress</small>` : ""}</div>` +
          `<div class="m">Workload<small>share of time · striped: moving</small></div>` +
          `<div class="v">${wd(c)}</div><div class="v">${t ? wd(t) : ""}</div></div>`;
      }
      // with no move to try (the tablet suggests none and none is picked), the current allocation is shown alone
      function run() {
        const f = { perHour: S.per, slow: S.slow };
        S.res = S.shown === "try" && Object.keys(S.alloc).length ? CT.compare(E, Sim, { ...f, alloc: S.alloc })
          : S.shown ? { current: CT.outcome(E, Sim, { ...f, alloc: {} }) } : null;
      }
      function render() {
        const f = { perHour: S.per, slow: S.slow }, r = CT.recommend(E, f);
        autoFill();
        const p = CT.project(E, { ...f, alloc: S.alloc }), B = band({ ...f, alloc: S.alloc }), base = CT.project(E, { ...f, alloc: {} });
        dem.value = S.per; $(tt, '[data-t="demv"]').textContent = S.per; slow.checked = S.slow;
        $(tt, ".tstrip").innerHTML = strip(p, B.lo, B.hi, S.alloc, 4);
        $(tt, ".tstaff").innerHTML = E.crew.map(w => {
          const c = base.crew.find(x => x.id === w.id), sel = S.alloc[w.id], busy = c.spare < E.spareMin;
          const chips = E.stations.map((s, k) => ({ s, k })).filter(({ s, k }) => !s.machine && k !== w.home).map(({ s, k }) => {
            const ok = w.trained.includes(k), on = sel === s.id, cls = !ok ? "no" : on ? "on" : busy ? "busy" : "";
            return `<button class="chip ${cls}" data-w="${w.id}" data-to="${s.id}"${ok ? "" : " disabled"}>Help at ${lc(s.label)}<small>${!ok ? "not trained" : on ? "trying" : busy ? "busy" : "eligible"}</small></button>`;
          }).join("");
          return `<div class="tsc${sel ? " sel" : ""}"><div class="hd"><span class="av">${w.name[0]}</span><span><b>${w.name}</b><small>On ${lc(lab(w.home))}${sel ? ` → helps at ${lc(lab(kOf(sel)))}` : ` · ${w.note.split(";")[0]}`}</small></span></div>` +
            `<div class="ld"><span>Busy at own step, next ${E.window} min</span><span>${c.load >= 1 ? "over capacity" : pct(c.load)}</span><div class="lbar${c.load >= 1 ? " hi" : ""}"><i style="width:${(100 * Math.min(1, c.load)).toFixed(1)}%"></i></div></div>` +
            `<span class="cl">Can help at · one step at a time</span><div class="chips">${chips}</div></div>`;
        }).join("");
        const cp = recCopy(r), kb = $(tt, '[data-t="kind"]');
        $(tt, ".trec").className = `trec ${r.kind}`; kb.textContent = KIND[r.kind]; kb.className = `kb ${r.kind}`;
        $(tt, '[data-t="rec"]').textContent = cp.head; $(tt, '[data-t="why"]').textContent = cp.short; $(tt, '[data-t="band"]').textContent = bandLine(r);
        $(tt, '[data-t="try"]').disabled = !Object.keys(S.alloc).length;
        $(tt, '[data-t="res"]').innerHTML = results();
      }
      tt.addEventListener("click", e => {
        const b = e.target.closest("[data-t],.chip"); if (!b || b.disabled) return; b.blur?.();
        if (b.classList.contains("chip")) { S.auto = false; if (S.alloc[b.dataset.w] === b.dataset.to) delete S.alloc[b.dataset.w]; else S.alloc[b.dataset.w] = b.dataset.to; if (S.shown) run(); return render(); }
        const a = b.dataset.t;
        if (a === "try") { S.shown = "try"; run(); render(); }
        else if (a === "keep") { S.shown = "keep"; run(); render(); }
        else if (a === "reset") { reset(); autoFill(); render(); }
        else if (a === "exec") tab.classList.add("exec");
        else if (a === "back") tab.classList.remove("exec");
      });
      dem.addEventListener("input", () => { S.per = +dem.value; autoFill(); if (S.shown) run(); render(); });
      slow.addEventListener("change", () => { S.slow = slow.checked; autoFill(); if (S.shown) run(); render(); });
      addEventListener("keydown", e => { if (e.key === "Escape") tab.classList.remove("exec"); });
      new MutationObserver(() => { if (!tt.classList.contains("active")) tab.classList.remove("exec"); }).observe(tt, { attributes: true, attributeFilter: ["class"] });
      printers.push(() => { reset(); autoFill(); S.shown = "try"; tab.classList.remove("exec"); run(); render(); });
      reset(); render();
    }
  })();

  /* ---------------------------------------------------------------- "How it works" / "Numbers" panels: [data-hiw] opens the
     .hiw with that name in the same panel; ✕, Escape or leaving the slide closes it */
  (function hiw() {
    const closeAll = () => $$(document, ".hiw.open").forEach(h => h.classList.remove("open"));
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-hiw]");
      if (b) { const h = $(b.closest(".panel"), `.hiw[data-name="${b.dataset.hiw}"]`); const was = h.classList.contains("open"); closeAll(); h.classList.toggle("open", !was); return; }
      if (e.target.closest("[data-hiwx]")) closeAll();
    });
    addEventListener("keydown", e => { if (e.key === "Escape") closeAll(); });
    const mo = new MutationObserver(closeAll); slides.forEach(sl => mo.observe(sl, { attributes: true, attributeFilter: ["class"] }));   // a slide change
    printers.push(closeAll);
  })();
  // the appendix P&L page (#ap): Back to P&L returns to slide 08 with its forecaster shown (not the three-step overview) and
  // the P&L view open, its chart tab, Assumptions / Test them and sliders as they were left
  const pnlBack = $(document, "#ap .pnlback");
  if (pnlBack) pnlBack.onclick = e => { e.stopPropagation(); pnlBack.blur(); const c5 = document.getElementById("c5"); jump = true; show(slides.indexOf(c5), true); c5._pnl?.(); };
  // appendix contents and in-slide links: each jumps to its page
  $$(document, ".apxix li[data-go], .golink[data-go], .auxb[data-go], .exob[data-go]").forEach(li => (li.onclick = () => { jump = true; li.blur(); show(slides.indexOf(document.getElementById(li.dataset.go))); }));

  /* ---------------------------------------------------------------- print */
  function preparePrint() {
    PRINTING = true;
    if (BUS.day !== DAY0) setDay(DAY0);
    steppers.forEach(({ S }) => S.stop()); slides.forEach(sl => buildTo(sl, Infinity));
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
