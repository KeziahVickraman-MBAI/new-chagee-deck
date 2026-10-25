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
    (years, OPIM639, Topic n, chapter numbers 01-11).
Printing: one 1280 x 720 page per slide, every step shown. ?notes=1 adds a notes page after each slide.
"""

from __future__ import annotations

import base64
import io
import json, shutil
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
TIERS_ = json.loads((ROOT / "machine_tiers.json").read_text(encoding="utf-8"))

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
    out["emblem"] = "data:image/png;base64," + base64.b64encode((HERE / "media" / "chagee_emblem.png").read_bytes()).decode()   # slide 01
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
    v["dm.wait_threshold"] = RAW["demand_mgmt"]["wait_threshold_min"]["value"]
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
    # slides 06 and 07, the AI layer alone (counter.aiLayer via precompute.js): normal-day vs forecast roster,
    # same robots, customers and sharing rule, on the printed day; A and B as each slide opens
    AI = d["aiLayer"][day]
    gA, gB = RAW["storyboard"]["gm_compare_default"]["value"]
    sides = {"ai6_a": ("today", "brigade"), "ai6_b": ("today", "fixed_best"),
             "ai7_a": (gA, "fixed_best" if sp[gA]["mode"] == "fixed" else "brigade"),
             "ai7_b": (gB, "fixed_best" if sp[gB]["mode"] == "fixed" else "brigade")}
    for nm, (k, rule) in sides.items():
        for w in ("without", "with"):
            x = AI[k][rule][w]
            for f in ("staff", "lostShare", "medianWait", "cost"):
                v[f"r.{nm}_{w}_{f}"] = x[f]
    t6 = AI["today"]["brigade"]
    if (t6["without"]["staff"], t6["with"]["staff"]) != (normal, rec) or \
       abs(t6["without"]["lostShare"] - v["r.lost_normal_roster"]) > 1e-9 or abs(t6["with"]["lostShare"] - v["r.lost_brigade"]) > 1e-9:
        raise SystemExit("build: slide 06's AI band no longer matches the walk-away table it quotes; check precompute.js")
    if v["r.ai7_b_with_staff"] != v["r.ai7_b_without_staff"] or v["r.ai7_a_with_staff"] <= v["r.ai7_a_without_staff"]:
        raise SystemExit("build: slide 07's notes say the forecast adds people by hand but none on the machine-made drink; rewrite them")
    # slide 05: the new-store forecast at the slider defaults (storyboard/precompute.js)
    st = d["site"]
    v["s.top_hub"] = st["top"]["hub"]
    v["r.next_outlet"] = RAW["facts"]["sg_outlets"]["value"] + 1
    v["r.press_lo"], v["r.press_hi"] = RAW["facts"]["sg_outlets_press_range"]["value"]
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
    v["r.top_unmet"] = st["top"]["fromUnmet"] / st["top"]["cups"]          # slides 10b and 11: customer access
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
    # slide 09 and its appendix: the benefit (sim/benefit.js via precompute.js)
    bn = d["benefit"]; S = bn["summary"]; base = S["base"]; Y = base["year"]; ev, bz = base["per"]["event"], base["per"]["busy"]
    tol = 1e-6 * max(1.0, abs(Y["a"]["profit"]) + abs(Y["b"]["profit"]))
    for f in ("orders", "revenue", "contribution"):                  # what the two levers share must not be counted twice
        if Y["ab"][f] > Y["a"][f] + Y["b"][f] + tol:
            raise SystemExit(f"build: benefit combined {f} exceeds a + b; check sim/benefit.js")
    ix = S["interaction"]                                            # profit may exceed a + b only by the labour interaction
    if ix["profit"] > max(0.0, ix["counterNet"]) + tol:
        raise SystemExit("build: benefit combined profit exceeds a + b by more than the labour interaction")
    if not (ev["a"]["profit"] > 0 > bz["a"]["profit"] and S["fragile"]["year"]["abE"]["profit"] < Y["abE"]["profit"]
            and Y["abE"]["counterNet"] > Y["abE"]["contribution"]):
        raise SystemExit("build: benefit appendix takeaway (forecast roster pays on event, not busy days; counter labour is most of the profit; "
                         "fragile without the minimum crew) no longer holds; rewrite it")
    # the "2% walk-away rule" label: at the default volume the forecast crew is the fewest people within the limit
    tgt = RAW["storyboard"]["walkaway_target"]["value"]
    for dname, row in bn["runs"]["base"]["days"].items():
        for case, cand in (("a", "cand_hand"), ("ab", "cand_machine")):
            pick = next((x for x in row[cand] if x["lostShare"] <= tgt + 1e-12), None)
            if not pick or pick["staff"] != row[case]["staff"] or pick["labourHours"] != row[case]["labourHours"]:
                raise SystemExit(f"build: benefit appendix calls the forecast crew the 2% walk-away rule, but not on {dname} ({case}); relabel it")
    for f in ("orders", "revenue"):
        if Y["abE"][f] > Y["aE"][f] + Y["b"][f] + tol:
            raise SystemExit(f"build: benefit combined {f} (economic rule) exceeds a + b")
    if not (bz["aE"]["staff"] == bn["runs"]["base"]["days"]["moderate"]["cand_hand"][0]["staff"] < bz["a"]["staff"] and bz["aE"]["profit"] >= 0):
        raise SystemExit("build: benefit appendix takeaway says the economic rule adds no one on busy days and avoids a loss; rewrite it")
    v["r.ben_cups"] = bn["cups"]
    # headline figures: the economic rule (abE), the rule the playbook recommends
    v["r.ben_event_orders"], v["r.ben_event_rev"] = ev["abE"]["orders"], ev["abE"]["revenue"]
    v["r.ben_busy_orders"], v["r.ben_busy_rev"] = bz["abE"]["orders"], bz["abE"]["revenue"]
    v["r.ben_year_rev"] = Y["abE"]["revenue"]
    v["r.ben_profit"] = Y["abE"]["profit"]
    v["r.ben_profit_fragile"] = S["fragile"]["year"]["abE"]["profit"]
    # the Without AI / With AI band at the end of each explainer (slides 05-10); every figure computed
    nd = st["besideTop"]
    GEO_ = json.loads((ROOT / "sim" / "sg_geo.json").read_text())
    v["s.bt_outlet"] = f'{GEO_["numbers"][nd["j"]]} · {GEO_["names"][nd["j"]]}'
    v["r.nd_cups"], v["r.nd_net"], v["r.nd_moved"], v["r.bt_km"] = nd["cups"], nd["netNew"], nd["cannibal"] / nd["cups"], nd["km"]
    v["r.nd_unmet"] = nd["fromUnmet"] / nd["cups"]                            # slide 10b: customer access at the baseline site
    if not v["r.top_unmet"] > v["r.nd_unmet"]:
        raise SystemExit("build: slide 10b says the cluster site serves more customers without access than the site beside an outlet; rewrite it")
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
    v["r.ben_orders"] = Y["abE"]["orders"]
    N_ = RAW["facts"]["sg_outlets"]["value"]
    v["r.ben_profit_sg"], v["r.ben_fragile_sg"] = Y["abE"]["profit"] * N_, S["fragile"]["year"]["abE"]["profit"] * N_
    # slide 09: the machine is most of it; on top of it, the economic rule adds a person on event days only
    add_o, add_p = Y["abE"]["orders"] - Y["b"]["orders"], Y["abE"]["profit"] - Y["b"]["profit"]
    if not (0 < Y["aE"]["profit"] < Y["b"]["profit"] and add_o > 0 and add_p > 0 and ev["abE"]["orders"] > ev["b"]["orders"]
            and ev["abE"]["staff"] > ev["b"]["staff"] and bz["abE"]["staff"] == bz["b"]["staff"] and S["pilot"]["profit"] > 0):
        raise SystemExit("build: slide 09 (machine is most of the benefit; the economic rule adds event-day orders; the pilot arm beats today's split) no longer holds; rewrite it")
    v["r.fc_add_event"] = ev["abE"]["orders"] - ev["b"]["orders"]
    v["r.fc_add_year"], v["r.fc_add_sg"] = add_o, add_p * N_
    v["r.sg_aE_orders"], v["r.sg_aE_profit"], v["r.sg_b_profit"] = Y["aE"]["orders"] * N_, Y["aE"]["profit"] * N_, Y["b"]["profit"] * N_
    v["r.ev_b_staff"], v["r.ev_abE_staff"] = ev["b"]["staff"], ev["abE"]["staff"]
    v["r.pilot_profit"], v["r.pilot_sg"] = S["pilot"]["profit"], S["pilot"]["profit"] * N_
    v["r.today_e_profit"] = S["today"]["year"]["abE"]["profit"]
    if not v["r.today_e_profit"] < 0:
        raise SystemExit("build: slide 09 says today's split is below the all-hand baseline; rewrite it")
    v["r.today_below_sg"] = -v["r.today_e_profit"] * N_
    # slide 07 and the playbook: the GM's decisions (sim/decisions.js; storyboard/check_decisions.js checks them)
    D = d["decisions"]; A = D["automate"]; pdays = A["perDay"].values()
    v["r.dec_single_lo"], v["r.dec_single_hi"] = min(x["single"]["cost"] for x in pdays), max(x["single"]["cost"] for x in pdays)
    v["r.dec_today_lo"], v["r.dec_today_hi"] = min(x["today"]["cost"] for x in pdays), max(x["today"]["cost"] for x in pdays)
    ev_ = A["perDay"][day]
    v["r.dec_ev_single_staff"], v["r.dec_ev_single_cost"], v["r.dec_ev_single_wait"] = ev_["single"]["staff"], ev_["single"]["cost"], ev_["single"]["medianWait"]
    v["r.dec_ev_today_cost"], v["r.dec_ev_today_wait"] = ev_["today"]["cost"], ev_["today"]["medianWait"]
    v["r.dec_be"] = A["breakEvenMax"]
    v["r.unit_year"] = A["assumed"] * 12
    amacha = next(e for t in TIERS_["tiers"] if t["id"] == "single" for e in t["examples"] if e["cost"]["kind"] == "purchase")
    v["r.amacha_price"] = amacha["cost"]["purchase"]
    v["r.dec_top"], v["r.dec_beside"] = D["where"]["topNet"], D["where"]["besideNet"]
    v["r.dec_flat"], v["r.dec_busy"], v["r.dec_event"] = D["roster"]["flat"], D["roster"]["busy"], D["roster"]["event"]
    cm_ = d["benefit"]["runs"]["base"]["days"]
    pick = lambda day_, k: next(x for x in cm_[day_]["cand_machine"] if x["staff"] == k)
    v["r.pb_ev_flat_lost"] = pick("large", D["roster"]["flat"])["lostShare"]
    v["r.pb_ev_econ_lost"] = pick("large", D["roster"]["event"])["lostShare"]
    v["r.pb_busy_flat_lost"] = pick("moderate", D["roster"]["flat"])["lostShare"]
    if not v["r.pb_ev_econ_lost"] < v["r.pb_ev_flat_lost"]:
        raise SystemExit("build: playbook band says the economic rule loses fewer event-day orders; rewrite it")
    v["r.dec_units_single"], v["r.dec_units_today"] = R["single"]["units"], R["today"]["units"]
    v["r.dec_wb"], v["r.dec_wf"] = D["share"]["waitBrigade"], D["share"]["waitFixedBest"]
    v["r.dec_share_k"], v["r.dec_br"], v["r.dec_fb"], v["r.dec_fw"] = D["share"]["staff"], D["share"]["brigade"], D["share"]["fixedBest"], D["share"]["fixedWorst"]
    # the roster trigger: forecast peak cups per person, after the capacity safety margin (plan()'s rule)
    v["r.cups_per_person"] = d["counter"]["perWorkerHour"] / RAW["costs"]["capacity_safety_margin"]["value"]
    # slides 08 and 09, the extension (sim/siteext.js via precompute.js): cups a day, price and margin must be slide 11's
    X, XE = d["siteExt"], RAW["site_ext"]
    if not (round(X["cups"]["base"]) == bn["cups"] and [round(X["cups"]["lo"]), round(X["cups"]["hi"])] == bn["volCups"]
            and X["price"] == bn["econ"]["price"] and X["margin"] == bn["econ"]["margin"]):
        raise SystemExit("build: slide 09's cups a day, price or margin differ from the benefit slide's inputs (slide 11); they must be the same")
    rule = lambda r: "skip" if r["net"]["base"] <= 0 else "open" if r["net"]["lo"] > 0 else "pilot"
    if X["rec"] != rule(X) or not X["payback"] or not X["contrast"] or X["contrast"]["rec"] != rule(X["contrast"]):
        raise SystemExit("build: slide 09's recommendation, payback or contrast pin no longer follows site_ext.recommendation_rule; rewrite it")
    if not X["contrast"]["net"]["base"] < X["net"]["base"]:
        raise SystemExit("build: slide 09 says the pin beside an outlet does worse; rewrite it")
    money = lambda x: ("−S$" if x < 0 else "S$") + f"{abs(round(x)):,}"
    v["x.cups"], v["x.cups_lo"], v["x.cups_hi"] = X["cups"]["base"], X["cups"]["lo"], X["cups"]["hi"]
    v["x.price"], v["x.margin"] = X["price"], X["margin"]
    for k in ("demand", "delivery", "competition"):
        v[f"x.score_{k}"], v[f"x.w_{k}"] = X["scores"][k], X["weights"][k]
    v["x.site_score"], v["x.score_max"] = X["siteScore"], 100   # scores are out of 100 (site_ext.scores unit)
    v["s.x_cannibal"] = f"−{round(100 * X['share'])}"
    v["x.moved_share"], v["x.moved_cups"] = X["share"], X["share"] * X["cups"]["base"]
    v["x.nb_share"], v["x.nb_km"] = X["neighbour"]["share"], X["neighbour"]["km"]
    m = X["month"]
    for k in ("contribution", "moved", "delivery", "counter", "rent", "utilities"):
        v[f"x.m_{k}"] = m[k]
    v["s.x_net"], v["s.x_net_lo"], v["s.x_net_hi"] = money(X["net"]["base"]), money(X["net"]["lo"]), money(X["net"]["hi"])
    v["x.payback"], v["x.pay_lo"], v["x.pay_hi"] = X["payback"]["base"], X["payback"]["lo"], X["payback"]["hi"]
    for k in ("ring_km", "competition_radius_m", "residents_radius_km", "setup_cost", "delivery_share_of_cups", "delivery_commission_share"):
        v[f"x.{k}"] = XE[k]["value"]
    v["x.setup_lo"], v["x.setup_hi"] = XE["setup_cost"]["range"]
    v["s.x_rec"] = X["rec"].capitalize()
    lo_, base_ = f'{round(X["cups"]["lo"]):,}', f'{round(X["cups"]["base"]):,}'
    v["s.x_rec_why"] = {"pilot": f"positive at {base_} cups a day, negative at {lo_}, the low end: test it before a full lease",
                        "open": f"positive even at {lo_} cups a day, the low end of the range",
                        "skip": f"not positive at {base_} cups a day, the default"}[X["rec"]]
    v["s.x_look1"], v["s.x_look2"] = XE["lookalike_labels"]["value"]
    C_ = X["contrast"]
    v["x.c_share"], v["x.c_nb_share"], v["x.c_nb_km"] = C_["share"], C_["neighbour"]["share"], C_["neighbour"]["km"]
    v["s.x_c_net"], v["s.x_c_rec"] = money(C_["net"]["base"]), C_["rec"]
    # slide 08b: the supervised model (sim/sitemodel.js); the notes say all inputs beat the new-market inputs, which beat the mean
    SMd = d["siteModel"]; al, nm_, no_ = SMd["all"], SMd["newMarket"], SMd["none"]
    if not (al["r2"] > nm_["r2"] > no_["r2"] and al["mae"] < nm_["mae"] < no_["mae"]):
        raise SystemExit("build: slide 08b says all inputs beat the new-market inputs, which beat the mean; rewrite it")
    v["x.sm_all_mae"], v["x.sm_all_r2"], v["x.sm_nm_mae"], v["x.sm_nm_r2"], v["x.sm_none_mae"] = al["mae"], al["r2"], nm_["mae"], nm_["r2"], no_["mae"]
    v["x.sm_n"] = len(SMd["rows"])
    # slide 05's P&L view (sim/pnl.js via precompute.js): the same sites as the band, five years, base volume
    PN = d["pnl"]
    if abs(PN["net"]["wi"] - v["r.top_net"]) > 1e-9 or abs(PN["net"]["wo"] - v["r.nd_net"]) > 1e-9:
        raise SystemExit("build: slide 05's P&L view no longer uses the band's two sites; check precompute.js")
    for k in ("wo", "wi"):
        b = PN[k]["base"]
        v[f"r.pnl_{k}_rev5"], v[f"r.pnl_{k}_op5"], v[f"r.pnl_{k}_invest"] = b["total"]["netRev"], b["total"]["opProfit"], b["invest"]
        v[f"r.pnl_{k}_rev1"], v[f"r.pnl_{k}_op2"] = b["years"][0]["netRev"], b["years"][1]["opProfit"]
        v[f"r.pnl_{k}_lost5"] = b["total"]["lostContrib"]
        v[f"r.pnl_{k}_op5_lo"], v[f"r.pnl_{k}_op5_hi"] = PN[k]["low"]["total"]["opProfit"], PN[k]["high"]["total"]["opProfit"]
    v["r.pnl_up_rev5"], v["r.pnl_up_op5"] = PN["uplift"]["netRev"], PN["uplift"]["opProfit"]
    if PN["wo"]["base"]["payback"] is not None or PN["wi"]["base"]["payback"] is None or PN["aiPayback"] is None or PN["wo"]["base"]["total"]["opProfit"] >= 0:
        raise SystemExit("build: slide 05's notes say the baseline site loses money and never pays back while the AI site and the AI cost do; rewrite them")
    if PN["wi"]["low"]["payback"] is not None:
        raise SystemExit("build: slide 10b says the cluster site does not pay back within the horizon at low volume; it now does, rewrite it")
    v["r.pnl_wi_payback"], v["r.pnl_ai_payback_m"] = PN["wi"]["base"]["payback"], PN["aiPayback"] * 12
    PR = RAW["pnl"]
    v["r.pnl_ai_impl"], v["r.pnl_ai_rec"], v["r.pnl_ramp1"] = PR["ai_implementation_cost"]["value"], PR["ai_recurring_per_year"]["value"], PR["ramp_up"]["value"][0]
    v["r.pnl_years"] = PR["years"]["value"]
    # slides M1-M3 (sim/members.js via precompute.js): the scenario table must equal members.expected_table
    MBd, MBR = d["members"], RAW["members"]
    exp = MBR["expected_table"]["value"]
    for s_ in MBd["table"]:
        got = None if s_["eq"] is None else [round(s_["eq"]["low"], 2), round(s_["eq"]["high"], 2)]
        if got != exp[s_["id"]]:
            raise SystemExit(f"build: members scenario {s_['id']} computes {got}, expected {exp[s_['id']]}; check sim/members.js or assumptions.json")
        if s_["eq"]:
            v[f"r.mb_{s_['id']}_lo"], v[f"r.mb_{s_['id']}_hi"] = s_["eq"]["low"], s_["eq"]["high"]
        v[f"r.mb_{s_['id']}_p"], v[f"r.mb_{s_['id']}_k"] = s_["p"], s_["k"]
    for q in MBR["quotes"]["value"]:
        if q["text"] not in q["excerpt"]:
            raise SystemExit(f"build: quote {q['id']} is not word for word in its source excerpt")
        v[f"s.{q['id']}"], v[f"s.{q['id']}_src"] = q["text"], q["source"]
    v["x.mb_squad_lo"], v["x.mb_squad_hi"] = MBR["squad_size"]["value"]
    NW = MBR["network"]["value"]
    v["x.mb_n"], v["x.mb_m"], v["x.mb_runs"] = NW["customers"], NW["friends_per_customer"], NW["runs"]
    gaps = [(n_["id"], n_["sim"] - n_["closed"]) for n_ in MBd["network"] if n_["closed"] is not None and n_["sim"] is not None]
    v["x.mb_gap_max"] = max(abs(g) for _, g in gaps)
    big = [i for i, g in gaps if abs(g) > 0.05]
    lab = {s_["id"]: s_["label"].lower() for s_ in MBR["scenarios"]["value"]}
    v["s.mb_gap_big"] = ", ".join(lab[i] for i in big) if big else "none"
    if not big:
        raise SystemExit("build: slide M2 says some network tipping points differ from the closed form by more than five points; they no longer do, rewrite it")
    for n_ in MBd["network"]:
        if n_["sim"] is not None:
            v[f"r.mb_{n_['id']}_sim"] = n_["sim"]
    BE = MBd["breakEven"]
    v["x.mb_credit"], v["x.mb_base"], v["x.mb_extra"], v["x.mb_price"] = BE["credit"], BE["base"], BE["extra"], BE["price"]
    for k_ in ("low", "mid", "high"):
        v[f"x.mb_be_{k_}"], v[f"x.mb_marg_{k_}"], v[f"x.mb_net_{k_}"] = BE[k_]["extraNeeded"], BE[k_]["margin"], BE[k_]["netPerMember"]
    # slide 09's video caption: the render's own report (video/out/report.json)
    VR = json.loads((ROOT / "video" / "out" / "report.json").read_text())
    v["x.vid_min"], v["x.vid_speed"] = VR["simMinutes"], VR["speed"]
    TR = json.loads(re.sub(r"^\s*window\.TRACE\s*=\s*|;\s*$", "", (ROOT / "video" / "build" / "trace.js").read_text()))
    v["x.vid_staff"] = TR["staff"]
    if TR["day"] != RAW["storyboard"]["day_type_default"]["value"] or TR["video"]["minutes"] != VR["simMinutes"]:
        raise SystemExit("build: slide 09's video caption says event day and the report's minutes; re-render the video")
    # slide 07, the CRM manager's decision: personalisation's running cost moves the break-even by its own hurdle
    v["x.mb_ai"], v["x.mb_be_ai"], v["x.mb_ai_hurdle"] = MBd["breakEvenAi"]["ai"], MBd["breakEvenAi"]["mid"]["extraNeeded"], MBd["aiHurdle"]
    if abs(v["x.mb_be_ai"] - v["x.mb_be_mid"] - v["x.mb_ai_hurdle"]) > 1e-9:
        raise SystemExit("build: slide 07 says personalisation's hurdle is the gap between the two break-evens; check sim/members.js")
    # slide 08, the operations problem (counter.forecastError via precompute.js): the notes and slide 09's strip say a busy-day
    # forecast that is too low drops the peak crew and raises walk-aways, and that too high costs little on an event day
    FE = d["forecastErr"]
    bz = {r["e"]: r for r in FE["moderate"]}; ev_ = {r["e"]: r for r in FE["large"]}
    lo_e = max(e for e in bz if e < 0 and bz[e]["staff"] < bz[0]["staff"])
    hi_e = min(e for e in ev_ if e > 0 and ev_[e]["staff"] > ev_[0]["staff"])
    if not (bz[lo_e]["lostShare"] > bz[0]["lostShare"] + 0.05 and 0 < ev_[hi_e]["cost"] - ev_[0]["cost"] < 100):
        raise SystemExit("build: slide 08 says under-forecasting a busy day costs walk-aways and over-forecasting an event day costs little; rewrite it")
    v["r.fe_bz_err"], v["r.fe_bz_lo_staff"], v["r.fe_bz_0_staff"] = abs(lo_e), bz[lo_e]["staff"], bz[0]["staff"]
    v["r.fe_bz_lo_lost"], v["r.fe_bz_0_lost"] = bz[lo_e]["lostShare"], bz[0]["lostShare"]
    v["r.fe_ev_hi_extra"] = round(ev_[hi_e]["cost"] - ev_[0]["cost"])
    # slide 10 (counter.shareCompare via precompute.js): fixed responsibilities against flexible assistance, same crew
    SHd, SHR = d["sharing"], RAW["sharing"]
    v["sh.staff"], v["sh.trigger"], v["sh.handover_cost"] = SHd["staff"], SHR["assist_trigger_cups"]["value"], SHR["assist_handover_sec"]["value"]
    v["sh.handover_step"], v["sh.ref_human"], v["sh.hand_work"] = d["sharing_times"]["handover"], d["sharing_times"]["all_human"], d["sharing_times"]["hand_here"]
    EV = SHd["levels"][SHR["crew_day"]["value"]]
    v["sh.ev_med_a"], v["sh.ev_med_b"], v["sh.ev_p90_a"], v["sh.ev_p90_b"] = EV["fixed"]["median"], EV["assist"]["median"], EV["fixed"]["p90"], EV["assist"]["p90"]
    if not (EV["assist"]["median"] <= EV["fixed"]["median"]):
        raise SystemExit("build: slide 10's notes say flexible assistance shortens the event-day median; it no longer does: rewrite them")
    # slide 06b (sim/squadcast.js via precompute.js): synthetic; the notes quote the default-share evaluation
    SQd, SQR = d["squadcast"], RAW["squadcast"]
    ev = SQd["eval"][str(SQR["social_share"]["value"])]
    v["x.sq_neval"] = SQR["eval_windows"]["value"]
    v["x.sq_mae_b"] = ev[0]["maeBaseline"]
    v["x.sq_mae_e10"] = next(r["maeEnhanced"] for r in ev if r["lead"] == 10)
    z = SQd["eval"]["0"]
    if any(abs(r["maeBaseline"] - r["maeEnhanced"]) > 1e-9 for r in z):
        raise SystemExit("build: slide 06b's notes say the two forecasts are identical with no squad share; they are not, check sim/squadcast.js")
    # slides 8A-8D, the new-market worked example (sim/newmarket.js via precompute.js; A$, scenario assumptions)
    NMd, NMR = d["newMarket"], RAW["new_market"]
    A_ = {a["id"]: a for a in NMR["areas"]["value"]}
    sc = NMd["score"]; sens = NMd["sensitivity"]
    contenders = [o["id"] for o in sc if sens["byArea"][o["id"]]["top"] > 0]
    if len(contenders) < 2:
        raise SystemExit("build: slide 8B says the top area changes with the weights; it no longer does, rewrite it")
    last = sc[-1]["id"]
    if sens["byArea"][last]["best"] != len(sc):
        raise SystemExit("build: slide 8B says the last area trails under every weight setting; rewrite it")
    v["s.nm_top"], v["s.nm_top_name"] = sc[0]["id"], sc[0]["name"]
    v["s.nm_contenders"] = ", ".join(contenders[:-1]) + " and " + contenders[-1]
    v["s.nm_last"], v["s.nm_last_name"] = last, A_[last]["name"]
    v["x.nm_variants"], v["x.nm_top_count"] = sens["variants"], sens["byArea"][sc[0]["id"]]["top"]
    v["x.nm_areas"] = len(sc)
    v["x.nm_score_top"], v["x.nm_score_last"] = sc[0]["score"], sc[-1]["score"]
    Dm = NMd["runs"]["demand"]
    v["x.nm_d_low"], v["x.nm_d_base"], v["x.nm_d_high"] = Dm["low"], Dm["base"], Dm["high"]
    E_ = NMR["forecast_error"]["value"]
    v["x.nm_err"] = max(abs(e) for e in E_)
    v["x.nm_wage"], v["x.nm_machine"], v["x.nm_price"] = NMR["wage_per_hour"]["value"], NMR["machine_cost_per_unit_per_month"]["value"], NMR["price_per_cup"]["value"]
    v["x.nm_wage_lo"], v["x.nm_wage_hi"] = NMR["wage_per_hour"]["range"]
    v["x.nm_rent"] = A_[NMd["pilot"]]["rent_month"]
    v["x.nm_weeks"] = NMR["trigger_weeks"]["value"]
    v["x.nm_overlap_km"], v["x.nm_cann_max"] = NMR["cannibalisation"]["value"]["overlap_km"], NMR["cannibalisation"]["value"]["max_share"]
    Q = NMd["quote"]; rb = Q["robust"]; other = [k for k in Q["setups"] if k != rb][0]
    lab = {"all_hand": "human-only", "heading": "machine-made drink"}
    v["s.nm_robust"], v["s.nm_other"] = lab[rb], lab[other]
    v["s.nm_pilot"], v["s.nm_pilot_name"] = NMd["pilot"], A_[NMd["pilot"]]["name"]
    if NMd["flipMachine"] is None or rb != "heading":
        raise SystemExit("build: slides 8C-8D say machine-made drink is the safer start until a machine unit costs about A$X a month; rewrite them")
    v["x.nm_flip_machine"] = NMd["flipMachine"]
    if NMd["flipWage"] is not None:
        raise SystemExit("build: slide 8C says machine-made drink stays ahead across the whole wage range; it no longer does, rewrite it")
    for k, nm in (("all_hand", "hand"), ("heading", "mdd")):
        S_ = Q["setups"][k]; be = NMd["breakEven"][k]
        v[f"x.nm_be_{nm}"], v[f"x.nm_be_{nm}_wo"] = be["withAI"], be["withoutAI"]
        v[f"x.nm_worst_{nm}"] = NMd["worst"][k]
        for w_, r in (("wo", S_["without"]), ("ai", S_["ai"]["0"]), ("aim", S_["ai"][str(min(E_))]), ("aip", S_["ai"][str(max(E_))])):
            v[f"x.nm_{nm}_{w_}_staff"], v[f"x.nm_{nm}_{w_}_lost"], v[f"x.nm_{nm}_{w_}_wait"], v[f"x.nm_{nm}_{w_}_c"] = r["staff"], r["lostShare"], r["medianWait"], r["contribution"]
        for n_ in ("low", "base", "high"):
            v[f"x.nm_{nm}_year_{n_}"] = S_["year"][n_]
    hs = Q["setups"]["all_hand"]
    if not (hs["ai"]["0"]["lostShare"] < hs["without"]["lostShare"] and hs["ai"][str(min(E_))]["lostShare"] > hs["ai"]["0"]["lostShare"]):
        raise SystemExit("build: slide 8C notes say AI staffing cuts human-only walk-aways and an under-forecast gives some back; rewrite them")
    nx = sorted(Q["next"], key=lambda o: -o["score"])[0]
    v["s.nm_next"], v["s.nm_next_name"], v["x.nm_next_cann"] = nx["id"], A_[nx["id"]]["name"], nx["cannibal"]
    # slides 03 to 07, online retailing (sim/online.js via precompute.js): the business case on the deck's own assumptions
    ON, OC = d["online"], RAW["online_case"]; B0, POL, BR = ON["scenarios"]["base"], OC["offer_policy"]["value"], OC["brief"]["value"]
    v["oc.cpc"] = RAW["storyboard"]["price_per_cup"]["value"] * RAW["storyboard"]["gross_margin_per_cup"]["value"]
    v["oc.disc"], v["oc.be_inc"], v["oc.be_gp"] = OC["offer_discount"]["value"], ON["breakEven"]["incShare"], ON["breakEven"]["grabPickupComm"]
    v["oc.g_del"], v["oc.comm"], v["oc.pay"] = B0["i3"]["delivery"]["perOrder"], RAW["site_ext"]["delivery_commission_share"]["value"], OC["app_payment_cost"]["value"]
    v["oc.p_off"], v["oc.p_pre"], v["oc.p_hot"], v["oc.p_rain"], v["oc.p_dor"] = (POL[k]["off"] for k in ("offpeak", "peak_preorder", "hot_weather", "normal_or_rain", "dormant"))
    v["oc.p_dor_days"], v["oc.p_up_days"] = POL["dormant"]["days"], POL["dormant"]["upsize_after_days"]
    v["oc.i1"], v["oc.i2"], v["oc.i3"], v["oc.gross"] = B0["i1"]["contrib"], B0["i2"]["contrib"], B0["i3"]["contrib"], B0["gross"]
    v["oc.gross_lo"], v["oc.gross_hi"] = ON["scenarios"]["low"]["gross"], ON["scenarios"]["high"]["gross"]
    v["oc.team"], v["oc.cloud"], v["oc.op"] = B0["team"], B0["cloud"], B0["operating"]
    v["oc.run_cover"], v["oc.team_n"] = ON["breakEven"]["runTeamCovered"], OC["run_team_people"]["value"]
    v["oc.cups_day"] = RAW["store"]["cups_per_store_per_year"]["value"] / RAW["store"]["open_days_per_year"]["value"]
    v["oc.years"] = RAW["business_case"]["horizon_years"]["value"]
    v["oc.brief_sales"], v["oc.brief_profit"] = BR["sales"]["total"], BR["profit"]["total"]
    v["oc.b_outlets"], v["oc.b_price"], v["oc.b_days"], v["oc.b_uplift"] = BR["outlets"], BR["price"], BR["days"], BR["offpeak_uplift"]
    sc = ("low", "base", "high")
    if not (B0["gross"] > 0 and all(ON["scenarios"][s]["operating"] < 0 and ON["cash"][s]["payback"] is None for s in sc)):
        raise SystemExit("build: slide 07 says the initiatives add contribution but do not fund the proposed team or pay back in any scenario; that no longer holds, rewrite it")
    if not (B0["i3"]["delivery"]["perOrder"] > 0 and ON["breakEven"]["runTeamCovered"] < OC["run_team_people"]["value"]):
        raise SystemExit("build: slides 06 and 07 say delivery-to-pickup moves gain per order and base contribution covers fewer than the proposed team; rewrite them")
    # slides 06 to 08, the manager's bottleneck tool (sim/crewtool.js via precompute.js); the deck runs the same model live
    CTd, OTR = d["crewTool"], RAW["ops_tool"]
    rc_, D_ = CTd["rec"], OTR["demand_per_hour"]["value"]
    if not (rc_["kind"] == "move" and rc_["best"] and rc_["best"]["worker"] == "ana" and rc_["best"]["to"] == rc_["con"] == "topping_finish" and rc_["longest"] == "ticket"):
        raise SystemExit("build: the tablet pages (appendix) say finishing is the constraint, the order screen the longest list, and the tablet moves Ana to finishing; rewrite them")
    crew = OTR["crew"]["value"]
    if [(c["id"], c["name"], c["home"]) for c in crew] != [("ana", "Ana", "cup_ice"), ("ben", "Ben", "topping_finish"), ("cai", "Cai", "handover")] \
            or "topping_finish" not in crew[0]["trained"] or "topping_finish" in crew[2]["trained"]:
        raise SystemExit("build: slides 06 to 08 and the tablet pages have Ana on cup and ice (trained on finishing), Ben on finishing and Cai on hand-over (not trained on it); rewrite them")
    cur, tr = CTd["cmp"]["current"], CTd["cmp"]["tried"]
    if not (tr["median"] < cur["median"] and tr["completed"] > cur["completed"]):
        raise SystemExit("build: the tablet page's notes say the recommended move shortens order-to-ready time and completes more orders at the default; rewrite them")
    sl_ = CTd["slow"]
    if not (sl_["kind"] == "escalate" and sl_["cause"] == "equipment" and abs(sl_["cmp"]["tried"]["completed"] - sl_["cmp"]["current"]["completed"]) < 1):
        raise SystemExit("build: the tablet page's notes say with the sealer slow the tablet escalates and moving Ana changes nothing; rewrite them")
    sw = CTd["sweep"]
    keep = [s["perHour"] for s in sw if s["kind"] == "keep"]; esc = [s["perHour"] for s in sw if s["kind"] == "escalate" and s["perHour"] > D_]
    if not keep or not esc or max(keep) >= D_ or any(s["kind"] != "keep" for s in sw if s["perHour"] <= max(keep)) \
            or any(s["kind"] != "escalate" for s in sw if s["perHour"] >= min(esc)) or sw[-1]["cause"] != "crew":
        raise SystemExit("build: the tablet page's notes say keep below one demand, escalate from another, and everyone trained is busy at the top; rewrite them")
    v["ct.demand"], v["ct.window"], v["ct.band"] = D_, OTR["window_min"]["value"], OTR["forecast_band"]["value"]
    v["ct.cur_med"], v["ct.try_med"], v["ct.cur_done"], v["ct.try_done"] = cur["median"], tr["median"], cur["completed"], tr["completed"]
    v["ct.ana_moves"] = tr["crew"][0]["moves"]
    v["ct.switch_sec"], v["ct.away_sec"], v["ct.return_trigger"] = OTR["switch_sec"]["value"], RAW["sharing"]["assist_handover_sec"]["value"], OTR["return_trigger"]["value"]
    v["ct.keep_upto"], v["ct.esc_from"], v["ct.slow_done"] = max(keep), min(esc), sl_["cmp"]["current"]["completed"]
    # slides 06 to 08, can the same crew absorb toppings (sim/toppings.js via precompute.js); the deck runs the same model live
    TPd, TR = d["toppings"], RAW["toppings"]; tv = lambda k: TR[k]["value"]
    A_, B_, Z = TPd["def"]["fixed"], TPd["def"]["brigade"], TPd["zero"]
    if [(c["id"], c["name"]) for c in crew] != [("ana", "Ana"), ("ben", "Ben"), ("cai", "Cai")] or tv("fixed_assignment") != {"ana": ["cup_ice"], "ben": ["tea_milk", "topping", "finish"], "cai": ["shake_seal", "handover"]}:
        raise SystemExit("build: slide 06 draws Ana on cup and ice, Ben on tea and milk, toppings and finishing, Cai on the sealer and hand-over; redraw it")
    if not (B_["median"] < A_["median"] and B_["completed"] > A_["completed"]):
        raise SystemExit("build: slides 06 to 08 say the brigade beats fixed responsibilities at the default topping share; rewrite them")
    if not abs(Z["brigade"]["completed"] - Z["fixed"]["completed"]) < 2:
        raise SystemExit("build: slide 08's notes say the two rules complete about the same before toppings; rewrite them")
    sw = TPd["sweep"]
    if any(b["fixed"]["completed"] > a["fixed"]["completed"] + 0.5 for a, b in zip(sw, sw[1:])) or not all(x["brigade"]["completed"] >= x["fixed"]["completed"] for x in sw):
        raise SystemExit("build: slide 08's notes say fixed responsibilities complete fewer orders as toppings rise, and the brigade keeps up better; rewrite them")
    a0, b0 = A_["crew"][0], A_["crew"][1]
    busy = lambda c: c["work"] + c["walk"] + c["pass"]
    if not (busy(b0) > busy(a0) + 0.3):
        raise SystemExit("build: slide 06 says toppings land on Ben while Ana has time to spare; rewrite it")
    cyc = [(e["type"], e["who"], e.get("from")) for e in TPd["cycle"]]
    if cyc != [("ready", "cai", None), ("pass", "cai", "ben"), ("pass", "ben", "ana"), ("start", "ana", None)]:
        raise SystemExit("build: slide 07 narrates Cai handing over, taking Ben's cup, Ben taking Ana's, Ana starting the next order; rewrite it")
    one, two = TPd["bar"]["one"], TPd["bar"]["two"]
    top_max, fin = TR["topping_sec"]["range"][1], tv("finish_sec")
    bar_need = (fin + top_max) * tv("peak_orders_per_hour") / 3600
    if not (bar_need > 1 and max(one["fixed"]["completed"], one["brigade"]["completed"]) < 3600 / (fin + top_max) and two["brigade"]["completed"] > one["brigade"]["completed"]):
        raise SystemExit("build: slide 08's notes say at the longest topping time the one-person bar caps both rules, and a second position helps the brigade; rewrite them")
    v["tp.share"], v["tp.per_hour"], v["tp.minutes"], v["tp.seeds"] = tv("topping_share"), tv("peak_orders_per_hour"), tv("peak_minutes"), tv("seeds")
    v["tp.top_sec"], v["tp.finish_sec"], v["tp.walk_sec"], v["tp.hand_sec"] = tv("topping_sec"), fin, tv("walk_sec_per_station"), tv("handover_sec")
    v["tp.std"], v["tp.topped"], v["tp.placed"] = TPd["def"]["content"]["standard"], TPd["def"]["content"]["topped"], A_["placed"]
    v["tp.a_med"], v["tp.b_med"], v["tp.a_p90"], v["tp.b_p90"] = A_["median"], B_["median"], A_["p90"], B_["p90"]
    v["tp.a_done"], v["tp.b_done"], v["tp.cost"] = A_["completed"], B_["completed"], TPd["def"]["cost"]
    v["tp.z_a_med"], v["tp.z_b_med"], v["tp.z_a_done"], v["tp.z_b_done"] = Z["fixed"]["median"], Z["brigade"]["median"], Z["fixed"]["completed"], Z["brigade"]["completed"]
    v["tp.ben_busy"], v["tp.ana_busy"] = busy(b0), busy(a0)
    v["tp.f_full"], v["tp.b_full"] = sw[-1]["fixed"]["completed"], sw[-1]["brigade"]["completed"]
    v["tp.top_max"], v["tp.bar_need"], v["tp.bar_cap"] = top_max, bar_need, 3600 / (fin + top_max)
    v["tp.bar1_a"], v["tp.bar1_b"], v["tp.bar2_b"] = one["fixed"]["completed"], one["brigade"]["completed"], two["brigade"]["completed"]
    if not abs(TPd["cai"]["brigade"]["median"] - B_["median"]) < 10:
        raise SystemExit("build: slide 08's notes say training Cai changes little at the default; rewrite them")
    v["tp.cai_b_med"] = TPd["cai"]["brigade"]["median"]
    sc_ = TPd["scene"]
    if not (sc_["shown"] > sc_["median"] and RAW["toppings"]["scene"]["value"]["plain_minutes"] < RAW["toppings"]["scene"]["value"]["build_minute"]):
        raise SystemExit("build: slide 06's notes say its run shows a longer-than-median shelf at Ben; check toppings.scene")
    v["tp.sc_shelf"], v["tp.sc_median"], v["tp.sc_share"], v["tp.sc_min"] = sc_["shown"], sc_["median"], sc_["share4"], RAW["toppings"]["scene"]["value"]["build_minute"]
    ids = {e["type"] + ":" + e["who"]: e["order"] for e in TPd["cycle"]}
    v["tp.cyc_ready"], v["tp.cyc_cai"], v["tp.cyc_ben"], v["tp.cyc_start"] = ids["ready:cai"], ids["pass:cai"], ids["pass:ben"], ids["start:ana"]
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
    ("sitepick", "events", "Synthetic app-intent dots (slide 12)"),
    ("sitepick", "walk_km", "Walking distance to collect"),
    ("sitepick", "decay_share", "Distance decay, share of the walking distance"),
    ("sitepick", "outside_option", "Pull of not buying"),
    ("sitepick", "dbscan_eps_km", "DBSCAN cluster radius"),
    ("sitepick", "dbscan_min_points", "DBSCAN minimum searches"),
    ("sitepick", "km_per_px", "Map scale"),
    ("service", "target_wait_minutes", "Wait at which a customer walks away"),
    ("storyboard", "price_per_cup", "Price per cup, in store (pin to profit, the benefit slide)"),
    ("storyboard", "gross_margin_per_cup", "Margin per cup, share of price (pin to profit, the benefit slide)"),
    ("storyboard", "busy_days_per_year", "Busy days a year (the benefit slide, illustrative)"),
    ("storyboard", "event_days_per_year", "Event days a year (the benefit slide, illustrative)"),
    ("illustration", "walk_back_speed", "Walking-back speed (Week 5 units)"),
    ("site_ext", "scores", "Site scores, hand-set (four scores, pin to profit, illustrative)"),
    ("site_ext", "score_weights", "Site score weights (pin to profit, illustrative)"),
    ("site_ext", "rent_per_month", "Rent per outlet per month (pin to profit, assumption, not Chagee data)"),
    ("site_ext", "utilities_per_month", "Utilities per outlet per month (pin to profit, assumption)"),
    ("site_ext", "delivery_share_of_cups", "Share of cups via delivery apps (pin to profit, assumption)"),
    ("site_ext", "delivery_commission_share", "Delivery platform commission (pin to profit, assumption)"),
    ("site_ext", "setup_cost", "Set-up cost per new outlet (pin to profit, assumption, not Chagee data)"),
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
    for k, label in (("sg_outlets", "Outlets in Singapore"), ("revenue_share_franchise_fy2025", "Global context, group-wide, not Singapore: franchise share of FY2025 net revenue"),
                     ("revenue_share_company_owned_fy2025", "Global context, group-wide, not Singapore: company-owned share of FY2025 net revenue"),
                     ("registered_members_jun2026", "Registered members, group-wide, end of June 2026"),
                     ("repeat_member_order_share", "Orders from members with two or more purchases, group-wide (more than)")):
        f = RAW["facts"][k]
        out.append(f"<p><b>{label}: {short(f['value'])}</b>. {esc(f['rationale'])} <i>[{esc(f['source'])}]</i></p>")
    out.append("<h5>Sources</h5>")
    for k in ("L-sg-directory", "I-sg-owned", "L-koalagains", "L-yfchuhai", "L-sec20f", "L-unsw", "I-chagee-contact", "I-sg-groundfloor", "I-team-app-first", "L-ester1996", "P-honeycombers", "P-eatbook", "I-team-expansion", "I-team-site-framework", "L-chagee-q2-2026-call", "L-chagee-q1-2025", "P-appstore", "P-vulcanpost-comeback", "L-sec20f-data", "L-sec20f-member", "C-topic8", "I-chagee-contact-tiers", "C-topic1", "C-topic2"):
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
    out.append("<p><b>Singapore ownership:</b> Chagee Singapore operates a company-owned model, not a franchise model, as confirmed by the "
               "project owner (I-sg-owned). That outlets run under one company and one data system is from an anonymous Chagee source "
               "(I-chagee-contact). Group-wide franchise revenue shares are global context only and are not applied to Singapore.</p>")
    out.append("<p>We make no claim about: <b>delivery profit by channel</b>; "
               "<b>Chagee's own equipment cost</b> (not public); <b>gross margin per cup</b> (our assumption); "
               "<b>Chagee's current rostering</b> beyond what an anonymous Chagee source told us (people are deployed on local expertise by the GM and outlet teams; the benefit slide's baseline is ours).</p>")
    return "\n".join(out)


def mb_appendix(d: dict) -> tuple:
    """Appendix for slides 05-07 (members): derivation and parameters, scenario table; network check; break-even and inputs."""
    M, D = RAW["members"], d["members"]
    pc = lambda x: "none" if x is None else f"{round(100 * x)}%"
    gap = lambda n: "" if n["closed"] is None or n["sim"] is None else f"{100 * (n['sim'] - n['closed']):+.1f}"
    need = lambda r: "none" if r["extraNeeded"] is None else f"{r['extraNeeded']:.2f}"
    a = ["<h5>Derivation (OPIM639 Topic 8, slides 30 to 36)</h5>",
         "<p>Customer x in (0, 1) has interest r(x) = 1 - x. With a share z of friends participating, x joins if r(x) k z &gt;= p, "
         "that is x &lt;= 1 - p/(k z): the share who would join is 1 - p/(k z). An equilibrium is a share that reproduces itself, "
         "z = 1 - p/(k z), which gives <b>p = k z (1 - z)</b>. This hump is the equilibrium curve of the population; one customer's "
         "benefit is r k z, a straight line in z.</p>",
         "<p>The hump peaks at k/4, at z = 50%. If p &lt; k/4 the effort line crosses it twice: <b>z' = (1 - sqrt(1 - 4p/k))/2</b>, the "
         "unstable tipping point, and <b>z'' = (1 + sqrt(1 - 4p/k))/2</b>, the stable level. At p = k/4 they merge at 50%; above it there "
         "is no positive equilibrium and participation falls to zero from any start. Rounds: z_next = max(0, min(1, 1 - p/(k z))).</p>",
         "<h5>Parameters (illustrative index, not Chagee data)</h5>",
         "<p><b>r</b> individual interest, 0 to 1, uniform across customers. <b>k</b> value of friends participating; squads are hypothesised to raise it. "
         "<b>z</b> share of a customer's friends participating. <b>p</b> effort score of joining or progressing, 0 to 1: 1 is the whole benefit a fully "
         f"interested customer gets with every friend on at k = 1; not money. Slider defaults: {short(M['slider_defaults']['value'])}. "
         f"Levers, read from the scenario table: squads add {d['members']['levers']['dk']:g} to k; a launch incentive takes {d['members']['levers']['dp']:g} off p.</p>",
         "<h5>Scenario table, computed (sim/members.js); the build fails if it differs from members.expected_table</h5>",
         "<table class='res mbt'><tr><th>Scenario</th><th>p</th><th>k</th><th>4p/k</th><th>z'</th><th>z''</th></tr>" +
         "".join(f"<tr><td>{x['label']}</td><td>{x['p']:.2f}</td><td>{x['k']:.1f}</td><td>{4 * x['p'] / x['k']:.2f}</td><td>{pc(x['eq'] and x['eq']['low'])}</td><td>{pc(x['eq'] and x['eq']['high'])}</td></tr>" for x in D["table"]) + "</table>"]
    NW = M["network"]["value"]
    b = ["<table class='res mbt' style='margin-top:6px'><tr><th>Scenario</th><th>Closed form z'</th><th>Simulated</th><th>Gap, points</th></tr>" +
         "".join(f"<tr><td>{next(x['label'] for x in M['scenarios']['value'] if x['id'] == n['id'])}</td><td>{pc(n['closed'])}</td><td>{pc(n['sim'])}</td>"
                 f"<td>{gap(n)}</td></tr>" for n in D["network"]) + "</table>",
         f"<p>{NW['customers']:,} customers on a seeded random graph with about {NW['friends_per_customer']} friends each, interest uniform; a customer is on next round "
         f"if r k (share of friends on) &gt;= p. {NW['runs']} seeded runs; the simulated tipping point is the smallest starting share (to {NW['z0_step']:g}) from which the "
         f"mean run ends above {NW['takeoff_share']:.0%}. Gaps above five points mean the friend-group structure matters: with a handful of friends each, pockets of "
         "friends keep each other on, so the network tips lower than the formula, which assumes everyone sees the whole population's share. We report the gap, not hide it.</p>"]
    BE = D["breakEven"]
    c = ["<h5>Break-even of the group-order credit</h5>",
         f"<p>Contribution per member a month = price x (margin x E - credit x (B + E)), with E extra orders and B group orders a member would place anyway. "
         f"Break-even E* = credit x B / (margin - credit); none if the credit reaches the margin. Price S${BE['price']:.2f}, credit {BE['credit']:.0%}, B {BE['base']:g}, E {BE['extra']:g}.</p>",
         "<table class='res mbt'><tr><th>Gross margin</th><th>Extra orders needed a month</th><th>With AI cost (CRM manager's decision)</th><th>Contribution a member a month at E</th></tr>" +
         "".join(f"<tr><td>{BE[q]['margin']:.0%}</td><td>{need(BE[q])}</td><td>{need(D['breakEvenAi'][q])}</td><td>S${BE[q]['netPerMember']:.2f}</td></tr>" for q in ("low", "mid", "high")) + "</table>",
         f"<p>With personalised suggestions (the CRM manager's decision) a flat AI cost a of S${D['breakEvenAi']['ai']:.2f} a member a month is added: E* = (credit x B + a / price) / (margin - credit). "
         f"Personalisation must add a / (price x (margin - credit)) = {D['aiHurdle']:.2f} orders a month on top of squads alone at the base margin.</p>",
         "<h5>New inputs (assumptions.json members; assumption, not Chagee data)</h5>"]
    for k in ("group_credit_share", "extra_orders_per_member_month", "base_group_orders_per_member_month", "ai_cost_per_member_month", "squad_size", "example_interest", "app_rules", "network"):
        o = M[k]; rng = f" (range {short(o['range'])})" if o.get("range") else ""
        c.append(f"<p><b>{k.replace('_', ' ')}</b>: {short(o['value'])}{rng}. {o['rationale']}</p>")
    return "\n".join(a), "\n".join(b), "\n".join(c)


def p1_steps() -> tuple:
    """Slide 05's execution panel and its printed appendix page: the four steps on the online roadmap's phases and gates."""
    DM, OC = RAW["demand_mgmt"], RAW["online_case"]
    RM, GT, tests = OC["roadmap"]["value"], OC["gates"]["value"], DM["gate_tests"]["value"]
    cells = "".join(f"<div><span class='n'>{i + 1}</span><span class='when'>{RM[s['phase']]['phase']} · months {RM[s['phase']]['from']}–{RM[s['phase']]['to']}</span>"
                    f"<h5>{s['step']}</h5><p style='margin:0'>{s['detail']}</p><p class='who'>Owners: {s['owners']}</p></div>" for i, s in enumerate(DM["execution_steps"]["value"]))
    gates = "".join(f"<p><b>{g['name']}</b> · month {g['month']}: {tests[i]}</p>" for i, g in enumerate(GT))
    steps = (f"<div class='p1xs'>{cells}</div><div class='p1xg'>{gates}</div>"
             "<p class='p1xd'><b>Decision-maker:</b> the digital commerce manager, with zone and outlet managers, decides whether to pilot in one zone and, at each gate, whether to continue. "
             "Phases, months and gate names reuse the online roadmap (team brief); the steps' scope and the gate tests are ours.</p>")
    v = lambda k: DM[k]["value"]
    rows = [("Busy and support outlet", f"{v('busy_outlet')} and {v('alt_outlet')} (the reference deck's example)"),
            ("Trigger threshold", f"{v('wait_threshold_min')} min, adjustable {DM['wait_threshold_min']['range'][0]}–{DM['wait_threshold_min']['range'][1]}; illustrative, not a validated rule"),
            ("Busy outlet", f"walk {v('busy_travel_min')} min, ready in {v('busy_ready_min')} min"),
            ("Support outlet", f"walk {v('alt_travel_min')} min, ready in {v('alt_ready_min')} min; {v('alt_ready_when_full_min')} min once it fills up"),
            ("Offer rule", f"suggest a switch only if it saves at least {v('min_saving_min')} min; collection = the later of walk and readiness"),
            ("Switch perk", v("switch_incentive") + "; cost and uptake not estimated")]
    page = (steps + "<h5>The illustrative scenario on slides 03 to 05</h5><table class='res mbt'>" + "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in rows) + "</table>"
            "<h5>Data the tool would need</h5><p>Recorded today, as far as we know: orders by outlet and time. Proposed, needing access, consent or logging: customer location (with permission), margin per drink, "
            "crew and equipment availability, delivery orders and rider waits (where platforms share them), and a log of recommendations, decisions and outcomes.</p>"
            "<h5>What we checked, and what we do not claim</h5><p>CHAGEE Singapore's Help Centre (October 2026): in-app delivery is available within coverage, with partners such as Grab elsewhere; rewards are redeemable only on in-app pickup orders. "
            "Pausing an outlet or promoting another on a delivery platform depends on that platform's tools and permissions, to confirm. No sales or profit uplift is estimated for this proposal; "
            "the earlier online business case, with its reconciliation, follows in this appendix. <span class='golink' data-go='p1a'>Back to the customer experience</span></p>")
    return steps, page


def p2_steps() -> tuple:
    """Slide 08's execution panel and its printed appendix page: the four steps, the tablet's inputs and the rules' settings."""
    O = RAW["ops_tool"]; v = lambda k: O[k]["value"]; lab = v("station_labels"); low = lambda k: lab[k].lower()
    cells = "".join(f"<div><span class='n'>{i + 1}</span><h5>{s['step']}</h5><p style='margin:0'>{s['detail']}</p></div>" for i, s in enumerate(v("execution_steps")))
    steps = (f"<div class='p1xs'>{cells}</div>"
             "<p class='p2xnote'><b>Decision-maker:</b> the operations manager or outlet GM decides after each step whether to continue. No timing, cost, labour saving or profit is estimated. "
             "Equipment purchases are a separate investigation: <span class='golink' data-go='c7'>machine comparison, appendix</span></p>")
    ins = "".join(f"<tr><td>{x['label']}</td><td>{x['detail']}</td><td>{'recorded today, as far as we know' if x['status'] == 'recorded' else 'proposed: needs instrumentation or a new record'} · {x['tag']}</td></tr>" for x in v("inputs"))
    crew = "; ".join(f"{c['name']} on {low(c['home'])}, trained on {', '.join(low(k) for k in c['trained'])}" for c in v("crew"))
    eq, sh = v("equipment"), RAW["sharing"]["assist_handover_sec"]["value"]
    rows = [("Counter", "today's split (our scenario): machines on " + ", ".join(low(k) for k in RAW["stations"]["mixed_machine_stations"]["value"]) + "; seconds per drink from stations.*, machine units as the counter simulation"),
            ("Crew", f"{crew}; speeds 1 ± {RAW['people']['worker_speed_spread']['value']:g} (people.worker_speed_spread)"),
            ("Drink mix", "; ".join(f"{x['label'].lower()} {x['share']:.0%}, finishing ×{x['finish_mult']:g}" for x in v("drink_mix"))),
            ("Demand", f"{v('demand_per_hour')} drinks an hour by default, slider {O['demand_per_hour']['range'][0]}–{O['demand_per_hour']['range'][1]}; forecast range ±{v('forecast_band'):.0%}"),
            ("Comparison", f"the next {v('window_min')} minutes; {v('seeds')} seeded runs per allocation, the same drinks and task-time variation for each"),
            ("Waiting at the start", ", ".join(f"{low(k)} {n}" for k, n in v("snapshot").items())),
            ("Moving", f"walking at illustration.walk_back_speed; {v('switch_sec')} s set-up on every move; {sh} s per drink away from one's own step (sharing.assist_handover_sec)"),
            ("Review and return", f"a helper goes back when {v('return_trigger')} drinks wait at their own step, and returns to help once it is clear; the help ends when the constraint is down to {v('clear_level')}"),
            ("Rules", f"keep if the constraint clears within the window; escalate if it is a machine, or if no trained colleague with at least {v('spare_min'):.0%} spare time can clear it; otherwise the one move that leaves the least work waiting"),
            ("Equipment scenario", f"{eq['label']}: the {low(eq['station'])} at ×{eq['slow_factor']:g} its seconds per drink")]
    page = (steps + "<h5>The tablet's inputs</h5><table class='res mbt'><tr><th>Input</th><th>What</th><th>Status</th></tr>" + ins + "</table>"
            "<h5>The illustrative scenario and the rules (assumptions.json ops_tool; to validate with Chagee)</h5><table class='res mbt'>" + "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in rows) + "</table>"
            "<h5>What we do not claim</h5><p>The counter layout, skills, timings and drink mix are ours, to validate by observing Chagee's counters; we have not observed them, and a queue at one step in a rush is not a failing. "
            "The demand forecast is an illustrative input, not a trained model. Reassignment moves work between the same paid people: no labour saving, sales or profit is estimated. "
            "Results are a simulation under stated assumptions. <span class='golink' data-go='s2t'>Back to the tablet</span></p>")
    return steps, page


def tp_page(d: dict) -> str:
    """Proposal 2's execution page (slides 06 to 08): the four steps, then every setting of slide 08's comparison and its source."""
    T, ST, PE = RAW["toppings"], RAW["stations"], RAW["people"]; v = lambda k: T[k]["value"]; lab = v("step_labels")
    hs, ms = ST["human_seconds_per_cup"]["value"], ST["machine_seconds_per_cup"]["value"]
    cells = "".join(f"<div><span class='n'>{i + 1}</span><h5>{s['step']}</h5><p style='margin:0'>{s['detail']}</p></div>" for i, s in enumerate(v("execution_steps")))
    crew = RAW["ops_tool"]["crew"]["value"]; sp = PE["worker_speed_spread"]["value"]
    own = "; ".join(f"{c['name']}: {', '.join(lab[k].lower() for k in v('fixed_assignment')[c['id']])}" for c in crew)
    rows = [("Toppings plan", v("plan_status")),
            ("Counter", f"{lab['cup_ice'].lower()} {hs['cup_ice']} s and {lab['handover'].lower()} {hs['handover']} s by hand (stations.human_seconds_per_cup); {lab['tea_milk'].lower()} {ms['tea_milk']} s and the {lab['shake_seal'].lower()} {ms['shake_seal']} s by machine (stations.machine_seconds_per_cup), attended by whoever carries the cup, one cup at a time"),
            ("Finishing and toppings", f"finishing {v('finish_sec')} s on every order; toppings {v('topping_sec')} s more on orders with toppings (Assumptions: {T['topping_sec']['range'][0]}–{T['topping_sec']['range'][1]} s). Together they replace the deck's {hs['topping_finish']} s topping/finish step on these slides, so topping work is not counted twice"),
            ("Crew", "; ".join(f"{c['name']} speed {1 + c['speed_step'] * sp:.1f}, {'trained' if 'topping_finish' in c['trained'] else 'not yet trained'} on toppings and finishing" for c in crew) + " (ops_tool.crew)"),
            ("A: fixed responsibilities", own + "; cups pass on a shelf"),
            ("B: bucket brigade", "Week 5's rules with safe hand-overs: carry forward through trained steps; the last person walks back and takes over the upstream colleague's cup when that colleague finishes the step in hand; nobody overtakes"),
            ("Moving and passing", f"{v('walk_sec_per_station'):g} s to walk one station; {v('handover_sec')} s for every pass between people, on both sides"),
            ("Topping bar", f"{v('bar_positions')} person at a time by default; Assumptions tries two"),
            ("Orders", f"{v('peak_orders_per_hour')} an hour, one drink each, Poisson arrivals; task-time variation ±{PE['human_speed_variation_cv']['value']:.0%}; the same order sequence and topping draws on A and B; an order has toppings when its draw is below the share"),
            ("Measured", f"one {v('peak_minutes')}-minute peak from an empty counter; orders placed in it followed up to {v('follow_minutes')} more minutes; {v('seeds')} runs per setting"),
            ("Paid labour", f"{len(crew)} people × S${RAW['costs']['labour_cost_per_hour']['value']:.2f} an hour (costs.labour_cost_per_hour), the same on both sides")]
    return (f"<div class='p1xs'>{cells}</div>"
            "<p class='p2xnote'><b>Decision-maker:</b> the operations manager or outlet GM decides after each step whether to continue. Dedicated staff and topping-dispensing equipment are follow-up alternatives; a robotic arm stays an investigation needing evidence on topping compatibility, cleaning, space, safety, throughput and cost "
            "(<span class='golink' data-go='c7'>equipment, appendix</span>). No labour saving, sales or profit is estimated.</p>"
            "<h5>The toppings comparison: every setting (assumptions.json toppings; illustrative, to validate with Chagee)</h5><table class='res mbt'>" + "".join(f"<tr><td>{a}</td><td>{b}</td></tr>" for a, b in rows) + "</table>"
            "<p>The AI forecast of topping demand is proposed, not built: on the comparison page the share is set by hand. The alternative, flexible assistance with a manager's tablet, is kept on its own pages: "
            "<span class='golink' data-go='s2b'>how the tablet works</span>. <span class='golink' data-go='s2c'>Back to the comparison</span></p>")


def online_appendix(d: dict) -> tuple:
    """Appendix for slides 03 to 07 (online retailing): inputs, each initiative, the brief reconciled; policy, plan, team, sources."""
    ON, OC, F, SBv, ST, X = d["online"], RAW["online_case"], RAW["facts"], RAW["storyboard"], RAW["store"], RAW["site_ext"]
    S, CA, BE, BR = ON["scenarios"], ON["cash"], ON["breakEven"], OC["brief"]["value"]
    v = lambda k: OC[k]["value"]; sc = ("low", "base", "high")
    sg = lambda x: f"{'−' if x < 0 else ''}S${abs(x):,.0f}"; sk = lambda x: f"{'−' if x < 0 else ''}S${abs(x) / 1e3:,.0f}k"
    pc = lambda x: f"{100 * x:.0f}%"; c2 = lambda x: f"S${x:.2f}"; n0 = lambda x: f"{x:,.0f}"
    tri = lambda f: " · ".join(f(S[s]) for s in sc)
    price, mg, cups = SBv["price_per_cup"]["value"], SBv["gross_margin_per_cup"]["value"], ST["cups_per_store_per_year"]["value"]
    ch, b = v("channel_shares"), S["base"]
    app = 1 - X["delivery_share_of_cups"]["value"] - ch["grab_pickup"] - ch["app_delivery"]
    peak = b["i1"]["eligible"] / (b["app"])
    p1 = ["<h5>Inputs: the deck's own values, and where each comes from</h5><table class='res mbt'><tr><th>Input</th><th>Value</th><th>Source</th></tr>",
          f"<tr><td>Outlets</td><td>{F['sg_outlets']['value']} (store directory, 15 Oct 2026). The store locator listed {v('outlets_locator')} on 24 Oct 2026: at that count every volume line is {pc(v('outlets_locator') / F['sg_outlets']['value'] - 1)} higher</td><td>facts.sg_outlets; online_case.outlets_locator</td></tr>",
          f"<tr><td>Days, cups, price, margin</td><td>{ST['open_days_per_year']['value']} days; {n0(cups)} cups an outlet a year (about {cups / ST['open_days_per_year']['value']:.0f} a day); {c2(price)} a cup; {pc(mg)} margin, so {c2(price * mg)} contribution a cup</td><td>store; storyboard</td></tr>",
          f"<tr><td>Channels</td><td>Chagee-app pickup and in-store app orders {pc(app)}; Grab delivery {pc(X['delivery_share_of_cups']['value'])} at {pc(X['delivery_commission_share']['value'])} commission; Grab self-pickup {pc(ch['grab_pickup'])}; in-app delivery {pc(ch['app_delivery'])} (rider cost unknown, not valued)</td><td>site_ext (as on the expansion slides); online_case.channel_shares</td></tr>",
          f"<tr><td>Peak and off-peak</td><td>peak = the {v('peak_hours')} busiest hours, {pc(peak)} of cups; off-peak the rest</td><td>store.hourly_demand_share</td></tr></table>",
          "<h5>Each initiative, a full-scale year: low · base · high</h5><table class='res mbt'><tr><th>Initiative</th><th>Eligible volume and rule</th><th>Contribution</th></tr>",
          f"<tr><td>Capacity-aware ordering</td><td>{n0(b['i1']['eligible'])} peak-hour Chagee-app cups (Grab orders cannot be rerouted); {tri(lambda a: pc(a['i1']['cups'] / a['i1']['eligible']))} kept × {c2(price * mg)}</td><td>{tri(lambda a: sk(a['i1']['contrib']))}</td></tr>",
          f"<tr><td>Targeted discounts</td><td>{n0(b['i2']['eligible'])} off-peak app cups; {pc(v('offer_share'))} redeemed with {c2(v('offer_discount'))} off; {tri(lambda a: pc(a['i2']['incremental'] / a['i2']['redeemed']))} of them new. Contribution = new × {c2(price * mg)} − redeemed × {c2(v('offer_discount'))}; break-even {pc(BE['incShare'])} new</td><td>{tri(lambda a: sk(a['i2']['contrib']))}</td></tr>",
          f"<tr><td>Delivery → app pickup</td><td>{n0(b['i3']['delivery']['eligible'])} Grab delivery cups; {tri(lambda a: pc(a['i3']['delivery']['moved'] / a['i3']['delivery']['eligible']))} move; each gains {c2(price)} × ({pc(X['delivery_commission_share']['value'])} − {pc(v('app_payment_cost'))}) − {c2(v('pickup_reward'))} reward = {c2(b['i3']['delivery']['perOrder'])}; {sk(b['i3']['delivery']['shiftedRevenue'])} of revenue moves at base, none added</td><td>{tri(lambda a: sk(a['i3']['delivery']['contrib']))}</td></tr>",
          f"<tr><td>Grab pickup → app pickup</td><td>{n0(b['i3']['grabPickup']['eligible'])} Grab self-pickup cups; each gains {c2(price)} × ({pc(v('grab_pickup_commission'))} − {pc(v('app_payment_cost'))}) − {c2(v('pickup_reward'))} = {c2(b['i3']['grabPickup']['perOrder'])}; pays only if Grab's pickup commission is above {BE['grabPickupComm']:.1%}</td><td>{tri(lambda a: sk(a['i3']['grabPickup']['contrib']))}</td></tr>",
          f"<tr><td><b>Gross contribution</b></td><td>added sales (rerouting, plus new offer orders less every discount): {tri(lambda a: sk(a['sales']))}</td><td><b>{tri(lambda a: sk(a['gross']))}</b></td></tr></table>"]
    q = ON["brief"]
    p1 += ["<h5>The team brief, line by line: what its figures imply, and how we treat them</h5><table class='res mbt'><tr><th>Line</th><th>Brief</th><th>What it implies</th><th>Here, base</th></tr>",
           f"<tr><td>Base</td><td>{BR['outlets']} × {BR['cups_per_day']} cups × {BR['days']} days × {c2(BR['price'])} = {sg(q['base'])}</td><td>the locator's count; {BR['days']} trading days</td><td>{sg(q['ourBase'])} on the deck's inputs</td></tr>",
           f"<tr><td>Rerouting</td><td>sales {sg(BR['sales']['rerouting'])}; profit {sg(BR['profit']['rerouting'])}</td><td>{pc(BR['retained'])} of all peak revenue ({pc(BR['peak_share'])}), Grab included; a {pc(q['reroutingMargin'])} margin</td><td>app orders only, {pc(mg)} margin: {sk(b['i1']['contrib'])}</td></tr>",
           f"<tr><td>Dynamic pricing</td><td>sales {sg(BR['sales']['pricing'])}; profit {sg(BR['profit']['pricing'])}</td><td>{pc(BR['offpeak_uplift'])} of {sg(q['pricingBase'])}, which is {pc(q['pricingBaseShare'])} of the base: all delivery revenue, not off-peak, where app vouchers cannot reach; {pc(BR['delivery_margin'])} margin; no discount on orders that would happen anyway</td><td>off-peak app orders, discount on every redeemed order: {sk(b['i2']['contrib'])}</td></tr>",
           f"<tr><td>Self-pickup</td><td>{sg(q['moved'])} moves; profit {sg(BR['profit']['pickup'])}</td><td>{pc(BR['shift'])} of that delivery revenue × ({pc(BR['commission'])} − {pc(BR['payment'])}); no reward cost; Grab pickup still pays Grab</td><td>two journeys, the deck's {pc(X['delivery_commission_share']['value'])} commission, reward deducted: {sk(b['i3']['contrib'])}</td></tr>",
           f"<tr><td>Total</td><td>sales {sg(BR['sales']['total'])}; profit {sg(BR['profit']['total'])}</td><td>gross: no team, cloud or integration cost</td><td>gross {sk(b['gross'])}; operating {sk(b['operating'])} after the run team and cloud</td></tr>",
           f"<tr><td>Payback</td><td>within a year if build costs stay below the annual profit</td><td>build cost against one year's gross; the team's running cost left out</td><td>phased cash flow: no payback within {RAW['business_case']['horizon_years']['value']} years in any scenario</td></tr>",
           "<tr><td>Scale</td><td>stores averaged over 1,500 cups a day, Q2 2025</td><td>could not be verified (transcript inaccessible); most likely group or China, not Singapore</td><td>not used</td></tr></table>"]
    c = CA["base"]
    p2 = [f"<h5>Costs, cash flow and payback · base (S$; low and high in brackets)</h5><table class='res mbt'><tr><th>Year</th><th>Benefit</th><th>Team</th><th>Cloud</th><th>Integration</th><th>Net</th><th>Cumulative</th></tr>"]
    for y in c["years"]:
        p2.append(f"<tr><td>{y['year']}</td><td>{sk(y['benefit'])}</td><td>{sk(-y['team'])}</td><td>{sk(-y['cloud'])}</td><td>{sk(-y['integ']) if y['integ'] else '–'}</td><td>{sk(y['net'])}</td><td>{sk(y['cum'])} ({sk(CA['low']['years'][y['year'] - 1]['cum'])}; {sk(CA['high']['years'][y['year'] - 1]['cum'])})</td></tr>")
    pm = RAW["business_case"]["specialist_day_rate"]["value"] * RAW["business_case"]["working_days_per_month"]["value"]
    small = OC["run_team_people"]["range"][0]
    p2.append(f"</table><p>Implementation spend, months 1 to {v('roadmap')[0]['to']}: {sk(c['implementation'])} (team and integration). Run cost from month {v('roadmap')[-1]['to'] + 1}: {sk(b['team'])} team ({v('run_team_people')} people × {sg(pm)} a person-month, the approved specialist rate) and {sk(b['cloud'])} cloud. Payback: none within the horizon. With a {small}-person run team the base operating result would be {sk(b['gross'] - small * pm * 12 - b['cloud'])} a year.</p>")
    POL = v("offer_policy")
    p2 += ["<h5>Proposed offer policy (team brief): discounts only, not proven optimal</h5><table class='res mbt'><tr><th>Scenario</th><th>Offer</th><th>Condition we add</th></tr>",
           f"<tr><td>Off-peak</td><td>up to {c2(POL['offpeak']['off'])} on the {POL['offpeak']['what']}</td><td>only to members the model scores as likely to add an order</td></tr>",
           f"<tr><td>Peak</td><td>no vouchers; {c2(POL['peak_preorder']['off'])} off a pre-order; limit Grab delivery when slots are full</td><td>the pre-order discount only if collection moves into a window with room; Grab limits as Grab's merchant tools allow (to confirm)</td></tr>",
           f"<tr><td>Weather, events</td><td>{c2(POL['hot_weather']['off'])} off in hot weather; {c2(POL['normal_or_rain']['off'])} in normal weather or rain; none during nearby events</td><td>weather and event effects estimated, not assumed</td></tr>",
           f"<tr><td>Inactive member</td><td>up to {c2(POL['dormant']['off'])} off their favourite for {POL['dormant']['days']} days; a free upsize after {POL['dormant']['upsize_after_days']} more days</td><td>only members the model scores as lapsing and responsive</td></tr></table>"]
    team = v("team")
    p2.append("<h5>Proposed plan: three phases, two gates, and the team as it joins</h5><table class='res mbt'><tr><th>Phase</th><th>Months</th><th>Scope</th><th>People</th><th>Team cost</th></tr>")
    for ph in v("roadmap"):
        ppl = sum(r["people"] for r in team if r["from_month"] <= ph["from"])
        p2.append(f"<tr><td>{ph['phase']}</td><td>{ph['from']}–{ph['to']}</td><td>{ph['what']}</td><td>{ppl}</td><td>{sk(ppl * pm * (ph['to'] - ph['from'] + 1))}</td></tr>")
    p2.append("</table><p>" + "; ".join(f"<b>{g['name']}</b> (month {g['month']}): {g['test']}" for g in v("gates")) + ". Roles: " + ", ".join(f"{r['role']} ({r['people']}, from month {r['from_month']})" for r in team) + ".</p>")
    p2 += ["<h5>Sources the brief cites, checked 24 Oct 2026</h5><table class='res mbt'><tr><th>Source</th><th>Supports</th><th>Does not support</th></tr>",
           "<tr><td>De Vries, Roy and De Koster 2018</td><td>longer waits relate to customers leaving and returning less (one Indian restaurant)</td><td>the 'nearly 15%' is a simulation without any waiting, not a Chagee uplift</td></tr>",
           "<tr><td>Wang and co-authors 2024</td><td>pooled capacity for app and platform orders gives more profit and throughput, in a queueing model</td><td>a size for Chagee</td></tr>",
           "<tr><td>Tong and co-authors 2020</td><td>platforms with dynamic pricing show higher demand (China O2O)</td><td>that targeted discounts lift Chagee's orders; an association</td></tr>",
           "<tr><td>Ma and co-authors 2024</td><td>Singapore consumers more sensitive to menu-price premiums than to delivery fees (stated choices; partly verified)</td><td>observed Chagee behaviour</td></tr>",
           "<tr><td>Kim, Wang and Malthouse 2015</td><td>app adopters spend more (US loyalty programme)</td><td>a Chagee uplift</td></tr>",
           "<tr><td>Traynor and co-authors 2022; Liu and Li 2023</td><td>operators see commissions as a cost (US interviews); a model that assumes and caps commissions</td><td>Chagee's commission rate</td></tr>",
           "<tr><td>CHAGEE SG Help Centre, Oct 2026</td><td>rewards redeemable only on in-app pickup; GrabFood orders earn once accounts are linked; in-app delivery within coverage; app payment methods</td><td>that Grab self-pickup orders earn; 'no delivery in the app' (the page says delivery is available)</td></tr>",
           "<tr><td>Q2 2025 earnings call</td><td>could not be accessed</td><td>the '1,500 cups a day' figure; not used</td></tr></table>"]
    return "".join(p1), "".join(p2)


def ops_appendix(d: dict) -> str:
    """Appendix for the Serve chapter (slides 08 to 11): the tables moved off the slides, every day type."""
    SBv = RAW["storyboard"]; days = list(RAW["surge"]["surge_multiplier"]["value"]); lab = SBv["day_type_labels"]["value"]
    p1 = lambda x: "–" if x is None else f"{100 * x:.1f}%"
    ms = lambda x: "–" if x is None else f"{int(x // 60)}:{int(round(x % 60)):02d}"
    sg = lambda x: f"S${x:,.0f}"
    hd = lambda first, sub: "<tr><th>" + first + "</th>" + "".join(f"<th>{lab[k]}<br><small>{sub}</small></th>" for k in days) + "</tr>"
    out = ["<h5>Forecasting page (earlier version) · forecast error: the roster follows a wrong forecast, the customers do not (today's split, bucket brigade)</h5>",
           "<table class='res mbt'>" + hd("Forecast", "crew · away · S$/day")]
    for i, r0 in enumerate(d["forecastErr"][days[0]]):
        e = r0["e"]; name = "exact" if e == 0 else f"{abs(e):.0%} {'high' if e > 0 else 'low'}"
        out.append(f"<tr><td>{name}</td>" + "".join(f"<td>{d['forecastErr'][k][i]['staff']} · {p1(d['forecastErr'][k][i]['lostShare'])} · {sg(d['forecastErr'][k][i]['cost'])}</td>" for k in days) + "</tr>")
    out.append("</table>")
    rules = (("brigade", "Bucket brigade"), ("fixed_best", "Fixed posts, fastest on toppings"), ("fixed_worst", "Fixed posts, slowest on toppings"))
    out += ["<h5>Bucket brigade (appendix) · sharing rules at the forecast crew, today's split</h5>", "<table class='res mbt'>" + hd("Rule", "crew · away · wait")]
    for k_, nm in rules:
        out.append(f"<tr><td>{nm}</td>" + "".join(f"<td>{d['aiLayer'][k]['today'][k_]['with']['staff']} · {p1(d['aiLayer'][k]['today'][k_]['with']['lostShare'])} · {ms(d['aiLayer'][k]['today'][k_]['with']['medianWait'])}</td>" for k in days) + "</tr>")
    out.append("</table>")
    SH = d["sharing"]; up = RAW["sharing"]["upper_percentile"]["value"]
    out += [f"<h5>Sharing page (earlier version) · same crew of {SH['staff']}, fixed responsibilities against flexible assistance, at each day type's peak hour</h5>",
            "<table class='res mbt'><tr><th>Rule</th>" + "".join(f"<th>{lab[k]} peak, {SH['levels'][k]['perHour']:.0f} orders an hour<br><small>median · {up:.0%} · completed · unfinished · away</small></th>" for k in days) + "</tr>"]
    for k_, nm in (("fixed", "A · fixed responsibilities"), ("assist", "B · flexible assistance")):
        out.append(f"<tr><td>{nm}</td>" + "".join((lambda r: f"<td>{ms(r['median'])} · {ms(r['p90'])} · {r['completed']:.0f} · {r['unfinished']:.0f} · {r['lost']:.0f}</td>")(SH['levels'][k][k_]) for k in days) + "</tr>")
    out.append("</table>")
    names = {"today": "Today's split (our scenario)", "heading": SBv["split_presets"]["display_labels"]["heading"], "all_hand": "All by hand", "all_robot": "All robots", "single": "One machine (tea and milk)"}
    def row(day, k):
        r = d["decisions"]["automate"]["perDay"][day]["single"] if k == "single" else d["splits"][day][k]
        cost = r["cost"] if k == "single" else r["cost"]["total"]
        if k != "single" and not r["meets"]: return f"over the limit · {sg(cost)}"
        return f"{r['staff'] if r['staff'] else '–'} · {p1(r['lostShare'])} · {ms(r['medianWait'])} · {sg(cost)}"
    out += [f"<h5>Equipment page · five setups: the fewest people that keep walk-aways within {SBv['walkaway_target']['value']:.0%}</h5>", "<table class='res mbt'>" + hd("Setup", "people · away · wait · S$/day")]
    for k in names:
        out.append(f"<tr><td>{names[k]}</td>" + "".join(f"<td>{row(day, k)}</td>" for day in days) + "</tr>")
    out.append("</table>")
    out += ["<h5>The forecast's effect at the counter: normal-day roster → forecast roster, same equipment and customers</h5>", "<table class='res mbt'>" + hd("Setup, bucket brigade", "crew · away · S$/day")]
    for k in ("today", "heading", "all_hand"):
        cell = lambda day: (lambda a: f"{a['without']['staff']}→{a['with']['staff']} · {p1(a['without']['lostShare'])}→{p1(a['with']['lostShare'])} · {sg(a['without']['cost'])}→{sg(a['with']['cost'])}")(d["aiLayer"][day][k]["brigade"])
        out.append(f"<tr><td>{names[k]}</td>" + "".join(f"<td>{cell(day)}</td>" for day in days) + "</tr>")
    out.append("</table><p>Peak hour, mean of the seeded runs; cost is the day's roster and machines. Illustrative assumptions, not Chagee data.</p>")
    return "\n".join(out)


def sq_appendix(d: dict) -> str:
    """Appendix for slide 06b: the synthetic forecast comparison, where each signal comes from, and every input."""
    Q, S = d["squadcast"], RAW["squadcast"]
    out = ["<h5>What this is</h5>", f"<p>{S['_note']['rationale']}</p>",
           "<h5>The forecasts</h5>",
           "<p><b>Baseline</b>: the calendar expectation for the window, cups a day x the peak hour's share x half an hour. "
           "<b>Enhanced</b>: the baseline's non-squad part, plus cups confirmed so far, plus predicted cups not yet confirmed: open baskets' unconfirmed "
           "invitees x the chance learned from synthetic history that they still confirm by then, unredeemed gifts x the learned chance of redemption, and "
           "the squad cups history says arrive from baskets and gifts not yet started. Each forecast uses only signals up to its time; a confirmed cup is "
           "counted once; an invitation or an unredeemed gift is never a confirmed drink.</p>",
           f"<h5>Mean absolute error, cups, over {S['eval_windows']['value']} synthetic windows</h5>",
           "<table class='res mbt'><tr><th>Squad share</th>" + "".join(f"<th>{r['lead']} min before: baseline / enhanced</th>" for r in Q["eval"]["0"]) + "</tr>" +
           "".join(f"<tr><td>{float(k):.0%}</td>" + "".join(f"<td>{r['maeBaseline']:.2f} / {r['maeEnhanced']:.2f}</td>" for r in v) + "</tr>" for k, v in Q["eval"].items()) + "</table>",
           "<p>With no squad share the two are identical. The enhanced forecast improves only because the synthetic squad signals were generated to move "
           "with demand; on single days it can be worse, when walk-in demand moves and squads cannot see it. Not measured accuracy.</p>",
           "<h5>Signals and where they stand</h5>",
           "<p><b>Documented</b>: completed purchases (Chagee's Form 20-F: the business generates personal, transactional and other data; L-sec20f-data); "
           "in-app ordering at a chosen outlet (Vulcan Post, P-vulcanpost-comeback; App Store listing, P-appstore, not checked by us). "
           "<b>To confirm</b>: drink customisations and the pickup time chosen, in Chagee's Singapore app. "
           "<b>Proposed, needing collection and consent</b>: group size and confirmed quantities, suggestion accepted, edited or dismissed, gifts sent and redeemed, open baskets and invitations.</p>",
           "<h5>Inputs (assumptions.json squadcast; assumption, synthetic, not Chagee data)</h5>"]
    for k, o in S.items():
        if k == "_note":
            continue
        rng = f" (range {short(o['range'])})" if o.get("range") else ""
        out.append(f"<p><b>{k.replace('_', ' ')}</b>: {short(o['value'])} {o.get('unit', '')}{rng}. {o['rationale']}</p>")
    out.append("<p><b>Course link</b>: OPIM639 Topic 1, slide 12 (capture demand data, not just sales data) and slide 13 (personalised service); "
               "Topic 2, slide 17 (the operator that provides fulfilment holds the detailed data). C-topic1, C-topic2.</p>")
    return "\n".join(out)


def nm_appendix() -> str:
    """Appendix for the new-market slides (things to consider): every new_market input, the method, and what we do not claim."""
    esc = lambda s: str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    N = RAW["new_market"]
    out = ["<h5>Status</h5>", f"<p>{esc(N['_note']['rationale'])} Market status: {esc(N['market_status']['value'])}.</p>",
           "<h5>Candidate areas (archetypes, scenario assumptions)</h5>"]
    F = N["features"]["value"]
    for a in N["areas"]["value"]:
        out.append(f"<p><b>{esc(a['id'])} · {esc(a['name'])}</b>: " + ", ".join(f"{esc(f['label'].lower())} {short(a[f['key']])}" for f in F) + "</p>")
    out.append("<h5>Features and where real values would come from (none retrieved)</h5>")
    for f in F:
        out.append(f"<p><b>{esc(f['label'])}</b>: stands in for {esc(f['proxy_for'])}; source to pull: {esc(f['planned_source'])}.</p>")
    out.append("<p><b>Left out</b>: " + "; ".join(f"{esc(x['label'].lower())} ({esc(x['why'])})" for x in N["excluded"]["value"]) +
               f". {esc(N['excluded']['rationale'])}</p>")
    out.append("<h5>Inputs (assumptions.json new_market)</h5>")
    for k in ("weights", "sensitivity", "demand_scenarios", "forecast_error", "day_mix", "wage_per_hour", "machine_cost_per_unit_per_month",
              "price_per_cup", "utilities_per_month", "setups", "cannibalisation", "trigger_weeks", "currency"):
        o = N[k]; unit = "" if o.get("unit") == "text" else o.get("unit", "")
        rng = f" (range {short(o['range'])})" if o.get("range") else ""
        out.append(f"<p><b>{esc(k.replace('_', ' '))}</b>: {esc(short(o['value']))} {esc(unit)}{esc(rng)}. {esc(o['rationale'])}</p>")
    out.append("<p><b>Reused from the Singapore sections, labelled where used</b>: gross margin per cup (storyboard), the per-outlet volume range "
               "(store) as the placeholder demand scale, open hours and days, the hourly demand shape, day-type multipliers, station seconds, "
               "staffing rule and minimum crews (sim/counter.js, unchanged).</p>")
    out.append("<h5>Method (sim/newmarket.js)</h5>")
    out.append("<p><b>Score</b>: each feature min-max scaled across the areas (turned round for competitors and rent), weighted mean out of 100. "
               "<b>Sensitivity</b>: each weight dropped, then doubled, one at a time. <b>Counter</b>: equipment sized for the base scenario; "
               "realised demand reaches the peak hour as a multiplier on the base arrivals; without AI, one crew all day, set for a normal day's "
               "planned peak; with AI, the forecast roster for the day type, the forecast missing realised demand by the stated error. "
               "<b>Contribution</b>: served cups x price x margin, less labour, machine units, rent and utilities, a day; the peak-hour walk-away "
               "share is applied to the busiest hours, other hours assumed served. <b>Worst case</b>: the lowest year-average contribution over "
               "demand scenarios and forecast errors, with AI staffing.</p>")
    out.append("<h5>Claims we did not make</h5>")
    out.append("<p>No Australian data and no Chagee data are used. The areas are archetypes, not suburbs. The score is not a sales forecast; "
               "the supervised site model is not validated for Australia. No figure on the new-market slides feeds the main story or the benefit.</p>")
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
                        f'<td><b>{", ".join(STEP[s] for s in mixed)}</b>. A scenario of ours (slides 09 and 10), not Chagee\'s disclosed setup</td>'
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
    "c2": lambda x: f"{x:.2f}",
    "mn": lambda x: f"{x / 1e6:,.0f} million",
    "g1": lambda x: f"{x:.1f}",
    "sgm": lambda x: f"{'−' if x < 0 else ''}S${abs(x) / 1e6:.1f}m",
    "sgm2": lambda x: f"{'−' if x < 0 else ''}S${abs(x) / 1e6:.2f}m",
    "sgk": lambda x: f"{'−' if x < 0 else ''}S${abs(x) / 1e3:,.0f}k",
}


def fill(text: str, vals: dict) -> str:
    def rep(m):
        path, fmt = m.group(1), m.group(2) or "int"
        if path not in vals:
            raise SystemExit(f"build: unknown placeholder {{{{{path}}}}}")
        return vals[path] if isinstance(vals[path], str) else FMT[fmt](vals[path])
    return re.sub(r"\{\{([a-zA-Z_][\w.]*)(?:\|(\w+))?\}\}", rep, text)


ALLOWED = re.compile(r"(?i:\bslides?\s+\d\db?(?:\s*(?:,|and|to|–)\s*\d\db?)*)|\bM[1-3]\b|Item 3\.D|\bslides? 3\d\b|\b8[A-D]\b|\b(?:19|20)\d\d\b|OPIM\s?639|Topic \d|\bT\d\b|\b0[1-9]b?\b|\b10b\b|\b1\d(?= ·)|\bslides? 1\d\b|Week \d|\b1 (?=company|counter)|Group \d|Form 20-F|Proposal \d|Gate \d")


def digit_check(tpl: str) -> None:
    body = tpl.split("<body", 1)[1]
    body = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>|<!--[\s\S]*?-->", " ", body)
    body = re.sub(r'<span class="(?:n|num)">\d</span>', " ", body)              # step numbers
    body = re.sub(r'<span class="no">(?:\d\d(?:–\d\d)?|8[A-D]|M[1-3])</span>', " ", body)        # agenda chapter numbers
    body = re.sub(r"\{\{[^}]*\}\}|\{img:[\w]+\}|<[^>]*>", " ", body)        # placeholders, tags (with attributes)
    bad = [m for m in re.finditer(r"\d", ALLOWED.sub(" ", body))]
    if bad:
        ctx = sorted({ALLOWED.sub(" ", body)[max(0, m.start() - 30):m.end() + 30].strip() for m in bad})
        raise SystemExit("build: typed digits in slide text (use a placeholder):\n  " + "\n  ".join(ctx))


def build() -> Path:
    d = ensure_data()
    # the GM's decisions, recomputed from sim/ on every build (not read from data.json)
    subprocess.run(["node", str(HERE / "check_decisions.js"), str(DATA)], check=True, cwd=ROOT)
    tpl = TEMPLATE.read_text(encoding="utf-8")
    digit_check(tpl)
    vals = values(d)
    html = fill(tpl, vals)
    imgs = images()
    # slide 09's video: the WebM (VP9) is embedded so the deck plays it anywhere, including VS Code's preview,
    # which lacks H.264; the MP4 in media/ is the second source. Poster: the render's last sim frame.
    VOUT = ROOT / "video" / "out"
    for f in ("counter_comparison.webm", "counter_comparison.mp4", "poster.png"):
        if not (VOUT / f).exists():
            raise SystemExit(f"build: slide 09's video needs video/out/{f}; run node video/render.js (--webm for the WebM only)")
    imgs["counter_poster"] = "data:image/png;base64," + base64.b64encode((VOUT / "poster.png").read_bytes()).decode()
    html = html.replace("{media:counter_webm}", "data:video/webm;base64," + base64.b64encode((VOUT / "counter_comparison.webm").read_bytes()).decode())
    html = re.sub(r"\{img:(\w+)\}", lambda m: imgs[m.group(1)], html)
    mx = mb_appendix(d)
    html = html.replace("<!--SQAPPX-->", sq_appendix(d))
    html = html.replace("<!--OPSAPPX-->", ops_appendix(d))
    p2 = p2_steps()
    html = html.replace("<!--P2XSTEPS-->", p2[0]).replace("<!--P2XPAGE-->", p2[1]).replace("<!--TPXPAGE-->", tp_page(d))
    ps = p1_steps()
    html = html.replace("<!--P1XSTEPS-->", ps[0]).replace("<!--P1XPAGE-->", ps[1])
    oa = online_appendix(d)
    html = html.replace("<!--ONLAPPX1-->", oa[0]).replace("<!--ONLAPPX2-->", oa[1])
    html = html.replace("<!--MBAPPX1-->", mx[0]).replace("<!--MBAPPX2-->", mx[1]).replace("<!--MBAPPX3-->", mx[2])
    html = html.replace("<!--APPENDIX-->", appendix()).replace("<!--NMAPPENDIX-->", nm_appendix()).replace("<!--TIERS-->", tiers_table())
    js = "\n".join((ROOT / "sim" / f).read_text(encoding="utf-8") for f in ("sim.js", "store.js", "counter.js", "sitepick.js", "ladder.js", "benefit.js", "siteext.js", "sitemodel.js", "newmarket.js", "pnl.js", "members.js", "squadcast.js", "crewtool.js", "toppings.js"))
    js += "\n" + (HERE / "deck.js").read_text(encoding="utf-8")
    payload = {"RAW": RAW, "DATA": d, "GEO": json.loads((ROOT / "sim" / "sg_geo.json").read_text(encoding="utf-8")),
               "MAP": imgs["sg_map_crop"],
               "TIERS": json.loads((ROOT / "machine_tiers.json").read_text(encoding="utf-8"))}
    html = html.replace("/*__DATA__*/", "window.STORY=" + json.dumps(payload, ensure_ascii=False).replace("</", "<\\/") + ";")
    html = html.replace("/*__JS__*/", js.replace("</script", "<\\/script"))
    OUT.write_text(html, encoding="utf-8")
    # slide 09's Visual toggle plays the rendered counter video; it is served next to the deck, not embedded
    MEDIA = HERE / "media"; MEDIA.mkdir(exist_ok=True)
    for src, dst in ((ROOT / "video" / "out" / "counter_comparison.mp4", "counter_comparison.mp4"), (ROOT / "video" / "out" / "poster.png", "counter_poster.png")):
        if not src.exists():
            raise SystemExit(f"build: slide 09's video needs {src.relative_to(ROOT)}; render it with video/render.js")
        shutil.copyfile(src, MEDIA / dst)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB)")
    return OUT


if __name__ == "__main__":
    out = build()
    if "--open" in sys.argv:
        webbrowser.open(out.as_uri())
