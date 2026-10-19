r"""
build_storyboard.py  -  OPIM639 group deck, storyboard version: Chagee Singapore's peak-hour counter.

    python3 storyboard/build_storyboard.py          # writes storyboard/chagee_storyboard.html
    python3 storyboard/build_storyboard.py --open   # ...and opens it

Look and feel: chagee-inspired-template-tealeaves.pptx (colours, fonts and the template's own
images, read straight from the .pptx). Story: the storyboard in "OPIM 639_ Ideation Process",
cut to the initial scope and the in-store bucket brigade.

Numbers
  * Slide text never types a number. {{facts.key|fmt}} reads assumptions.json, {{sb.key|fmt}} the
    storyboard section, {{d.path|fmt}} the simulator output (storyboard/build/data.json, made by
    `node storyboard/precompute.js`, re-run when assumptions.json or sim/ is newer).
  * The build fails if the template's visible text holds a digit outside a short allow-list
    (years, OPIM639, Topic n, chapter numbers 01-09).
Printing: one 1280 x 720 page per slide, every step shown. ?notes=1 adds a notes page after each slide.
"""

from __future__ import annotations

import base64
import io
import json
import re
import subprocess
import sys
import webbrowser
import zipfile
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
OUT = HERE / "chagee_storyboard.html"
DATA = HERE / "build" / "data.json"
TEMPLATE = HERE / "template.html"
PPTX = ROOT / "chagee-inspired-template-tealeaves.pptx"
DOCX = ROOT / "OPIM 639_ Ideation Process (1).docx"
RAW = json.loads((ROOT / "assumptions.json").read_text(encoding="utf-8"))

# template images used, by name -> path inside the .pptx
PPTX_IMAGES = {
    "sand": "ppt/media/image1.png", "leaves_left": "ppt/media/image2.png", "leaves_right": "ppt/media/image3.png",
    "cup_navy": "ppt/media/image4.png", "logo": "ppt/media/image5.png", "sand_small": "ppt/media/image6.png",
    "cup_cream": "ppt/media/image7.png", "cup_green": "ppt/media/image8.png", "cup_pink": "ppt/media/image9.png",
    "cup_red": "ppt/media/image10.png", "sprig": "ppt/media/image15.png", "leaves_corner": "ppt/media/image16.png",
}
DOCX_MAP = "word/media/image3.png"          # the team's "Chagee in Singapore" map


def ensure_data() -> dict:
    srcs = [ROOT / "assumptions.json", HERE / "precompute.js", ROOT / "sim" / "sg_geo.json", *(ROOT / "sim").glob("*.js")]
    if not DATA.exists() or DATA.stat().st_mtime < max(p.stat().st_mtime for p in srcs):
        subprocess.run(["node", str(HERE / "precompute.js"), str(DATA)], check=True, cwd=ROOT)
    return json.loads(DATA.read_text(encoding="utf-8"))


def images() -> dict:
    out = {}
    with zipfile.ZipFile(PPTX) as z:
        for k, p in PPTX_IMAGES.items():
            out[k] = "data:image/png;base64," + base64.b64encode(z.read(p)).decode()
    with zipfile.ZipFile(DOCX) as z:
        raw = z.read(DOCX_MAP)
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((1200, 1200))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=82)
        out["sg_map"] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        crop = Image.open(io.BytesIO(raw)).convert("RGB")                     # the map only, for slide 05
        crop = crop.crop((0, 0, crop.width, json.loads((ROOT / "sim" / "sg_geo.json").read_text())["mapBottom"]))
        crop.thumbnail((1400, 1400)); buf = io.BytesIO(); crop.save(buf, "JPEG", quality=80)
        out["sg_map_crop"] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        out["sg_map"] = "data:image/png;base64," + base64.b64encode(raw).decode()
    return out


# ---------------------------------------------------------------------------- values
def values(d: dict) -> dict:
    """Every number the slide text can show, by placeholder path."""
    v = {}
    for k, o in RAW["facts"].items():
        if isinstance(o, dict) and "value" in o:
            v[f"facts.{k}"] = o["value"]
    for k, o in RAW["storyboard"].items():
        if isinstance(o, dict) and "value" in o and not isinstance(o["value"], dict):
            v[f"sb.{k}"] = o["value"]
    v["sb.staff_max"] = RAW["storyboard"]["staff_choices"]["value"][1]
    v["a.target_wait"] = RAW["service"]["target_wait_minutes"]["value"]
    v["a.surge_hours"] = RAW["surge"]["surge_hours"]["value"]
    v["a.seeds"] = d["seeds"]
    for g, m in RAW["surge"]["surge_multiplier"]["value"].items():
        v[f"a.mult.{g}"] = m
    v["d.perWorkerHour"] = d["counter"]["perWorkerHour"]
    v["d.cupsPerDay"] = d["counter"]["cupsPerDay"]

    def walk(o, p):
        if isinstance(o, dict):
            for k, x in o.items():
                walk(x, f"{p}.{k}")
        elif isinstance(o, (int, float)) and not isinstance(o, bool):
            v[p] = o
    walk(d["grid"], "d.grid")
    # named results the headline and takeaways quote
    G, day = d["grid"], RAW["storyboard"]["day_type_default"]["value"]
    rec = G[day]["forecast"]["peakStaff"]
    normal = G["none"]["forecast"]["peakStaff"]
    v["r.rec"] = rec
    v["r.normal_staff"] = normal
    v["r.peak_cups"] = G[day]["forecast"]["peakCups"]
    v["r.lost_normal_roster"] = G[day]["staff"][str(normal)]["brigade"]["lostShare"]
    v["r.lost_forecast_roster"] = G[day]["staff"][str(rec)]["brigade"]["lostShare"]
    for m in ("brigade", "fixed_best", "fixed_worst"):
        v[f"r.lost_{m}"] = G[day]["staff"][str(rec)][m]["lostShare"]
        v[f"r.wait_{m}"] = G[day]["staff"][str(rec)][m]["medianWait"]
    # GM slide: the event-day split table (storyboard/precompute.js)
    sp = d["splits"][day]
    cheap, head = sp["_cheapest"], sp["heading"]
    if cheap is None or cheap == "heading" or not head["meets"]:
        raise SystemExit("build: the GM takeaway assumes another split is cheapest and 'heading' meets the limit; rewrite it")
    nd = d["splits"]["none"]
    if nd["_cheapest"] != "all_hand" or nd["_fastest"] == "all_hand":
        raise SystemExit("build: the GM headline says all-by-hand is cheapest but not fastest on a normal day; rewrite it")
    v["s.cheapest_label"] = sp[cheap]["label"]
    v["s.heading_label"] = head["label"]
    v["r.cheapest_cost"] = sp[cheap]["cost"]["total"]
    v["r.heading_staff"] = head["staff"]
    v["r.heading_extra"] = head["cost"]["total"] - sp[cheap]["cost"]["total"]
    v["r.heading_wait"] = head["medianWait"]
    # slide 05: the new-store forecast at the slider defaults (storyboard/precompute.js)
    st = d["site"]
    v["s.top_hub"] = st["top"]["hub"]
    v["r.next_outlet"] = RAW["facts"]["sg_outlets"]["value"] + 1
    v["r.top_cups"] = st["top"]["cups"]
    v["r.top_net"] = st["top"]["netNew"]
    v["r.nextdoor_cannibal"] = st["nextDoor"]["cannibal"] / st["nextDoor"]["cups"]
    # the roster trigger: forecast peak cups per person, after the capacity safety margin (plan()'s rule)
    v["r.cups_per_person"] = d["counter"]["perWorkerHour"] / RAW["costs"]["capacity_safety_margin"]["value"]
    return v


# ---------------------------------------------------------------------------- appendix
USED = [  # (section, key, label) shown in the appendix: every input the storyboard slides rely on
    ("store", "cups_per_store_per_year", "Cups per outlet per year"),
    ("store", "hourly_demand_share", "Share of the day's cups in each open hour"),
    ("surge", "surge_multiplier", "Busy and event day multipliers"),
    ("surge", "surge_hours", "Busiest hours the multiplier lands on"),
    ("stations", "human_seconds_per_cup", "Seconds per cup by hand, per station"),
    ("stations", "machine_seconds_per_cup", "Seconds per cup by robot, per station"),
    ("stations", "mixed_machine_stations", "Stations the robots do today"),
    ("people", "worker_speed_spread", "Spread of worker speeds"),
    ("people", "human_speed_variation_cv", "Minute-to-minute variation in pace"),
    ("people", "new_staff_share", "Share of new staff"),
    ("people", "new_staff_relative_speed", "New staff speed"),
    ("people", "coordination_loss_mixed", "Coordination loss, people around robots"),
    ("people", "min_staff_on_shift", "Minimum people on the counter"),
    ("costs", "capacity_safety_margin", "Roster safety margin over the forecast"),
    ("costs", "labour_cost_per_hour", "Labour cost per hour worked (SGD)"),
    ("costs", "machine_cost_per_unit_per_month", "Robot cost per station unit per month (SGD)"),
    ("people", "all_machine_attendant_per_open_hour", "Attendant hours, all-robot counter"),
    ("storyboard", "walkaway_target", "Walk-away limit for the GM's split table"),
    ("sitepick", "events", "Synthetic app-intent dots (slide 05)"),
    ("sitepick", "walk_km", "Walking distance to collect"),
    ("sitepick", "decay_share", "Distance decay, share of the walking distance"),
    ("sitepick", "outside_option", "Pull of not buying"),
    ("sitepick", "dbscan_eps_km", "DBSCAN cluster radius"),
    ("sitepick", "dbscan_min_points", "DBSCAN minimum searches"),
    ("sitepick", "km_per_px", "Map scale"),
    ("service", "target_wait_minutes", "Wait at which a customer walks away"),
    ("illustration", "walk_back_speed", "Walking-back speed (Week 5 units)"),
]


def short(v) -> str:
    if isinstance(v, dict):
        return ", ".join(f"{k.replace('_', ' ')} {short(x)}" for k, x in v.items())
    if isinstance(v, list):
        return ", ".join(short(x) for x in v)
    if isinstance(v, float):
        return f"{v:g}"
    return str(v).replace("_", " ")


def appendix() -> str:
    esc = lambda s: str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    out = ["<h5>Facts quoted</h5>"]
    for k, label in (("sg_outlets", "Outlets in Singapore"), ("revenue_share_franchise_fy2025", "Franchise share of FY2025 net revenue"),
                     ("revenue_share_company_owned_fy2025", "Company-owned share of FY2025 net revenue")):
        f = RAW["facts"][k]
        out.append(f"<p><b>{label}: {short(f['value'])}</b>. {esc(f['rationale'])} <i>[{esc(f['source'])}]</i></p>")
    out.append("<h5>Sources</h5>")
    for k in ("L-sg-directory", "L-koalagains", "L-yfchuhai", "L-sec20f", "L-unsw", "I-sg-owned", "I-sg-groundfloor", "I-team-automation", "I-team-app-first"):
        out.append(f"<p><b>{k}</b> {esc(RAW['_sources'][k])}</p>")
    out.append("<h5>Assumptions (assumptions.json, illustrative)</h5>")
    for sec, key, label in USED:
        o = RAW[sec][key]
        unit = "" if o.get("unit") == "text" else o.get("unit", "")
        out.append(f"<p><b>{esc(label)}</b>: {esc(short(o['value']))} {esc(unit)}</p>")
    out.append("<h5>Claims we did not make</h5>")
    out.append("<p>No Chagee sales, staffing or wait-time data is used; the forecast is not a trained model. "
               "We do not claim the bucket brigade always beats fixed stations: with spare staff, a well-assigned "
               "fixed line is as good or slightly faster. Machine breakdowns, breaks and order mix are not modelled.</p>")
    return "\n".join(out)


FMT = {
    "int": lambda x: f"{round(x):,}",
    "pct": lambda x: f"{round(100 * x)}%",
    "pct1": lambda x: f"{100 * x:.1f}%",
    "x": lambda x: f"×{x:g}",
    "mmss": lambda x: f"{int(x // 60)}:{int(round(x % 60)):02d}",
    "min": lambda x: f"{x:g} min",
}


def fill(text: str, vals: dict) -> str:
    def rep(m):
        path, fmt = m.group(1), m.group(2) or "int"
        if path not in vals:
            raise SystemExit(f"build: unknown placeholder {{{{{path}}}}}")
        return vals[path] if isinstance(vals[path], str) else FMT[fmt](vals[path])
    return re.sub(r"\{\{([a-zA-Z_][\w.]*)(?:\|(\w+))?\}\}", rep, text)


ALLOWED = re.compile(r"\b(?:19|20)\d\d\b|OPIM\s?639|Topic \d|\bT\d\b|\b0[1-9]\b|Week \d|Group \d|Form 20-F")


def digit_check(tpl: str) -> None:
    body = tpl.split("<body", 1)[1]
    body = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->", " ", body)
    body = re.sub(r'<span class="(?:n|num)">\d</span>', " ", body)              # step numbers
    body = re.sub(r"\{\{[^}]*\}\}|\{img:[\w]+\}|<[^>]*>", " ", body)        # placeholders, tags (with attributes)
    bad = [m for m in re.finditer(r"\d", ALLOWED.sub(" ", body))]
    if bad:
        ctx = sorted({ALLOWED.sub(" ", body)[max(0, m.start() - 30):m.end() + 30].strip() for m in bad})
        raise SystemExit("build: typed digits in slide text (use a placeholder):\n  " + "\n  ".join(ctx))


def build() -> Path:
    d = ensure_data()
    tpl = TEMPLATE.read_text(encoding="utf-8")
    digit_check(tpl)
    vals = values(d)
    html = fill(tpl, vals)
    imgs = images()
    html = re.sub(r"\{img:(\w+)\}", lambda m: imgs[m.group(1)], html)
    html = html.replace("<!--APPENDIX-->", appendix())
    js = "\n".join((ROOT / "sim" / f).read_text(encoding="utf-8") for f in ("sim.js", "store.js", "counter.js", "sitepick.js"))
    js += "\n" + (HERE / "deck.js").read_text(encoding="utf-8")
    payload = {"RAW": RAW, "DATA": d, "GEO": json.loads((ROOT / "sim" / "sg_geo.json").read_text(encoding="utf-8")),
               "MAP": imgs["sg_map_crop"]}
    html = html.replace("/*__DATA__*/", "window.STORY=" + json.dumps(payload, ensure_ascii=False).replace("</", "<\\/") + ";")
    html = html.replace("/*__JS__*/", js.replace("</script", "<\\/script"))
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")
    return OUT


if __name__ == "__main__":
    out = build()
    if "--open" in sys.argv:
        webbrowser.open(out.as_uri())
