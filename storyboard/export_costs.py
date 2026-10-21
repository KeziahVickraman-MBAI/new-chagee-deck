"""Export every number the storyboard uses to cost.md, for the team to build revenue and cost tables.

    python3 storyboard/build_storyboard.py     # refreshes storyboard/build/data.json if inputs changed
    python3 storyboard/export_costs.py         # writes cost.md at the repo root

Reads assumptions.json (every input), storyboard/build/data.json (the precomputed results) and the build's named
values (the figures the slides quote). Counter cost by setup and day type comes from sim/counter.js, run once in Node.
Nothing is typed here: change assumptions.json, rebuild, rerun.
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
import build_storyboard as B  # noqa: E402

RAW = json.loads((ROOT / "assumptions.json").read_text(encoding="utf-8"))
D = json.loads((HERE / "build" / "data.json").read_text(encoding="utf-8"))
V = B.values(D)
OUT = ROOT / "cost.md"

# where each section is used on the slides (for the team's orientation)
USED_ON = {
    "store": "every counter and benefit slide; slide 10 volume", "demand": "forecast uncertainty (engine; not on current slides)",
    "surge": "busy and event days: slides 08, 09 and the benefit slide", "stations": "counter replica: slides 08, 09", "people": "counter replica and staffing rule",
    "costs": "labour and machine cost everywhere in Singapore", "service": "walk-away rule", "provision": "milk stock (engine)",
    "benefit": "the benefit slide (things to consider, TBC)", "business_case": "AI platform cost in the business case (engine)", "staffing": "roster rules (engine)",
    "simulation": "seeds and draws", "triggers": "volume trigger (engine)", "illustration": "bucket-brigade animation", "validation": "tests and checks",
    "storyboard": "price, margin, day types, split table: slides 08-10 and things to consider", "sitepick": "slide 10 site forecast", "site_ext": "four scores, supervised site model, pin to profit (things to consider)",
    "new_market": "new-market slides, Australia (A$; things to consider)", "pnl": "slide 10 P&L view and its appendix page", "members": "slides 05-07, part one: grow demand",
    "predict": "forecast toggle (engine)", "predict_toggles": "forecast toggle (engine)",
}


def status(src) -> str:
    s = str(src or "")
    ids = [w.strip(" ,;()") for w in s.replace(",", " ").split() if w[:2] in ("L-", "P-", "I-", "C-")]
    if ids:
        kinds = {"L-": "sourced", "P-": "sourced (press / price check)", "I-": "team or informal source", "C-": "course material"}
        return f"{kinds[ids[0][:2]]}: {', '.join(ids)}"
    if "assumption" in s.lower() or not s:
        return "assumption"
    return s


def fmt(v, limit=1600) -> str:
    if isinstance(v, float):
        t = f"{v:,.4f}".rstrip("0").rstrip(".")
    elif isinstance(v, int) and not isinstance(v, bool):
        t = f"{v:,}"
    elif isinstance(v, (list, dict)):
        t = json.dumps(v, ensure_ascii=False)
    else:
        t = str(v)
    t = t.replace("|", "\\|").replace("\n", " ")
    return t if len(t) <= limit else t[:limit] + f"… ({len(t):,} characters; see assumptions.json)"


def money(x, cur="S$") -> str:
    return f"{'−' if x < 0 else ''}{cur}{abs(x):,.0f}"


def counter_costs() -> dict:
    """sim/counter.js dayCost for every named split and day type, plus the peak crew, machine units and labour hours."""
    js = r"""
    const Sim = require("./sim/sim.js"), C = require("./sim/counter.js"), RAW = require("./assumptions.json"), TIERS = require("./machine_tiers.json");
    const P = Sim.params(RAW), pr = C.presets(RAW, P);
    pr.single = { label: "One machine (tea and milk)", robots: TIERS.tiers.find(t => t.id === "single").replaces };
    const out = {};
    for (const [k, p] of Object.entries(pr)) { const c = C.configure(P, p.robots); out[k] = { label: p.label, robots: c.robots, setup: c.setup, days: {} };
      for (const d of Object.keys(P.surgeMult)) { const F = C.forecastDay(Sim, c.P, d, c.setup), x = C.dayCost(Sim, c.P, c.setup, d);
        out[k].days[d] = { peakStaff: F.peakStaff, labourHours: x.labourHours, labour: x.labour, units: x.machineUnits, machine: x.machine, total: x.total }; } }
    console.log(JSON.stringify(out));
    """
    return json.loads(subprocess.run(["node", "-e", js], cwd=ROOT, check=True, capture_output=True, text=True).stdout)


def main() -> None:
    A = lambda s, k: RAW[s][k]["value"]
    L = []
    w = L.append
    sg = RAW["storyboard"]
    days = A("store", "open_days_per_year")
    cups_year = A("store", "cups_per_store_per_year")
    cups_day = cups_year / days
    price, margin = A("storyboard", "price_per_cup"), A("storyboard", "gross_margin_per_cup")
    wage, unit_month = A("costs", "labour_cost_per_hour"), A("costs", "machine_cost_per_unit_per_month")
    X = RAW["site_ext"]
    rent, util, deliv, comm, setup = (A("site_ext", k) for k in ("rent_per_month", "utilities_per_month", "delivery_share_of_cups", "delivery_commission_share", "setup_cost"))
    maint = A("pnl", "store_maintenance_per_month")
    busy_d, event_d = A("storyboard", "busy_days_per_year"), A("storyboard", "event_days_per_year")
    normal_d = days - busy_d - event_d
    CC = counter_costs()
    disp = {**RAW["storyboard"]["split_presets"].get("display_labels", {}), "today": "Today's split (our scenario)"}   # the deck's display names
    for k, x in CC.items():
        x["label"] = disp.get(k, x["label"])
    ppl = lambda n: f"{n} {'person' if n == 1 else 'people'}"
    DL = A("storyboard", "day_type_labels")

    w("# Cost and revenue inputs: Chagee storyboard deck")
    w("")
    w(f"Generated {date.today().isoformat()} from `assumptions.json` and the model outputs. **Do not edit this file by hand**: change "
      "`assumptions.json`, then rerun the two commands below, and every number here and in the deck updates together.")
    w("")
    w("```bash")
    w("python3 storyboard/build_storyboard.py   # rebuilds the deck and refreshes the model outputs")
    w("python3 storyboard/export_costs.py       # rewrites this file")
    w("```")
    w("")
    w("Money is **S$ (SGD)**, Singapore as the reference market, unless a line says **A$** (the Australia slides, under things to consider). "
      f"USD figures approved earlier were converted at {A('_meta', 'fx_sgd_per_usd')} SGD per USD (section 5, _meta).")
    w("")
    w("## 1. How to read the status column")
    w("")
    w("| Status | Meaning | Can we quote it as fact? |")
    w("|---|---|---|")
    w("| sourced (L-…) | From a public document; the source is listed in section 7 | Yes, with the source |")
    w("| sourced (press / price check, P-…) | Press article or a price we checked | Yes, as \"reported\" |")
    w("| team or informal source (I-…) | Team research or an anonymised Chagee contact | No: \"according to an informal source, to confirm\" |")
    w("| course material (C-…) | OPIM639 slides | As the course model |")
    w("| assumption | Our illustrative input, **not Chagee data** | No: say \"we assume\" |")
    w("")
    w("Almost every cost is an assumption. Chagee does not publish outlet-level costs, wages, rents or machine prices.")
    w("")

    # ---- 2. starter table
    w("## 2. Starter revenue and cost table: one Singapore outlet, base case")
    w("")
    w("Copy these into the team's sheet. The **Formula** column shows how each line is built, so you can change one input and recompute.")
    w("")
    w("| Line | Value | Unit | Formula or key in `assumptions.json` | Status |")
    w("|---|---|---|---|---|")
    rows = [
        ("Cups per outlet per year", f"{cups_year:,}", "cups", "store.cups_per_store_per_year (range " + fmt(RAW['store']['cups_per_store_per_year']['range']) + ")", status(RAW["store"]["cups_per_store_per_year"]["source"])),
        ("Open days per year", f"{days}", "days", "store.open_days_per_year", status(RAW["store"]["open_days_per_year"]["source"])),
        ("Open hours per day", f"{A('store', 'open_hours_per_day')}", "hours", "store.open_hours_per_day", status(RAW["store"]["open_hours_per_day"]["source"])),
        ("Cups per day", f"{cups_day:,.1f}", "cups", "cups per year ÷ open days", "derived"),
        ("Price per cup, in store", f"S${price:.2f}", "S$", "storyboard.price_per_cup (range " + fmt(sg['price_per_cup']['range']) + ")", status(sg["price_per_cup"]["source"])),
        ("Gross margin per cup", f"{margin:.0%}", "share of price", "storyboard.gross_margin_per_cup (range " + fmt(sg['gross_margin_per_cup']['range']) + ")", status(sg["gross_margin_per_cup"]["source"])),
        ("Ingredients and packaging", f"{1 - margin:.0%}", "share of price", "1 − gross margin", "derived"),
        ("Share of cups via delivery apps", f"{deliv:.0%}", "share of cups", "site_ext.delivery_share_of_cups", status(X["delivery_share_of_cups"]["source"])),
        ("Delivery platform commission", f"{comm:.0%}", "share of delivery revenue", "site_ext.delivery_commission_share", status(X["delivery_commission_share"]["source"])),
        ("Labour cost per hour worked, fully loaded", f"S${wage:.2f}", "S$ an hour", "costs.labour_cost_per_hour (range " + fmt(RAW['costs']['labour_cost_per_hour']['range']) + ")", status(RAW["costs"]["labour_cost_per_hour"]["source"])),
        ("Machine cost per station unit per month", f"S${unit_month:,.2f}", "S$ a month", "costs.machine_cost_per_unit_per_month (range " + fmt(RAW['costs']['machine_cost_per_unit_per_month']['range']) + "); includes machine maintenance", status(RAW["costs"]["machine_cost_per_unit_per_month"]["source"])),
        ("Rent", money(rent), "S$ a month", "site_ext.rent_per_month", status(X["rent_per_month"]["source"])),
        ("Utilities", money(util), "S$ a month", "site_ext.utilities_per_month", status(X["utilities_per_month"]["source"])),
        ("Store maintenance (premises)", money(maint), "S$ a month", "pnl.store_maintenance_per_month (range " + fmt(RAW['pnl']['store_maintenance_per_month']['range']) + ")", status(RAW["pnl"]["store_maintenance_per_month"]["source"])),
        ("Set-up cost (fit-out, equipment, deposits)", money(setup), "S$ one-off", "site_ext.setup_cost (range " + fmt(X['setup_cost']['range']) + "); kept out of operating costs", status(X["setup_cost"]["source"])),
        ("Day mix", f"{normal_d} normal · {busy_d} busy · {event_d} event", "days a year", "open days − storyboard.busy_days_per_year − storyboard.event_days_per_year", "assumption"),
        ("Busy and event day multipliers", fmt(A("surge", "surge_multiplier")), "× cups in the busiest hours", f"surge.surge_multiplier, on the {A('surge', 'surge_hours')} busiest hours", status(RAW["surge"]["surge_multiplier"]["source"])),
    ]
    for r in rows:
        w("| " + " | ".join(r) + " |")
    w("")

    # ---- worked annual example per counter setup
    w("### Worked example: one outlet, one year, by counter setup")
    w("")
    w("Revenue is the same for every setup (same cups; walk-aways left out here). Counter cost is labour hours from the staffing rule "
      "(`sim/counter.js`, the forecast roster for each day type) × wage, plus machine units × monthly cost × 12. "
      "This is a simple yearly view for the team's table, not a figure the deck quotes.")
    w("")
    rev = cups_year * price
    cogs, dlv = rev * (1 - margin), rev * deliv * comm
    fixed = (rent + util + maint) * 12
    keys = ["all_hand", "today", "single", "heading", "all_robot"]
    w("| Line (S$ a year) | Formula | " + " | ".join(CC[k]["label"] for k in keys) + " |")
    w("|---|---|" + "---|" * len(keys))
    yr = lambda k, f: sum(CC[k]["days"][d][f] * n for d, n in (("none", normal_d), ("moderate", busy_d), ("large", event_d)))
    line = lambda lab, form, vals: w(f"| {lab} | {form} | " + " | ".join(vals) + " |")
    line("Revenue", "cups a year × price", [money(rev)] * len(keys))
    line("− Ingredients and packaging", "revenue × (1 − margin)", [money(-cogs)] * len(keys))
    line("− Delivery commission", "revenue × delivery share × commission", [money(-dlv)] * len(keys))
    line("= Contribution", "", [money(rev - cogs - dlv)] * len(keys))
    line("Labour hours a year", "staffing rule, by day type", [f"{yr(k, 'labourHours'):,.0f}" for k in keys])
    line("− Labour", "hours × wage", [money(-yr(k, "labour")) for k in keys])
    line("Machine units", "plan() sizing", [f"{CC[k]['days']['none']['units']}" for k in keys])
    line("− Machines", "units × monthly cost × 12", [money(-yr(k, "machine")) for k in keys])
    line("− Rent, utilities, maintenance", "(rent + utilities + maintenance) × 12", [money(-fixed)] * len(keys))
    line("= Operating profit, before depreciation, interest and tax", "", [money(rev - cogs - dlv - yr(k, "labour") - yr(k, "machine") - fixed) for k in keys])
    w("")
    w(f"Set-up cost {money(setup)} is a one-off investment, not in the lines above. Payback = set-up ÷ yearly operating profit.")
    w("")

    # ---- Australia and Members starters
    N = RAW["new_market"]
    w("### Australia starter, A$ (new-market slides, things to consider): every input is a scenario assumption, not sourced")
    w("")
    w("| Line | Value | Unit | Key | Range |")
    w("|---|---|---|---|---|")
    for k in ("price_per_cup", "wage_per_hour", "machine_cost_per_unit_per_month", "utilities_per_month"):
        w(f"| {k.replace('_', ' ')} | A${N[k]['value']:,} | {N[k]['unit']} | `new_market.{k}` | {fmt(N[k]['range'])} |")
    for a in N["areas"]["value"]:
        w(f"| rent, area {a['id']} ({a['name']}) | A${a['rent_month']:,} | A$ a month | `new_market.areas` | |")
    dm = N["day_mix"]["value"]
    w(f"| gross margin | {margin:.0%} | share of price | reused `storyboard.gross_margin_per_cup` | |")
    w(f"| day mix | {days - sum(dm.values())} normal · {dm['moderate']} busy · {dm['large']} event | days a year | `new_market.day_mix` | |")
    w(f"| demand scenarios | {D['newMarket']['runs']['demand']['low']:,.0f} / {D['newMarket']['runs']['demand']['base']:,.0f} / {D['newMarket']['runs']['demand']['high']:,.0f} | cups a day, low / base / high | Singapore per-outlet range reused as a placeholder | |")
    w("")
    M = RAW["members"]
    w("### Members starter (slides 05 to 07): assumptions, not Chagee data")
    w("")
    w("| Line | Value | Unit | Key | Range |")
    w("|---|---|---|---|---|")
    for k in ("group_credit_share", "base_group_orders_per_member_month", "extra_orders_per_member_month"):
        w(f"| {k.replace('_', ' ')} | {M[k]['value']:g} | {M[k]['unit']} | `members.{k}` | {fmt(M[k]['range'])} |")
    w(f"| contribution per member a month | price × (margin × extra − credit × (anyway + extra)) | S$ | at the defaults: S${D['members']['breakEven']['mid']['netPerMember']:.2f} | |")
    w("")

    # ---- 3. counter cost per day
    w("## 3. Counter cost per day, by setup and day type (S$)")
    w("")
    w("From `sim/counter.js` `dayCost`: the forecast roster for that day type, machine units sized for an average outlet.")
    w("")
    w("| Setup | Robots on | Day type | Peak crew | Labour hours | Labour | Machine units | Machines | Total a day |")
    w("|---|---|---|---|---|---|---|---|---|")
    for k in keys:
        for d in ("none", "moderate", "large"):
            x = CC[k]["days"][d]
            w(f"| {CC[k]['label']} | {', '.join(CC[k]['robots']) or 'none'} | {DL[d]} | {x['peakStaff']} | {x['labourHours']} | {money(x['labour'])} | {x['units']} | {money(x['machine'])} | {money(x['total'])} |")
    w("")
    w("The split table on slide 09 adds people above this roster where needed to keep peak walk-aways within "
      f"{A('storyboard', 'walkaway_target'):.0%}; its costs per day:")
    w("")
    w("| Split | " + " | ".join(DL[d] for d in ("none", "moderate", "large")) + " |")
    w("|---|---|---|---|")
    for k in ("today", "heading", "all_hand", "all_robot"):
        cells = []
        for d in ("none", "moderate", "large"):
            r = D["splits"][d][k]
            cells.append(f"{money(r['cost']['total'])} ({ppl(r['staff']) if r['setup'] != 'all_machine' else 'attendant only'})" if r["meets"] else "over the limit")
        w(f"| {CC[k]['label']} | " + " | ".join(cells) + " |")
    one = D["decisions"]["automate"]["perDay"]
    w(f"| {CC['single']['label']} | " + " | ".join(f"{money(one[d]['single']['cost'])} ({ppl(one[d]['single']['staff'])})" for d in ("none", "moderate", "large")) + " |")
    w("")

    # ---- 4. figures the slides quote
    w("## 4. Results the slides quote (outputs, not inputs)")
    w("")
    w("These come out of the models. Quote them as \"in our model\".")
    w("")
    q = lambda k, f=lambda x: f"{x:,.0f}": f(V[k]) if k in V else "–"
    pc = lambda x: f"{x:.0%}"
    pc1 = lambda x: f"{x:.1%}"
    S = [
        ("10 · new outlet, suggested site", "cups a day sold / moved from nearby / net for Chagee", f"{q('r.top_cups')} / {V['r.top_cups'] - V['r.top_net']:,.0f} / +{q('r.top_net')}"),
        ("10 · same outlet beside the nearest existing outlet", "cups a day sold / net for Chagee", f"{q('r.nd_cups')} / +{q('r.nd_net')} ({pc(V['r.nd_moved'])} moved)"),
        ("10 P&L · five years, without AI", "net extra network sales / operating profit", f"{money(V['r.pnl_wo_rev5'])} / {money(V['r.pnl_wo_op5'])}"),
        ("10 P&L · five years, with AI site selection", "net extra network sales / operating profit / payback", f"{money(V['r.pnl_wi_rev5'])} / {money(V['r.pnl_wi_op5'])} / {V['r.pnl_wi_payback']:.1f} years"),
        ("10 P&L · uplift", "sales / operating profit over five years", f"{money(V['r.pnl_up_rev5'])} / {money(V['r.pnl_up_op5'])}"),
        ("08 · event day, walk-aways at the forecast roster", "brigade / fixed best / fixed worst", f"{pc1(V['r.lost_brigade'])} / {pc1(V['r.lost_fixed_best'])} / {pc1(V['r.lost_fixed_worst'])}"),
        ("08 · normal-day roster on an event day", "walk-aways", pc(V["r.lost_normal_roster"])),
        ("09 · one tea-and-milk machine vs today's split", "S$ a day, range across day types", f"S${V['r.dec_single_lo']:,.0f}–{V['r.dec_single_hi']:,.0f} vs S${V['r.dec_today_lo']:,.0f}–{V['r.dec_today_hi']:,.0f}"),
        ("09 · machine unit cost at which that flips", "S$ a month", f"about {money(V['r.dec_be'])}"),
        ("To consider · pin to profit, site A, a month", "net profit to Chagee / payback", f"{money(D['siteExt']['month']['net'])} / {D['siteExt']['payback']['base']:.0f} months"),
        ("To consider · benefit per outlet (TBC)", "orders kept a year / their revenue / total yearly benefit (mostly counter labour saved, so larger than the revenue)", f"{q('r.ben_orders')} / {money(V['r.ben_year_rev'])} / {money(V['r.ben_profit'])}"),
        ("To consider · Australia, worst-case year-average day (A$)", "machine-made drink / human-only", f"A${V['x.nm_worst_mdd']:,.0f} / A${V['x.nm_worst_hand']:,.0f}"),
        ("To consider · Australia, machine unit cost at which human-only wins (A$)", "A$ a month", f"about A${V['x.nm_flip_machine']:,.0f}"),
        ("To consider · Australia, break-even cups a day (A$ costs)", "machine-made drink / human-only", f"{q('x.nm_be_mdd')} / {q('x.nm_be_hand')}"),
        ("07 · group-order credit break-even", "extra orders per member a month at 50 / 60 / 70% margin",
         f"{V['x.mb_be_low']:.2f} / {V['x.mb_be_mid']:.2f} / {V['x.mb_be_high']:.2f}"),
    ]
    w("| Slide | What | Value |")
    w("|---|---|---|")
    for r in S:
        w("| " + " | ".join(r) + " |")
    w("")
    w("### Slide 10 P&L, year by year (S$, base scenario)")
    w("")
    w("| Year | Without AI: net sales | Without AI: operating profit | With AI: net sales | With AI: operating profit |")
    w("|---|---|---|---|---|")
    for a, b in zip(D["pnl"]["wo"]["base"]["years"], D["pnl"]["wi"]["base"]["years"]):
        w(f"| {a['y']} | {money(a['netRev'])} | {money(a['opProfit'])} | {money(b['netRev'])} | {money(b['opProfit'])} |")
    w("")
    T = D["pnl"]["wi"]["base"]["total"]
    w("Five-year cost lines, with AI site: " + ", ".join(f"{lab} {money(T[k])}" for lab, k in (
        ("new-store sales", "revNew"), ("displaced sales", "revMoved"), ("ingredients and packaging", "cogs"), ("delivery commission", "delivery"),
        ("labour", "labour"), ("machines", "machine"), ("rent", "rent"), ("utilities", "utilities"), ("maintenance", "maint"),
        ("contribution lost at nearby outlets", "lostContrib"), ("AI recurring", "aiRec"))) + ".")
    w("")

    # ---- 5. every assumption
    w("## 5. Every assumption, by section")
    w("")
    w("Every input in `assumptions.json`. **Key** is the path to change; **Range** is what we test in sensitivity; **Notes** says why the number is what it is.")
    w("")
    meta = RAW["_meta"]
    w("### _meta")
    w("")
    for k, x in meta.items():
        if k == "conventions":
            continue
        w(f"- **{k}**: {fmt(x['value'] if isinstance(x, dict) and 'value' in x else x, 400)}" + (f" ({x.get('unit')}; {status(x.get('source'))}) {x.get('rationale', '')}" if isinstance(x, dict) and "value" in x else ""))
    w("")
    for sec, body in RAW.items():
        if sec.startswith("_") or sec == "facts":
            continue
        w(f"### {sec}" + (f" · used on: {USED_ON[sec]}" if sec in USED_ON else ""))
        w("")
        note = body.get("_note")
        if isinstance(note, dict):
            w(f"> {fmt(note.get('rationale') or note.get('value'), 600)}")
            w("")
        w("| Key | Value | Unit | Range | Status | Notes |")
        w("|---|---|---|---|---|---|")
        for k, x in body.items():
            if k == "_note" or not isinstance(x, dict) or "value" not in x:
                continue
            w(f"| `{sec}.{k}` | {fmt(x['value'])} | {fmt(x.get('unit') or '', 600)} | {fmt(x.get('range')) if x.get('range') is not None else ''} | {status(x.get('source'))} | {fmt(x.get('rationale') or '', 4000)} |")
        w("")

    # ---- 6. facts
    w("## 6. Sourced facts (quoted on the slides)")
    w("")
    w("| Key | Value | Unit | Source | Notes |")
    w("|---|---|---|---|---|")
    for k, x in RAW["facts"].items():
        if k == "_note" or not isinstance(x, dict):
            continue
        w(f"| `facts.{k}` | {fmt(x['value'])} | {fmt(x.get('unit') or '', 600)} | {status(x.get('source'))} | {fmt(x.get('rationale') or '', 4000)} |")
    w("")

    # ---- 7. sources
    w("## 7. Sources")
    w("")
    for k, t in RAW["_sources"].items():
        w(f"- **{k}**: {t}")
    w("")

    # ---- 8. gaps
    w("## 8. What we do not have (say so when asked)")
    w("")
    for t in ("Chagee's outlet-level revenue, costs, wages, rents or staffing: none is public; every cost line in section 2 is our assumption except the "
              "labour cost per hour, which we built from Singapore statutory sources.",
              "Chagee's machine or equipment prices: not public; costs.machine_cost_per_unit_per_month is an assumption with a wide range.",
              "Gross margin per cup: our assumption (50 to 70%).",
              "Delivery share of cups and platform commission: assumptions, not sourced.",
              "Australian inputs (new-market slides): all scenario assumptions in A$; no Australian data has been retrieved.",
              "AI implementation and recurring costs (slide 10 P&L): assumptions, all charged to one outlet by default.",
              "Members (slides 05 to 07): every parameter is an illustrative index, not Chagee data; the extra orders squads would bring is what a pilot must measure.",
              "How many stores Chagee plans to open: confidential; nothing in the deck assumes a number."):
        w(f"- {t}")
    w("")
    OUT.write_text("\n".join(L), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({len(L):,} lines)")


if __name__ == "__main__":
    main()
