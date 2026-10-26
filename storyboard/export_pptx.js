// Pictures of every slide for the PowerPoint download: the printed view (every step shown), one PNG per slide,
// plus each slide's speaker notes. Run by build_storyboard.py.   node storyboard/export_pptx.js <deck.html> <out dir>
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const [HTML, OUT] = process.argv.slice(2);
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  await pg.emulateMedia({ media: "print" });
  await pg.goto("file://" + path.resolve(HTML) + "?print=1", { waitUntil: "load" }); await pg.waitForTimeout(2500);
  await pg.evaluate(() => dispatchEvent(new Event("beforeprint"))); await pg.waitForTimeout(800);
  const slides = await pg.$$("#deck > .slide"), notes = [];
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: path.join(OUT, `slide-${String(i + 1).padStart(2, "0")}.png`) });
    notes.push(await slides[i].evaluate(s => [...s.querySelectorAll("aside.notes p")].map(p => p.innerText.trim()).filter(Boolean)));
  }
  fs.writeFileSync(path.join(OUT, "notes.json"), JSON.stringify(notes));
  await b.close();
})();
