/* scene.js - the slide 07 comparison as an animated counter (Canvas 2D), driven by video/build/trace.js.
 *
 * Every position and time of the people at the counter, every cup and every counter on screen comes
 * from the sim trace (sim/trace.js: counter.create stepped by 0.5 s, read only). Frame f shows sim time
 * f x speed / fps seconds into the peak hour; staff x is interpolated linearly between the 0.5 s samples.
 * Drawn here, not in the sim (presentation only): the customers' walking paths (keyed to the sim's
 * order, hand-over and walk-away times), a 0.14 s slide when a cup changes place (the sim moves it
 * instantly), the poses, the props and the camera.
 *
 *   SCENE.frame(f)  draws frame f (frames must be asked for in order; asking for an earlier one replays)
 *                   -> { ts, hud: { A: { served, queue }, B: ... }, diag }
 */
(function () {
  "use strict";
  const TR = window.TRACE, V = TR.video;
  const cv = document.getElementById("c"), g = cv.getContext("2d");
  const CW = 1920, CH = 1080, FPS = V.fps, DTV = 1 / FPS;
  const SIM_PER_FRAME = V.speed / FPS, SIM_END = V.minutes * 60;
  const SIM_FRAMES = Math.round(SIM_END / SIM_PER_FRAME), TOTAL = SIM_FRAMES + Math.round(V.holdSec * FPS);
  const simT = f => Math.min(SIM_END, f * SIM_PER_FRAME);

  const COL = { red: "#B8322B", navy: "#24406B", blue: "#6F86AE", gold: "#C8A96A", taupe: "#9A9387", ice: "#DCE2EC",
    cream: "#F6F3ED", ink: "#262626", ink2: "#4A4A4A", line: "#E4DED2", paper: "#FFFFFF", charcoal: "#33363B" };
  const NAME = { ticket: "Order and tag", cup_ice: "Cup and ice", tea_milk: "Tea and milk", topping_finish: "Toppings",
    shake_seal: "Shake and seal", handover: "Hand-over" };                                  // as deck.js NAME
  const SANS = "Roboto, system-ui, sans-serif", SERIF = "'EB Garamond', Georgia, serif";

  /* ------------------------------------------------------------------ layout (world = one panel, 800 x 600) */
  const PANELS = [{ x: 30, y: 150, w: 920, h: 690 }, { x: 970, y: 150, w: 920, h: 690 }];
  const WW = 800, WH = 600, BASE = 1.2;
  const X = x => 80 + x * 108;                              // sim position along the counter -> world x
  const CTOP_FAR = 345, CTOP_NEAR = 400, CFLOOR = 466;      // counter: top surface far / near edge, foot of the front face
  const STRIP = 398;                                        // bottom of cups standing on the counter's near strip
  const LANE = [486, 510];                                  // staff feet, by worker index
  const STAFF_DX = -22;                                     // a person stands just left of the cup they work on
  const LINE_Y = 400, PICK = { x: X(5.85), y: 400 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const hash = n => { let h = (n + 1) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h ^ (h >>> 13)) >>> 0; };
  const pick = (arr, n) => arr[n % arr.length];

  /* ------------------------------------------------------------------ camera: gentle zoom-in, close-up on hand-over ~12 s */
  // the close-up is centred on the first moment near 12 s when both panels are handing a cup over (from the trace)
  const CLOSE = (() => {
    const handing = (tr, ts) => { const i = Math.min(tr.samples.length - 1, Math.floor(ts / tr.dt + 1e-9));
      return tr.samples[i][3].some(w => w[1] === 1 && w[0] >= tr.n - 0.6 && w[0] < tr.n); };
    let best = null;
    for (let f = 10.5 * FPS; f <= 13.5 * FPS; f++) {
      const both = TR.sides.every(s => handing(s, simT(f)));
      if (both && (best == null || Math.abs(f - 12 * FPS) < Math.abs(best - 12 * FPS))) best = f;
    }
    return { t: (best ?? 12 * FPS) / FPS, both: best != null };
  })();
  function camera(tv) {
    const zin = ease(tv / 4) * 0.06, c = CLOSE.t;
    const w = ease((tv - (c - 1.3)) / 0.7) * (1 - ease((tv - (c + 0.6)) / 0.7));
    const z = BASE * (1 + zin) * (1 + 0.55 * w);
    const fx = lerp(404, X(5.55), w), fy = lerp(350, 380, w);
    return { z, fx, fy, w };
  }

  /* ------------------------------------------------------------------ people (jointed vector figures) */
  const SKIN = ["#F1C9A5", "#E0AC82", "#C68A5E", "#9C6B47", "#7A4E32", "#F5D6BC"];
  const HAIR = ["#2B2522", "#4A3426", "#6B4A2F", "#1E1E1E", "#8A6A45", "#B9B2A6"];
  const SHIRT = [COL.navy, COL.blue, COL.red, COL.gold, "#7C9A7E", "#A86B8F", "#5E8C9A", COL.taupe];
  const PANTS = ["#3B4A5E", "#5A5149", "#2F3B47", "#6B6258", "#7E8794"];
  const staffColours = i => ({ skin: SKIN[[1, 3][i % 2]], hair: HAIR[[0, 3][i % 2]], shirt: "#F7F5F0", pants: "#3A3D42", shoe: "#2A2A2A", apron: COL.charcoal, cap: COL.charcoal });
  const custColours = id => { const h = hash(id);
    return { skin: pick(SKIN, h), hair: pick(HAIR, h >>> 3), shirt: pick(SHIRT, h >>> 6), pants: pick(PANTS, h >>> 9), shoe: "#3a3430" }; };

  function limb(a, b, c, w, colA, colB) {
    g.lineCap = "round"; g.lineJoin = "round";
    g.strokeStyle = colA; g.lineWidth = w; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = colB; g.lineWidth = w * 0.92; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
  }
  // two-bone reach: elbow for a hand at target t from shoulder s (lengths la, lb); side = +1 / -1 elbow out
  function ik(s, t, la, lb, side) {
    let dx = t[0] - s[0], dy = t[1] - s[1], d = Math.hypot(dx, dy);
    const dmax = la + lb - 0.5, dmin = Math.abs(la - lb) + 1;
    const dd = clamp(d, dmin, dmax); if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
    const ux = dx / d, uy = dy / d, hand = [s[0] + ux * dd, s[1] + uy * dd];
    const al = Math.acos(clamp((la * la + dd * dd - lb * lb) / (2 * la * dd), -1, 1)), th = Math.atan2(uy, ux) + side * al;
    return { elbow: [s[0] + Math.cos(th) * la, s[1] + Math.sin(th) * la], hand };
  }
  function hang(s, ang, bend, la, lb) {
    const e = [s[0] + Math.sin(ang) * la, s[1] + Math.cos(ang) * la];
    return { elbow: e, hand: [e[0] + Math.sin(ang + bend) * lb, e[1] + Math.cos(ang + bend) * lb] };
  }

  /* o: x, y (feet, world), s, theta (deg: 0 = back to camera, 180 = facing camera, +-90 = walking right / left),
        ph (walk phase), amp (0..1), reach: { L, R } world targets or null, col, staff, tilt
     returns the hands in world coordinates (so a held cup can be drawn under them) */
  function person(o) {
    const s = o.s, th = ((o.theta % 360) + 360) % 360, rad = th * Math.PI / 180;
    const side = Math.abs(Math.sin(rad)) > 0.7071, dir = Math.sin(rad) >= 0 ? 1 : -1;
    const front = !side && Math.cos(rad) < 0;
    const sq = side ? Math.abs(Math.sin(rad)) : Math.abs(Math.cos(rad));
    const sx = side ? dir * sq : sq, bob = -2.2 * o.amp * Math.abs(Math.cos(o.ph));
    const C = o.col;
    g.save();
    g.fillStyle = "rgba(38,38,38,0.13)"; g.beginPath(); g.ellipse(o.x, o.y + 1, 17 * s, 4.6 * s, 0, 0, 2 * Math.PI); g.fill();
    g.translate(o.x, o.y + bob * s); g.scale(s * sx, s);
    const toLocal = t => (t ? [(t[0] - o.x) / (s * sx), (t[1] - (o.y + bob * s)) / s] : null);
    const R = { L: toLocal(o.reach && o.reach.L), R: toLocal(o.reach && o.reach.R) };
    const LA = 29, LB = 27, hands = {};

    // legs
    const legs = [0, 1].map(j => {
      const f = o.ph + j * Math.PI;
      if (side) {
        const t = 0.5 * o.amp * Math.sin(f), flex = 0.9 * o.amp * Math.max(0, Math.cos(f));
        const hip = [0, -66], knee = [hip[0] + Math.sin(t) * 33, hip[1] + Math.cos(t) * 33];
        const sa = t - flex, foot = [knee[0] + Math.sin(sa) * 33, knee[1] + Math.cos(sa) * 33];
        return { hip, knee, foot, far: j === 1 };
      }
      const lift = 3 * o.amp * Math.max(0, Math.sin(f)), x = j ? 5 : -5;
      return { hip: [x, -66], knee: [x * 1.05, -33 - lift * 0.5], foot: [x * 1.1, -lift], far: false };
    });
    const drawLeg = L => {
      limb(L.hip, L.knee, L.foot, 8, L.far ? shade(C.pants, -18) : C.pants, L.far ? shade(C.pants, -18) : C.pants);
      g.fillStyle = C.shoe; g.beginPath();
      if (side) roundRect(L.foot[0] - 4, L.foot[1] - 4, 12, 5, 2.5); else roundRect(L.foot[0] - 4.5, L.foot[1] - 4, 9, 5, 2.5);
      g.fill();
    };
    // arms
    const shoulders = side ? [[-2, -113], [2, -113]] : [[-12, -113], [12, -113]];
    const arms = [0, 1].map(j => {
      const sh = shoulders[j], key = j ? "R" : "L", tgt = R[key];
      if (tgt) return { ...ik(sh, tgt, LA, LB, side ? -1 : (j ? -1 : 1) * (front ? -1 : 1)), far: side && j === 0 };
      if (side) { const a = -0.55 * o.amp * Math.sin(o.ph + j * Math.PI); return { ...hang(sh, a, 0.25 + 0.25 * o.amp, LA, LB), far: j === 0 }; }
      return { ...hang(sh, (j ? -1 : 1) * 0.08, (j ? -1 : 1) * 0.1, LA, LB), far: false };
    });
    const drawArm = A => {
      const sh = A === arms[0] ? shoulders[0] : shoulders[1];
      limb(sh, A.elbow, A.hand, 6.5, A.far ? shade(C.shirt, -14) : C.shirt, A.far ? shade(C.skin, -14) : C.skin);
    };

    if (side) { drawArm(arms[0]); drawLeg(legs[1]); }
    else legs.forEach(drawLeg);
    // torso
    const tw = side ? 9.5 : 13.5, hw = side ? 8.5 : 10;
    g.fillStyle = C.shirt; g.beginPath();
    g.moveTo(-tw, -110); g.quadraticCurveTo(-tw, -119, -tw + 5, -119); g.lineTo(tw - 5, -119); g.quadraticCurveTo(tw, -119, tw, -110);
    g.lineTo(hw, -64); g.lineTo(-hw, -64); g.closePath(); g.fill();
    g.fillStyle = C.pants; g.beginPath(); g.moveTo(-hw, -66); g.lineTo(hw, -66); g.lineTo(hw + 0.5, -58); g.lineTo(-hw - 0.5, -58); g.closePath(); g.fill();
    if (o.staff) apron(side, front, C.apron);
    if (side) drawLeg(legs[0]);
    // head
    g.fillStyle = C.skin; g.fillRect(-3, -125, 6, 8);
    g.save(); if (o.tilt) { g.translate(0, -125); g.rotate(o.tilt); g.translate(0, 125); }
    g.beginPath(); g.arc(0, -135, 11, 0, 2 * Math.PI); g.fill();
    if (side) {
      g.beginPath(); g.arc(10.5, -134, 2.2, 0, 2 * Math.PI); g.fill();
      g.fillStyle = C.hair; g.beginPath(); g.arc(-2.5, -137, 10, Math.PI * 0.45, Math.PI * 1.75); g.closePath(); g.fill();
      if (!o.staff) { g.fillStyle = C.ink; g.beginPath(); g.arc(5.5, -136.5, 1.2, 0, 2 * Math.PI); g.fill(); }
    } else if (front) {
      g.fillStyle = C.hair; g.beginPath(); g.arc(0, -137, 11.4, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();
      g.fillStyle = COL.ink; [-4, 4].forEach(x => { g.beginPath(); g.arc(x, -134, 1.3, 0, 2 * Math.PI); g.fill(); });
    } else {
      [-11, 11].forEach(x => { g.beginPath(); g.arc(x, -134, 2.3, 0, 2 * Math.PI); g.fill(); });
      g.fillStyle = C.hair; g.beginPath(); g.arc(0, -136, 11.2, 0, 2 * Math.PI); g.fill();
    }
    if (o.staff) {
      g.fillStyle = C.cap; g.beginPath(); g.arc(0, -138, 11.8, Math.PI, 2 * Math.PI); g.closePath(); g.fill();
      g.fillRect(-11.8, -139, 23.6, 3.5);
      if (side) { g.beginPath(); roundRect(6, -140, 13, 3.6, 1.8); g.fill(); }
      else if (front) { g.beginPath(); g.ellipse(0, -137, 12.5, 3.2, 0, 0, Math.PI); g.fill(); }
    }
    g.restore();
    // near arm (side) or both arms (back / front)
    if (side) drawArm(arms[1]); else arms.forEach(drawArm);
    const handsLocal = arms.map(A => A.hand);
    g.fillStyle = C.skin; handsLocal.forEach(h => { g.beginPath(); g.arc(h[0], h[1], 3.4, 0, 2 * Math.PI); g.fill(); });
    g.restore();
    const toWorld = h => [o.x + h[0] * s * sx, o.y + bob * s + h[1] * s];
    hands.L = toWorld(handsLocal[0]); hands.R = toWorld(handsLocal[1]); hands.r = 3.4 * s; hands.skin = C.skin;
    return hands;
  }
  function apron(side, front, c) {
    g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 2.2;
    if (side) {
      g.beginPath(); g.moveTo(3, -107); g.lineTo(9.8, -107); g.lineTo(9.2, -72); g.lineTo(12.5, -36); g.lineTo(-3, -36); g.lineTo(-2, -72); g.lineTo(3, -72); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(4, -107); g.lineTo(-1, -121); g.stroke();
      g.beginPath(); g.moveTo(-2, -73); g.lineTo(-9, -71); g.stroke();
    } else if (front) {
      g.beginPath(); g.moveTo(-7, -110); g.lineTo(7, -110); g.lineTo(9, -72); g.lineTo(12, -36); g.lineTo(-12, -36); g.lineTo(-9, -72); g.closePath(); g.fill();
    } else {
      g.beginPath(); g.moveTo(-10, -115); g.lineTo(8, -74); g.moveTo(10, -115); g.lineTo(-8, -74); g.stroke();
      g.fillRect(-10.5, -76, 21, 3.4);
      g.beginPath(); g.ellipse(-3, -72, 3.4, 2, 0.5, 0, 2 * Math.PI); g.ellipse(3, -72, 3.4, 2, -0.5, 0, 2 * Math.PI); g.fill();
      g.fillRect(-12.6, -72, 2.6, 36); g.fillRect(10, -72, 2.6, 36);
    }
  }
  function roundRect(x, y, w, h, r) { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), f = c => clamp(c + amt, 0, 255);
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  /* ------------------------------------------------------------------ cups: stages done (d) and progress (p) of the next */
  const TEA = [139, 90, 43], MILKTEA = [201, 162, 122], MIXED = [194, 154, 110];
  const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(",")})`;
  function ticket(x, y) {
    g.fillStyle = "#fff"; g.strokeStyle = "#CFC6B5"; g.lineWidth = 0.8;
    g.beginPath(); roundRect(x - 5, y - 12, 10, 12, 1.2); g.fill(); g.stroke();
    g.strokeStyle = "#B9B2A6"; g.lineWidth = 0.9; [-9, -6, -3.5].forEach(yy => { g.beginPath(); g.moveTo(x - 3, y + yy); g.lineTo(x + 3, y + yy); g.stroke(); });
  }
  function cup(x, y, d, p, rot = 0) {
    if (d === 0 && p < 0.5) { ticket(x, y); return; }
    const H = 18, T = 6.6, B = 5;
    g.save(); g.translate(x, y); if (rot) g.rotate(rot);
    const body = () => { g.beginPath(); g.moveTo(-T, -H); g.lineTo(T, -H); g.lineTo(B, 0); g.lineTo(-B, 0); g.closePath(); };
    g.fillStyle = "rgba(255,255,255,0.7)"; body(); g.fill();
    g.save(); body(); g.clip();
    const fill = (lvl, col) => { g.fillStyle = col; g.fillRect(-T, -H * lvl, 2 * T, H * lvl); };
    if (d >= 2 || (d === 1 && p > 0)) {                                       // ice
      const ice = d === 1 ? 0.38 * p : 0.38;
      if (d <= 2) { g.fillStyle = "#CFE3F0"; for (let k = 0; k < Math.round(ice * 9); k++) g.fillRect(-4 + (k % 3) * 2.8, -2.8 - Math.floor(k / 3) * 2.6, 2.4, 2.4); }
    }
    if (d >= 3 || (d === 2 && p > 0)) {                                       // tea and milk
      const lvl = d === 2 ? 0.2 + 0.65 * p : 0.85, col = d === 2 ? rgb(TEA, MILKTEA, p) : d >= 5 || (d === 4 && p > 0.5) ? rgb(MIXED, MIXED, 0) : rgb(MILKTEA, MILKTEA, 0);
      g.globalAlpha = 0.92; fill(lvl, col); g.globalAlpha = 1;
      if (d === 2) { g.fillStyle = "#E6F0F6"; for (let k = 0; k < 3; k++) g.fillRect(-4 + k * 2.8, -H * lvl + 1, 2.4, 2.2); }
    }
    if (d >= 4 || (d === 3 && p > 0)) {                                       // toppings
      const n = d === 3 ? Math.floor(p * 7) : 7;
      g.fillStyle = "#3A2A20"; for (let k = 0; k < n; k++) { g.beginPath(); g.arc(-3.6 + (k % 4) * 2.4 + (k >= 4 ? 1.2 : 0), -1.8 - (k >= 4 ? 2.2 : 0), 1.25, 0, 2 * Math.PI); g.fill(); }
    }
    g.restore();
    g.strokeStyle = "#A7AFB8"; g.lineWidth = 0.9; body(); g.stroke();
    if (d >= 1 || p >= 0.5) { g.fillStyle = COL.gold; g.fillRect(-3, -11, 6, 4); }                 // order tag
    if (d >= 5 || (d === 4 && p >= 0.7)) {                                    // sealed, lid on
      g.fillStyle = "rgba(255,255,255,0.85)"; g.strokeStyle = "#A7AFB8";
      g.beginPath(); g.ellipse(0, -H, T + 0.8, 3.4, 0, Math.PI, 2 * Math.PI); g.fill(); g.stroke();
      g.fillStyle = "#A7AFB8"; g.fillRect(-T - 0.8, -H - 0.6, 2 * T + 1.6, 1.4);
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ the counter and its stations */
  function drawRoom(cam) {
    g.fillStyle = "#EFE9DF"; g.fillRect(-400, -400, WW + 800, 120 + 400);
    g.fillStyle = COL.ice; g.fillRect(60, 22, 680, 78);                       // shop window
    g.strokeStyle = "#CFC6B5"; g.lineWidth = 3; g.strokeRect(60, 22, 680, 78);
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(60 + k * 170, 22); g.lineTo(60 + k * 170, 100); g.stroke(); }
    g.fillStyle = "rgba(255,255,255,0.45)"; g.beginPath(); g.moveTo(90, 100); g.lineTo(140, 22); g.lineTo(170, 22); g.lineTo(120, 100); g.fill();
    g.fillStyle = "#E5DCCD"; g.fillRect(-400, 116, WW + 800, 6);
    const fl = g.createLinearGradient(0, 120, 0, WH + 200); fl.addColorStop(0, "#EAE3D6"); fl.addColorStop(1, "#E0D7C7");
    g.fillStyle = fl; g.fillRect(-400, 120, WW + 800, WH + 400);
    g.strokeStyle = "rgba(154,147,135,0.18)"; g.lineWidth = 1;
    for (let y = 140; y < WH + 200; y += 28) { g.beginPath(); g.moveTo(-400, y); g.lineTo(WW + 400, y); g.stroke(); }
  }
  function drawCounterTop(st) {
    g.fillStyle = "rgba(38,38,38,0.10)"; g.fillRect(X(0) - 6, CFLOOR - 2, X(st.length) - X(0) + 12, 14);   // floor shadow
    g.fillStyle = "#F4EFE6"; g.beginPath(); g.moveTo(X(0) + 8, CTOP_FAR); g.lineTo(X(st.length) - 8, CTOP_FAR); g.lineTo(X(st.length), CTOP_NEAR); g.lineTo(X(0), CTOP_NEAR); g.closePath(); g.fill();
    g.strokeStyle = "#D8CFBF"; g.lineWidth = 1.2; g.stroke();
    for (let k = 1; k < st.length; k++) { g.strokeStyle = "rgba(154,147,135,0.25)"; g.beginPath(); g.moveTo(X(k), CTOP_FAR + 2); g.lineTo(X(k), CTOP_NEAR - 1); g.stroke(); }
  }
  function drawCounterFront(st) {
    const fr = g.createLinearGradient(0, CTOP_NEAR, 0, CFLOOR); fr.addColorStop(0, "#E9E1D3"); fr.addColorStop(1, "#DDD3C2");
    g.fillStyle = fr; g.fillRect(X(0), CTOP_NEAR, X(st.length) - X(0), CFLOOR - CTOP_NEAR);
    g.fillStyle = "#CFC4B1"; g.fillRect(X(0), CTOP_NEAR, X(st.length) - X(0), 3);
    st.forEach((s, k) => {
      const x = X(k) + 6, y = CTOP_NEAR + 12, w = 98, h = 30;
      g.fillStyle = s.machine ? COL.navy : "#fff"; g.strokeStyle = s.machine ? COL.navy : "#CFC6B5"; g.lineWidth = 1;
      g.beginPath(); roundRect(x, y, w, h, 5); g.fill(); g.stroke();
      g.fillStyle = s.machine ? "#fff" : COL.ink; g.font = `500 10.5px ${SANS}`; g.textBaseline = "alphabetic";
      g.fillText(NAME[s.id] || s.id, x + 7, y + 13);
      g.fillStyle = s.machine ? "#C9D3E6" : COL.taupe; g.font = `400 9.5px ${SANS}`;
      g.fillText(`${s.machine ? "machine" : "by hand"} · ${Math.round(s.sec)} s`, x + 7, y + 25);
    });
  }
  function props(s, k, tv) {
    const cx = X(k + 0.5), y = CTOP_FAR + 30;
    if (s.id === "ticket") {
      g.fillStyle = "#4A4A4A"; g.beginPath(); roundRect(cx + 4, y - 22, 30, 20, 2.5); g.fill();
      g.fillStyle = COL.ice; g.fillRect(cx + 7, y - 19, 24, 14); g.fillStyle = "#8A8A8A"; g.fillRect(cx + 15, y - 2, 8, 4);
      g.fillStyle = "#fff"; g.beginPath(); g.arc(cx - 22, y - 6, 7, 0, 2 * Math.PI); g.fill(); g.strokeStyle = "#CFC6B5"; g.stroke();
    } else if (s.id === "cup_ice") {
      for (let j = 0; j < 5; j++) { g.strokeStyle = "#A7AFB8"; g.fillStyle = "rgba(255,255,255,0.8)"; g.beginPath(); g.moveTo(cx - 34, y - 2 - j * 4); g.lineTo(cx - 20, y - 2 - j * 4); g.lineTo(cx - 22, y - 14 - j * 4); g.lineTo(cx - 32, y - 14 - j * 4); g.closePath(); g.fill(); g.stroke(); }
      steel(cx - 4, y - 16, 40, 18, 3); g.fillStyle = "#D9EAF4"; for (let j = 0; j < 7; j++) g.fillRect(cx - 1 + j * 5, y - 18 + (j % 2) * 2, 4, 4);
    } else if (s.id === "tea_milk") {
      [[-26, "#C8CDD3"], [4, "#C8CDD3"]].forEach(([dx, c]) => { steel(cx + dx, y - 34, 22, 32, 4); g.fillStyle = "#6B7178"; g.fillRect(cx + dx + 8, y - 8, 6, 4); });
      g.fillStyle = "#fff"; g.strokeStyle = "#CFC6B5"; g.beginPath(); roundRect(cx + 32, y - 18, 12, 16, 2); g.fill(); g.stroke();
    } else if (s.id === "topping_finish") {
      [["#3A2A20", -34], [COL.gold, -10], ["#F1E3C0", 14]].forEach(([c, dx]) => { steel(cx + dx, y - 14, 20, 14, 2); g.fillStyle = c; g.beginPath(); g.ellipse(cx + dx + 10, y - 13, 8, 2.6, 0, 0, 2 * Math.PI); g.fill(); });
    } else if (s.id === "shake_seal") {
      steel(cx - 30, y - 26, 14, 24, 3); steel(cx - 12, y - 22, 14, 20, 3);
      g.fillStyle = "#fff"; for (let j = 0; j < 4; j++) { g.beginPath(); g.ellipse(cx + 18, y - 4 - j * 3, 8, 2.2, 0, 0, 2 * Math.PI); g.fill(); g.strokeStyle = "#CFC6B5"; g.stroke(); }
    } else if (s.id === "handover") {
      g.fillStyle = "rgba(154,147,135,0.35)"; g.beginPath(); roundRect(cx - 38, y - 18, 76, 22, 4); g.fill();
      g.fillStyle = COL.ink2; g.font = `700 8.5px ${SANS}`; g.textAlign = "center"; g.fillText("PICK-UP", cx, y - 4); g.textAlign = "left";
    }
  }
  function steel(x, y, w, h, r) {
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, "#E6E9ED"); gr.addColorStop(0.55, "#C4CAD1"); gr.addColorStop(1, "#AEB5BD");
    g.fillStyle = gr; g.beginPath(); roundRect(x, y, w, h, r); g.fill(); g.strokeStyle = "#9AA2AB"; g.lineWidth = 0.8; g.stroke();
  }
  // machines: plain stainless boxes with one moving part each (no brand, no vendor shape)
  const MW = 90, MTOP = 304, MBASE = 392, BAY = { w: 34, top: 348 };
  function machine(s, k, busy, tv) {
    const cx = X(k + 0.5), x = cx - MW / 2;
    g.fillStyle = "rgba(38,38,38,0.12)"; g.beginPath(); g.ellipse(cx + 6, MBASE + 2, MW / 2 + 4, 6, 0, 0, 2 * Math.PI); g.fill();
    g.fillStyle = "#E9ECEF"; g.beginPath(); g.moveTo(x + 6, MTOP - 12); g.lineTo(x + MW - 2, MTOP - 12); g.lineTo(x + MW, MTOP); g.lineTo(x, MTOP); g.closePath(); g.fill();
    g.strokeStyle = "#9AA2AB"; g.lineWidth = 0.8; g.stroke();
    steel(x, MTOP, MW, MBASE - MTOP, 3);
    g.fillStyle = "#4A5058"; g.beginPath(); roundRect(cx - BAY.w / 2, BAY.top, BAY.w, MBASE - BAY.top - 4, 3); g.fill();
    g.fillStyle = "#5C636C"; g.fillRect(cx - BAY.w / 2 + 3, MBASE - 9, BAY.w - 6, 4);                 // cup rest
    const on = busy.length > 0, p = on ? busy[0][1] : 0;
    g.fillStyle = on ? COL.gold : "#8C949C"; g.beginPath(); g.arc(x + MW - 12, MTOP + 10, 3, 0, 2 * Math.PI); g.fill();
    g.fillStyle = "#2F343A"; g.fillRect(x + 10, MTOP + 7, 30, 7);
    return { cx, p, on };
  }
  // the moving part, drawn over the cup in the bay
  function machinePart(s, m, tv) {
    const { cx, p, on } = m, top = BAY.top + 2;
    g.save();
    if (s.id === "cup_ice") {
      steel(cx - 24, MTOP - 30, 14, 34, 3);                                    // cup tube
      g.fillStyle = "#6B7178"; g.fillRect(cx - 4, top - 2, 8, 6);             // ice chute
      if (on && p > 0.3 && p < 0.9) { g.fillStyle = "#D9EAF4"; for (let j = 0; j < 4; j++) { const yy = top + 6 + ((tv * 120 + j * 7) % 22); g.fillRect(cx - 2 + (j % 2) * 2, yy, 3, 3); } }
    } else if (s.id === "tea_milk") {
      steel(cx - 16, MTOP - 26, 32, 30, 5);                                    // tank
      g.fillStyle = "#6B7178"; g.fillRect(cx - 3 + (on ? Math.sin(tv * 20) * 0.8 : 0), top - 2, 6, 9);   // spout
      if (on && p > 0.12 && p < 0.86) { g.fillStyle = rgb(TEA, MILKTEA, p); g.fillRect(cx - 1.3, top + 7, 2.6, MBASE - 10 - (top + 7) - 14); }
    } else if (s.id === "topping_finish") {
      g.fillStyle = "rgba(255,255,255,0.75)"; g.strokeStyle = "#9AA2AB"; g.beginPath(); g.moveTo(cx - 18, MTOP - 30); g.lineTo(cx + 18, MTOP - 30); g.lineTo(cx + 6, MTOP); g.lineTo(cx - 6, MTOP); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#3A2A20"; for (let j = 0; j < 9; j++) { g.beginPath(); g.arc(cx - 10 + (j % 5) * 5, MTOP - 6 - Math.floor(j / 5) * 5 - (j % 2), 2, 0, 2 * Math.PI); g.fill(); }
      g.fillStyle = "#6B7178"; g.fillRect(cx - 4, top - 2, 8, 7);              // chute
      if (on && p > 0.2 && p < 0.8) { g.fillStyle = "#3A2A20"; for (let j = 0; j < 3; j++) { const yy = top + 7 + ((tv * 90 + j * 8) % 18); g.beginPath(); g.arc(cx, yy, 1.6, 0, 2 * Math.PI); g.fill(); } }
    } else if (s.id === "shake_seal") {
      const press = on && p >= 0.7 ? Math.sin(clamp((p - 0.7) / 0.25, 0, 1) * Math.PI) : 0;
      g.fillStyle = "#6B7178"; g.fillRect(cx - 2, top - 2, 4, 4 + press * 8);
      g.fillStyle = "#8C949C"; g.fillRect(cx - 11, top + 2 + press * 8, 22, 4);  // seal plate
    }
    g.restore();
  }
  // cup x offset in a busy bay (the shaker shakes the cup)
  const bayShake = (s, p, tv) => (s.id === "shake_seal" && p < 0.7 ? Math.sin(tv * 70) * 2.6 : 0);

  /* ------------------------------------------------------------------ one side: sim state at a time, and what is drawn */
  function makeSide(tr, idx) {
    const S = { tr, idx, n: tr.n, st: tr.stations, workers: tr.workers.map((w, i) => ({ i, xw: null, hist: [], theta: 0, ph: 0, amp: 0 })),
      cups: new Map(), cust: new Map(), balkers: [], slots: Array(22).fill(null), ai: 0, oi: 0, bi: 0, diag: { staffOverlap: [], custOverlap: [], custKinds: {} } };
    return S;
  }
  function sampleAt(S, ts) {
    const tr = S.tr, N = tr.samples.length, u = ts / tr.dt, i = Math.min(N - 1, Math.floor(u + 1e-9)), a = i < N - 1 ? u - i : 0;
    return { i, a, s0: tr.samples[i], s1: tr.samples[Math.min(N - 1, i + 1)] };
  }
  const stageOf = (S, wx) => { const k = Math.min(S.n - 1, Math.floor(wx + 1e-9)); return { k, p: clamp(wx - k, 0, 1) }; };

  function update(S, f) {
    const ts = simT(f), tv = f * DTV, { i, a, s0, s1 } = sampleAt(S, ts), tr = S.tr, n = S.n;
    const view = { ts, served: s0[0], lost: s0[1], queue: s0[2], workers: [], cups: [], machines: s0[4].map(() => []) };
    // staff: x from the trace, linearly between samples
    s0[3].forEach((w0, j) => {
      const w1 = s1[3][j], W = S.workers[j];
      const wx = Math.abs(w1[0] - w0[0]) < 1.5 ? lerp(w0[0], w1[0], a) : w0[0], mode = TRACE_MODES[w0[1]], cupId = w0[2];
      const xw = X(wx) + STAFF_DX, dx = W.xw == null ? 0 : xw - W.xw;
      W.hist.unshift(W.xw == null ? xw : W.xw); W.hist.length = 3;
      W.xw = xw;
      // working carries the cup along the station (x40 makes that fast): keep facing the counter and side-step
      const moving = Math.abs(dx) > 0.8, working = mode === "work" && cupId >= 0;
      const target = moving && !working ? (dx > 0 ? 90 : -90) : 0;
      let d = target - W.theta; W.theta += clamp(d, -30, 30);
      W.ph += Math.min(Math.abs(dx) / 14, 0.75);
      W.amp += ((moving ? Math.min(working ? 0.6 : 1, Math.abs(dx) / 3) : 0) - W.amp) * 0.5;
      view.workers.push({ j, wx, xw, mode, cupId, speed: Math.abs(dx) * FPS, ...stageOf(S, wx) });
    });
    // where each cup is (and how far along)
    const loc = new Map();
    s0[4].forEach(([q, busy, ready], k) => {
      q.forEach((id, j) => loc.set(id, { key: `q${k}.${j}`, k, d: k, p: 0, x: X(k) + 10 + (j % 7) * 14.5, y: STRIP - Math.floor(j / 7) * 6, at: k }));
      busy.forEach(([id, p0], u) => {
        const nb = s1[4][k][1].find(b => b[0] === id), p = nb && nb[1] >= p0 ? lerp(p0, nb[1], a) : p0, units = S.st[k].units;
        loc.set(id, { key: `m${k}.${u}`, k, d: k, p, x: X(k + 0.5) + (u - (units - 1) / 2) * 30, y: MBASE - 5, at: k, inMachine: true });
        view.machines[k].push([id, p]);
      });
      ready.forEach((id, j) => loc.set(id, { key: `r${k}.${j}`, k, d: k + 1, p: 0, x: X(k + 1) - 10 - j * 14.5, y: STRIP, at: k }));
    });
    view.workers.forEach(w => {
      if (w.cupId < 0) return;
      const { k, p } = w, hand = S.st[k].id === "handover" && p > 0.5;
      loc.set(w.cupId, { key: `w${w.j}`, k, d: k, p, x: X(w.wx), y: hand ? STRIP - (p - 0.5) / 0.5 * 44 : STRIP, at: k, held: w.j });
    });
    // cups: exact sim place; a short slide when a cup changes place
    for (const [id, L] of loc) {
      let C = S.cups.get(id);
      if (!C) { C = { key: L.key, from: null, t0: tv, x: L.x, y: L.y }; S.cups.set(id, C); }
      if (C.key !== L.key) { C.from = [C.x, C.y]; C.t0 = tv; C.key = L.key; }
      const e = C.from ? ease((tv - C.t0) / 0.14) : 1;
      C.x = C.from ? lerp(C.from[0], L.x, e) : L.x; C.y = C.from ? lerp(C.from[1], L.y, e) : L.y;
      if (e >= 1) C.from = null;
      view.cups.push({ id, ...L, dx: C.x, dy: C.y });
    }
    // customers: one per cup; born at the sim's order time, served at the sim's hand-over time
    const ev = tr.events;
    if (f === 0) for (const id of loc.keys()) S.cust.set(id, newCust(id, null));
    while (S.ai < ev.arrive.length && ev.arrive[S.ai][0] <= ts + 1e-9) { const id = ev.arrive[S.ai++][1]; if (!S.cust.has(id)) S.cust.set(id, newCust(id, [-30, LINE_Y])); }
    while (S.oi < ev.out.length && ev.out[S.oi][0] <= ts + 1e-9) {
      const id = ev.out[S.oi++][1], c = S.cust.get(id), C = S.cups.get(id);
      if (c) { c.state = "got"; c.tGot = tv; c.cupD = 6; }
      S.cups.delete(id);
    }
    while (S.bi < ev.balk.length && ev.balk[S.bi] <= ts + 1e-9) { S.bi++; S.balkers.push({ ...newCust(100000 + S.bi, [-30, LINE_Y - 6]), state: "balk", tB: tv }); }
    // targets
    const atOrder = [], waiting = [], atPick = [];
    for (const [id, c] of S.cust) {
      if (c.state !== "in") continue;
      const L = loc.get(id); if (!L) continue;
      if (L.at === 0 && !(L.d >= 1)) atOrder.push([L.held != null ? -1 : +L.key.split(".")[1] || 0, id]);
      else if (L.at >= n - 2) atPick.push(id); else waiting.push(id);       // last two stations: step up to pick-up
    }
    atOrder.sort((p, q) => p[0] - q[0] || p[1] - q[1]); atPick.sort((p, q) => p - q);
    atOrder.forEach(([, id], j) => (S.cust.get(id).tgt = [X(0) + 52 - j * 24, LINE_Y - j * 9]));
    // waiting: each customer keeps the spot they took (nobody shuffles along); spots fill left to right
    for (let j = 0; j < S.slots.length; j++) if (S.slots[j] != null && !waiting.includes(S.slots[j])) S.slots[j] = null;
    for (const id of waiting.sort((p, q) => p - q)) if (!S.slots.includes(id)) { const j = S.slots.indexOf(null); if (j >= 0) S.slots[j] = id; }
    S.slots.forEach((id, j) => { if (id == null) return; const r = Math.floor(j / 11), jj = j % 11;
      S.cust.get(id).tgt = [X(1.15) + jj * 40 + r * 20, (jj % 2 ? 372 : 360) - r * 12]; });
    atPick.forEach((id, j) => (S.cust.get(id).tgt = [PICK.x - j * 30, PICK.y - j * 6]));
    const lineEnd = X(0) + 52 - atOrder.length * 24;
    for (const [id, c] of S.cust) {
      if (c.state === "got") {                                           // at pick-up a moment, then out to the right
        const there = c.x > PICK.x - 100 || c.left;
        if (there && c.tAt == null) c.tAt = tv;
        c.left = c.left || (there && tv - c.tAt >= 0.3);
        if (there && !c.aside) c.aside = [c.x + 34, c.y];                  // step aside so the next customer can come up
        c.tgt = c.left ? [WW + 120, LINE_Y] : there ? c.aside : [PICK.x, PICK.y];
      }
      if (c.tgt) move(c, c.tgt, c.state === "got" ? 380 : 520, f === 0);
      if (c.state === "got" && c.x > WW + 90) S.cust.delete(id);
    }
    for (const b of S.balkers) {
      const age = tv - b.tB;
      const lane = b.id % 3;                                             // walk-aways stop in one of three spots
      if (b.state === "balk") { move(b, [Math.max(-4, lineEnd - 26) - lane * 22, LINE_Y - 8 - lane * 9], 420); if (age > 0.55) b.state = "turn"; }
      else if (b.state === "turn") { b.vx = 0; b.amp *= 0.5; if (age > 0.85) b.state = "leave"; }
      else move(b, [-80, LINE_Y - 10 - lane * 9], 420);
    }
    S.balkers = S.balkers.filter(b => !(b.state === "leave" && b.x < -60));
    // reach: staff hands to the cup they work on; the customer at pick-up reaches for the cup being handed over
    view.reachCust = null;
    view.workers.forEach(w => {
      if (w.cupId < 0) return;
      const L = view.cups.find(c => c.id === w.cupId); if (!L) return;
      w.cup = L;
      if (S.st[w.k].id === "handover" && w.p > 0.72) view.reachCust = { id: w.cupId, x: L.dx, y: L.dy - 9 };
    });
    // diagnostics: two staff figures drawn over each other, two customers standing in one spot
    const ws = view.workers;
    for (let p = 0; p < ws.length; p++) for (let q = p + 1; q < ws.length; q++)
      if (Math.abs(ws[p].xw - ws[q].xw) < 28) S.diag.staffOverlap.push(f);
    const cs = [...S.cust.values(), ...S.balkers];
    const kind = c => (c.state === "in" ? (atOrder.some(o => o[1] === c.id) ? "line" : atPick.includes(c.id) ? "pick-up" : "waiting") : c.state);
    let co = 0; for (let p = 0; p < cs.length; p++) for (let q = p + 1; q < cs.length; q++) if (Math.abs(cs[p].x - cs[q].x) < 14 && Math.abs(cs[p].y - cs[q].y) < 8) {
      co++; const k = [kind(cs[p]), kind(cs[q])].sort().join(" + "); S.diag.custKinds[k] = (S.diag.custKinds[k] || 0) + 1; }
    if (co) S.diag.custOverlap.push(f);
    S.view = view;
  }
  const TRACE_MODES = ["idle", "work", "back", "fetch", "walk"];
  function newCust(id, at) { return { id, x: at ? at[0] : null, y: at ? at[1] : null, tgt: null, state: "in", ph: 0, amp: 0, vx: 0, col: custColours(id), dir: 1 }; }
  function move(c, t, vmax, snap) {
    if (c.x == null || snap) { c.x = t[0]; c.y = t[1]; c.amp = 0; c.vx = 0; return; }
    const dx = t[0] - c.x, dy = t[1] - c.y, d = Math.hypot(dx, dy);
    const step = Math.min(d, Math.max(vmax * DTV * 0.25, Math.min(vmax * DTV, d * 0.35)));
    if (d > 1e-6) { c.x += dx / d * step; c.y += dy / d * step; }
    c.vx = d > 1e-6 ? dx / d * step : 0;
    if (Math.abs(c.vx) > 0.3) c.dir = Math.sign(c.vx);
    c.ph += step / 9; c.amp += ((step > 0.6 ? Math.min(1, step / 4) : 0) - c.amp) * 0.5;
  }

  /* ------------------------------------------------------------------ drawing one panel */
  function staffReach(w, tv) {
    const L = w.cup; if (!L || w.mode !== "work") return null;
    const id = S_ID(w), cx = L.dx, cy = L.dy - 9;
    const t = tv + w.j * 0.37;
    if (id === "ticket") return { L: [cx - 6, cy], R: [cx + 14, cy - 6 + 3 * Math.sin(t * 18)] };
    if (id === "cup_ice") return { L: [cx - 6, cy], R: [cx + 9 + 5 * Math.sin(t * 9), cy - 14 + 4 * Math.cos(t * 9)] };
    if (id === "tea_milk") return { L: [cx - 6, cy], R: [cx + 12, cy - 20] };
    if (id === "topping_finish") return { L: [cx - 6, cy], R: [cx + 4, cy - 16 + 7 * Math.abs(Math.sin(t * 8))] };
    if (id === "shake_seal") return w.p < 0.7 ? { L: [cx - 6, cy - 4], R: [cx + 6, cy - 4] } : { L: [cx - 6, cy], R: [cx, cy - 12 + 2 * Math.sin(t * 20)] };
    if (id === "handover") return { L: [cx - 6, cy], R: [cx + 5, cy - 4] };
    return { L: [cx - 6, cy], R: [cx + 6, cy] };
  }
  let S_ID = () => "";
  function heldTool(w, tv) {                                         // pitcher, scoop, spoon in the right hand
    const L = w.cup; if (!L || w.mode !== "work" || !w.hands) return;
    const id = S_ID(w), h = w.hands.R;
    if (id === "tea_milk") {
      g.save(); g.translate(h[0], h[1]); g.rotate(-0.6 - 0.25 * Math.sin(w.p * Math.PI));
      g.fillStyle = "#C8CDD3"; g.strokeStyle = "#9AA2AB"; g.beginPath(); roundRect(-6, -14, 12, 16, 2); g.fill(); g.stroke(); g.restore();
      if (w.p > 0.1 && w.p < 0.9) { g.fillStyle = rgb(TEA, MILKTEA, w.p); g.fillRect(L.dx - 1.2, h[1] + 2, 2.4, Math.max(0, L.dy - 14 - h[1])); }
    } else if (id === "cup_ice") { g.fillStyle = "#9AA2AB"; g.beginPath(); g.ellipse(h[0] + 3, h[1] + 2, 5, 3, 0.3, 0, 2 * Math.PI); g.fill(); }
    else if (id === "topping_finish") { g.strokeStyle = "#6B7178"; g.lineWidth = 2; g.beginPath(); g.moveTo(h[0], h[1]); g.lineTo(h[0] - 3, h[1] + 10); g.stroke(); }
  }
  function drawPanel(S, k, cam, tv) {
    const P = PANELS[k], v = S.view;
    S_ID = w => S.st[w.k].id;
    g.save();
    g.beginPath(); roundRect(P.x, P.y, P.w, P.h, 14); g.clip();
    g.translate(P.x + P.w / 2, P.y + P.h / 2); g.scale(cam.z, cam.z); g.translate(-cam.fx, -cam.fy);
    drawRoom(cam);
    // customers (behind the counter), far first
    const people = [...S.cust.values(), ...S.balkers].filter(c => c.x != null).sort((p, q) => p.y - q.y || p.id - q.id);
    const custHands = new Map();
    people.forEach(c => {
      const walking = c.amp > 0.15, reach = v.reachCust && v.reachCust.id === c.id ? { R: [v.reachCust.x, v.reachCust.y] } : null;
      const holding = c.state === "got";
      const theta = c.state === "turn" ? 180 + 25 * Math.sin((tv - c.tB) * 18) : walking ? 90 * c.dir : 180;
      const hands = person({ x: c.x, y: c.y, s: 0.8, theta, ph: c.ph, amp: walking ? c.amp : 0, col: c.col, staff: false,
        reach: holding && !walking ? { R: [c.x + 12, c.y - 72] } : reach, tilt: c.state === "turn" ? 0.18 * Math.sin((tv - c.tB) * 16) : 0 });
      custHands.set(c.id, hands);
      if (holding) { const h = hands.R; cup(h[0] + (walking ? 0 : 1), h[1] + 9, 6, 0); g.fillStyle = hands.skin; g.beginPath(); g.arc(h[0], h[1], hands.r, 0, 2 * Math.PI); g.fill(); }
    });
    drawCounterTop(S.st);
    S.st.forEach((s, j) => { if (!s.machine) props(s, j, tv); });
    const ms = S.st.map((s, j) => (s.machine ? machine(s, j, v.machines[j], tv) : null));
    if (S.st.some(s => s.machine)) {                                   // the rail cups ride between machines
      const ks = S.st.map((s, j) => (s.machine ? j : -1)).filter(j => j >= 0);
      g.fillStyle = "#B7BEC6"; g.fillRect(X(ks[0]) + 4, STRIP - 1, X(ks.at(-1) + 1) - X(ks[0]) - 8, 3);
    }
    // cups not in hands: on the counter and in the machine bays
    v.cups.filter(c => c.held == null).forEach(c => {
      const sh = c.inMachine ? bayShake(S.st[c.k], c.p, tv) : 0;
      cup(c.dx + sh, c.dy, c.d, c.p);
    });
    ms.forEach((m, j) => m && machinePart(S.st[j], m, tv));
    // the customer's reaching arm and hand, over the counter top
    if (v.reachCust) { const h = custHands.get(v.reachCust.id); if (h) { g.fillStyle = h.skin; g.beginPath(); g.arc(h.R[0], h.R[1], h.r, 0, 2 * Math.PI); g.fill(); } }
    drawCounterFront(S.st);
    // staff, far lane first
    [...v.workers].sort((p, q) => LANE[p.j] - LANE[q.j]).forEach(w => {
      const W = S.workers[w.j], y = LANE[w.j % 2], s = 1 + (w.j % 2) * 0.03, col = staffColours(w.j);
      w.hands = person({ x: w.xw, y, s, theta: W.theta, ph: W.ph, amp: W.amp, col, staff: true, reach: Math.abs(W.theta) < 30 ? staffReach(w, tv) : null });
      if (w.cup) {
        const shk = S_ID(w) === "shake_seal" && w.p < 0.7 ? [Math.sin(tv * 60) * 3, -8] : [0, 0];
        cup(w.cup.dx + shk[0], w.cup.dy + shk[1], w.cup.d, w.cup.p);
        heldTool(w, tv);
        g.fillStyle = w.hands.skin; ["L", "R"].forEach(hk => { const h = w.hands[hk]; g.beginPath(); g.arc(h[0], h[1], w.hands.r, 0, 2 * Math.PI); g.fill(); });
      }
    });
    g.restore();
    g.strokeStyle = "#D8CFBF"; g.lineWidth = 1.5; g.beginPath(); roundRect(P.x, P.y, P.w, P.h, 14); g.stroke();
  }

  /* ------------------------------------------------------------------ HUD */
  function hud(sides, f) {
    const ts = simT(f);
    g.fillStyle = COL.ink; g.font = `600 44px ${SERIF}`; g.textBaseline = "alphabetic";
    g.fillText("Peak hour, same customers", 36, 74);
    g.fillStyle = COL.ink2; g.font = `400 19px ${SANS}`;
    g.fillText(`${TR.dayLabel} · same arrival stream and seed on both counters · ${TR.staff} people each · played at ×${V.speed}`, 38, 110);
    // time badge
    const m = Math.floor(ts / 60), sec = Math.floor(ts % 60), clock = `${String(TR.peakClock).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    const bx = 1584, by = 34, bw = 300, bh = 84;
    g.fillStyle = COL.navy; g.beginPath(); roundRect(bx, by, bw, bh, 12); g.fill();
    g.fillStyle = "#fff"; g.font = `700 40px ${SANS}`; g.textAlign = "center"; g.fillText(clock, bx + bw / 2, by + 48);
    g.fillStyle = "#C9D3E6"; g.font = `400 16px ${SANS}`;
    g.fillText(f >= SIM_FRAMES ? `end of minute ${V.minutes}` : `minute ${m} of ${V.minutes} · ×${V.speed}`, bx + bw / 2, by + 72); g.textAlign = "left";
    const out = {};
    sides.forEach((S, k) => {
      const P = PANELS[k], v = S.view, key = S.tr.key;
      // counters under the panel
      const y = P.y + P.h + 18;
      g.fillStyle = "#fff"; g.strokeStyle = "#D8CFBF"; g.lineWidth = 1.2; g.beginPath(); roundRect(P.x, y, P.w, 86, 12); g.fill(); g.stroke();
      g.fillStyle = k ? COL.navy : COL.red; g.beginPath(); g.arc(P.x + 34, y + 43, 18, 0, 2 * Math.PI); g.fill();
      g.fillStyle = "#fff"; g.font = `700 20px ${SANS}`; g.textAlign = "center"; g.fillText(key, P.x + 34, y + 50); g.textAlign = "left";
      g.fillStyle = COL.ink; g.font = `600 22px ${SANS}`; g.fillText(S.tr.title, P.x + 64, y + 36);
      g.fillStyle = COL.taupe; g.font = `400 15px ${SANS}`;
      g.fillText(S.tr.mode === "fixed" ? "Everything by hand · each person keeps to their own stations" : "Machines make the drink · people tag the order and hand it over", P.x + 64, y + 62);
      const stat = (label, val, x) => {
        g.fillStyle = COL.taupe; g.font = `500 13px ${SANS}`; g.textAlign = "right"; g.fillText(label.toUpperCase(), x, y + 30);
        g.fillStyle = COL.ink; g.font = `700 38px ${SANS}`; g.fillText(String(val), x, y + 70); g.textAlign = "left";
      };
      stat("cups served", v.served, P.x + P.w - 150); stat("queue", v.queue, P.x + P.w - 30);
      out[key] = { served: v.served, queue: v.queue, walkedAway: v.lost };
    });
    // legend and footer
    const ly = 1046;
    g.font = `400 15px ${SANS}`; g.fillStyle = COL.ink2;
    g.fillStyle = COL.charcoal; g.beginPath(); g.arc(44, ly - 5, 7, 0, 2 * Math.PI); g.fill();
    g.fillStyle = COL.ink2; g.fillText("Staff (charcoal apron and cap)", 58, ly);
    g.fillStyle = COL.blue; g.beginPath(); g.arc(300, ly - 5, 7, 0, 2 * Math.PI); g.fill();
    g.fillStyle = COL.ink2; g.fillText("Customers", 314, ly);
    steelChip(420, ly - 13); g.fillStyle = COL.ink2; g.fillText("Steel box = machine (robotics/automation, not AI)", 446, ly);
    g.fillText("Queue = orders placed, not yet handed over", 820, ly);
    g.fillStyle = COL.taupe; g.font = `400 14px ${SANS}`; g.textAlign = "right";
    g.fillText("Illustrative simulation. Our model, synthetic inputs, not Chagee data. Illustrative assumptions.", CW - 36, ly);
    g.textAlign = "left";
    return out;
  }
  function steelChip(x, y) { g.save(); steel(x, y, 18, 16, 3); g.restore(); }

  /* ------------------------------------------------------------------ driver */
  let sides, cur;
  function reset() { sides = TR.sides.map((tr, i) => makeSide(tr, i)); cur = -1; }
  function frame(f) {
    f = clamp(Math.round(f), 0, TOTAL - 1);
    if (f <= cur) reset();
    while (cur < f) { cur++; sides.forEach(S => update(S, cur)); }
    const tv = f * DTV, cam = camera(tv);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = COL.cream; g.fillRect(0, 0, CW, CH);
    sides.forEach((S, k) => drawPanel(S, k, cam, tv));
    const h = hud(sides, f);
    return { f, ts: simT(f), hud: h, cam: { z: cam.z / BASE, w: cam.w } };
  }
  const diag = () => sides.map(S => ({ key: S.tr.key, ...S.diag }));
  reset();

  const capture = /[?&]capture/.test(location.search);
  if (capture) document.body.classList.add("capture");
  const ready = (document.fonts ? Promise.all([document.fonts.load(`700 20px Roboto`), document.fonts.load(`400 20px Roboto`), document.fonts.load(`500 20px Roboto`), document.fonts.load(`600 40px "EB Garamond"`)]).catch(() => {}) : Promise.resolve())
    .then(() => (document.fonts ? document.fonts.ready : null));
  window.SCENE = { frame, diag, close: CLOSE, total: TOTAL, simFrames: SIM_FRAMES, fps: FPS, ready };

  // interactive: play at 30 fps, loop; print / no script shows the last frame drawn
  if (!capture) {
    let playing = true, f = 0, last = 0;
    const btn = document.getElementById("pp");
    const sync = () => (btn.textContent = playing ? "❚❚ Pause" : "▶ Play");
    btn.onclick = () => { playing = !playing; sync(); };
    addEventListener("keydown", e => {
      if (e.code === "Space") { playing = !playing; sync(); e.preventDefault(); }
      if (e.code === "ArrowRight") { f = Math.min(TOTAL - 1, f + FPS); frame(f); }
      if (e.code === "ArrowLeft") { f = Math.max(0, f - FPS); frame(f); }
    });
    addEventListener("beforeprint", () => frame(SIM_FRAMES));
    ready.then(() => {
      frame(0);
      const loop = t => { if (playing && t - last >= 1000 / FPS - 1) { last = t; f = (f + 1) % TOTAL; frame(f); } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
  }
})();
