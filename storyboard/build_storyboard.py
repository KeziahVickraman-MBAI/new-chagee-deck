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
    srcs = [ROOT / "assumptions.json", ROOT / "machine_tiers.json", HERE / "precompute.js", ROOT / "sim" / "sg_geo.json", *(ROOT / "sim").glob("*.js")]
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
    disp = RAW["storyboard"]["split_presets"].get("display_labels", {})      # display names only; stored labels unchanged
    v["s.cheapest_label"] = disp.get(cheap, sp[cheap]["label"])
    v["s.heading_label"] = disp.get("heading", head["label"])
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
    # appendix: the site forecast's inputs and results at the slider defaults
    SP = RAW["sitepick"]
    for k, o in SP.items():
        if isinstance(o, dict) and isinstance(o.get("value"), (int, float)) and not isinstance(o["value"], bool):
            v[f"sp.{k}"] = o["value"]
    v["r.hubs"] = len(SP["hubs"]["value"])
    v["r.unmet_share"] = st["unmetShare"]
    v["r.clusters"] = st["clusters"]
    v["r.decay_km"] = SP["walk_km"]["value"] * SP["decay_share"]["value"]
    v["r.avg_cups"] = RAW["store"]["cups_per_store_per_year"]["value"] / RAW["store"]["open_days_per_year"]["value"]
    v["r.top_moved"] = st["top"]["cannibal"]
    v["r.strong"] = SP["verdict"]["value"]["strong_new_share"]
    v["r.weak"] = SP["verdict"]["value"]["weak_new_share"]
    if round(st["top"]["cups"]) - round(st["top"]["cannibal"]) != round(st["top"]["netNew"]):
        v["r.top_moved"] = round(st["top"]["cups"]) - round(st["top"]["netNew"])     # so the printed sum adds up
    # slide 08: the machine ladder (sim/ladder.js via precompute.js)
    lad = d["ladder"]; at = lad["at"]; R = {r["id"]: r for r in lad["rungs"]}; V = {r["id"]: r for r in lad["volumes"]["rungs"]}
    v["r.vol_lo"], v["r.vol_hi"] = lad["volumes"]["lo"], lad["volumes"]["hi"]
    v["r.ladder_cups"] = at["cupsDay"]
    v["r.unit_month"] = RAW["costs"]["machine_cost_per_unit_per_month"]["value"]
    v["r.min_mixed"] = RAW["people"]["min_staff_on_shift"]["value"]["mixed"]
    v["r.min_hand"] = RAW["people"]["min_staff_on_shift"]["value"]["all_human"]
    wins = [r for r in lad["rungs"] if r["basis"] == "model" and not r.get("baseline") and r["modelMargin"] > 0]
    if not wins:
        raise SystemExit("build: the ladder takeaway names the rungs that beat all by hand at the default outlet; none do, rewrite it")
    names = ["the " + r["name"][0].lower() + r["name"][1:] for r in wins]
    v["s.ladder_wins"] = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
    starts = [V[k]["moreBands"][0][0] for k in ("arm", "barista") if V[k]["moreBands"]]
    if len(starts) != 2 or len(set(starts)) != 1 or starts[0] <= at["cupsDay"] \
            or any(abs(R[k]["saved"] - R["today"]["saved"]) > 1e-6 for k in ("arm", "barista")):
        raise SystemExit("build: the ladder says robot rungs save no more labour than today's split until one volume above the default; rewrite it")
    v["r.ladder_more"] = starts[0]
    # why the single machines pay and today's split does not (slide 08 note and takeaway)
    singles, today = [R[k] for k in ("semi", "platform", "single")], R["today"]
    peak = d["counter"]["peakHour"]
    if not (all(r["hoursDay"] == singles[0]["hoursDay"] == r["hoursLower"] and r["maxDrop"] == 1 and peak not in r["lowerIdx"] for r in singles)
            and R["platform"]["modelMargin"] > 0 and R["single"]["modelMargin"] > 0 and today["modelMargin"] < 0
            and today["hoursDay"] > singles[0]["hoursDay"]):
        raise SystemExit("build: slide 08 says a single machine drops one person in off-peak hours and pays, and today's split does not; rewrite it")
    v["r.single_hours"] = singles[0]["hoursDay"]
    v["r.single_saved"] = singles[0]["saved"]
    v["r.today_hours"] = today["hoursDay"]
    v["r.today_units"] = today["units"]
    v["r.today_more"] = -today["modelMargin"]
    v["r.single_net"] = R["single"]["modelMargin"]
    v["r.fx"] = RAW["_meta"]["fx_sgd_per_usd"]["value"]
    rep = RAW["costs"]["machine_cost_per_unit_per_month"]["represents"].replace(" Display text only.", "")
    v["s.unit_represents"] = rep[0].lower() + rep[1:] if rep.startswith("Our") else rep
    # slide 10: the benefit (sim/benefit.js via precompute.js)
    bn = d["benefit"]; S = bn["summary"]; base = S["base"]; Y = base["year"]; ev, bz = base["per"]["event"], base["per"]["busy"]
    tol = 1e-6 * max(1.0, abs(Y["a"]["profit"]) + abs(Y["b"]["profit"]))
    for f in ("orders", "revenue", "contribution"):                  # what the two levers share must not be counted twice
        if Y["ab"][f] > Y["a"][f] + Y["b"][f] + tol:
            raise SystemExit(f"build: benefit combined {f} exceeds a + b; check sim/benefit.js")
    ix = S["interaction"]                                            # profit may exceed a + b only by the labour interaction
    if ix["profit"] > max(0.0, ix["counterNet"]) + tol:
        raise SystemExit("build: benefit combined profit exceeds a + b by more than the labour interaction")
    if not (ev["a"]["profit"] > 0 > bz["a"]["profit"] and S["fragile"]["year"]["ab"]["profit"] < Y["ab"]["profit"]
            and Y["ab"]["counterNet"] > Y["ab"]["contribution"]):
        raise SystemExit("build: slide 10 takeaway (forecast roster pays on event, not busy days; counter labour is most of the profit; "
                         "fragile without the minimum crew) no longer holds; rewrite it")
    # the "2% walk-away rule" label: at the default volume the forecast crew is the fewest people within the limit
    tgt = RAW["storyboard"]["walkaway_target"]["value"]
    for dname, row in bn["runs"]["base"]["days"].items():
        for case, cand in (("a", "cand_hand"), ("ab", "cand_machine")):
            pick = next((x for x in row[cand] if x["lostShare"] <= tgt + 1e-12), None)
            if not pick or pick["staff"] != row[case]["staff"] or pick["labourHours"] != row[case]["labourHours"]:
                raise SystemExit(f"build: slide 10 calls the forecast crew the 2% walk-away rule, but not on {dname} ({case}); relabel it")
    for f in ("orders", "revenue"):
        if Y["abE"][f] > Y["aE"][f] + Y["b"][f] + tol:
            raise SystemExit(f"build: benefit combined {f} (economic rule) exceeds a + b")
    if not (bz["aE"]["staff"] == bn["runs"]["base"]["days"]["moderate"]["cand_hand"][0]["staff"] < bz["a"]["staff"] and bz["aE"]["profit"] >= 0):
        raise SystemExit("build: slide 10 takeaway says the economic rule adds no one on busy days and avoids a loss; rewrite it")
    v["r.ben_cups"] = bn["cups"]
    v["r.ben_event_orders"], v["r.ben_event_rev"] = ev["ab"]["orders"], ev["ab"]["revenue"]
    v["r.ben_busy_orders"], v["r.ben_busy_rev"] = bz["ab"]["orders"], bz["ab"]["revenue"]
    v["r.ben_year_rev"] = Y["ab"]["revenue"]
    v["r.ben_profit"] = Y["ab"]["profit"]
    v["r.ben_profit_fragile"] = S["fragile"]["year"]["ab"]["profit"]
    # the Without AI / With AI band at the end of each explainer (slides 05-10); every figure computed
    nd = st["besideTop"]
    GEO_ = json.loads((ROOT / "sim" / "sg_geo.json").read_text())
    v["s.bt_outlet"] = f'{GEO_["numbers"][nd["j"]]} · {GEO_["names"][nd["j"]]}'
    v["r.nd_cups"], v["r.nd_net"], v["r.nd_moved"], v["r.bt_km"] = nd["cups"], nd["netNew"], nd["cannibal"] / nd["cups"], nd["km"]
    if not st["top"]["netNew"] > nd["netNew"]:
        raise SystemExit("build: slide 05 band says the app-search site adds more than a store beside an outlet; rewrite it")
    L_ = d["splits"][day]; hand, ch = L_["all_hand"], L_[L_["_cheapest"]]
    if not (hand["meets"] and L_["_cheapest"] != "all_hand" and ch["cost"]["total"] < hand["cost"]["total"]):
        raise SystemExit("build: slide 07 band assumes a machine split is cheaper than all by hand on an event day; rewrite it")
    v["r.hand_staff"], v["r.hand_wait"], v["r.hand_cost"] = hand["staff"], hand["medianWait"], hand["cost"]["total"]
    v["r.cheapest_staff"], v["r.cheapest_wait"] = ch["staff"], ch["medianWait"]
    v["s.cheapest_slower"] = "a longer" if ch["medianWait"] > hand["medianWait"] else "a shorter"
    v["r.fast_wait"], v["r.fast_cost"] = L_[L_["_fastest"]]["medianWait"], L_[L_["_fastest"]]["cost"]["total"]
    fl = disp.get(L_["_fastest"], L_[L_["_fastest"]]["label"]); v["s.fastest_label"] = fl[0].lower() + fl[1:]
    rb = bn["runs"]["base"]["days"]
    v["r.hand_hours"] = rb["none"]["cf"]["labourHours"]
    v["r.hand_month"] = rb["none"]["cf"]["labourHours"] * RAW["costs"]["labour_cost_per_hour"]["value"] * RAW["store"]["open_days_per_year"]["value"] / 12
    v["r.single_hours_left"] = v["r.hand_hours"] - v["r.single_hours"]
    for key, dname in (("busy", "moderate"), ("event", "large")):
        F = G[dname]["forecast"]["peakStaff"]
        a0, a1 = G[dname]["staff"][str(normal)]["brigade"]["lostShare"], G[dname]["staff"][str(F)]["brigade"]["lostShare"]
        if not a1 < a0:
            raise SystemExit(f"build: slide 09 band says the forecast roster loses fewer orders on a {key} day; rewrite it")
        v[f"r.pb_{key}_lost"], v[f"r.pb_{key}_lost_fc"], v[f"r.pb_{key}_staff"] = a0, a1, F
    SBv = RAW["storyboard"]
    v["r.cf_lost_year"] = (SBv["busy_days_per_year"]["value"] * rb["moderate"]["cf"]["lost"] + SBv["event_days_per_year"]["value"] * rb["large"]["cf"]["lost"]
                           + (RAW["store"]["open_days_per_year"]["value"] - SBv["busy_days_per_year"]["value"] - SBv["event_days_per_year"]["value"]) * rb["none"]["cf"]["lost"])
    v["r.ben_orders"] = Y["ab"]["orders"]
    N_ = RAW["facts"]["sg_outlets"]["value"]
    v["r.ben_profit_sg"], v["r.ben_fragile_sg"] = Y["ab"]["profit"] * N_, S["fragile"]["year"]["ab"]["profit"] * N_
    if not (0 < Y["a"]["profit"] < Y["b"]["profit"] and Y["a"]["orders"] > Y["b"]["orders"] and Y["a"]["contribution"] > Y["a"]["profit"]):
        raise SystemExit("build: slide 09 says the forecast keeps more orders but less profit than the machine; rewrite it")
    v["r.sg_a_orders"], v["r.sg_a_rev"], v["r.sg_a_profit"] = Y["a"]["orders"] * N_, Y["a"]["revenue"] * N_, Y["a"]["profit"] * N_
    v["r.sg_aE_profit"], v["r.sg_b_profit"] = Y["aE"]["profit"] * N_, Y["b"]["profit"] * N_
    v["r.a_event_orders"] = ev["a"]["orders"]
    # slide 07 decision strip: keep today's split; the machine-made drink buys wait, not cost
    E_, N_d = d["splits"][day], d["splits"]["none"]
    if not (E_["_cheapest"] == "today" and N_d["_cheapest"] == "all_hand" and E_["heading"]["meets"]
            and E_["heading"]["cost"]["total"] > E_["today"]["cost"]["total"] and E_["heading"]["medianWait"] < E_["today"]["medianWait"]):
        raise SystemExit("build: slide 07 decision (keep today's split; machine-made drink is faster but dearer) no longer holds; rewrite it")
    v["r.dec_normal_gap"] = N_d["today"]["cost"]["total"] - N_d["all_hand"]["cost"]["total"]
    v["r.dec_today_cost"] = E_["today"]["cost"]["total"]
    v["r.dec_mm_extra"] = E_["heading"]["cost"]["total"] - E_["today"]["cost"]["total"]
    v["r.dec_mm_faster"] = E_["today"]["medianWait"] - E_["heading"]["medianWait"]
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
    ("storyboard", "price_per_cup", "Price per cup, in store (slide 10)"),
    ("storyboard", "gross_margin_per_cup", "Margin per cup, share of price (slide 10)"),
    ("storyboard", "busy_days_per_year", "Busy days a year (slide 10, illustrative)"),
    ("storyboard", "event_days_per_year", "Event days a year (slide 10, illustrative)"),
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
    for k in ("L-sg-directory", "L-koalagains", "L-yfchuhai", "L-sec20f", "L-unsw", "I-chagee-contact", "I-sg-groundfloor", "I-team-app-first", "L-ester1996", "P-honeycombers", "P-eatbook", "I-team-expansion"):
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
    out.append("<p>We make no claim about: <b>Singapore ownership structure</b> (a Chagee contact says outlets run under one company and "
               "one data system, and that the ownership form does not matter here; I-chagee-contact); <b>delivery profit by channel</b>; "
               "<b>Chagee's own equipment cost</b> (not public); <b>gross margin per cup</b> (our assumption); "
               "<b>Chagee's current rostering</b> (unknown; slide 10's counterfactual is ours).</p>")
    return "\n".join(out)


# ---------------------------------------------------------------------------- appendix: machine tiers (slide 08)
STEP = {"ticket": "Order and tag", "cup_ice": "Cup and ice", "tea_milk": "Tea and milk", "topping_finish": "Toppings",
        "shake_seal": "Shake and seal", "handover": "Hand-over"}


def tiers_table() -> str:
    """The full machine ladder from machine_tiers.json: every example, its price as published, claims and source."""
    T = json.loads((ROOT / "machine_tiers.json").read_text(encoding="utf-8"))
    fx = RAW["_meta"]["fx_sgd_per_usd"]["value"]
    esc = lambda s: str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    cur = lambda c: "US$" if c == "USD" else "S$"
    amt = lambda x, c: (f"{cur(c)}{x[0]:,}–{x[1]:,}" if isinstance(x, list) else f"{cur(c)}{x:,}")
    sgd = lambda x, c: "" if c != "USD" else f" (≈ S${round(x[0] * fx):,}–{round(x[1] * fx):,})" if isinstance(x, list) else f" (≈ S${round(x * fx):,})"

    def price(c):
        k = c["kind"]
        if k == "not_disclosed":
            return "<i>Not disclosed</i>" + (f". {esc(c['note'])}" if c.get("note") else "")
        bits = []
        if c.get("purchase") is not None:
            bits.append(f"{amt(c['purchase'], c['currency'])}{sgd(c['purchase'], c['currency'])} to buy")
        if c.get("lease_month") is not None:
            bits.append(f"{amt(c['lease_month'], c['currency'])}{sgd(c['lease_month'], c['currency'])} a month lease")
        if c.get("software_month") is not None:
            bits.append(f"{amt(c['software_month'], c['currency'])} a month software")
        return "; ".join(bits)

    TAG = {"company claim": "claim", "vendor page": "vendor", "press": "press", "our assumption": ""}
    tag = lambda r: f'<span class="tagr {TAG.get(r, "")}">{esc(r)}</span>'
    rows = ['<tr><th>Rung</th><th>Example</th><th>Automates · steps on machines (our mapping)</th><th>Vendor list price</th>'
            '<th>Claims (not model inputs)</th><th>Reliability</th><th>Source</th></tr>']
    base = T["baseline"]
    mixed = RAW["stations"]["mixed_machine_stations"]["value"]
    for i, t in enumerate(T["tiers"], 1):
        if t["id"] == "arm":                                   # the baseline sits where it does on the slide ladder
            rows.append(f'<tr class="base"><td>–</td><td><b>{esc(base["label"])}</b></td>'
                        f'<td><b>{", ".join(STEP[s] for s in mixed)}</b>. A scenario of ours (slides 06 and 07), not Chagee\'s disclosed setup</td>'
                        f'<td>Model: S${RAW["costs"]["machine_cost_per_unit_per_month"]["value"]:,.0f} a month per station unit</td>'
                        f'<td></td><td>{tag(base["reliability"])}</td><td>assumptions.json</td></tr>')
        n = len(t["examples"])
        for k, e in enumerate(t["examples"]):
            head = (f'<td rowspan="{n}"><span class="num">{i}</span><b>{esc(t["name"])}</b></td>' if k == 0 else "")
            what = (f'<td rowspan="{n}">{esc(t["automates"])}. <b>{", ".join(STEP[s] for s in t["replaces"])}</b>'
                    f'{". " + esc(t["replaces_note"]) if t.get("replaces_note") else ""}{". " + esc(t["note"]) if t.get("note") else ""}</td>' if k == 0 else "")
            cost = price(e["cost"]) + (f'<span class="small">{esc(e["cost_note"])}</span>' if e.get("cost_note") else "")
            claims = "; ".join(esc(c) for c in e["claims"]) or "–"
            rows.append(f'<tr>{head}<td>{esc(e["name"])}</td>{what}<td>{cost}</td><td>{claims}</td><td>{tag(e["reliability"])}</td>'
                        f'<td><a href="{esc(e["source"])}">{esc(e["source"])}</a></td></tr>')
    c = T["chagee"]
    rows.append(f'<tr class="chg"><td>–</td><td><b>Chagee Singapore</b></td><td>{esc(c["text"])}</td><td><i>Not public</i></td><td>–</td>'
                f'<td>{tag(c["reliability"])}</td><td><a href="{esc(c["source"])}">{esc(c["source"])}</a></td></tr>')
    return "\n".join(rows)


FMT = {
    "int": lambda x: f"{round(x):,}",
    "pct": lambda x: f"{round(100 * x)}%",
    "pct1": lambda x: f"{100 * x:.1f}%",
    "x": lambda x: f"×{x:g}",
    "mmss": lambda x: f"{int(x // 60)}:{int(round(x % 60)):02d}",
    "min": lambda x: f"{x:g} min",
    "g": lambda x: f"{x:g}",
    "m2": lambda x: f"{x / 1e6:.2f}m",
    "km": lambda x: f"{x:.1f}",
}


def fill(text: str, vals: dict) -> str:
    def rep(m):
        path, fmt = m.group(1), m.group(2) or "int"
        if path not in vals:
            raise SystemExit(f"build: unknown placeholder {{{{{path}}}}}")
        return vals[path] if isinstance(vals[path], str) else FMT[fmt](vals[path])
    return re.sub(r"\{\{([a-zA-Z_][\w.]*)(?:\|(\w+))?\}\}", rep, text)


ALLOWED = re.compile(r"\b(?:19|20)\d\d\b|OPIM\s?639|Topic \d|\bT\d\b|\b0[1-9]\b|\b1\d(?= ·)|Week \d|Group \d|Form 20-F")


def digit_check(tpl: str) -> None:
    body = tpl.split("<body", 1)[1]
    body = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->", " ", body)
    body = re.sub(r'<span class="(?:n|num)">\d</span>', " ", body)              # step numbers
    body = re.sub(r'<span class="no">\d\d</span>', " ", body)                   # agenda chapter numbers
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
    html = html.replace("<!--APPENDIX-->", appendix()).replace("<!--TIERS-->", tiers_table())
    js = "\n".join((ROOT / "sim" / f).read_text(encoding="utf-8") for f in ("sim.js", "store.js", "counter.js", "sitepick.js", "ladder.js", "benefit.js"))
    js += "\n" + (HERE / "deck.js").read_text(encoding="utf-8")
    payload = {"RAW": RAW, "DATA": d, "GEO": json.loads((ROOT / "sim" / "sg_geo.json").read_text(encoding="utf-8")),
               "MAP": imgs["sg_map_crop"],
               "TIERS": json.loads((ROOT / "machine_tiers.json").read_text(encoding="utf-8"))}
    html = html.replace("/*__DATA__*/", "window.STORY=" + json.dumps(payload, ensure_ascii=False).replace("</", "<\\/") + ";")
    html = html.replace("/*__JS__*/", js.replace("</script", "<\\/script"))
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")
    return OUT


if __name__ == "__main__":
    out = build()
    if "--open" in sys.argv:
        webbrowser.open(out.as_uri())
