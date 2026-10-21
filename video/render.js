// render.js - npm run render:video
// Records the trace (build_trace.js), renders every frame of video/scene.html in headless Chromium
// (Playwright) and encodes the MP4 with ffmpeg (H.264, yuv420p), then a 10-second looping GIF of each panel.
// Fails (exit 1, no video kept) if the cups-served and queue values on the last sim frame differ from what
// the slide 07 panels show for the same seed and minutes (computed separately by build_trace.js).
//   node video/render.js                 full render -> video/out/
//   node video/render.js --stills 0,360  PNG stills only -> video/out/stills/
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const FFMPEG = require("ffmpeg-static");
const { build } = require("./build_trace.js");

const OUT = path.join(__dirname, "out");
const MP4 = path.join(OUT, "counter_comparison.mp4");
const GIF = { A: path.join(OUT, "panel_A_humans_fixed_posts.gif"), B: path.join(OUT, "panel_B_machine_brigade.gif") };
const PANEL_CROP = { A: "920:794:30:150", B: "920:794:970:150" };       // scene.js PANELS plus the counters underneath
const GIF_FROM = 14, GIF_SEC = 10;

const run = (args, input) => new Promise((ok, no) => {
  const p = spawn(FFMPEG, args, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"] });
  let err = ""; p.stderr.on("data", d => (err += d));
  p.on("close", c => (c === 0 ? ok() : no(new Error(`ffmpeg exited ${c}\n${err.slice(-2000)}`))));
  if (input) input(p);
});
function check(hud, expected, where) {
  const bad = ["A", "B"].flatMap(k => ["served", "queue"].filter(m => hud[k][m] !== expected[k][m])
    .map(m => `${k} ${m}: video ${hud[k][m]}, slide 07 ${expected[k][m]}`));
  if (bad.length) throw new Error(`Video counters differ from the slide 07 panels (${where}, minute ${expected.minutes}):\n  ${bad.join("\n  ")}`);
}
const ranges = fr => fr.reduce((a, f) => { const l = a.at(-1); if (l && f === l[1] + 1) l[1] = f; else a.push([f, f]); return a; }, []);

(async () => {
  const { trace, expected } = build();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto("file://" + path.join(__dirname, "scene.html") + "?capture=1");
  await page.evaluate(() => window.SCENE.ready);
  if (errors.length) throw new Error(errors.join("\n"));
  const { total, simFrames, fps } = await page.evaluate(() => ({ total: SCENE.total, simFrames: SCENE.simFrames, fps: SCENE.fps }));
  const shot = () => page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });

  const si = process.argv.indexOf("--stills");
  if (si > 0) {
    const dir = path.join(OUT, "stills"); fs.mkdirSync(dir, { recursive: true });
    for (const f of process.argv[si + 1].split(",").map(Number)) {
      const r = await page.evaluate(f => SCENE.frame(f), f);
      fs.writeFileSync(path.join(dir, `frame_${String(f).padStart(4, "0")}.png`), await shot());
      console.log(`frame ${f}: sim ${r.ts.toFixed(1)} s`, JSON.stringify(r.hud));
    }
    await browser.close(); return;
  }

  // before rendering: the last sim frame must already match the slide
  check((await page.evaluate(f => SCENE.frame(f), simFrames)).hud, expected, "pre-check");

  const t0 = Date.now(); let last = null;
  try {
    await run(["-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", MP4], async p => {
      for (let f = 0; f < total; f++) {
        const r = await page.evaluate(f => SCENE.frame(f), f);
        if (f === simFrames) last = r;
        const buf = await shot();
        if (!p.stdin.write(buf)) await new Promise(ok => p.stdin.once("drain", ok));
        if (f % 150 === 0) process.stdout.write(`  frame ${f}/${total}\r`);
      }
      p.stdin.end();
    });
    if (errors.length) throw new Error(errors.join("\n"));
    check(last.hud, expected, "rendered");
  } catch (e) { fs.rmSync(MP4, { force: true }); throw e; }
  await page.evaluate(f => SCENE.frame(f), simFrames);
  fs.writeFileSync(path.join(OUT, "poster.png"), await shot());
  const diag = await page.evaluate(() => SCENE.diag());
  await browser.close();

  for (const k of ["A", "B"])
    await run(["-y", "-ss", String(GIF_FROM), "-t", String(GIF_SEC), "-i", MP4, "-filter_complex",
      `[0:v]crop=${PANEL_CROP[k]},fps=15,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      "-loop", "0", GIF[k]]);

  const report = { mp4: path.relative(process.cwd(), MP4), frames: total, fps, seconds: total / fps, simMinutes: trace.video.minutes, speed: trace.video.speed,
    lastSimFrame: simFrames, video: last.hud, slide07: expected,
    overlaps: diag.map(d => ({ panel: d.key, staffDrawnOverEachOther: ranges(d.staffOverlap), customersInOneSpot: ranges(d.custOverlap) })) };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\nrendered ${total} frames (${(total / fps).toFixed(1)} s) in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${report.mp4}`);
  console.log("check passed: minute", expected.minutes, JSON.stringify(last.hud));
})().catch(e => { console.error(e.message || e); process.exit(1); });
