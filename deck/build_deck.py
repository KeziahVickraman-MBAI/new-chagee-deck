r"""
build_deck.py  -  OPIM639 group deck on Chagee's overseas expansion.

    python deck/build_deck.py          # writes deck/chagee_deck.html
    python deck/build_deck.py --open   # ...and opens it

Title slide + 5 content slides (1280 x 720, scaled to fit; F full screen, N notes, E edit).
Structure, toolbar, notes, edit mode and Download follow reference/week6.

Numbers
  * Every number in the slide text is a placeholder: {{section.key|fmt}} reads
    assumptions.json, {{sim.name|fmt}} reads the simulator output. The build fails
    if any text field contains a raw digit outside a short allow-list (years,
    "Week n", course code, ledger IDs).
  * Simulator output comes from `node sim/precompute.js`, re-run automatically when
    assumptions.json or sim/ is newer than deck/build/data.json.
  * Slides 2, 3 and 5 compute live in the browser with sim/sim.js (inlined);
    slide 4 reads the precomputed sweeps.

Printing: every slide prints as its own 1280 x 720 page at the settings on screen.
deck/export_pdf.sh writes the PDFs (with and without speaker-notes pages).
"""

from __future__ import annotations

import html
import json
import re
import subprocess
import sys
import webbrowser
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
OUT = HERE / "chagee_deck.html"
DATA = HERE / "build" / "data.json"
A = json.loads((ROOT / "assumptions.json").read_text(encoding="utf-8"))
esc = html.escape


TITLE = dict(
    course="OPIM639 · Innovations & Operations of Intelligent Online Marketplaces",
    title="Chagee: opening overseas stores right",
    topic="One new store: forecast demand, plan the inventory, choose the counter, review",
    group="Group 3",
    members=["Keziah, Jin, Ayumi, Revan"],
)
FOOT = f"OPIM639 · Chagee group project · {TITLE['group']}"     # from the title, so the two never disagree

# ---------------------------------------------------------------------------
# Slide content. Every number is a placeholder; see module docstring.
# ---------------------------------------------------------------------------
CONTENT = [
    dict(
        key="c1", widget="aimap",
        kicker="Context and problem", chapter="context",
        headline="One new store, no local sales history: estimate demand, plan the inventory, choose a counter, then "
                 "update",
        sub="We are opening a store with no local sales history. We need to estimate demand, translate that demand "
            "into an inventory plan, choose a counter configuration, and update those decisions after opening.",
        points=[
            ("trend", "Why it matters for Chagee",
             "{{facts.overseas_stores|int}} overseas stores in {{facts.overseas_markets|int}} markets and about "
             "{{benefit.overseas_stores_per_year|int}} openings planned a year; each commits stock and a counter "
             "before local sales exist."),
            ("phone", "Proposed AI (not built here)",
             "Forecast the whole store's demand from comparable stores, cross-checked by pre-launch app sign-ups, "
             "and validate it against actual sales."),
            ("box", "What this prototype calculates",
             "Synthetic inputs: a demand range, one inventory worked example (fresh milk) and a counter simulation. "
             "Tea, other ingredients and packaging are planned qualitatively. No trained model."),
            ("users", "Who decides",
             "People: teams set the inventory plan and choose the counter from these outputs and local constraints."),
        ],
        explainer_title="Where AI enters a new store's opening",
        caption="Click a step. Today's practice is our reading of public sources and one industry conversation, "
                "not a Chagee statement.",
        steps=[
            ("members", "Members",
             "Members order through the app (our understanding).",
             "Read sign-ups and pre-orders as early demand evidence.",
             "Membership / CRM", "slide {{ref.s2|int}}"),
            ("forecast", "Forecast",
             "Judgement-led by a local General Manager (our reading).",
             "A proposed demand range from member signals, with hype and habit separated by existing-market proxies.",
             "Market-entry leads and GMs", "slide {{ref.s2|int}}"),
            ("stock", "Opening inventory",
             "Direct, standardised sourcing of tea and milk for domestic stores (company release).",
             "Turn the forecast into an item-by-item opening list; size fresh milk with newsvendor logic as the "
             "worked example.",
             "Supply chain / planning", "slides {{ref.inv|int}} and {{ref.s3|int}}"),
            ("counter", "Counter",
             "Moving toward semi-automation: QR-scan dispensing, Chagee Express.",
             "Simulate the counter before the store exists, and flag which inputs would change the choice.",
             "Store format / equipment; franchisees", "slides {{ref.mech|int}} to {{ref.staff|int}}"),
            ("after", "After opening",
             "Not covered by public sources.",
             "Compare actual demand with the range to narrow the next market's forecast.",
             "Market-entry leads", "slide {{ref.playbook|int}}"),
        ],
        printnote="Printed with all five steps shown. Live: click a step to see one at a time.",
        view_kicker="Four gates",
        view_lead="Predict → Provision → Counter → Review.",
        view_body="Scope: the whole store. Each gate states the decision, its evidence, a suggested action, the "
                  "trade-off and what the model cannot establish. Figures are illustrative assumptions.",
        notes=("About 50 seconds. Start with one store: we are opening a store with no local sales history. We need "
               "to estimate demand, translate it into an inventory plan, choose a counter, and update those "
               "decisions after opening. Chagee faces that about {{benefit.overseas_stores_per_year|int}} times a "
               "year abroad. The scope is the whole store: demand for every drink, and an inventory plan for tea, "
               "fresh milk and alternatives, other ingredients, cups, lids and packaging. Be clear about three "
               "layers. The AI we propose would forecast the store's demand from comparable stores, cross-checked "
               "by pre-launch sign-ups; it is not built here. This prototype calculates from synthetic, assumed "
               "inputs: a demand range, one inventory worked example, fresh milk, and a counter simulation. People "
               "make the decisions. The deck walks the four gates: Predict, Provision, Counter, Review."),
        sources="Scale facts and planned openings: L-jiemian. Direct sourcing, HQ distribution: L-prn (company "
                "release). Semi-automation: L-unsw, L-cyberrt. Kuala Lumpur opening day: L-gabgrowth (secondary). "
                "App ordering and GM-led forecasting: I-leeyen (INFORMAL - check with Lee Yen before presenting).",
    ),
    dict(
        key="sc", widget="scope",
        kicker="Scope: what we left out and why", chapter="scope",
        headline="A closed app-to-store channel puts our problem in Topics 3 to 5, not the marketplace topics",
        explainer_title="Eight course topics: click one to see why it is in or out",
        topics=[
            (1, "Introduction to Online Retailing", "out", "",
             "One closed channel, app to store: no online-versus-store trade-off to weigh (our reading).",
             "Advantages and disadvantages of online retailing; Wharton case on online book retailing."),
            (2, "Online Marketplaces", "out", "",
             "No third-party sellers, so no sell-versus-fulfilment-service choice (our reading).",
             "Business models: sell on Amazon; fulfillment by Amazon."),
            (3, "Analytics and AI for Online Retailing", "in", "Predict · slide {{ref.s2|int}}",
             "Predicting a new market's demand from app-member signals.",
             "Predicting demand and optimizing price using data; the importance of data in the AI era. "
             "Price optimisation stays out: we have no demand-elasticity assumption."),
            (4, "Supply Chain Management using AI and Robotics", "in", "Provision · Counter",
             "Supply-chain planning turns the forecast into stock; equipment selection sizes the counter.",
             "AI decision making for aggregate supply-chain planning; how to select robotics equipment and AI "
             "technology for effective fulfilment. Used on slides {{ref.inv|int}} and {{ref.s3|int}} (inventory) and slide {{ref.cost|int}} (counter)."),
            (5, "Order Fulfillment for Online Retailing", "in", "Provision · Counter",
             "Preparing the opening inventory, and work shared by people and robots (the bucket brigade).",
             "How to prepare inventory for effective fulfilment; how to perform efficient order-picking using "
             "humans and robots. Used on slides {{ref.inv|int}} and {{ref.s3|int}} (inventory) and slides {{ref.mech|int}} and {{ref.store|int}} (counter)."),
            (6, "Last-mile Delivery for Online Retailing", "unused", "",
             "Outside our question, which stops at the counter.",
             "Planning last-mile delivery using AI; uberization and autonomous vehicles."),
            (7, "Service-oriented platforms", "unused", "",
             "Outside our question.",
             "Differentiating factors, network effects, inventions, mistakes and failures of service-oriented "
             "platforms."),
            (8, "Omni-channel Retailing", "out", "",
             "One channel, so no channel conflict; the franchise revenue share is out of scope.",
             "Omni-channel retailing and distribution; its opportunities and challenges."),
        ],
        where_title="Where does uncertainty land?",
        scenarios=[
            ("rigid", "Rigid sourcing", "Chagee today, our reading",
             [("Sourcing", "Fixed: single origin", 0), ("Distribution", "Fixed: run from HQ", 0),
              ("Opening stock", "Absorbs the miss", 3), ("Counter speed", "Absorbs the miss", 3)]),
            ("local", "Localised sourcing", "For contrast only",
             [("Sourcing", "Flexes with local suppliers", 2), ("Distribution", "Shorter, local", 1),
              ("Opening stock", "Less exposed", 1), ("Counter speed", "Still exposed", 3)]),
        ],
        logic=[
            ("A supply chain is a chain of buffers",
             "Goods flow from suppliers through warehouses to stores. When demand misses the forecast, the miss is "
             "absorbed wherever something can still change in time."),
            ("Rigid: fixed upstream, so the miss lands in the store",
             "Chagee sources tea and milk directly and distributes from HQ for its domestic stores (L-prn); we read "
             "overseas sourcing as standardised too. Origin and routes are set long before opening, so in the first "
             "weeks only the store can react: its opening stock and its counter speed."),
            ("Localised: suppliers nearby can top up",
             "A local supplier can resend stock quickly, so part of a stock miss is absorbed upstream. The counter "
             "still has to serve the queue on the day, so it stays exposed."),
            ("So our slice",
             "We take sourcing as given and work on the two buffers a new store controls: opening stock (Topics 4 and 5, "
             "Provision) and counter speed (Topic 5, Counter)."),
        ],
        where_caption="Why this slice: with sourcing fixed, a demand miss lands in the store, on its opening stock "
                      "or its counter speed (our reading, not a Chagee statement).",
        printnote="Printed: every tile shows its status and reason; both sourcing columns are shown.",
        view_kicker="Our scope",
        view_lead="Three topics, three decisions.",
        view_body="Topic 3 feeds Predict; Topics 4 and 5 feed Provision and Counter. Sourcing is fixed by design, "
                  "so we take it as given, and the franchise revenue share stays out of scope.",
        notes=("About 35 seconds. The course has eight topics. Chagee runs one closed channel, from its app to its "
               "own stores, so the marketplace topics do not arise: no third-party sellers, no fulfilment-service "
               "choice, no channel conflict. Topics 6 and 7 are outside our question. Topics 3, 4 and 5 are where a "
               "new store's risk sits: predicting demand, planning the opening inventory, and choosing people or "
               "robots at the counter. Use the toggle: because Chagee's sourcing is fixed, a demand miss can only "
               "be absorbed in the store, in its opening stock and its counter."),
        sources="Topic names and content: OPIM639 course outline (AY2026-27), weekly lesson plans. Closed channel, "
                "no third-party sellers: brief.md section 3, our reading; app ordering rests on I-leeyen (INFORMAL). "
                "Direct sourcing and HQ distribution: L-prn. Franchise revenue share: out of scope, no figure "
                "claimed.",
    ),
    dict(
        key="s2", widget="band",
        kicker="Predict", chapter="predict",
        headline="Predict: plan on a demand range, not one number, and treat the range as an assumption to test",
        points=[
            ("phone", "Proposed AI: comparable stores first, sign-ups as a cross-check",
             "A model trained on Chagee's existing stores would set the base; app sign-ups would cross-check it. Not "
             "built here: our base is assumed."),
            ("wave", "A narrower range is an assumption to test",
             "The slider narrows it from ±{{demand.uncertainty_no_signal|pct}} to "
             "±{{demand.uncertainty_strong_signal|pct}} by assumption; no evidence yet that member data does this."),
            ("cycle", "Hype versus habit needs a proxy",
             "No repeat history yet: use repeat rates in existing markets or nearby stores. Kuala Lumpur reportedly "
             "sold {{facts.kl_opening_day_cups|int}}+ cups on day one (secondary)."),
            ("alert", "Blind spot: tourists and non-app orders",
             "They sit outside the member signal, so the range runs low where tourists matter."),
        ],
        explainer_title="Demand range before opening: a sensitivity",
        caption="Weekly cups at one new store. The bar is an illustrative {{demand.band_coverage|pct}} demand range: "
                "we assume about that share of outcomes falls inside it.",
        concepts=[("demand", "the whole store's inventory and counter planning", "Prototype: an assumed range, no trained forecast")],
        printnote="Printed at the default assumed signal strength ({{predict.signal_strength_default|pct}}) with "
                  "opening hype removed.",
        gate=dict(
            n=1, name="Predict", who=["entry", "crm"],
            decision="What demand should the whole store's inventory and counter planning assume?",
            action="Plan on about {{sim.band_base|int}} cups a week, within an illustrative {{demand.band_coverage|pct}} "
                   "range of {{sim.band_low|int}} to {{sim.band_high|int}}; treat it as an assumption to test.",
            evidence=[("base", "Base", "{{sim.band_base|int}} cups/week"),
                      ("range", "{{demand.band_coverage|pct}} range", "{{sim.band_low|int}}–{{sim.band_high|int}}"),
                      ("half", "Half-width", "±{{sim.u0|pct1}}")],
            tradeoff="Plan too low: stockouts, queues and lost sales. Plan too high: stock that expires or ties up "
                     "cash, and machines or staff that sit idle.",
            limitation="The range is assumed, not calibrated, and demand can fall outside it. It cannot approve a "
                       "site or show that a store is viable.",
            actions=[
                ("crm", "Before the site is committed, open a pre-launch waitlist and tag each sign-up as new or "
                        "already a Chagee member in another market."),
                ("entry", "Set the base from comparable stores; use sign-ups only to cross-check it. Send the range "
                          "to supply chain (slide {{ref.inv|int}}) and to store format (slide {{ref.playbook|int}})."),
                ("entry", "Widen the range where tourists or walk-ups matter, and back-test it on recent openings "
                          "before narrowing it."),
            ],
            calc=["Base = an assumed comparable-store volume, {{store.cups_per_store_per_year|int}} cups a year over "
                  "{{store.open_days_per_year|int}} open days (synthetic).",
                  "Range = base, plus or minus the half-width. The half-width moves in a straight line from "
                  "±{{demand.uncertainty_no_signal|pct}} with no signal to ±{{demand.uncertainty_strong_signal|pct}} "
                  "with a strong one: an assumption to test, not evidence that membership data improves accuracy.",
                  "On the range alone the counter choice changes only beyond ±{{sim.be_u_all_human_mixed|pct}}."],
        ),
        notes=("About 40 seconds; under time pressure, read only the gate card. Chagee orders go "
               "through the app (our understanding, to be confirmed), so a pre-launch waitlist could be read as a "
               "demand signal. Be clear what the slider is: we assumed that more signal narrows the band, along a "
               "straight line between two end points; we have not shown member data does that. Separating opening "
               "hype from repeat habit also needs a proxy, because a new store has no repeat history: repeat rates "
               "in Chagee's existing overseas markets, nearby stores, or waitlist members who already order "
               "elsewhere. So this is a method to back-test on past openings. Gate card: does the band change "
               "the counter? Barely: mixed overtakes all-human only beyond about "
               "±{{sim.be_u_all_human_mixed|pct}}. The range matters most for the inventory plan, next."),
        sources="App-only ordering with tourist exceptions: I-leeyen (INFORMAL - check before presenting). Kuala "
                "Lumpur opening day: L-gabgrowth (secondary). Existing overseas markets: L-jiemian ({{facts.overseas_markets|int}} markets). "
                "Not novel - AI forecasting and siting: L-starbucks. Band narrowing with signal: assumption "
                "(predict.signal_strength_default, demand.uncertainty_no_signal / _strong_signal). Trigger: sim/ "
                "breakEven over the band half-width, default volume, moderate surge.",
    ),
    dict(
        key="mech", widget="brigade",
        kicker="Counter", chapter="perform",
        headline="Counter flow: people pass work along like a bucket brigade; machines are fixed, so they queue at "
                 "the bottleneck or sit idle",
        points=[
            ("users", "People pass the work along",
             "Each worker carries a drink downstream and hands it over. In a surge the handover point moves, so "
             "the load evens out: one way a crew shares work."),
            ("box", "Machines stay at their station",
             "A fixed station cannot hand work back or take on more. The queue builds at the slowest one, "
             "wherever it sits on the line."),
            ("coins", "Faster in the peak, idle at low volume",
             "Machines can cut the wait in a surge, but sized for the peak they are busy only part of the day, "
             "and idle capacity is what a store pays for."),
        ],
        explainer_title="Counter flow: people and machines in a surge",
        caption="Movement illustration in Week 5 units: not a cost model, not measured times. The store replica is next.",
        concepts=[("brigade", "how much a crew absorbs in a surge", "Illustration with the Week 5 rules"),
                  ("bottleneck", "where a fixed machine line queues", "Illustration and cost model")],
        printnote="Printed at the end of the surge window; the table compares both sizing settings over the full "
                  "run.",
        view_kicker="Our view",
        view_lead="Materials are half of opening; service capacity is the other half.",
        view_body="People flex; machines come in whole units. Next: the same counter in a store replica, then its cost.",
        notes=("About 20 seconds. Materials are half of an opening; the counter is the other half. Two course "
               "concepts. Bucket brigade: people hand a drink along, so in a surge the load evens out. Bottleneck: "
               "machines are fixed, so the queue builds at the slowest one, and sized for the peak they sit idle. "
               "Next, the same idea in a store layout."),
        sources="Bucket-brigade engine: course Week 5 explainer (reference, read-only), wrapped by "
                "sim/mechanism.js. As-sized ratios read from sim/ peakUtilisation and plan. Illustration settings: "
                "assumptions.json illustration (mixed_sizing needs approval).",
    ),
    dict(
        key="store", widget="storefront",
        kicker="Counter", chapter="perform",
        headline="In the peak hour, robots hand over a cup in about {{sim.st_med_all_machine|sec}}; a counter "
                 "like today's takes about {{sim.st_med_mixed|min1}}",
        explainer_title="Store replica: two counters in the peak hour, side by side",
        caption="Illustrative layout after a Chagee tea bar: order right, brewing behind the counter, pick-up left. "
                "Choose each counter; people move as the Week 5 bucket brigade; staff and arrivals from the cost "
                "model.",
        printnote="Printed at minute {{sim.store_print_minute|int}} of the peak hour, moderate surge: people slowest "
                  "first (top) against fastest first (bottom).",
        serve_summary="Time to serve, cost model (median · slowest tenth · lost):",
        serve_title="Time to serve: today versus simulated",
        serve_caption="From order to hand-over, waiting included. Cost model, peak hour, "
                      "{{validation.crossover_stability.seeds|int}} simulated days per bar.",
        serve_printnote="Printed at the moderate surge.",
        view_kicker="Our view",
        view_lead="Robots buy speed in the peak; whether it pays is the next slide.",
        notes=("About 30 seconds. The main counter view: two counters laid out like a Chagee tea bar, same "
               "customers, playing on their own. Top: people as the Week 5 bucket brigade, slowest first, so the "
               "line balances itself. Bottom: fastest first; the fast worker is held back by the slow one, the red "
               "ring, and fewer cups get out. Switch the bottom to All-robot: the cups move, nobody walks. From the "
               "cost model: today's counter hands over a cup in about {{sim.st_med_mixed|min1}} at the median, "
               "all-robot in about {{sim.st_med_all_machine|sec}}. Not measured. Next: what each costs."),
        sources="Semi-automation (machine dispenses the formulation): L-unsw; Chagee Express semi-automated "
                "machine: L-cyberrt. Layout: illustrative, after a Chagee tea-bar storefront (order right, pick-up "
                "left). Animation: sim/store.js (Week 5 brigade rules, illustration.walk_back_speed). Times and lost "
                "orders: sim.js serveTimes, a read-out of the cost model's peak hour. "
                "No measured serve time exists in our sources; the informal sub-one-minute target (I-leeyen) is "
                "not used.",
    ),
    dict(
        key="cost", widget="volcost",
        kicker="Counter", chapter="perform",
        headline="Counter: at our inputs all-human and mixed are {{sim.vc_hm|sgd}} a cup apart, so choose with all "
                 "inputs together",
        explainer_title="Cost per cup, by counter",
        caption="Faster service does not mean a lower cost per cup: at low volume, machine capacity sits unused. "
                "Labour, machines and lost sales per cup served, by steady volume.",
        concepts=[("utilisation", "why idle machines raise the cost per cup", "In the cost model"),
                  ("robotics", "which counter to install", "Compared in the cost model")],
        printnote="Printed at the default forecast.",
        tradeoff_title="One-variable thresholds: which assumptions deserve a closer look",
        tradeoff=["wage", "cupsPerDay", "machineMonth", "u", "coordHuman", "coordMixed", "newShare", "machineMult"],
        confidence=("How sure are we? A close call. The gap is {{sim.vc_hm|sgd}} a cup. Our staffing shortcut misses its "
                    "Week 5 check ({{sim.w5_lo|f1}}% and {{sim.w5_hi|f1}}% against "
                    "±{{validation.week5_comparison.tolerance_pct|int}}%), and with walking modelled people reach only "
                    "{{sim.cap_h|pct}} of the assumed capacity ({{sim.cap_m|pct}} at today's counter). Test the "
                    "ranking with real staffing data before relying on it."),
        gate=dict(
            n=3, name="Counter", who=["format", "ops"],
            decision="Which counter should this store install: all-human, mixed, or full automation?",
            action="All-human is cheaper by {{sim.vc_hm|sgd}} a cup at these inputs: close, but above the "
                   "{{validation.breakeven.tol_cost_sgd_per_cup|sgd}} tie line. Choose using all current inputs "
                   "together.",
            evidence=[("costs", "Cost per cup", "all-human {{sim.vc_h|sgd}} · mixed {{sim.vc_m|sgd}} · "
                                                  "all-robot {{sim.vc_a|sgd}}"),
                      ("busy", "All-robot machines busy", "{{sim.vc_busy|pct}} of open hours")],
            tradeoff="All-human: cheapest here, but depends on trained staff. Machines: faster in the peak, but "
                     "idle and costly when volume is low.",
            limitation="Small gap on a simplified staffing model that misses its Week 5 check "
                       "({{sim.w5_lo|f1}}% and {{sim.w5_hi|f1}}% against ±{{validation.week5_comparison.tolerance_pct|int}}%). "
                       "No measured service times: a candidate to test in a pilot, not an instruction to install.",
            actions=[
                ("format", "Enter the store's expected steady volume, local wage and machine quote into the "
                           "playbook (slide {{ref.playbook|int}})."),
                ("format", "Install the setup the full comparison favours. If the margin is under "
                           "{{validation.breakeven.tol_cost_sgd_per_cup|sgd}} a cup, treat it as a tie and decide "
                           "on service, staffing risk or brand."),
                ("format", "Mixed means machines at {{sim.mixed_stations|txt}} with {{sim.staff_m|int}} person at "
                           "the peak; all-human means {{sim.staff_h|int}} staff at the peak (model staffing)."),
                ("ops", "Put the thresholds closest to your inputs on a watch list for Review."),
            ],
            calc=["Cost per cup = (labour + machines + lost sales) ÷ cups served, averaged over "
                  "{{simulation.monte_carlo_draws|int}} simulated stores at the default range and surge.",
                  "One-variable thresholds (right) move one input at a time with the rest at our defaults: they show "
                  "which assumptions deserve closer attention, not a rule to switch setups."],
        ),
        notes=("About 30 seconds; under time pressure, read only the gate card. Speed has a price: faster is not "
               "cheaper per cup. At our forecast of about {{sim.cpd0|int}} cups a day all-human is cheaper, but only "
               "by {{sim.vc_hm|sgd}} a cup, so no default. The table flags the nearest inputs that would change it: "
               "machine cost, staff coordination and the wage, each a few per cent away; volume needs about "
               "{{sim.be_cupsPerDay_all_human_mixed|int}} cups a day. It is a close call on a simplified staffing "
               "model: a candidate to test in a pilot, not an instruction to install equipment."),
        sources="Wage S$ per hour worked, fully loaded: L-mom-pwm, L-mom-ows, L-cpf, L-sdl, L-mom-leave, L-mom-ph. "
                "Costs and break-evens: sim/ cost model and breakEven over cups per day (data.json volumeCurve, "
                "breakEven), default band, moderate surge. All inputs: assumptions.json (illustrative).",
    ),
    dict(
        key="inv", widget="invplan",
        kicker="Provision", chapter="provision",
        headline="Provision: translate the sales forecast into an opening inventory plan",
        chain_title="From forecast to purchase order",
        chain=[
            ("Forecast cups", "The whole store's weekly range (slide {{ref.s2|int}}). Cups alone are not enough: "
                              "drinks use different ingredients."),
            ("Product mix", "Share of each drink and format (size, hot or cold). Requires menu-mix data."),
            ("Recipes and materials", "Ingredient requirement = forecast drink quantities × ingredient amount per "
                                      "drink. Packaging follows orders and formats."),
            ("Deliveries and stock", "The order nets off usable stock and deliveries due, adds expected losses, and "
                                     "fits lead times, shelf life, storage and supplier minimums."),
        ],
        matrix_title="Opening plan by category: qualitative, no quantities",
        matrix_cols=["Item", "What drives its demand", "Main constraint", "Opening decision", "Replenishment",
                     "Needed for a number"],
        matrix=[
            ("Tea leaves", "Tea drinks in the mix × tea per drink",
             "Sourcing lead time, minimum orders, storage; quality fades with age and handling, so tea also has "
             "waste and quality risk",
             "How much to hold before opening: the opening weeks plus the time a reorder takes to arrive",
             "Reorder when stock reaches usage over the lead time plus a buffer",
             "Recipes · supplier lead time · minimum order · usable life"),
            ("Fresh milk and alternatives", "Milk drinks × milk per drink; alternatives by customer choice",
             "Short shelf life, chilled space, delivery frequency",
             "First fresh-milk delivery: the worked example (slide {{ref.s3|int}})",
             "Each delivery sized on actual sales",
             "Recipes · share of alternative milks · delivery schedule"),
            ("Other ingredients", "Each recipe's amounts",
             "Each has its own shelf life and supplier terms",
             "Plan per recipe and shelf life: perishables like milk, longer-life items like tea",
             "Per item's usage and lead time",
             "Menu recipes · shelf lives · supplier terms"),
            ("Cups, lids, seals, packaging", "Orders by format",
             "Lead time, minimum orders, bulky storage",
             "Cover opening demand plus the reorder lead time: no cup or seal, no sale, even with ingredients ready",
             "Reorder on usage and lead time",
             "Format mix · supplier lead time · storage space"),
        ],
        matrix_note="Origin (imported or local) is not public for overseas stores: Chagee's direct sourcing of tea "
                    "and milk is documented for its domestic operations (L-prn). Quantities, lead times, shelf lives "
                    "and service levels are not in our sources, so none are shown.",
        concepts=[("inventory", "what must be on hand on opening day", "Prototype: fresh milk only"),
                  ("leadtime", "how early each item is ordered", "Explained, not modelled"),
                  ("reorder", "when each item is replenished", "Explained, not modelled")],
        view_kicker="Materials and capacity",
        view_lead="A forecast becomes sales only if the store has both materials and service capacity.",
        view_body="Enough milk is not enough if tea or cups run out. Enough ingredients are not enough if the counter "
                  "cannot serve customers (slides {{ref.mech|int}} to {{ref.cost|int}}). Both use the Predict "
                  "range; the prototype does not optimise them together.",
        gate=dict(
            n=2, name="Provision", who=["supply", "entry"],
            decision="What must be on hand on opening day, what should the first delivery bring, and what is "
                     "replenished later?",
            action="Build the opening list item by item from the demand range: tea, milk and alternatives, other "
                   "ingredients, cups, lids and packaging. Size fresh milk with the worked example.",
            evidence=[("q", "Quantified here", "fresh milk only (slide {{ref.s3|int}})"),
                      ("need", "Needs Chagee data", "menu mix · recipes · lead times · minimum orders")],
            tradeoff="Too little of any one item stops sales. Too much ties up cash and storage, and perishables "
                     "expire or lose quality.",
            limitation="No quantities for tea, other ingredients or packaging: their inputs are not in our "
                       "sources. Inventory and counter are not optimised together.",
            actions=[
                ("supply", "Collect recipes, the expected menu mix, and each supplier's lead time and minimum "
                           "order for the market."),
                ("supply", "Draft the opening list: requirement = forecast drinks × amount per drink, net of stock "
                           "on hand and deliveries already due."),
                ("entry", "Send any change to the demand range, including expected opening hype; supply chain "
                          "recomputes the list."),
                ("ops", "Count stock at opening and log stockouts of every item for Review."),
            ],
            calc=["Ingredient requirement = forecast drink quantities × ingredient amount per drink.",
                  "Purchase order = requirement over the cover period − usable stock − deliveries already due + "
                  "expected losses, rounded to the supplier's minimum and delivery days.",
                  "Reorder point: reorder when stock falls to the usage expected during the lead time, plus safety "
                  "stock for demand above that. Explained here; not implemented in the prototype.",
                  "Implemented in the prototype: the first fresh-milk delivery only (slide {{ref.s3|int}})."],
        ),
        notes=("About 40 seconds. Predict gives us cups for the whole store, but cups alone do not tell us what to "
               "buy: different drinks use different ingredients. So the plan runs from forecast cups, to the product "
               "mix, to recipes, to deliveries. Ingredient requirement is forecast drinks times the amount per "
               "drink; the purchase order then nets off stock on hand and deliveries already due, adds expected "
               "losses, and fits supplier minimums. The table goes item by item. Tea keeps longer than milk, but it "
               "still has lead times, minimum orders and quality that fades, so it is not risk-free. Milk is "
               "perishable: that is our worked example, next. Packaging is easy to forget: no cup or seal, no sale. "
               "We show no quantities: recipes, menu mix, lead times and minimum orders are not in our sources. And "
               "materials are only half: enough ingredients are not enough if the counter cannot serve customers."),
        sources="Direct sourcing of tea and milk, domestic operations: L-prn (company release); overseas origin not "
                "claimed. Demand range: the Predict model (assumptions.json, illustrative). Every other cell: our "
                "qualitative planning logic, no Chagee figure.",
    ),
    dict(
        key="s3", widget="stock",
        kicker="Provision · worked example", chapter="provision",
        headline="Worked example: choosing the first fresh-milk delivery",
        sub="The whole-store plan includes many materials. We use fresh milk to demonstrate the ordering trade-off "
            "because unused stock can expire quickly.",
        points=[
            ("scale", "Decision and method",
             "How much milk should the first delivery bring? Newsvendor logic balances the cost of leftover stock "
             "against the cost of running short."),
            ("coins", "Inputs",
             "The demand range from slide {{ref.s2|int}}; a missed cup costs {{provision.stockout_cost_per_cup|sgd}}, "
             "a wasted litre {{provision.milk_waste_cost_per_litre|sgd}}; shelf life about "
             "{{provision.milk_shelf_life_days|int}} days. Simplification: every cup uses "
             "{{provision.milk_litres_per_cup|f2}} L; real recipes differ."),
            ("moon", "Opening surge or steady demand",
             "The surge is assumed to last {{demand.opening_hype_weeks|int}} weeks, so this delivery falls inside "
             "it: about {{sim.opt_litres_hype|int}} L if the surge is real, {{sim.opt_litres|int}} L on steady "
             "demand."),
        ],
        explainer_title="First fresh-milk delivery calculator",
        caption="Expected cost of the first delivery at one store, using the range from slide {{ref.s2|int}}. Milk costs are "
                "generic: overseas sourcing is not public.",
        concepts=[("newsvendor", "the size of the first fresh-milk delivery", "Implemented for fresh milk")],
        printnote="Printed at the band from slide {{ref.s2|int}} (opening hype removed) and the default of "
                  "{{provision.opening_stock_days|int}} days of stock.",
        gate=dict(
            n=2, name="Provision · fresh milk", who=["supply", "entry"],
            decision="How much fresh milk should the first delivery bring?",
            action="Steady demand: about {{sim.opt_litres|int}} L for the first {{provision.milk_shelf_life_days|int}} "
                   "days. If the expected opening surge is real, about {{sim.opt_litres_hype|int}} L: this delivery "
                   "falls inside it.",
            evidence=[("cost", "Short vs waste, per L", "{{sim.milk_trigger|sgd}} vs {{provision.milk_waste_cost_per_litre|sgd}}"),
                      ("cover", "Order covers", "{{sim.critical_ratio|pct}} of outcomes"),
                      ("waste", "Expected waste", "{{sim.opt_waste_l|int}} L"),
                      ("short", "Expected shortage", "{{sim.opt_short_cups|int}} cups")],
            tradeoff="Order less: more missed cups at {{provision.stockout_cost_per_cup|sgd}} each. Order more: more "
                     "milk thrown away at {{provision.milk_waste_cost_per_litre|sgd}} a litre. A shortage costs more, "
                     "so the order sits above base demand.",
            limitation="Sizes one delivery of one item; it does not optimise the whole inventory. Still runs short "
                       "in about {{sim.short_share|pct}} of outcomes. Generic milk costs, one amount per cup.",
            actions=[
                ("entry", "Say whether the opening surge is expected; size the first delivery on it if so."),
                ("supply", "Place the first delivery at the suggested order, not at the base forecast or the top of "
                           "the range."),
                ("ops", "From the second delivery on, order on actual sales; log waste and shortages for Review."),
            ],
            calc=["Newsvendor logic: order up to the point where the chance of running short equals waste cost ÷ "
                  "(shortage + waste cost) per litre = {{provision.milk_waste_cost_per_litre|sgd}} ÷ "
                  "({{sim.milk_trigger|sgd}} + {{provision.milk_waste_cost_per_litre|sgd}}), so the order covers "
                  "about {{sim.critical_ratio|pct}} of outcomes.",
                  "Shortage cost per litre = {{provision.stockout_cost_per_cup|sgd}} per missed cup ÷ "
                  "{{provision.milk_litres_per_cup|f2}} L per cup, the same for every drink (a simplification).",
                  "The best order is {{sim.opt_days|f1}} days of the demand it is sized on, just above the top of the "
                  "{{demand.band_coverage|pct}} range ({{sim.top_days|f1}} days), because a shortage costs far more "
                  "than waste.",
                  "Surge: opening demand is assumed {{demand.opening_hype_multiplier|x}} steady demand for "
                  "{{demand.opening_hype_weeks|int}} weeks, longer than this {{provision.milk_shelf_life_days|int}}-day "
                  "delivery, so the same calculation on surge demand gives the larger order."],
        ),
        notes=("About 35 seconds; under time pressure, read only the gate card. The whole-store plan includes many "
               "materials; we use fresh milk to show the ordering trade-off because unused milk expires quickly. "
               "Newsvendor logic balances the cost of leftover stock against the cost of running short. A missed "
               "cup costs far more than a wasted litre, so the best order sits above the base forecast. Be clear "
               "about the opening surge: we assume it lasts {{demand.opening_hype_weeks|int}} weeks, longer than "
               "this delivery, so if it is real the order is about {{sim.opt_litres_hype|int}} L, not the "
               "{{sim.opt_litres|int}} L steady demand gives. Limits: one item, one delivery, one milk amount per "
               "cup, generic costs."),
        sources="All figures: assumptions.json (illustrative). Best order: sim/ provision at the Predict range; the "
                "surge order is the same optimum in days of demand applied to opening-week demand. Milk trigger: "
                "sim/ milkTrigger. Overseas milk sourcing: unknown, deliberately not claimed (brief.md section 9).",
    ),
    dict(
        key="a1", widget="a1", kicker="Appendix A1 · assumptions", chapter="appendix",
        headline="Every assumption, with its unit, range and source",
        sections=["facts", "predict", "predict_toggles", "store", "demand", "surge"],
        notes="Handout only. Generated from assumptions.json at build time, so it always matches the deck.",
        sources="assumptions.json.",
    ),
    dict(
        key="a1b", widget="a1", kicker="Appendix A1 · assumptions (continued)", chapter="appendix",
        headline="Every assumption, with its unit, range and source (continued)",
        sections=["stations", "people", "costs", "service", "provision", "benefit"],
        notes="Handout only. Generated from assumptions.json at build time, so it always matches the deck.",
        sources="assumptions.json.",
    ),
    dict(
        key="a1c", widget="a1", kicker="Appendix A1 · assumptions (continued)", chapter="appendix",
        headline="Every assumption, with its unit, range and source (continued)",
        sections=["simulation", "triggers", "illustration", "validation"],
        notes="Handout only. Generated from assumptions.json at build time, so it always matches the deck.",
        sources="assumptions.json.",
    ),
    dict(
        key="a1d", widget="a1", kicker="Appendix A1 · assumptions (continued)", chapter="appendix",
        headline="Every assumption, with its unit, range and source (continued): business case and staffing",
        sections=["business_case", "staffing"],
        notes="Handout only. Generated from assumptions.json at build time. These cost lines are approved illustrative assumptions and feed "
              "only the A4 revenue and cost analysis, never the simulator.",
        sources="assumptions.json.",
    ),
    dict(
        key="a2", widget="a2", kicker="Appendix A2 · model and validation", chapter="appendix",
        headline="The model is stable across seeds but misses its Week 5 check, and a handful of inputs decide "
                 "all-human versus mixed",
        notes="Handout only. Week 5 comparison and seed stability from sim/ tests and precompute; the sensitivity "
              "chart varies one ranged assumption at a time across its approved range.",
        sources="sim/precompute.js: the Week 5 comparison, seed stability, the sensitivity sweep and replica capacity (data.json).",
    ),
    dict(
        key="a3", widget="a3", kicker="Appendix A3 · sources and claims not made", chapter="appendix",
        headline="The source behind every Chagee fact, and the claims we deliberately did not make",
        not_claimed=[
            "That Chagee is first at anything, or that anything is not available in the market.",
            "Any revenue-mix share for franchise supply: sources conflict.",
            "Overseas milk sourcing details: unknown, so milk costs are generic.",
            "A Supply Chain Security Act local-sourcing rule: low-quality source.",
            "Any Chagee internal cost, forecast method or automation plan not in the ledger.",
            "Measured serve times: every time on the store-replica slide is modelled; the observed row is empty.",
            "That member data narrows the forecast band: the narrowing is our assumption, tested as a sensitivity.",
            "That all-human or mixed is proven cheaper: the gap is small and rests on a simplified staffing model.",
            "A saving against today's practice: the benefit is a modelled avoided cost against a standard counter.",
            "Anything about menu prices: that would need a demand-elasticity assumption we do not have.",
            "The informal sub-one-minute fulfilment target from the industry call: not used.",
            "That the prototype contains a trained AI model: it calculates from synthetic, assumed inputs.",
            "That rerunning the model with observed inputs validates it, or proves machines should be added.",
            "That uncertainty never matters for the counter: the finding holds for the scenarios we tested.",
            "Sales revenue or a payback for Chagee: A4 sets modelled avoided cost against approved but illustrative costs.",
            "Quantities, lead times, shelf lives, minimum orders or origin for tea, other ingredients or packaging.",
            "Inventory savings beyond fresh milk: tea, other ingredients and packaging have not been estimated.",
            "That inventory and counter are optimised together: the prototype treats them separately.",
            "That Chagee uses any particular staffing or rostering system: the staffing slide is illustrative.",
        ],
        notes="Handout only. Ledger from assumptions.json _sources; the list of claims not made follows brief.md "
              "section 9 plus the limits found while building the deck.",
        sources="assumptions.json _sources; brief.md section 9.",
    ),
    dict(
        key="a4", widget="a4", kicker="Appendix A4 · revenue and cost analysis", chapter="appendix",
        headline="Over {{business_case.horizon_years|int}} years the modelled savings {{sim.fin_verdict|txt}} (illustrative)",
        notes="Handout only. Benefit lines come from the benefit slide's calculation (sim/ volumeCurve and "
              "provision); cost lines are the approved business-case assumptions (illustrative). No sales revenue is modelled.",
        sources="Openings: L-jiemian (2026 only; held flat after). Benefit: benefit_values in deck/build_deck.py from "
                "data.json. Costs: assumptions.json business_case (approved, illustrative).",
    ),
    dict(
        key="s4", widget="cross",
        kicker="Appendix A2 · the uncertainty sweep", chapter="appendix",
        headline="At a new store’s volume, a mixed people-and-machine counter beats full automation, because "
                 "machines sit idle, not because demand is uncertain",
        sub="We tested the hypothesis that mixed wins only until demand becomes predictable. Our simulator "
            "rejected the uncertainty part.",
        points=[
            ("box", "Machines come in whole units, so they sit idle",
             "Even one machine per station serves about {{sim.machine_cap_hr|int}} cups an hour against a forecast "
             "peak of about {{sim.peak_hr|int}}. The fully automated line is busy only {{sim.busy_lo|pct}} to "
             "{{sim.busy_hi|pct}} of open hours."),
            ("users", "People flex; machines cannot be returned",
             "Rosters follow the hour and the real demand, and staff rebalance across stations like a bucket "
             "brigade. A mixed counter buys {{sim.mixed_units|int}} machines instead of "
             "{{sim.machine_units|int}}, with similar staff hours."),
            ("trend", "Where machines still win",
             "Big surges: at a {{surge.surge_multiplier.large|x}} peak, people-based counters lose about "
             "{{sim.large_lost|pct}} of orders and full automation is cheaper. Also steady high volume, "
             "consistency and labour scarcity."),
        ],
        explainer_title="Cost per cup by counter setup",
        printnote="Printed at the default band (±{{sim.u0|pct1}}) and {{surge.surge_default|txt}} surge.",
        shift_title="What could shift the balance",
        view_kicker="Our view",
        view_lead="Uncertainty did not decide the counter; volume, wage and machine cost do.",
        view_body="All-human ({{sim.cost_h|sgd}}) and mixed ({{sim.cost_m|sgd}} per cup at the default band) are a close "
                  "call settled by the triggers on slide {{ref.cost|int}}. Machine breakdowns are not modelled, which "
                  "flatters automation.",
        notes=("Handout only (appendix). Our starting hypothesis was that a mixed counter beats full automation "
               "until demand becomes predictable. The simulator only half supports it. Mixed does beat full "
               "automation at the default settings, at every level of uncertainty, but the reason is not "
               "uncertainty: machines come in whole units, so the automated line sits idle and its fixed cost is "
               "spread over too few cups. The uncertainty slider barely moves the lines; a large surge does, and "
               "there full automation wins. All-human versus mixed is a close call decided by volume, wage and "
               "machine cost (slide {{ref.cost|int}}). Limits: the pooled staffing formula overstates a real bucket "
               "brigade (our Week 5 check missed its tolerance, gap {{sim.w5_lo|f1}} to {{sim.w5_hi|f1}} percent), and "
               "breakdowns are not modelled."),
        sources="All figures: sim/ with assumptions.json (illustrative). Semi-automation context: L-unsw, L-cyberrt. "
                "Not novel - beverage automation: L-gongcha (company-reported), L-slate; store digital twins: "
                "L-mosimtec. Labour cost floor: L-mom-pwm, L-cpf.",
    ),
    dict(
        key="staff", widget="staffing",
        kicker="Counter · staffing", chapter="perform",
        headline="AI-driven staff optimisation: matching workforce capacity to predicted hourly demand",
        sub="How many people should a store schedule through the day to minimise labour cost while keeping "
            "service acceptable?",
        points=[
            ("alert", "The operational problem",
             "Demand peaks at lunch and in the evening. A fixed crew sized for the busiest hour pays for quiet "
             "hours; a thin crew lets peak queues grow."),
            ("phone", "How AI contributes",
             "AI forecasts each hour's demand (Predict). An optimiser, not AI, then sets the roster: forecasting "
             "and workforce optimisation are separate steps."),
            ("cycle", "Optimisation logic",
             "Each hour: the fewest people serving {{staffing.service_level_target|pct}} within "
             "{{service.target_wait_minutes|int}} minutes at under {{staffing.max_utilisation|pct}} busy (a queueing "
             "model). Then the cheapest {{staffing.shift_min_hours|int}}–{{staffing.shift_max_hours|int}}-hour "
             "shifts, with breaks, for at most {{staffing.max_staff_available|int}} people."),
            ("coins", "Expected business impact",
             "Steady demand: the minimum crew of {{people.min_staff_on_shift.all_human|int}} covers every hour, so "
             "no saving. Opening weeks: {{sim.sf_hours_surge|int}} paid hours a day against {{sim.sf_base_surge|int}} "
             "for a fixed crew, about {{sim.sf_save_open|sgd0}} per opening (illustrative)."),
            ("lock", "Limitations",
             "Textbook queue (random arrivals, one shared line), whole-hour shift starts, no absences or skill "
             "mix. Illustrative inputs; not Chagee's rostering system."),
        ],
        explainer_title="Staffing optimiser: one store, one day",
        caption="Illustrative data: assumed hourly demand, one cup per order, all-human counter.",
        printnote="Printed at steady demand and our defaults; the opening-week result is under Expected business impact.",
        gate=dict(
            n=3, name="Counter · staffing", who=["ops", "entry"],
            decision="How many people should this store roster each hour, and on which shifts?",
            action="{{sim.sf_action|txt}}",
            evidence=[("cost", "Labour a day", "{{sim.sf_cost_steady|sgd0}} vs {{sim.sf_basecost_steady|sgd0}} fixed"),
                      ("sl", "Served within {{service.target_wait_minutes|int}} min", "{{sim.sf_sl_steady|pct1}}"),
                      ("busy", "Staff busy", "{{sim.sf_util_steady|pct}}")],
            tradeoff="Fewer people: lower cost, longer waits at the peaks. A fixed crew: simple, but it pays for "
                     "the quiet hours.",
            limitation="Textbook queue and illustrative inputs; the shift rules are proposed. Check the roster "
                       "against real waits in a pilot before adopting it.",
            actions=[
                ("entry", "Send store operations the hourly forecast, including the opening-week hype."),
                ("ops", "Publish the suggested roster; in opening weeks add the extra shifts only at the peaks."),
                ("ops", "Each week, rerun with actual hourly sales and measured waits; change the roster only if "
                        "the service level or cost moves."),
            ],
            calc=["Per hour: the fewest people (queueing model, one shared line) who serve "
                  "{{staffing.service_level_target|pct}} of customers within {{service.target_wait_minutes|int}} minutes "
                  "and are busy at most {{staffing.max_utilisation|pct}}, at forecast × {{costs.capacity_safety_margin|x}}.",
                  "Shifts: the set with the fewest paid hours covering every half-hour, {{staffing.shift_min_hours|int}} to "
                  "{{staffing.shift_max_hours|int}} hours, a break in shifts over {{staffing.break_after_hours|int}} hours, at "
                  "most {{staffing.max_staff_available|int}} people. The search is exhaustive, so the result is the lowest "
                  "cost within these rules.",
                  "Baseline: a fixed crew sized for the busiest hour, every open hour."],
        ),
        notes=("About 30 seconds. Same counter, now the people. Two steps to keep apart: AI forecasts each hour's "
               "demand; an optimiser then sets the roster. Per hour it finds the fewest people that keep "
               "{{staffing.service_level_target|pct}} of customers within {{service.target_wait_minutes|int}} "
               "minutes, then picks the cheapest shifts with breaks. At steady demand two people cover every hour, "
               "so nothing to save. Toggle opening week: a third person only at the peaks, "
               "{{sim.sf_hours_surge|int}} paid hours instead of {{sim.sf_base_surge|int}} for a fixed crew."),
        sources="All inputs: assumptions.json (illustrative): store hourly demand shares and cups per day, human "
                "seconds per cup with coordination and new-staff speed, minimum crew, capacity safety margin, "
                "target wait, wage, opening hype, and the proposed staffing section. Model: sim/staffing.js "
                "(Erlang C per hour; exact shift search). Per opening: the daily saving over the assumed opening-hype weeks. "
                "No Chagee rostering system or figure is claimed.",
    ),
    dict(
        key="playbook", widget="playbook",
        kicker="Decide", chapter="decide",
        headline="Review: rerun the comparison with observed inputs and compare it with the original plan",
        groups=[
            ("Counter: when mixed beats all-human", "Store format / equipment, with franchisees",
             ("all_human", "mixed"), ["wage", "machineMonth", "coordHuman", "coordMixed", "cupsPerDay", "u",
                                       "newShare", "machineMult"]),
            ("Counter: when full automation beats mixed", "Store format / equipment, with franchisees",
             ("mixed", "all_machine"), ["cupsPerDay", "wage", "machineMonth", "u", "machineMult"]),
        ],
        stock_group=("Fresh milk: when to order at or below the base forecast", "Supply chain / planning"),
        table_note="One input at a time, the rest at our defaults; nearest first. Thresholds flag what to recheck, "
                   "not when to switch (slide {{ref.cost|int}}).",
        explainer_title="Updated scenario versus the original plan",
        caption="Enter observed inputs. Verdict: the full cost model; under {{validation.breakeven.tol_cost_sgd_per_cup|sgd}} "
                "a cup is a tie. Nearest threshold: a live estimate.",
        printnote="Printed at our default inputs.",
        gate=dict(
            n=4, name="Review", who=["ops", "entry", "supply", "format"],
            decision="After real sales arrive, does the plan still hold?",
            action="Create an updated scenario using observed inputs and compare it with the original plan.",
            evidence=[("feeds", "Feeds the model", "steady sales · wage · machine quote · milk costs"),
                      ("diag", "Check by hand", "service times · lost orders · waste and stockouts of every item vs plan")],
            tradeoff="Change too early and you chase the opening hype; change too late and the store keeps the "
                     "wrong stock or counter.",
            limitation="Rerunning the model does not validate it, and a new result does not by itself prove that "
                       "machines should be added.",
            actions=[
                ("ops", "After the first {{demand.opening_hype_weeks|int}} weeks, record steady sales, waste, "
                        "stockouts of every item, service times and lost orders."),
                ("entry", "Revise the demand estimate from post-hype sales and enter it, with the latest wage and "
                          "machine quote, as the updated scenario (right)."),
                ("supply", "Compare milk waste and shortages with the worked example (slide {{ref.s3|int}}) and "
                           "other stockouts with the opening list (slide {{ref.inv|int}}); update inputs only for a known reason."),
                ("format", "Change the counter only if the full updated comparison changes, not because one "
                           "threshold was crossed."),
            ],
            calc=["Post-hype sales: revise the demand estimate. Feeds the model (steady cups per day).",
                  "Waste and stockouts: reassess the ordering assumptions. Diagnostic: milk against the expected "
                  "waste and shortage; other items against the opening list (not modelled).",
                  "Service times and lost orders: check whether the service model matches reality. Diagnostic only: "
                  "the model contains no measured service times.",
                  "Updated wages and machine quotes: rerun the counter comparison. Feeds the model directly."],
        ),
        notes=("About 45 seconds. Review: after the opening weeks, rerun with what the store actually saw. The "
               "table lists every threshold, nearest first. For mixed over all-human, machine cost, staff "
               "coordination and the wage each sit a few per cent from our defaults; volume needs about "
               "{{sim.be_cupsPerDay_all_human_mixed|int}} cups a day. Fresh milk: order above base unless waste "
               "costs over {{sim.milk_trigger|sgd}} a litre; check other stockouts against the opening list. On "
               "the right, enter a market's wage or machine price: the panel compares the updated scenario with "
               "the original plan. Under a cent a cup is a tie."),
        sources="Wage: L-mom-pwm, L-mom-ows, L-cpf, L-sdl, L-mom-leave, L-mom-ph. Triggers: sim/ breakEven "
                "(data.json breakEven, leverNow) and milkTrigger. Your market: sim/ "
                "runPoint with simulation.live_draws, nearest flip found by bisection at the user's inputs. All "
                "inputs: assumptions.json (illustrative).",
    ),
    dict(
        key="s5", widget="benefit",
        kicker="Conclusion, benefit, next step", chapter="decide",
        headline="Each opening gets a demand estimate, an inventory plan, a counter tested on local costs and a "
                 "review; only counter and fresh-milk benefits are quantified",
        explainer_title="What choosing per store is worth (quantified part only)",
        comparator="Comparison: a mixed counter at every opening versus choosing each store's counter for its modelled "
                   "conditions. The quantified inventory benefit currently covers the fresh-milk example only. "
                   "Benefits for tea, other ingredients, and packaging have not been estimated.",
        caption="Bar = openings at that volume × the standard's yearly cost above the cheapest counter (our defaults).",
        printnote="Printed at our defaults: openings spread evenly over our volume range.",
        gates_title="Four outputs for each opening",
        gates=[
            ("Before committing the site", "Predict", ["entry", "crm"],
             "A demand estimate for the whole store: a range to test, back-tested on past openings.", "{{ref.s2|int}}"),
            ("Before the first order", "Provision", ["supply"],
             "An opening inventory and replenishment plan, item by item; fresh milk sized with newsvendor logic.",
             "{{ref.inv|int}}"),
            ("Before fit-out", "Counter", ["format"],
             "A counter compared on demand and local costs, all inputs together; a candidate to pilot.",
             "{{ref.cost|int}}"),
            ("After opening", "Review", ["ops", "entry"],
             "Compare sales, stockouts, waste and service with the plan; rerun with observed inputs.",
             "{{ref.playbook|int}}"),
        ],
        risks=[
            ("Staff dependence and turnover",
             "Keep SOP training and flexible roles."),
            ("Tourist and non-app demand is invisible",
             "Widen the band in tourist areas; log walk-ups."),
            ("Opening crowds read as steady demand",
             "Decide the counter on steady volume, after the hype."),
            ("Automation versus the premium teahouse",
             "Keep people at finishing and hand-over."),
        ],
        next_title="Next step with real Chagee data",
        next_items=[
            "Replace every assumption with store actuals: station times, staffing, wages, machine costs.",
            "Back-test the waitlist signal on recent openings, such as Korea (launch planned for Q2 2026).",
            "Pilot all-human against mixed counters in paired new stores, timing real orders.",
        ],
        view_kicker="Finding",
        view_lead="In the tested model, uncertainty did not determine the counter choice.",
        view_body="Volume and operating costs mattered more; demand uncertainty still matters for inventory. This "
                  "holds for the scenarios we tested, not as a general rule. Next: replace the assumptions with "
                  "Chagee data and back-test on recent openings such as Korea (Q2 2026).",
        notes=("About 55 seconds. To close: each opening gets four outputs. A demand estimate for the whole store. "
               "An opening inventory and replenishment plan, with fresh milk worked through. A counter and a "
               "roster evaluated against demand and local costs. And a review once sales, stockouts, waste and "
               "service come in. Only part is quantified: choosing each store's counter rather than a mixed one "
               "everywhere is worth about {{sim.bn_counter|sgdk}} a year across about "
               "{{benefit.overseas_stores_per_year|int}} openings, and fresh milk about {{sim.bn_stock|sgdk}} once, if "
               "the pre-launch signal works as assumed. Tea, other ingredients and packaging are not estimated. "
               "Modelled avoided costs, not demonstrated savings; appendix A4 sets them against the cost of the "
               "gates. Next step: real data, a back-test on recent openings such as Korea, and a paired pilot."),
        sources="Overseas openings planned for 2026 and Korea launch: L-jiemian. Semi-automated counter as Chagee's "
                "standard: L-unsw, L-cyberrt (our reading). Per-store cost: data.json volumeCurve and the cups-per-day "
                "break-even, x open days. Share below the trigger: openings assumed evenly spread over the approved "
                "cups range (illustrative). Stock term: fresh milk only, provision best-order cost, no signal minus default band. "
                "Everything else: assumptions.json and sim/ (illustrative).",
    ),
]

# ---------------------------------------------------------------------------
# Claims register (deck/claims.md), generated at build time. Facts and ledger sources are matched to slides
# automatically; the rows below are the claims that need a status of their own.
# ---------------------------------------------------------------------------
CHECK_CLAIMS = [
    ("Members order through the app; app-only ordering, with tourist exceptions", ["c1", "s2"], "I-leeyen",
     "CHECK: informal call; the Predict slide depends on it"),
    ("New-market forecasting is judgement-led by a local General Manager", ["c1"], "I-leeyen",
     "CHECK: informal call"),
    ("One closed app-to-store channel; no third-party sellers", ["sc"], "brief.md section 3, I-leeyen",
     "CHECK: our reading"),
    ("Chagee's counter today is semi-automated, modelled as our mixed setup", ["store", "s5"], "L-unsw, L-cyberrt",
     "CHECK: our reading of public sources"),
    ("Chagee sources tea and milk directly for domestic operations; overseas origin not claimed", ["c1", "inv"],
     "L-prn", "OK for domestic; overseas deliberately not claimed"),
]
MODEL_CLAIMS = [
    ("Labour cost {{costs.labour_cost_per_hour|sgd}} per hour worked, fully loaded", ["cost", "playbook"],
     "L-mom-pwm, L-cpf, L-sdl, L-mom-leave, L-mom-ph"),
    ("Cost per cup at our forecast: all-human {{sim.vc_h|sgd}}, mixed {{sim.vc_m|sgd}}; gap {{sim.vc_hm|sgd}}",
     ["cost", "playbook"], "sim/ volumeCurve"),
    ("Mixed overtakes all-human above about {{sim.be_cupsPerDay_all_human_mixed|int}} cups a day, a wage of "
     "{{sim.be_wage_all_human_mixed|sgd}}, or below a machine cost of {{sim.be_machineMonth_all_human_mixed|sgd0}} "
     "a month", ["cost", "playbook"], "sim/ breakEven"),
    ("Full automation overtakes mixed only above about {{sim.be_cupsPerDay_mixed_all_machine|int}} cups a day "
     "(a step)", ["cost", "playbook"], "sim/ breakEven"),
    ("Peak-hour time to serve: today's counter about {{sim.st_med_mixed|min1}}, all-robot about "
     "{{sim.st_med_all_machine|sec}} (median)", ["store"], "sim/ serveTimes (cost model)"),
    ("First fresh-milk delivery: about {{sim.opt_litres|int}} L on steady demand, about {{sim.opt_litres_hype|int}} L "
     "if the opening surge is real", ["s3"], "sim/ provision (same optimum in days of demand)"),
    ("Staffing at our defaults: {{sim.sf_hours_steady|int}} paid hours a day at steady demand (same as a fixed crew); "
     "{{sim.sf_hours_surge|int}} against {{sim.sf_base_surge|int}} in the opening weeks, about {{sim.sf_save_day|sgd0}} a day",
     ["staff"], "sim/staffing.js (Erlang C, exact shift search); staffing assumptions PROPOSED"),
    ("Best opening milk order holds above base unless waste costs over {{sim.milk_trigger|sgd}} a litre",
     ["s3", "playbook"], "sim/ milkTrigger"),
    ("Best opening order costs {{sim.prov_none|sgd0}} with no signal against {{sim.prov_def|sgd0}} at the "
     "default band", ["s3"], "sim/ provision"),
    ("Choosing each store's counter instead of mixed everywhere: about {{sim.bn_counter|sgdk}} a year in counter "
     "costs plus {{sim.bn_stock|sgdk}} once in fresh-milk opening stock (the only inventory item quantified)", ["s5", "a4"],
     "sim/ volumeCurve, breakEven; openings spread evenly (illustrative)"),
    ("Week 5 check: pooled formula {{sim.w5_lo|f1}}% and {{sim.w5_hi|f1}}% above the Week 5 engine; the test fails",
     ["cost"], "sim/ tests"),
    ("Band narrows from ±{{demand.uncertainty_no_signal|pct}} to ±{{demand.uncertainty_strong_signal|pct}} with "
     "signal", ["s2"], "assumption, shown as a sensitivity"),
]
QA = [
    ("Is this only about milk?", "No. The plan covers the whole store: demand for every drink, and an inventory plan "
     "for tea, milk and alternatives, other ingredients and packaging. Fresh milk is the one item we quantify, as a "
     "worked example of the ordering trade-off; the others need recipe and supplier data we do not have."),
    ("What does the bucket brigade add?", "One service-capacity mechanism: how a crew shares work in a surge, and "
     "why fixed machines queue at a bottleneck or sit idle. It informs the counter choice; it is not the solution."),
    ("Why not a marketplace?", "Chagee runs one closed app-to-store channel, so the marketplace-design topics do not "
     "apply (our reading, partly from an informal call)."),
    ("So which counter should a new store open with?", "No default. All-human is cheaper at our forecast by "
     "{{sim.vc_hm|sgd}} a cup; mixed wins once machine cost, wage, staff coordination or volume crosses a trigger "
     "(slide {{ref.playbook|int}}). The gap is small and the staffing model is simplified, so pilot before relying "
     "on it."),
    ("Did uncertainty matter?", "Not for the counter: mixed beats full automation at every band width in all seeds, "
     "and the all-human versus mixed choice turns on volume and input costs. The band matters for stock."),
    ("Are the serve times real?", "No. They are a read-out of the cost model's peak hour; no measured serve time "
     "exists in our sources. Timing real orders would replace them."),
    ("How certain is the novelty claim?", "Hedged: to our knowledge, based on public sources. Forecasting, "
     "automation and digital twins exist; simulating a store before it exists is the part we add."),
    ("How would you use real data?", "Replace station times, staffing, wages, machine costs and demand with Chagee "
     "actuals and re-run sim/; the deck, the playbook and this register rebuild from the same data."),
]

# ---------------------------------------------------------------------------
# Chapters (brief-v2 section 3): rail order, one-line purpose, on-stage time.
# Times are a talk plan, not model inputs, so they live here rather than in assumptions.json.
# ---------------------------------------------------------------------------
CHAPTERS = [
    ("context", "Context", "One new store: the whole-store problem, and what AI would add", 50),
    ("scope", "Scope", "Which course topics we use, which we leave out, and why", 35),
    ("predict", "Predict", "Gate 1: what demand the whole store should plan for", 40),
    ("provision", "Provision", "Gate 2: the opening inventory plan, with fresh milk as the worked example", 75),
    ("perform", "Counter", "Gate 3: the counter in a store, which one to install, and how to staff it", 110),
    ("decide", "Review", "Gate 4: review after opening, and the conditional business case", 100),
]
CONTENTS_SECONDS = 10          # the Contents slide itself
QA_SECONDS = 180               # brief.md: about 3 minutes of Q&A

# Slides not yet rebuilt for brief-v2 show as clearly marked placeholders.
PLACEHOLDERS = {
    "context": dict(key="p1", chapter="context", kicker="Context and problem", step="step 2",
                    plan="Chagee scale facts, the core processes AI can enhance (demand forecasting, opening "
                         "inventory, counter service), the problem statement and its significance."),
}
DECK = ["c1", "sc", "s2", "inv", "s3", "mech", "store", "cost", "staff", "playbook", "s5", "a1", "a1b", "a1c", "a1d", "a2", "s4",
        "a3", "a4"]

# ---------------------------------------------------------------------------
# Placeholders and the no-raw-numbers check
# ---------------------------------------------------------------------------
PH = re.compile(r"\{\{([\w.]+)\|(\w+)\}\}")
ALLOW = re.compile(r"\bAY20\d\d-\d\d\b|\bTopics? \d+(?:(?:, | and | to )\d+)*|\bstep \d+|\bA[1-5]\b|^\d · |^About \d+(?:\.\d+)? (?:minutes?|seconds)|\bsection \d+|\b(?:FY)?20\d\d\b|\bWeeks? \d+(?:[–-]\d+)?(?: and \d+)?|OPIM639|\bQ[1-4]\b|\b[LI]-[\w-]+")
FMT = {
    "int": lambda v: f"{v:,.0f}",
    "pct": lambda v: f"{v * 100:.0f}%",
    "pct1": lambda v: f"{v * 100:.1f}%",
    "sgd": lambda v: f"S${v:,.2f}",
    "sgd0": lambda v: f"S${v:,.0f}",
    "f1": lambda v: f"{v:.1f}",
    "f2": lambda v: f"{v:.2f}",
    "x": lambda v: f"{v:g}×",
    "txt": lambda v: str(v),
    "sec": lambda v: f"{v:.0f} seconds",
    "sgdm": lambda v: f"S${v / 1e6:.1f}m",
    "sgdk": lambda v: f"S${v / 1e3:,.0f}k",
    "min1": lambda v: f"{v / 60:.1f} minutes",
}


def ensure_data() -> dict:
    deps = [ROOT / "assumptions.json", *(ROOT / "sim").glob("*.js")]
    if not DATA.exists() or max(p.stat().st_mtime for p in deps) > DATA.stat().st_mtime:
        print("running sim/precompute.js (about 90 s) ...")
        subprocess.run(["node", str(ROOT / "sim" / "precompute.js"), str(DATA)], check=True)
    return json.loads(DATA.read_text(encoding="utf-8"))


def sim_values(d: dict) -> dict:
    g = A["surge"]["surge_default"]["value"]
    rows, u0 = d["sweeps"][g]["rows"], d["defaults"]["u"]

    def at(rs, u, f, key="u"):
        for a, b in zip(rs, rs[1:]):
            if a[key] <= u <= b[key]:
                t = (u - a[key]) / (b[key] - a[key])
                return f(a) + t * (f(b) - f(a))
        return f(rs[-1])

    vc = d["volumeCurve"]
    cpd0 = A["store"]["cups_per_store_per_year"]["value"] / A["store"]["open_days_per_year"]["value"]

    util = d["util"][g]
    pv = A["provision"]
    under = pv["stockout_cost_per_cup"]["value"] / pv["milk_litres_per_cup"]["value"]
    be = {f"be_{r['lever']}_{r['a']}_{r['b']}": r["x"] for r in d["breakEven"] if r["kind"] == "value"}
    return {
        **be,
        "cpd0": cpd0,
        **{f"st_med_{k}": v["median"] for k, v in d["store"][g].items()},
        **{f"st_p90_{k}": v["p90"] for k, v in d["store"][g].items()},
        "store_print_minute": d["storePrintMinute"],
        "cap_h": d["storeCap"]["all_human"]["replica"] / d["storeCap"]["all_human"]["nominal"],
        "cap_m": d["storeCap"]["mixed"]["replica"] / d["storeCap"]["mixed"]["nominal"],
        "vc_h": at(vc, cpd0, lambda r: r["all_human"]["cost"], "cupsPerDay"),
        "vc_m": at(vc, cpd0, lambda r: r["mixed"]["cost"], "cupsPerDay"),
        "vc_hm": at(vc, cpd0, lambda r: r["mixed"]["cost"] - r["all_human"]["cost"], "cupsPerDay"),
        "vc_busy": at(vc, cpd0, lambda r: r["all_machine"]["busy"], "cupsPerDay"),
        "vc_gap": at(vc, cpd0, lambda r: r["all_machine"]["cost"] - min(r["all_human"]["cost"], r["mixed"]["cost"]), "cupsPerDay"),
        "u0": u0,
        "busy_lo": min(r["all_machine"]["busy"] for r in rows),
        "busy_hi": max(r["all_machine"]["busy"] for r in rows),
        "machine_cap_hr": util["all_machine"]["capacityPerMin"] * 60,
        "peak_hr": d["util"]["none"]["all_machine"]["arrivalPerMin"] * 60,
        "mixed_units": util["mixed"]["machineUnits"],
        "machine_units": util["all_machine"]["machineUnits"],
        "large_lost": at(d["sweeps"]["large"]["rows"], u0, lambda r: r["mixed"]["lostShare"]),
        "cost_h": at(rows, u0, lambda r: r["all_human"]["cost"]),
        "cost_m": at(rows, u0, lambda r: r["mixed"]["cost"]),
        "milk_trigger": d["milkTrigger"]["value"],
        "band_base": d["defaults"]["band"]["base"], "band_low": d["defaults"]["band"]["low"],
        "band_high": d["defaults"]["band"]["high"],
        "opt_waste_l": d["provision"]["def"]["optWaste"] / A["provision"]["milk_waste_cost_per_litre"]["value"],
        "opt_short_cups": d["provision"]["def"]["optStockout"] / A["provision"]["stockout_cost_per_cup"]["value"],
        "short_share": 1 - under / (under + pv["milk_waste_cost_per_litre"]["value"]),
        "top_days": A["provision"]["milk_shelf_life_days"]["value"] * d["defaults"]["band"]["high"] / d["defaults"]["band"]["base"],
        "vc_a": at(vc, cpd0, lambda r: r["all_machine"]["cost"], "cupsPerDay"),
        "staff_h": d["util"][g]["all_human"]["staff"],
        "staff_m": d["util"][g]["mixed"]["staff"],
        "mixed_stations": ", ".join(STATION_LABEL.get(x, x) for x in A["stations"]["mixed_machine_stations"]["value"]),
        "opt_days": d["provision"]["def"]["optDays"],
        "opt_litres": d["provision"]["def"]["optDays"] * d["defaults"]["band"]["base"] / 7
                      * A["provision"]["milk_litres_per_cup"]["value"],
        # same optimum in days of demand (it depends on the band width, not its level) on opening-week demand
        "opt_litres_hype": d["provision"]["def"]["optDays"] * d["defaults"]["band"]["base"] / 7
                           * (A["demand"]["opening_hype_multiplier"]["value"] if d["defaults"]["removeHype"] else 1)
                           * A["provision"]["milk_litres_per_cup"]["value"],
        **benefit_values(d),
        **business_values(d),
        **staffing_values(d),
        "critical_ratio": under / (under + pv["milk_waste_cost_per_litre"]["value"]),
        "prov_none": d["provision"]["none"]["optTotal"],
        "prov_def": d["provision"]["def"]["optTotal"],
        "w5_lo": min(w["gapPct"] for w in d["week5"]),
        "w5_hi": max(w["gapPct"] for w in d["week5"]),
    }


CONCEPTS = {   # name: (badge or None, plain-language line). Badges only where OPIM639 materials support them.
    "demand": ("Demand prediction", "Topic 3", "Estimate how much customers will buy, as a range rather than one number."),
    "inventory": ("Preparing inventory for fulfilment", "Topic 5", "Have every material on hand before the orders arrive, item by item."),
    "leadtime": ("Lead time", None, "The time from placing an order to having it usable in the store."),
    "reorder": ("Reorder point and safety stock", None, "Reorder when stock falls to the usage expected during the lead time, plus a buffer for demand above it."),
    "newsvendor": ("Newsvendor logic", None, "Choose the order quantity by balancing the cost of unused stock against the cost of running short."),
    "brigade": ("Bucket brigade", "Topic 5", "Workers pass each order along a line and rebalance themselves, slowest first."),
    "bottleneck": ("Bottleneck", "Topic 5", "The slowest step sets the pace of the whole line."),
    "utilisation": ("Capacity utilisation", None, "The share of available capacity that is actually used."),
    "robotics": ("Selecting robotics equipment", "Topic 4", "Choose automation that fits the volume and the work, not the most automation."),
}


def concept_line(key: str, informs: str, status: str = "") -> str:
    name, badge, line = CONCEPTS[key]
    b = f' <span class="ccb">Course concept · {esc(badge)}</span>' if badge else ""
    st = f' <span class="cst">{esc(status)}</span>' if status else ""
    return (f'<p class="concept"><b>{esc(name)}</b>{b}{st} <span class="cl">{esc(line)}</span> '
            f'<span class="ci">Informs: {esc(informs)}</span></p>')


ROLES = {   # owner chips: one colour per team, used on the decision strips and the opening gates
    "entry": "Market-entry leads", "crm": "Membership / CRM", "supply": "Supply chain / planning",
    "format": "Store format & franchisee", "ops": "Store operations",
}


def role_chip(r: str) -> str:
    return f'<span class="role r-{r}">{esc(ROLES[r])}</span>'


STATION_LABEL = {"ticket": "order & ticket", "cup_ice": "cup & ice", "tea_milk": "tea & milk",
                 "topping_finish": "toppings", "shake_seal": "shake & seal", "handover": "hand-over"}


def benefit_values(d: dict) -> dict:
    """Standard counter (mixed) at every store vs choosing by trigger: per-store cost by volume, from sim/."""
    days = A["store"]["open_days_per_year"]["value"]
    be = next(r for r in d["breakEven"] if (r["lever"], r["a"], r["b"]) == ("cupsPerDay", "all_human", "mixed"))["x"]
    vc = d["volumeCurve"]
    best = lambda r: min(r[k]["cost"] for k in ("all_human", "mixed", "all_machine"))
    below = [(r["mixed"]["cost"] - best(r)) * r["cupsPerDay"] * days for r in vc if r["cupsPerDay"] < be]
    full = [(r["all_machine"]["cost"] - best(r)) * r["cupsPerDay"] * days for r in vc]
    lo, hi = vc[0]["cupsPerDay"], vc[-1]["cupsPerDay"]
    share = (be - lo) / (hi - lo)
    stores = A["benefit"]["overseas_stores_per_year"]["value"]
    per = sum(below) / len(below)
    # openings spread evenly over [lo, hi]; each curve point stands for the volumes within half a step of it
    step = vc[1]["cupsPerDay"] - vc[0]["cupsPerDay"]
    frac = [(min(hi, r["cupsPerDay"] + step / 2) - max(lo, r["cupsPerDay"] - step / 2)) / (hi - lo) for r in vc]
    counter = stores * sum(f * (r["mixed"]["cost"] - best(r)) * r["cupsPerDay"] * days for f, r in zip(frac, vc))
    stock = stores * (d["provision"]["none"]["optTotal"] - d["provision"]["def"]["optTotal"])
    return {"bn_store": per, "bn_share": share, "bn_counter": counter, "bn_stock": stock,
            "bn_total": counter + stock, "bn_full_lo": min(full), "bn_full_hi": max(full)}


def staffing_values(d: dict) -> dict:
    """Staff-optimisation slide figures at our defaults (sim/staffing.js via precompute)."""
    st, su = d["staffing"]["steady"], d["staffing"]["surge"]
    wage, days = A["costs"]["labour_cost_per_hour"]["value"], 7 * A["demand"]["opening_hype_weeks"]["value"]
    if not (st["feasible"] and su["feasible"] and st["complete"] and su["complete"]):
        raise SystemExit("staffing: the default schedule is not a completed, feasible search")
    return {"sf_hours_steady": st["hours"], "sf_base_steady": st["base"]["hours"],
            "sf_hours_surge": su["hours"], "sf_base_surge": su["base"]["hours"],
            "sf_save_day": (su["base"]["hours"] - su["hours"]) * wage,
            "sf_save_open": (su["base"]["hours"] - su["hours"]) * wage * days,
            "sf_sl_surge": su["at"]["sl"], "sf_wait_surge": su["at"]["wait"] * 60,
            "sf_cost_steady": st["cost"], "sf_basecost_steady": st["base"]["cost"], "sf_sl_steady": st["at"]["sl"],
            "sf_util_steady": st["at"]["util"], "sf_action": staffing_action(st, wage)}


def staffing_action(r: dict, wage: float) -> str:
    """The gate's suggested roster in words; deck.js staffingWidget writes the same sentence live."""
    req, fixed = r["req"], r["base"]["hours"] / len(r["req"])
    lo, hi = min(req), max(req)
    lab = lambda h: f"{10 + h:02d}:00"
    runs, h = [], 0
    while h < len(req):
        if req[h] == hi:
            e = h
            while e < len(req) and req[e] == hi:
                e += 1
            runs.append(f"{lab(h)}–{lab(e)}")
            h = e
        else:
            h += 1
    who = (f"Roster {lo} people every hour" if lo == hi else f"Roster {lo} people all day and {hi} at {' and '.join(runs)}")
    save = (r["base"]["hours"] - r["hours"]) * wage
    tail = (f" Saves S${save:,.0f} a day against a fixed crew of {fixed:.0f}." if save > 0.5 else
            f" A fixed crew of {fixed:.0f} costs the same here, so keep it.")
    return f"{who}: {len(r['shifts'])} shifts, {r['hours']} paid hours (S${r['cost']:,.0f} a day).{tail}"


def business_case(d: dict, openings: float = None, one_time_mult: float = 1.0, saving_mult: float = 1.0) -> dict:
    """Appendix A4: yearly modelled benefit of the four gates against the cost of building and running them."""
    B, bv = A["business_case"], benefit_values(d)
    v = lambda k: B[k]["value"]
    stores = A["benefit"]["overseas_stores_per_year"]["value"]
    opens = stores if openings is None else openings
    rate, mday = v("specialist_day_rate"), v("working_days_per_month")
    per_store = bv["bn_counter"] / stores * saving_mult          # counter saving per store-year
    per_open = bv["bn_stock"] / stores                            # one-time stock saving per opening
    build = v("build_people") * v("build_months") * mday * rate * one_time_mult
    integ = v("integration_one_time") * one_time_mult
    maint = v("maintenance_people") * 12 * mday * rate
    years, cum = [], 0.0
    for y in range(v("horizon_years")):
        sy = opens * y + opens * v("opening_year_share")          # earlier cohorts trade all year, new ones part
        r = dict(opens=opens, store_years=sy, counter=sy * per_store, stock=opens * per_open,
                 build=build if y == 0 else 0.0, integ=integ if y == 0 else 0.0, maint=maint,
                 platform=sy * v("platform_per_store_month") * 12, review=opens * v("review_days_per_opening") * rate)
        r["benefit"] = r["counter"] + r["stock"]
        r["one_time"] = r["build"] + r["integ"]
        r["recurring"] = r["maint"] + r["platform"] + r["review"]
        r["cost"] = r["one_time"] + r["recurring"]
        r["net"] = r["benefit"] - r["cost"]
        cum += r["net"]
        r["cum"] = cum
        years.append(r)
    payback = next((i + 1 for i, r in enumerate(years) if r["cum"] >= 0), None)
    return dict(years=years, payback=payback, per_store=per_store, per_open=per_open, build=build, integ=integ,
                maint=maint, rate=rate, mday=mday)


def business_values(d: dict) -> dict:
    bc = business_case(d)
    ys, n = bc["years"], len(bc["years"])
    cum = ys[-1]["cum"]
    k = lambda x: f"S${abs(x) / 1e3:,.0f}k"
    verdict = (f"cover the cost of building and running the gates in year {bc['payback']}, leaving about {k(cum)} "
               f"ahead" if bc["payback"] else
               f"do not cover the cost of building and running the gates within {n} years: about {k(cum)} short")
    return {"fin_verdict": verdict, "fin_cum": cum, "fin_benefit": sum(r["benefit"] for r in ys),
            "fin_cost": sum(r["cost"] for r in ys)}


def lookup(path: str, simv: dict):
    parts = path.split(".")
    if parts[0] == "ref":                         # on-stage slide number of a deck entry (rail numbering)
        if parts[1] not in REFNUM:
            raise SystemExit(f"slide reference to {parts[1]!r}: not an on-stage slide")
        return REFNUM[parts[1]]
    if parts[0] == "sim":
        return simv[parts[1]]
    node = A[parts[0]][parts[1]]["value"]
    for p in parts[2:]:
        node = node[p]
    return node


def check_and_fill(content, simv: dict, where: str = "CONTENT"):
    """Fail on raw digits in text; replace placeholders. Recurses through lists, tuples and dicts."""
    if isinstance(content, str):
        bare = ALLOW.sub("", PH.sub("", content))
        if re.search(r"\d", bare):
            raise SystemExit(f"raw number in {where}: {content[:90]!r} - use a {{{{placeholder}}}}")
        return PH.sub(lambda m: FMT[m.group(2)](lookup(m.group(1), simv)), content)
    if isinstance(content, dict):
        return {k: (v if k in ("key", "widget") else check_and_fill(v, simv, f"{where}.{k}")) for k, v in content.items()}
    if isinstance(content, (list, tuple)):
        return type(content)(v if isinstance(v, (int, float)) else check_and_fill(v, simv, where) for v in content)
    return content


# ---------------------------------------------------------------------------
ICONS = {
    "trend": '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    "lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 018 0V11"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/>'
             '<path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14c2.2.6 3.5 2.8 3.5 6"/>',
    "route": '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/>'
             '<path d="M8.5 18H15a3 3 0 000-6H9a3 3 0 010-6h6.5"/>',
    "phone": '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    "wave": '<path d="M3 17l4-6 4 3 5-8 5 6"/><path d="M3 21h18"/>',
    "cycle": '<path d="M20 11a8 8 0 00-14.3-4.9L4 8"/><path d="M4 4v4h4"/>'
             '<path d="M4 13a8 8 0 0014.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    "alert": '<path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.3v.4"/>',
    "scale": '<path d="M12 3v18"/><path d="M7 21h10"/><path d="M4 7h16"/><path d="M4 7l-2.5 6h5L4 7z"/>'
             '<path d="M20 7l-2.5 6h5L20 7z"/>',
    "coins": '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/>'
             '<path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    "moon": '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    "box": '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5"/><path d="M12 12v9"/>',
}

TEMPLATE_PATH = HERE / "template.html"
DATA_CACHE: dict = {}
ENGINE_PATH = HERE / "deck.js"


def icon(name: str) -> str:
    return (f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICONS[name]}</svg>')


def ed(key: str, text: str, tag: str = "span", cls: str = "") -> str:
    """An element whose text can be changed in the browser's edit mode."""
    c = f' class="{cls}"' if cls else ""
    return f'<{tag}{c} data-k="{key}">{esc(text)}</{tag}>'


def render_title() -> str:
    t = TITLE
    names = "".join(ed(f"t.m{i}", m, "li") for i, m in enumerate(t["members"]))
    art = """<svg class="art" viewBox="0 0 430 720" fill="none" aria-hidden="true">
      <path d="M70 660 C 70 520, 340 560, 300 410 S 110 260, 230 150" stroke="#e8a33d" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>
      <circle cx="70" cy="660" r="9" fill="#e8a33d"/>
      <g transform="translate(180 60)" stroke="#cbd2e0" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">
        <path d="M10 30h80l-10 92a10 10 0 01-10 9H30a10 10 0 01-10-9z"/><path d="M4 30h92"/><path d="M50 30V4"/>
        <circle cx="38" cy="108" r="4" fill="#cbd2e0"/><circle cx="54" cy="114" r="4" fill="#cbd2e0"/><circle cx="64" cy="104" r="4" fill="#cbd2e0"/>
      </g>
      <g transform="translate(250 380)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round">
        <rect x="0" y="0" width="90" height="56" rx="6"/><path d="M0 18h90"/><path d="M14 56v18M76 56v18"/>
        <rect x="58" y="-30" width="22" height="30" rx="3" fill="#e8a33d" stroke="#e8a33d"/>
      </g>
    </svg>"""
    return f"""
<section class="slide title" aria-label="Title">
  <div class="ttext">
    {ed("t.course", t['course'], "p", "course")}
    {ed("t.title", t['title'], "h1")}
    {ed("t.topic", t['topic'], "p", "topic")}
    <div class="rule"></div>
    {ed("t.group", t['group'], "p", "group")}
    <ul class="names">{names}</ul>
  </div>
  {art}
</section>"""


def render_points(s: dict) -> str:
    k = s["key"]
    return "".join(
        f'<div class="point"><span class="ico">{icon(ic)}</span><div>'
        f'{ed(f"{k}.p{i}.t", t, "h3")}{ed(f"{k}.p{i}.b", b, "p")}</div></div>'
        for i, (ic, t, b) in enumerate(s.get("points", [])))


def render_view(s: dict) -> str:
    k = s["key"]
    if not s.get("view_kicker"):
        return ""
    body = ed(f"{k}.vb", s["view_body"], "p", "vb") if s.get("view_body") else ""
    return (f'<div class="view">{ed(f"{k}.vk", s["view_kicker"], "p", "vk")}'
            f'{ed(f"{k}.vl", s["view_lead"], "p", "vl")}{body}</div>')


def sourcing_svg() -> str:
    """Two small networks: rigid (origin -> HQ -> stores) and localised (local suppliers <-> stores)."""
    ink, mute, amb, blue = "#23272f", "#6b7280", "#e8a33d", "#2563eb"
    box = lambda x, y, w, t: (f'<rect x="{x}" y="{y}" width="{w}" height="26" rx="5" fill="#fff" stroke="#9aa3af"/>'
                              f'<text x="{x + w / 2}" y="{y + 17}" font-size="10.5" fill="{ink}" text-anchor="middle">{t}</text>')
    store = lambda x, y: (f'<rect x="{x}" y="{y}" width="34" height="22" rx="4" fill="{amb}" opacity=".9"/>'
                          f'<text x="{x + 17}" y="{y + 15}" font-size="9" fill="#fff" text-anchor="middle" font-weight="700">store</text>')
    arrow = lambda x1, y1, x2, y2, c=blue: (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="1.6" '
                                            f'marker-end="url(#ah)"/>')
    g = ['<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">'
         f'<path d="M0 0L8 4L0 8z" fill="{blue}"/></marker></defs>']
    g.append(f'<text x="0" y="12" font-size="11" font-weight="700" fill="{ink}">Rigid sourcing</text>')
    g.append(box(0, 22, 92, "Origin suppliers") + box(124, 22, 92, "HQ distribution"))
    g.append(arrow(92, 35, 122, 35))
    for i, y in enumerate((14, 34, 54)):
        g.append(arrow(216, 35, 246, y + 11) + store(248, y))
    g.append(f'<text x="0" y="66" font-size="9.5" fill="{mute}">fixed long before opening</text>')
    g.append(f'<text x="244" y="90" font-size="9.5" font-weight="700" fill="#9a6b1e" text-anchor="end">the miss lands '
             f'here, in the store →</text>')
    g.append(f'<text x="0" y="118" font-size="11" font-weight="700" fill="{ink}">Localised sourcing</text>')
    g.append(box(0, 128, 92, "Local suppliers"))
    for y in (120, 140, 160):
        g.append(arrow(92, 141, 246, y + 11) + store(248, y))
    g.append(f'<path d="M246 186 C 170 200, 110 190, 60 156" fill="none" stroke="{blue}" stroke-dasharray="3 3" '
             f'stroke-width="1.4" marker-end="url(#ah)"/>')
    g.append(f'<text x="96" y="204" font-size="9.5" fill="{mute}">top-ups come back quickly</text>')
    return f'<svg viewBox="0 0 290 210" class="lsvg" role="img" aria-label="Rigid versus localised sourcing">{"".join(g)}</svg>'


def render_where(s: dict) -> str:
    k, cols = s["key"], []
    for j, (sid, name, sub, steps) in enumerate(s["scenarios"]):
        rows = "".join(
            f'<div class="step"><span class="sname">{esc(st)}</span>'
            f'<span class="dots" aria-label="exposure {lvl} of 3">{"".join("<i class=on></i>" if d < lvl else "<i></i>" for d in range(3))}</span>'
            f'<span class="sdesc">{esc(desc)}</span></div>'
            for st, desc, lvl in steps)
        cols.append(f'<div class="scen {"on" if j == 0 else ""}" data-sc="{sid}"><h5>{ed(f"{k}.sc{j}", name)}'
                    f' <small>{esc(sub)}</small></h5>{rows}</div>')
    buttons = "".join(f'<button data-sc="{sid}" class="{"on" if j == 0 else ""}">{esc(name)}</button>'
                      for j, (sid, name, _, _) in enumerate(s["scenarios"]))
    legend = ('<div class="dlegend"><span><span class="dots"><i class=on></i><i></i><i></i></span> low</span>'
              '<span><span class="dots"><i class=on></i><i class=on></i><i class=on></i></span> high exposure to a demand miss</span></div>')
    logic = ""
    if s.get("logic"):
        pts = "".join(f'<li><b>{esc(t)}.</b> {esc(b)}</li>' for t, b in s["logic"])
        logic = (f'<details class="logicbox screenonly"><summary>How the logic works ▸</summary>'
                 f'<div class="logicpop"><div class="lgrid"><div>{sourcing_svg()}</div><ul>{pts}</ul></div>'
                 f'<p class="tnote">Network view after the course\'s supply-chain diagrams; our reading, not a Chagee '
                 f'statement.</p></div></details>')
    return (f'<div class="variants">{buttons}</div><div class="scens">{"".join(cols)}</div>{legend}{logic}')


def render_aimap(s: dict) -> str:
    k, steps = s["key"], s["steps"]
    chips = "".join(
        f'<button class="mstep {"on" if i == 0 else ""}" data-st="{sid}"><span class="mn">{i + 1}</span>{esc(name)}</button>'
        + ('<span class="marrow" aria-hidden="true">→</span>' if i < len(steps) - 1 else "")
        for i, (sid, name, *_rest) in enumerate(steps))
    cards = "".join(
        f'<div class="mcard {"on" if i == 0 else ""}" data-st="{sid}"><h5>{i + 1} · {esc(name)}</h5>'
        f'<div class="mrow"><span>Today</span><p>{esc(today)}</p></div>'
        f'<div class="mrow ai"><span>What AI adds</span><p>{esc(ai)}</p></div>'
        f'<div class="mrow"><span>Who decides</span><p>{esc(who)}</p></div>'
        f'<div class="mrow"><span>In this deck</span><p>{esc(where)}</p></div></div>'
        for i, (sid, name, today, ai, who, where) in enumerate(steps))
    table = "".join(
        f'<tr><th>{i + 1} · {esc(name)}</th><td>{esc(today)}</td><td>{esc(ai)}</td><td>{esc(who)}<br><i>{esc(where)}</i></td></tr>'
        for i, (sid, name, today, ai, who, where) in enumerate(steps))
    return (f'<div class="mchain">{chips}</div><div class="mcards screenonly">{cards}</div>'
            f'<table class="mtable printonly"><thead><tr><th>Step</th><th>Today (our reading)</th><th>What AI adds</th>'
            f'<th>Who decides · where</th></tr></thead><tbody>{table}</tbody></table>')


def render_explainer(s: dict) -> str:
    k = s["key"]
    head = (f'<div class="exhead"><span class="tag">● INTERACTIVE EXPLAINER</span>'
            f'{ed(f"{k}.ex", s["explainer_title"], "span", "ex-title")}</div>')
    cap = ed(f"{k}.cap", s["caption"], "p", "caption") if s.get("caption") else ""
    if s.get("comparator"):
        cap = ed(f"{k}.cmp", s["comparator"], "p", "comparator") + cap
    if not s.get("points"):
        cap += "".join(concept_line(*c) for c in s.get("concepts", []))
    pn = f'<p class="printonly pnote">{esc(s["printnote"])}</p>'
    if s["widget"] == "where":
        inner = render_where(s)
    elif s["widget"] == "aimap":
        inner = render_aimap(s)
    elif s["widget"] == "cross":
        inner = (f'<div class="body"></div><div class="shift"><h4>{ed(f"{k}.shift", s["shift_title"])}</h4>'
                 f'<div class="shiftrows"></div></div>')
    else:
        inner = '<div class="body"></div>'
    return f'<div class="explainer" data-widget="{s["widget"]}">{head}{cap}{inner}{pn}</div>'


def render_risks(s: dict) -> str:
    k = s["key"]
    rows = "".join(
        f'<div class="risk {"on" if i == 0 else ""}"><button class="rt" aria-expanded="{"true" if i == 0 else "false"}">'
        f'<span class="rn">{i + 1}</span>{ed(f"{k}.r{i}.t", t)}</button>{ed(f"{k}.r{i}.b", b, "p", "rb")}</div>'
        for i, (t, b) in enumerate(s["risks"]))
    nxt = "".join(ed(f"{k}.n{i}", x, "li") for i, x in enumerate(s["next_items"]))
    return (f'<div class="risks"><h4>RISKS <span class="screenonly">· click each</span></h4>{rows}</div>'
            f'<div class="next"><h4>{ed(f"{k}.nt", s["next_title"])}</h4><ul>{nxt}</ul></div>')


def mmss(sec: int) -> str:
    return f"{sec // 60}:{sec % 60:02d}"


def render_rail(chapter: str, n: int, total: int, label: str = "") -> str:
    """Progress rail: current chapter filled, earlier ones ticked, a slide counter; chapters are links."""
    ids = [c[0] for c in CHAPTERS]
    cur = ids.index(chapter) if chapter in ids else len(ids)
    chips = "".join(
        f'<button class="rc {"cur" if i == cur else "done" if i < cur else ""}" data-goto="{cid}"'
        f'{" aria-current=step" if i == cur else ""}><span class="rd">{"✓" if i < cur else i + 1}</span>{esc(name)}</button>'
        for i, (cid, name, _, _) in enumerate(CHAPTERS))
    count = f"Slide {n} of {total}" if chapter != "appendix" else f"{esc(label) or 'Appendix'} · handout only"
    return f'<nav class="rail" aria-label="Progress">{chips}<span class="rcount">{count}</span></nav>'


def render_contents(first: dict) -> str:
    rows = "".join(
        f'<button class="chap" data-goto="{cid}"><span class="cn">{i + 1}</span><span class="ct">{esc(name)}'
        f'<small>{esc(purpose)}</small></span><span class="cs">slide{"s" if len(first[cid]) > 1 else ""} '
        f'{(" and ".join(str(x) for x in first[cid])) if len(first[cid]) < 3 else f"{first[cid][0]} to {first[cid][-1]}"}</span><span class="cm">{mmss(sec)}</span></button>'
        for i, (cid, name, purpose, sec) in enumerate(CHAPTERS))
    stage = sum(c[3] for c in CHAPTERS) + CONTENTS_SECONDS
    return f"""
<section class="slide contents" aria-label="Contents" data-kicker="Contents">
  <p class="kicker">Contents</p>
  <h2>Six chapters: one new store, four gates from forecast to review</h2>
  <div class="chaps">{rows}</div>
  <p class="ctotal">About {mmss(stage)} on stage, then {mmss(QA_SECONDS)} for Q&amp;A. Click a chapter to jump to it.
     Appendix slides are in the handout only.</p>
  <div class="foot"><span>{esc(FOOT)} · <span class="assume">explainer figures are illustrative assumptions</span></span><span>2</span></div>
</section>"""


def render_placeholder(page: int, n: int, total: int, s: dict) -> str:
    k = s["key"]
    return f"""
<section class="slide content placeholder {k}" aria-label="Slide {page}" data-chapter="{s['chapter']}" data-kicker="{esc(s['kicker'])}">
  {render_rail(s['chapter'], n, total)}
  <h2>{esc(s['kicker'])}</h2>
  <div class="phbox"><p class="phk">DRAFT PLACEHOLDER · BUILT IN {esc(s['step']).upper()}</p><p>{esc(s['plan'])}</p></div>
  <div class="foot"><span>{esc(FOOT)} · <span class="assume">explainer figures are illustrative assumptions</span></span><span>{page}</span></div>
  <div class="notes"><p class="nk">SPEAKER NOTES</p><p data-k="{k}.notes">Placeholder: this slide is built in {esc(s['step'])}.</p><p class="src"><b>Sources:</b> none yet.</p></div>
</section>"""


def render_scope(s: dict) -> str:
    k = s["key"]
    badge = {"in": "IN", "out": "OUT", "unused": "NOT USED"}
    tiles = "".join(
        f'<button class="topic {st}{" on" if n == 3 else ""}" data-t="{n}"><span class="tn">Topic {n}</span>'
        f'<span class="tname">{esc(name)}</span><span class="tbadge">{badge[st]}</span>{f'<span class="tch">→ {esc(ch)}</span>' if ch else ""}'
        f'<span class="treason">{esc(why)}</span></button>'
        for n, name, st, ch, why, course in s["topics"])
    details = "".join(
        f'<div class="tdetail{" on" if n == 3 else ""}" data-t="{n}"><h5>Topic {n} · {esc(name)} '
        f'<span class="tbadge {st}">{badge[st]}{" · " + esc(ch) if ch else ""}</span></h5>'
        f'<p><b>Course content:</b> {esc(course)}</p><p><b>Why {"we use it" if st == "in" else "it is out"}:</b> {esc(why)}</p></div>'
        for n, name, st, ch, why, course in s["topics"])
    scope_ex = (f'<div class="explainer" data-widget="scope"><div class="exhead"><span class="tag">● INTERACTIVE EXPLAINER</span>'
                f'{ed(f"{k}.ex", s["explainer_title"], "span", "ex-title")}</div><div class="topics">{tiles}</div>'
                f'<div class="tdetails screenonly">{details}</div></div>')
    where = dict(key=f"{k}w", widget="where", explainer_title=s["where_title"], caption=s["where_caption"],
                 scenarios=s["scenarios"], printnote=s["printnote"], logic=s.get("logic"))
    return (f'{scope_ex}<div class="grid gsc"><div class="left">{render_explainer(where)}</div>'
            f'<div class="right">{render_view(s)}</div></div>')


LEVER_FMT = {"u": lambda x: f"±{round(x * 100, 1):g}%", "wage": lambda x: f"S${x:,.2f}/h",
             "machineMonth": lambda x: f"S${x:,.0f}/month", "cupsPerDay": lambda x: f"{x:,.0f} cups/day",
             "newShare": lambda x: f"{x * 100:.0f}% new staff", "machineMult": lambda x: f"{x:.2f}×",
             "coordHuman": lambda x: f"{x:.2f}", "coordMixed": lambda x: f"{x:.2f}"}
SETUP_NAME = {"all_human": "all-human", "mixed": "mixed", "all_machine": "all-machine"}


def trigger_text(lever: str, a: str, b: str) -> tuple:
    """(value, short reading, raw result) for one sim/ break-even. Never typed in: read from data.json."""
    r = next(x for x in DATA_CACHE["breakEven"] if (x["lever"], x["a"], x["b"]) == (lever, a, b))
    f = LEVER_FMT[lever]
    rng = f"swept {f(r['range'][0])} to {f(r['range'][1])}"
    if r["kind"] == "none_in_range":
        return ("none in range", f"No break-even in range ({rng}): {SETUP_NAME[r[r['cheaper']]]} is cheaper "
                                 f"throughout, so this choice holds everywhere.", r)
    lo = r[r["below"]]
    hi = b if lo == a else a
    step = " Step: staff and machines come in whole units." if r["step"] else ""
    if lever == "cupsPerDay":
        step += " Trigger range, not a new-store forecast."
    return (f(r["x"]) + (" · step" if r["step"] else ""),
            f"Below it {SETUP_NAME[lo]} is cheaper, above it {SETUP_NAME[hi]} ({rng}).{step}", r)


TRADE_LABEL = {"wage": "Wage per hour", "cupsPerDay": "Steady volume", "machineMonth": "Machine cost",
               "u": "Forecast band", "coordHuman": "All-human coordination", "coordMixed": "Mixed coordination",
               "newShare": "New-hire share", "machineMult": "Machine time"}


def cost_split() -> dict:
    """Cost per cup by setup at the default band and surge, split into labour, machines and lost sales (sim/ sweep)."""
    d, g = DATA_CACHE, A["surge"]["surge_default"]["value"]
    rows, u = d["sweeps"][g]["rows"], d["defaults"]["u"]
    for r0, r1 in zip(rows, rows[1:]):
        if r0["u"] <= u <= r1["u"]:
            t = (u - r0["u"]) / (r1["u"] - r0["u"])
            return {k: {f: r0[k][f] + t * (r1[k][f] - r0[k][f]) for f in ("cost", "machine", "labour", "lost")}
                    for k in ("all_human", "mixed", "all_machine")}
    return {k: rows[-1][k] for k in ("all_human", "mixed", "all_machine")}


def price_tip(lever: str, kind: str, a: str = "all_human", b: str = "mixed") -> str:
    """Hover text explaining how a price in the trigger tables is derived. Empty for non-price levers."""
    if lever not in ("wage", "machineMonth"):
        return ""
    c, d = cost_split(), DATA_CACHE
    cpd = A["store"]["cups_per_store_per_year"]["value"] / A["store"]["open_days_per_year"]["value"]
    days, util = A["store"]["open_days_per_year"]["value"], d["util"][A["surge"]["surge_default"]["value"]]
    split = lambda k: (f"{SETUP_NAME[k]}: labour S${c[k]['labour']:.3f} + machines S${c[k]['machine']:.3f} + lost sales "
                       f"S${c[k]['lost']:.3f} = S${c[k]['cost']:.3f} a cup")
    V = A["validation"]["breakeven"]["value"]
    how = (f"Found by sim/ breakEven: {V['grid_points']} points scanned across the approved range, then bisection to "
           f"{V['tol_x_share_of_range'] * 100:g}% of the range; every other input at our defaults.")
    if lever == "wage" and kind == "now":
        return "How S$15.06 is built (assumptions.json):\n" + A["costs"]["labour_cost_per_hour"]["rationale"].split(". ", 1)[1]
    if lever == "machineMonth" and kind == "now":
        m = A["costs"]["machine_cost_per_unit_per_month"]
        return (f"Approved as USD {m['value_usd']:,.0f} a month per machine unit, converted at "
                f"{A['_meta']['fx_sgd_per_usd']['value']} SGD per USD (L-xrates) = S${m['value']:,.2f}. "
                + m["rationale"].split(" Converted")[0])
    if kind == "none":
        r = next(x for x in d["breakEven"] if (x["lever"], x["a"], x["b"]) == (lever, a, b))
        f = LEVER_FMT[lever]
        return (f"No break-even: across {f(r['range'][0])} to {f(r['range'][1])}, {SETUP_NAME[r[r['cheaper']]]} stays "
                f"cheaper.\nAt our defaults:\n{split(a)}\n{split(b)}\n{how}")
    if lever == "wage":
        return (f"The wage at which {SETUP_NAME[a]} and {SETUP_NAME[b]} cost the same per cup.\nAt our defaults:\n"
                f"{split(a)}\n{split(b)}\nA higher wage raises labour per cup in proportion, and the counter with more "
                f"staff hours per cup rises faster (peak staff: all-human {util['all_human']['staff']}, mixed "
                f"{util['mixed']['staff']} plus {util['mixed']['machineUnits']} machines).\n{how}")
    units = util[b]["machineUnits"]
    per100 = units * 100 * 12 / days / cpd
    return (f"The machine price at which {SETUP_NAME[a]} and {SETUP_NAME[b]} cost the same per cup.\nAt our defaults:\n"
            f"{split(a)}\n{split(b)}\n{SETUP_NAME[b].capitalize()} carries {units} machine units: each S$100 a month per "
            f"unit adds {units} × S$100 × 12 ÷ {days} days ÷ {cpd:.0f} cups a day = about S${per100:.3f} a cup.\n{how}")


def trigger_rows(a: str, b: str, levers: list, now: dict) -> list:
    """(sort key, row html) per lever: when setup b beats setup a, from sim/ breakEven at our defaults."""
    rows = []
    for lever in levers:
        r = next(x for x in DATA_CACHE["breakEven"] if (x["lever"], x["a"], x["b"]) == (lever, a, b))
        f = LEVER_FMT[lever]
        tx = price_tip(lever, "none" if r["kind"] == "none_in_range" else "x", a, b)
        tn = price_tip(lever, "now", a, b)
        tip = lambda t: f' class="ptip" data-tip="{esc(t)}" tabindex="0"' if t else ""
        if r["kind"] == "none_in_range":
            rows.append((9e9, f'<tr class="none"><th>{TRADE_LABEL[lever]}</th><td colspan="3"{tip(tx)}>none in '
                              f'{f(r["range"][0])} to {f(r["range"][1])}: {SETUP_NAME[r[r["cheaper"]]]} cheaper '
                              f'throughout</td></tr>'))
            continue
        b_above = r[r["below"]] == a
        dist = (r["x"] - now[lever]) / now[lever]
        rows.append((abs(dist), f'<tr><th>{TRADE_LABEL[lever]}</th><td{tip(tx)}>{"above" if b_above else "below"} '
                                f'<b>{f(r["x"])}</b>{" · step" if r["step"] else ""}</td><td{tip(tn)}>{f(now[lever])}</td>'
                                f'<td>{dist * 100:+.0f}%</td></tr>'))
    rows.sort(key=lambda t: t[0])
    return rows


def render_playbook(s: dict) -> str:
    now, k = DATA_CACHE["leverNow"], s["key"]
    head = '<thead><tr><th>Trigger</th><th>flips when</th><th>ours</th><th>gap</th></tr></thead>'
    parts = []
    for title, who, (a, b), levers in s["groups"]:
        tr = trigger_rows(a, b, levers, now)
        live = [h for k_, h in tr if k_ < 9e9]
        none = [TRADE_LABEL[l] for l in levers if next(x for x in DATA_CACHE["breakEven"]
                if (x["lever"], x["a"], x["b"]) == (l, a, b))["kind"] == "none_in_range"]
        cheaper = SETUP_NAME[a] if b == "mixed" else SETUP_NAME[a]
        if none:
            live.append(f'<tr class="none"><th>{esc(", ".join(none))}</th><td colspan="3">no threshold in the tested '
                        f'range: {cheaper} stays cheaper throughout</td></tr>')
        rows = "".join(live).replace("<tr>", '<tr class="near">', 1)
        parts.append(f'<tr class="grp"><th colspan="4">{esc(title)} <span>· {esc(who)}</span></th></tr>{rows}')
    m = DATA_CACHE["milkTrigger"]
    title, who = s["stock_group"]
    mt = (f"Waste cost per litre at which the best opening order falls to the base forecast: a lost cup costs "
          f"S${m['stockoutCost']:.2f} (provision.stockout_cost_per_cup: {A['provision']['stockout_cost_per_cup']['rationale']}) "
          f"and uses {m['milkPerCup']:g} L of milk (provision.milk_litres_per_cup), so a litre short loses "
          f"S${m['stockoutCost']:.2f} ÷ {m['milkPerCup']:g} = S${m['value']:.2f}. Our waste cost is "
          f"S${A['provision']['milk_waste_cost_per_litre']['value']:.2f} a litre "
          f"({A['provision']['milk_waste_cost_per_litre']['rationale']}).")
    milk = (f'<tr><th>Milk waste per litre</th><td colspan="3" class="ptip" data-tip="{esc(mt)}" tabindex="0">'
            + (f'none in S${m["range"][0]:.2f} to S${m["range"][1]:.2f}/L: order above base throughout '
               f'(flips at S${m["value"]:.2f}/L = S${m["stockoutCost"]:.2f} per lost cup ÷ {m["milkPerCup"]:g} L)'
               if m["kind"] == "none_in_range" else f'above <b>S${m["value"]:.2f}/L</b>') + '</td></tr>')
    parts.append(f'<tr class="grp"><th colspan="4">{esc(title)} <span>· {esc(who)}</span></th></tr>{milk}')
    table = (f'<div class="pbtable"><table>{head}<tbody>{"".join(parts)}</tbody></table>'
             f'{ed(f"{k}.tn", s["table_note"], "p", "tnote")}</div>')
    return (f'<div class="grid gpb"><div class="left">{table}</div>'
            f'<div class="right">{render_explainer(s)}{render_view(s)}</div></div>')


def render_tradeoff(s: dict) -> str:
    """Mixed versus all-human, one row per lever: the break-even from sim/, where we are, and how far."""
    rows = trigger_rows("all_human", "mixed", s["tradeoff"], DATA_CACHE["leverNow"])
    body = "".join(h for _, h in rows).replace("<tr>", '<tr class="near">', 1)
    return (f'<div class="tradeoff"><h4>{esc(s["tradeoff_title"])}</h4><table><thead><tr><th>Mixed wins when…</th>'
            f'<th>is</th><th>ours</th><th>gap</th></tr></thead><tbody>{body}</tbody></table>'
            f'<p class="tnote">Each row moves one input with the rest at our defaults; nearest first. A crossed row is a '
            f'reason to recheck, not a rule to switch.</p></div>')


def milk_trigger_text() -> tuple:
    """The milk waste cost per litre at which the best opening order falls to the base forecast (sim/ milkTrigger)."""
    m = DATA_CACHE["milkTrigger"]
    conv = f"= S${m['stockoutCost']:.2f} per lost cup ÷ {m['milkPerCup']:g} L per cup"
    if m["kind"] == "none_in_range":
        return (f"S${m['value']:.2f}/L", f"{conv}. Above the whole S${m['range'][0]:.2f} to S${m['range'][1]:.2f}/L "
                                        f"range, so ordering above base holds everywhere.", {"lever": "milk", "x": m["value"]})
    return (f"S${m['value']:.2f}/L", f"{conv}. Above it, order at or below base.", {"lever": "milk", "x": m["value"]})


def render_inv(s: dict) -> str:
    """Whole-store inventory slide: forecast-to-order chain and concepts (left), qualitative plan matrix (right)."""
    k = s["key"]
    cons = "".join(concept_line(*c) for c in s.get("concepts", []))
    chain = "".join(f'<div class="cstep"><span class="cn">{i + 1}</span><div>{ed(f"{k}.c{i}.t", t, "h4")}'
                    f'{ed(f"{k}.c{i}.b", b, "p")}</div></div>' for i, (t, b) in enumerate(s["chain"]))
    head = "".join(f"<th>{esc(c)}</th>" for c in s["matrix_cols"])
    rows = "".join("<tr>" + f"<th>{esc(r[0])}</th>" + "".join(f"<td>{esc(x)}</td>" for x in r[1:]) + "</tr>"
                   for r in s["matrix"])
    return (f'<div class="grid ginv"><div class="left"><div class="chain"><h4>{esc(s["chain_title"])}</h4>{chain}</div>'
            f'<div class="concepts">{cons}</div></div>'
            f'<div class="right"><div class="invm"><h4>{esc(s["matrix_title"])}</h4><table><thead><tr>{head}</tr></thead>'
            f'<tbody>{rows}</tbody></table><p class="tnote">{esc(s["matrix_note"])}</p></div>{render_view(s)}</div></div>')


def render_gate(s: dict) -> str:
    """Gate card: decision and suggested action first, the few numbers under them, then trade-off and limitation;
    owners' actions and the calculation open on request. Elements with data-g are filled live by the widgets."""
    k, g = s["key"], s["gate"]
    ev = "".join(f'<span class="gev"><span>{esc(lab)}</span><b data-g="{key}">{esc(val)}</b></span>'
                 for key, lab, val in g["evidence"])
    acts = "".join(f'<li class="a-{r}">{role_chip(r)} {ed(f"{k}.ga{i}", x, "span")}</li>'
                   for i, (r, x) in enumerate(g["actions"]))
    who = "".join(role_chip(r) for r in g["who"])
    calc = "".join(f"<p>{esc(x)}</p>" for x in g["calc"])
    return (f'<div class="gate-card collapsed" data-gate="{k}">'
            f'<div class="gc-top"><span class="gc-n">GATE {g["n"]} · {esc(g["name"]).upper()}</span>'
            f'<div class="gc-dec"><span class="gl">Decision</span>{ed(f"{k}.gd", g["decision"], "p")}</div>'
            f'<div class="gc-act"><span class="gl">Suggested action <i class="gstate"></i></span>'
            f'<p data-g="action">{esc(g["action"])}</p></div>'
            f'<div class="gc-ev"><span class="gl">Evidence</span><div class="gevs">{ev}</div></div></div>'
            f'<div class="gc-mid"><div><span class="gl">Trade-off</span><p>{esc(g["tradeoff"])}</p></div>'
            f'<div><span class="gl">Limitation</span><p>{esc(g["limitation"])}</p></div>'
            f'<button class="gc-toggle screenonly" aria-expanded="false">Who does what · how it is calculated ▸</button></div>'
            f'<div class="gc-more"><div class="gc-who"><span class="gl">Who does what</span> {who}<ol class="dacts">{acts}</ol></div>'
            f'<div class="gc-calc"><span class="gl">How it is calculated</span>{calc}</div></div></div>')


def render_decision(s: dict) -> str:
    k, d = s["key"], s["decision"]
    if d["trigger"][0] == "milk":
        val, read, r = milk_trigger_text()
        label = "waste cost per litre at which the best order falls to the base forecast"
    else:
        val, read, r = trigger_text(*d["trigger"][:3])
        label = d["trigger"][3]
    if not d.get("also"):
        also = ""
    elif isinstance(d["also"], str):
        also = esc(d["also"])
    else:
        aval, aread, r2 = trigger_text(*d["also"][:3])
        also = f'<b>{esc(d["also"][3])}:</b> {esc(aval + "." if r2["kind"] == "value" else aread)}'
    live = f' data-lever="{r["lever"]}" data-x="{r.get("x", "")}"'
    acts = "".join(f'<li class="a-{r}">{role_chip(r)} {ed(f"{k}.da{i}", x, "span")}</li>'
                   for i, (r, x) in enumerate(d["actions"]))
    who = "".join(role_chip(r) for r in d["who"])
    return (f'<div class="dstrip collapsed"{live}><span class="dtag">DECISION STRIP</span>'
            f'<div class="drow"><div class="df"><span class="dl">Decision</span>{ed(f"{k}.dq", d["question"], "p")}</div>'
            f'<div class="df"><span class="dl">Who decides</span><p class="dwho">{who}</p></div>'
            f'<div class="df dt"><span class="dl">Trigger · computed by sim/</span><p><b class="dv">{esc(val)}</b> '
            f'<span class="dlab">{esc(label)}</span></p><p class="dnow"></p></div>'
            f'<button class="dtoggle screenonly" aria-expanded="false">What to do ▸</button></div>'
            f'<div class="dmore"><p class="dread">{esc(read)}' + (f' {also}' if also else "") + '</p>'
            f'<ol class="dacts">{acts}</ol></div></div>')


def fmt_value(v) -> str:
    """Compact, readable value for the assumptions table."""
    if isinstance(v, bool):
        return "yes" if v else "no"
    if isinstance(v, (int, float)):
        return f"{v:,.4g}" if abs(v) < 1e5 else f"{v:,.0f}"
    if isinstance(v, list):
        return ", ".join(fmt_value(x) for x in v)
    t = " · ".join(f"{k.replace('_', ' ')} {fmt_value(x)}" for k, x in v.items()) if isinstance(v, dict) else str(v)
    return t if len(t) <= 110 else t[:108] + "…"


def render_a1(s: dict) -> str:
    rows = []
    for sec in s["sections"]:
        rows.append(f'<tr class="grp"><th colspan="5">{esc(sec.replace("_", " "))}</th></tr>')
        for key, a in A[sec].items():
            if not isinstance(a, dict) or "value" not in a:
                continue
            rng = "–" if a.get("range") is None else (fmt_value(a["range"][0]) + " to " + fmt_value(a["range"][1])
                                                      if isinstance(a["range"], list) and len(a["range"]) == 2 else fmt_value(a["range"]))
            src = a.get("source", "")
            rows.append(f'<tr><th>{esc(key.replace("_", " "))}</th><td>{esc(fmt_value(a["value"]))}</td>'
                        f'<td>{esc(str(a.get("unit", "")))}</td><td>{esc(rng)}</td><td>{esc(src)}</td></tr>')
    return (f'<div class="apx a1t"><table><colgroup><col style="width:190px"><col style="width:380px">'
            f'<col style="width:270px"><col style="width:110px"><col></colgroup><thead><tr><th>Assumption</th><th>Value</th><th>Unit</th><th>Range</th>'
            f'<th>Source</th></tr></thead><tbody>{"".join(rows)}</tbody></table>'
            f'<p class="tnote">Source "assumption" = our illustrative choice; ledger IDs are listed in A3. Ranges drive '
            f'the sliders and the sensitivity chart in A2.</p></div>')


def render_a4(s: dict) -> str:
    d, B = DATA_CACHE, A["business_case"]
    bc = business_case(d)
    ys, v = bc["years"], (lambda k: B[k]["value"])
    money = lambda x: (f'<span class="neg">(S${-x / 1e3:,.0f}k)</span>' if x < -0.5
                       else "–" if abs(x) < 0.5 else f"S${x / 1e3:,.0f}k")
    def row(label, key, note, cls="", f=money):
        return (f'<tr class="{cls}"><th>{esc(label)}</th>' + "".join(f"<td>{f(r[key])}</td>" for r in ys)
                + f'<td class="how">{esc(note)}</td></tr>')
    grp = lambda t: f'<tr class="grp"><th colspan="{len(ys) + 2}">{esc(t)}</th></tr>'
    stores = A["benefit"]["overseas_stores_per_year"]["value"]
    k = lambda x: f"S${x / 1e3:,.0f}k"
    rows = [
        grp("Benefit: modelled avoided cost (no sales revenue)"),
        row("New stores opened", "opens", f"About {stores} overseas openings planned for 2026 (L-jiemian); held flat "
            "after that (no later figure in our sources)", f=lambda x: f"{x:,.0f}"),
        row("Store-years using the gates", "store_years", f"Earlier stores trade all year; new stores "
            f"{v('opening_year_share'):.0%} of a year (mid-year openings)", f=lambda x: f"{x:,.0f}"),
        row("Counter saving (recurring)", "counter", f"Store-years × S${bc['per_store']:,.0f}: the mixed counter's yearly "
            f"cost above the cheapest counter, openings spread over our volume range (slide {REFNUM['s5']})"),
        row("Fresh-milk opening stock (once per opening)", "stock", f"Openings × S${bc['per_open']:,.0f}: best milk order "
            "with no signal minus with the member signal; if the signal narrows the range as assumed. Tea, other ingredients and packaging: not estimated"),
        row("Total benefit", "benefit", "", "tot"),
        grp("Cost of the initiative: one-time"),
        row("Build the four gates", "build", f"{v('build_people')} people × {v('build_months')} months × "
            f"{bc['mday']} days × S${bc['rate']:,.0f} a day: forecast, ordering, counter comparison, review"),
        row("Data integration and set-up", "integ", "POS sales, app sign-ups and supplier order feeds; lump sum"),
        row("Total one-time cost", "one_time", "", "stot"),
        grp("Cost of the initiative: recurring"),
        row("Maintenance team", "maint", f"{v('maintenance_people')} people × 12 months × {bc['mday']} days × "
            f"S${bc['rate']:,.0f}; counted from year 1 (conservative)"),
        row("Platform and licences", "platform", f"Store-years × S${v('platform_per_store_month'):,.0f} a month × 12"),
        row("Gate 4 reviews", "review", f"Openings × {v('review_days_per_opening')} analyst day × "
            f"S${bc['rate']:,.0f}: updated scenario against the original plan"),
        row("Total recurring cost", "recurring", "", "stot"),
        row("Total cost", "cost", "", "tot"),
        row("Net benefit", "net", "Total benefit minus total cost", "tot"),
        row("Cumulative net", "cum", "From year 1", "cum"),
    ]
    sens = [("one-time costs double", business_case(d, one_time_mult=2)),
            ("counter saving halves", business_case(d, saving_mult=0.5)),
            (f"openings fall to {stores // 2} a year", business_case(d, openings=stores // 2))]
    cumtxt = lambda x: (f"{k(x)} ahead" if x >= 0 else f"{k(-x)} short")
    stxt = "; ".join(f"{t}: {cumtxt(b['years'][-1]['cum'])}" + (f", payback year {b['payback']}" if b["payback"]
                                                                  else ", no payback") for t, b in sens)
    head = "".join(f"<th>Year {i + 1}</th>" for i in range(len(ys)))
    return (f'<div class="apx a4t"><table><colgroup><col style="width:220px">'
            + "".join('<col style="width:92px">' for _ in ys) + '<col></colgroup>'
            f'<thead><tr><th>Item</th>{head}<th>Assumption / how calculated</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
            f'<p class="tnote"><b>Sensitivity, cumulative net after {len(ys)} years.</b> {esc(stxt)}.</p>'
            f'<p class="tnote"><b>Read with care.</b> No sales revenue: we have no price or demand-elasticity '
            f'assumption, so the benefit is the modelled avoided cost from slide {REFNUM["s5"]}, against a mixed '
            f'counter at every opening; it is not a demonstrated AI saving. The cost lines are our approved '
            f'illustrative assumptions (A1, business case), not Chagee or vendor figures. Values in S$ thousands; '
            f'brackets are negative.</p></div>')


def render_a2(s: dict) -> str:
    d = DATA_CACHE
    W = A["validation"]["week5_comparison"]["value"]
    w5 = "".join(f'<tr><td>{esc(", ".join(f"{x:g}" for x in w["speeds"]))}</td><td>{w["engine"]:.3f}</td>'
                 f'<td>{w["pooled"]:.3f}</td><td class="{"bad" if w["gapPct"] > W["tolerance_pct"] else "ok"}">'
                 f'{w["gapPct"]:.2f}%</td></tr>' for w in d["week5"])
    st = d["stability"]
    KIND = {"mixed_cheaper_everywhere": "mixed cheaper than full automation at every band width",
            "machine_cheaper_everywhere": "full automation cheaper than mixed at every band width",
            "crossover": "with a crossover", "reverse": "with a reverse crossover"}
    kinds = ", ".join(f"{v} of {st['seeds']} seeds: {KIND.get(k, k.replace('_', ' '))}" for k, v in st["kinds"].items())
    cap = d["storeCap"]
    caprows = "".join(f'<tr><td>{SETUP_NAME[k]}</td><td>{v["replica"]:.2f}</td><td>{v["nominal"]:.2f}</td>'
                      f'<td>{v["replica"] / v["nominal"] * 100:.0f}%</td></tr>' for k, v in cap.items())
    left = (f'<div class="apx"><h4>Week 5 check: pooled staffing formula vs the Week 5 engine</h4>'
            f'<table><thead><tr><th>Worker speeds</th><th>Engine, lines/h</th><th>Pooled</th><th>Gap</th></tr></thead>'
            f'<tbody>{w5}</tbody></table><p class="tnote"><b class="bad">{"Passes" if d["week5Pass"] else "Fails"}</b> '
            f'the pre-registered ±{W["tolerance_pct"]:g}% tolerance: the pooled formula overstates a real bucket brigade. '
            f'The coordination factor (0.9) absorbs part of this.</p>'
            f'<h4>Seed stability</h4><p class="tnote">Uncertainty sweep at the {esc(st["surge"])} surge: {esc(kinds)}. '
            + (f'The result agrees in every seed. The pre-registered rule asks for a crossover point in most seeds; '
               f'with none in any seed, the deck shows no crossover point, as the rule requires.</p>'
               if not st["pass"] and st["kinds"].get("crossover", 0) == 0 else
               f'{"Passes" if st["pass"] else "Does not pass"} the stability rule.</p>') +
            f'<h4>Store replica (walking modelled) vs cost-model capacity, cups per minute</h4>'
            f'<table><thead><tr><th>Counter</th><th>Replica</th><th>Cost model</th><th>Share</th></tr></thead>'
            f'<tbody>{caprows}</tbody></table><p class="tnote">The replica animates movement only; times and costs '
            f'on the slides come from the cost model.</p></div>')
    T = d["tornado"]
    rows = [r for r in T["rows"] if abs(r["gapHi"] - r["gapLo"]) > 1e-3]
    flat = [r for r in T["rows"] if abs(r["gapHi"] - r["gapLo"]) <= 1e-3]
    lo = min(min(r["gapLo"], r["gapHi"]) for r in rows + [{"gapLo": T["base"], "gapHi": T["base"]}])
    hi = max(max(r["gapLo"], r["gapHi"]) for r in rows + [{"gapLo": T["base"], "gapHi": T["base"]}])
    lo, hi = min(lo, 0) * 1.1, hi * 1.1
    Wd, L, R, rh, top = 560, 190, 470, 19, 22
    X = lambda v: L + (R - L) * (v - lo) / (hi - lo)
    svg = [f'<line x1="{X(0):.1f}" x2="{X(0):.1f}" y1="{top - 6}" y2="{top + rh * len(rows)}" stroke="#23272f"/>',
           f'<line x1="{X(T["base"]):.1f}" x2="{X(T["base"]):.1f}" y1="{top - 6}" y2="{top + rh * len(rows)}" '
           f'stroke="#9aa3af" stroke-dasharray="3 3"/>',
           f'<text x="{X(0) - 4:.1f}" y="{top - 9}" font-size="9.5" fill="#2563eb" text-anchor="end">← mixed cheaper</text>',
           f'<text x="{X(0) + 4:.1f}" y="{top - 9}" font-size="9.5" fill="#2a9d8f">all-human cheaper →</text>']
    for i, r in enumerate(rows):
        y = top + i * rh
        a, b = sorted((r["gapLo"], r["gapHi"]))
        flips = a < 0 < b or (a < 0 and b < 0)
        svg.append(f'<text x="{L - 6}" y="{y + 12}" font-size="10" fill="#23272f" text-anchor="end">'
                   f'{esc(r["key"].split(".")[1].replace("_", " "))}</text>')
        svg.append(f'<rect x="{X(a):.1f}" y="{y + 3}" width="{max(1, X(b) - X(a)):.1f}" height="{rh - 6}" rx="2" '
                   f'fill="{"#d4892a" if flips else "#c5cad3"}"/>')
        svg.append(f'<text x="{X(b) + 4:.1f}" y="{y + 12}" font-size="9" fill="#6b7280">'
                   f'{fmt_value(r["range"][0])}–{fmt_value(r["range"][1])}</text>')
    axis = "".join(f'<text x="{X(v):.1f}" y="{top + rh * len(rows) + 12}" font-size="9" fill="#6b7280" '
                   f'text-anchor="middle">{"−" if v < 0 else ""}S${abs(v):.2f}</text>'
                   for v in (lo / 1.1, 0, hi / 1.1))
    h = top + rh * len(rows) + 18
    right = (f'<div class="apx"><h4>Sensitivity: mixed minus all-human cost per cup, one assumption at a time</h4>'
             f'<svg viewBox="0 0 {Wd} {h}" class="tornado" role="img" aria-label="Sensitivity of the counter gap">'
             f'{"".join(svg)}{axis}</svg><p class="tnote">Dashed: our default gap (S${T["base"]:.3f} a cup, all-human '
             f'cheaper). Amber bars cross zero inside their approved range, so they can flip the choice; labels '
             f'show the range tested. No visible effect: '
             f'{esc(", ".join(r["key"].split(".")[1].replace("_", " ") for r in flat))}.</p></div>')
    return f'<div class="grid ga2"><div class="left">{left}</div><div class="right">{right}</div></div>'


def render_a3(s: dict) -> str:
    def status(t):
        t = t.upper()
        return "informal" if "INFORMAL" in t or t.startswith("I-") else "secondary" if "SECONDARY" in t else "public"
    rows = "".join(f'<tr><th>{esc(k)}</th><td>{esc(v if len(v) <= 165 else v[:163] + "…")}</td>'
                   f'<td class="st {status(k + " " + v)}">{status(k + " " + v)}</td></tr>'
                   for k, v in A["_sources"].items())
    nc = "".join(f"<li>{esc(x)}</li>" for x in s["not_claimed"])
    return (f'<div class="grid ga3"><div class="left apx a3t"><table><thead><tr><th>ID</th><th>Source and what it '
            f'supports</th><th>Status</th></tr></thead><tbody>{rows}</tbody></table></div>'
            f'<div class="right apx"><h4>Claims we did not make</h4><ul class="nc">{nc}</ul></div></div>')


def render_slide(page: int, s: dict, n: int = 0, total: int = 0) -> str:
    k = s["key"]
    sub = ed(f"{k}.sub", s["sub"], "p", "sub") if s.get("sub") else ""
    if s["widget"] == "scope":
        grid = render_scope(s)
    elif s["widget"] == "storefront":
        serve = dict(key=f"{k}t", widget="serve", explainer_title=s["serve_title"], caption=s["serve_caption"],
                     printnote=s["serve_printnote"])
        summary = (f'<summary><span class="slab">{esc(s["serve_summary"])}</span><span class="ssum"></span>'
                   f'<span class="sopen screenonly">open the chart ▸</span><span class="sclose screenonly">close ▾</span></summary>')
        grid = (f'{render_explainer(s)}<div class="grid gstore"><div class="left"><details class="servebox">{summary}'
                f'<div class="servepop">{render_explainer(serve)}</div></details></div>'
                f'<div class="right">{render_view(s)}</div></div>')
    elif s["widget"] == "playbook":
        grid = render_playbook(s)
    elif s["widget"] == "invplan":
        grid = render_inv(s)
    elif s["widget"] in ("a1", "a2", "a3", "a4"):
        grid = {"a1": render_a1, "a2": render_a2, "a3": render_a3, "a4": render_a4}[s["widget"]](s)
    elif s["widget"] == "volcost":
        conf = ed(f"{k}.conf", s["confidence"], "p", "conf")
        grid = (f'<div class="grid gcost"><div class="left">{render_explainer(s)}</div>'
                f'<div class="right">{render_tradeoff(s)}{conf}</div></div>')
    elif s["widget"] == "benefit":
        gates = "".join(
            f'<div class="gate"><span class="gn">{i + 1}</span><div><p class="gh"><b>{esc(when)}</b> · {esc(what)} '
            f'<span class="gref">slide {esc(ref)}</span></p>{ed(f"{k}.g{i}", body, "p", "gb")}'
            f'<p class="gw">{"".join(role_chip(r) for r in who)}</p></div></div>'
            for i, (when, what, who, body, ref) in enumerate(s["gates"]))
        risks = "".join(f'<div class="rk"><b>{esc(t)}</b>{ed(f"{k}.r{i}.b", b, "span")}</div>'
                        for i, (t, b) in enumerate(s["risks"]))
        grid = (f'<div class="grid g5"><div class="left">{render_explainer(s)}'
                f'<div class="rkgrid"><h4>Risks and how we would manage them</h4>{risks}</div></div>'
                f'<div class="right"><div class="gates"><h4>{esc(s["gates_title"])}</h4>{gates}</div>'
                f'{render_view(s)}</div></div>')
    else:
        cons = "".join(concept_line(*c) for c in s.get("concepts", []))
        cons = f'<div class="concepts">{cons}</div>' if cons else ""
        grid = (f'<div class="grid"><div class="points">{cons}{render_points(s)}</div>'
                f'<div class="right">{render_explainer(s)}{render_view(s)}</div></div>')
    return f"""
<section class="slide content {k}" aria-label="Slide {page}" data-chapter="{s['chapter']}" data-kicker="{esc(s['kicker'])}">
  {render_rail(s['chapter'], n, total, s.get('kicker', '') if s['chapter'] == 'appendix' else '')}
  {ed(f"{k}.h", s['headline'], "h2")}
  {sub}
  {render_gate(s) if s.get("gate") else ""}
  {grid}
  {render_decision(s) if s.get("decision") else ""}
  <div class="foot"><span>{esc(FOOT)} · <span class="assume">explainer figures are illustrative assumptions</span></span><span>{page}</span></div>
  <div class="notes"><p class="nk">SPEAKER NOTES</p>{ed(f"{k}.notes", s['notes'], "p")}<p class="src"><b>Sources:</b> {esc(s['sources'])}</p></div>
</section>"""


def week5_engine() -> str:
    """The Week 5 bucket-brigade engine's simulation part, read from the reference deck (never modified)."""
    src = (ROOT / "week5" / "build_opim639_deck.py").read_text(encoding="utf-8")
    eng = re.search(r'ENGINE = r"""([\s\S]*?)"""', src).group(1).split("/* ================= drawing helpers")[0]
    return f"const W5=(function(){{\n{eng}\nreturn {{Brigade, measure}};\n}})();"


REFNUM: dict = {}


def ledger_check() -> None:
    """Every ledger ID cited in the slides or in assumptions.json must exist in _sources."""
    cited = set(re.findall(r"\b[LI]-[a-z][\w-]*", json.dumps(CONTENT) + json.dumps({k: v for k, v in A.items() if k != "_sources"})))
    missing = sorted(c.rstrip("-") for c in cited if c.rstrip("-") not in A["_sources"])
    if missing:
        raise SystemExit(f"ledger: cited but not in assumptions.json _sources: {', '.join(missing)}")


def timing_check(filled: dict) -> None:
    """Sum each chapter's 'About N seconds/minutes' notes and fail if a chapter runs over its Contents time."""
    used = {c[0]: 0 for c in CHAPTERS}
    for key in DECK:
        it = filled.get(key)
        if not it or it["chapter"] == "appendix":
            continue
        m = re.match(r"About (\d+(?:\.\d+)?) (minutes?|seconds)", it["notes"])
        if not m:
            raise SystemExit(f"timing: notes for {key!r} do not start with 'About N seconds/minutes'")
        used[it["chapter"]] += float(m.group(1)) * (60 if m.group(2).startswith("minute") else 1)
    over = [f"{cid}: {used[cid]:.0f} s against {sec} s" for cid, _, _, sec in CHAPTERS if used[cid] > sec]
    if over:
        raise SystemExit("timing: chapters over their Contents time - " + "; ".join(over))
    print("timing: " + ", ".join(f"{cid} {used[cid]:.0f}/{sec} s" for cid, _, _, sec in CHAPTERS))


def slide_label(key: str, filled: dict) -> str:
    if key in REFNUM:
        return str(REFNUM[key])
    m = re.search(r"\bA[1-5]\b", filled[key]["kicker"])
    return m.group(0) if m else key


def write_claims(filled: dict, simv: dict) -> None:
    """deck/claims.md from the same data and placeholders as the slides."""
    text = {k: json.dumps(v, ensure_ascii=False) for k, v in CONTENT_RAW.items()}
    where = lambda needle: ", ".join(slide_label(k, filled) for k in DECK if k in text and needle in text[k]) or "-"
    fill = lambda t: check_and_fill(t, simv, "claims")
    status = lambda t: ("INFORMAL" if "INFORMAL" in t.upper() else "SECONDARY" if "SECONDARY" in t.upper() else "OK")
    out = ["# Claims register: Chagee deck", "",
           "Generated by deck/build_deck.py from assumptions.json, data.json and the slide text. Do not edit by hand.",
           "Slide numbers follow the progress rail (on-stage slides); A1-A4 are appendix pages. Status: OK = public "
           "ledger source; SECONDARY = secondary source, flagged where shown; INFORMAL / CHECK = confirm before "
           "presenting; MODEL = simulator or assumption (illustrative).", "",
           "## Chagee facts", "", "| Fact | Value | Source | Status | Slides |", "|---|---|---|---|---|"]
    for k, a in A["facts"].items():
        if isinstance(a, dict) and "value" in a:
            src = a["source"]
            out.append(f'| {k.replace("_", " ")} | {fmt_value(a["value"])} {a.get("unit", "")} | {src} | '
                       f'{status(src + " " + A["_sources"].get(src, ""))} | {where("{{facts." + k)} |')
    out += ["", "## Ledger sources and where they are cited", "", "| ID | Status | Cited on slides |", "|---|---|---|"]
    for k, v in A["_sources"].items():
        out.append(f"| {k} | {status(k + ' ' + v)} | {where(k)} |")
    out += ["", "## Claims that rest on our reading or an informal source", "",
            "| Claim | Slides | Source | Status |", "|---|---|---|---|"]
    for c, ks, src, st in CHECK_CLAIMS:
        out.append(f"| {c} | {', '.join(slide_label(x, filled) for x in ks)} | {src} | {st} |")
    out += ["", "## Model figures (illustrative)", "", "| Claim | Slides | Source | Status |", "|---|---|---|---|"]
    for c, ks, src in MODEL_CLAIMS:
        out.append(f"| {fill(c)} | {', '.join(slide_label(x, filled) for x in ks)} | {src} | MODEL |")
    out += ["", "## Deliberately not claimed", ""] + [f"- {x}" for x in filled["a3"]["not_claimed"]]
    out += ["", "## Likely Q&A: short answers", ""] + [f"{i + 1}. **{q}** {fill(a)}" for i, (q, a) in enumerate(QA)]
    (HERE / "claims.md").write_text("\n".join(out) + "\n", encoding="utf-8")


def write_revcost(simv: dict) -> None:
    """deck/revenue_cost.md: the A4 revenue and cost structure as a handout, from the same calculation as the slide."""
    d, B = DATA_CACHE, A["business_case"]
    bc = business_case(d)
    ys, n = bc["years"], len(bc["years"])
    stores = A["benefit"]["overseas_stores_per_year"]["value"]
    k = lambda x: f"(S${-x / 1e3:,.0f}k)" if x < -0.5 else "–" if abs(x) < 0.5 else f"S${x / 1e3:,.0f}k"
    c = lambda x: f"{x:,.0f}"
    hdr = "| Item | " + " | ".join(f"Year {i + 1}" for i in range(n)) + " | How calculated |"
    line = lambda label, key, how, f=k, bold=False: (
        f"| {'**' + label + '**' if bold else label} | " + " | ".join((f"**{f(r[key])}**" if bold else f(r[key])) for r in ys)
        + f" | {how} |")
    grp = lambda t: f"| *{t}* |" + " |" * (n + 1)
    table = [hdr, "|---|" + "---:|" * n + "---|",
             grp("Benefit: modelled avoided cost (no sales revenue)"),
             line("New stores opened", "opens", f"About {stores} overseas openings planned for 2026 (L-jiemian); held flat after", c),
             line("Store-years using the gates", "store_years",
                  f"Earlier stores trade all year; new stores {B['opening_year_share']['value']:.0%} of a year", c),
             line("Counter saving (recurring)", "counter", f"Store-years × S${bc['per_store']:,.0f}"),
             line("Fresh-milk opening stock (once per opening)", "stock", f"Openings × S${bc['per_open']:,.0f}; other inventory not estimated"),
             line("Total benefit", "benefit", "", bold=True),
             grp("Cost of the initiative: one-time"),
             line("Build the four gates", "build", f"{B['build_people']['value']} people × {B['build_months']['value']} months × "
                  f"{bc['mday']} days × S${bc['rate']:,.0f} a day"),
             line("Data integration and set-up", "integ", "Lump sum"),
             line("Total one-time cost", "one_time", "", bold=True),
             grp("Cost of the initiative: recurring"),
             line("Maintenance team", "maint", f"{B['maintenance_people']['value']} people × 12 months × {bc['mday']} days × "
                  f"S${bc['rate']:,.0f}, from year 1"),
             line("Platform and licences", "platform", f"Store-years × S${B['platform_per_store_month']['value']:,.0f} a month × 12"),
             line("Gate 4 reviews", "review", f"Openings × {B['review_days_per_opening']['value']} analyst day × S${bc['rate']:,.0f}"),
             line("Total recurring cost", "recurring", "", bold=True),
             line("Total cost", "cost", "", bold=True),
             line("Net benefit", "net", "Total benefit minus total cost", bold=True),
             line("Cumulative net", "cum", "From year 1", bold=True)]
    arows = ["| Assumption | Value | Unit | Why |", "|---|---|---|---|"]
    for key, a in B.items():
        if isinstance(a, dict) and "value" in a:
            arows.append(f"| {key.replace('_', ' ')} | {fmt_value(a['value'])} | {a['unit']} | "
                         f"{re.sub(r'^APPROVED [(][^)]*[)][.]\s*', '', a['rationale'])} |")
    sens = [("Base case (approved assumptions)", bc),
            ("One-time costs double", business_case(d, one_time_mult=2)),
            ("Counter saving halves", business_case(d, saving_mult=0.5)),
            (f"Openings fall to {stores // 2} a year", business_case(d, openings=stores // 2))]
    srows = ["| Case | Cumulative net after year " + str(n) + " | Payback |", "|---|---:|---|"]
    srows += [f"| {t} | {k(b['years'][-1]['cum'])} | {'year ' + str(b['payback']) if b['payback'] else 'not within ' + str(n) + ' years'} |"
              for t, b in sens]
    tot_b, tot_c = sum(r["benefit"] for r in ys), sum(r["cost"] for r in ys)
    s5, a4 = REFNUM["s5"], "A4"
    out = [
        "# Revenue and cost structure: the four decision gates", "",
        "Appendix A4 of the Chagee deck (OPIM639, Group 3). Generated by deck/build_deck.py from assumptions.json and "
        "the simulator output, so every figure matches the slide. Do not edit by hand. All figures are illustrative "
        "assumptions.", "",
        "## The question", "",
        f"Does what the four gates (Predict, Provision, Counter, Review) save across Chagee's overseas openings cover "
        f"the cost of building and running them? Over {n} years, at our approved assumptions, the modelled savings "
        f"{simv['fin_verdict']}.", "",
        "## How the analysis is structured", "",
        "It follows the course examples of a revenue and cost analysis: a benefit line, one-time (fixed) costs, "
        "recurring (variable) costs, net benefit and cumulative net, year by year, with the assumption behind each line.", "",
        f"- **Benefit (the \"revenue\" side).** The modelled avoided cost from the benefit slide (slide {s5}): choosing "
        "each store's counter for its conditions instead of a mixed counter at every opening, plus a better first "
        "fresh-milk order. It is not sales revenue, and it covers no inventory other than fresh milk.",
        "- **One-time costs.** Building the four gates and connecting the data (POS sales, app sign-ups, supplier "
        "orders). Year 1 only.",
        "- **Recurring costs.** A maintenance team, a platform fee for every store using the gates, and one analyst "
        "day per opening for the Review gate.", "",
        "## Where the benefit numbers come from", "",
        f"- **Counter saving, S${bc['per_store']:,.0f} per store-year.** The simulator's yearly cost of the mixed counter "
        f"above the cheapest of the three counters, averaged over openings spread evenly across our volume range. "
        f"About S${simv['bn_counter'] / 1e3:,.0f}k a year for {stores} stores. It recurs: a store keeps the cheaper counter.",
        f"- **Fresh-milk opening-stock saving, S${bc['per_open']:,.0f} per opening.** The only inventory item quantified; "
        "tea, other ingredients and packaging have not been estimated. The best first milk order's expected cost "
        "with no pre-launch signal minus with the member signal. Once per opening. It holds only if member sign-ups "
        "narrow the demand range as assumed; that narrowing is our assumption, not a finding.",
        "- **Store-years.** Stores opened in earlier years trade all year; stores opened this year trade half a year "
        "(openings spread through the year).", "",
        f"## {n}-year table (S$ thousands; brackets are negative)", "", *table, "",
        f"Over {n} years: total benefit {k(tot_b)}, total cost {k(tot_c)}, cumulative net {k(ys[-1]['cum'])}.", "",
        "## Assumptions (approved 13 Oct 2026, illustrative)", "", *arows, "",
        f"Openings: about {stores} a year (benefit.overseas_stores_per_year, L-jiemian, 2026 only), held flat for "
        "every year because no later figure is in our sources.", "",
        "## Sensitivity", "", *srows, "",
        "## How to read it", "",
        f"- The payback is thin: it arrives in the last year of {n}, and none of the three stress cases pays back "
        "within the horizon. The result depends on the counter saving, which grows only as stores accumulate.",
        "- The benefit is a modelled avoided cost against a mixed counter at every opening. It is not a measured "
        "saving and not a demonstrated AI saving.",
        "- No sales revenue is modelled: we have no price-per-cup or demand-elasticity assumption.",
        "- The cost lines are our illustrative assumptions, not Chagee or vendor figures.",
        "- The maintenance team is costed from year 1, alongside the build: conservative, and it may double-count "
        "part of year 1.", "",
        "## If asked in Q&A (about 20 seconds)", "",
        f"\"We set what the gates save against what they cost to build and run. At our assumptions they pay back in "
        f"year {bc['payback']}, but only just, and not if build costs double, the counter saving halves, or openings "
        f"halve. So the case rests on the per-store counter saving, which is what a pilot with real Chagee data "
        f"should test first. The full table is in appendix {a4}.\"",
        "",
    ]
    (HERE / "revenue_cost.md").write_text("\n".join(out), encoding="utf-8")


CONTENT_RAW: dict = {}


def build() -> Path:
    data = ensure_data()
    chap = {**{c["key"]: c["chapter"] for c in CONTENT}, **{k: v["chapter"] for k, v in PLACEHOLDERS.items()}}
    REFNUM.update({k: i + 1 for i, k in enumerate(d for d in DECK if chap[d] != "appendix")})
    DATA_CACHE.update(data)
    simv = sim_values(data)
    filled = {s["key"]: check_and_fill(s, simv, s["key"]) for s in CONTENT}
    CONTENT_RAW.update({s["key"]: s for s in CONTENT})
    ledger_check()
    timing_check(filled)
    write_claims(filled, simv)
    write_revcost(simv)
    for ph in PLACEHOLDERS.values():
        check_and_fill(ph, simv, ph["key"])
    items = [filled[d] if d in filled else PLACEHOLDERS[d] for d in DECK]
    total = sum(1 for it in items if it["chapter"] != "appendix")
    first = {}                                    # chapter -> content-slide numbers, for the Contents slide
    for n, it in enumerate(items, start=1):
        first.setdefault(it["chapter"], []).append(n)
    parts, page = [render_title(), render_contents(first)], 3
    for n, it in enumerate(items, start=1):
        parts.append(render_placeholder(page, n, total, it) if it["key"] in [p["key"] for p in PLACEHOLDERS.values()]
                     else render_slide(page, it, n, total))
        page += 1
    slides = "".join(parts)
    sim_js = (ROOT / "sim" / "sim.js").read_text(encoding="utf-8")
    page = (TEMPLATE_PATH.read_text(encoding="utf-8")
            .replace("__SLIDES__", slides)
            .replace("__ASSUMPTIONS__", json.dumps(A).replace("</", "<\\/"))
            .replace("__DATA__", json.dumps(data).replace("</", "<\\/"))
            .replace("__REFS__", json.dumps(REFNUM))
            .replace("__SIMJS__", sim_js)
            .replace("__W5__", week5_engine())
            .replace("__MECHJS__", (ROOT / "sim" / "mechanism.js").read_text(encoding="utf-8") + "\n"
                     + (ROOT / "sim" / "store.js").read_text(encoding="utf-8") + "\n"
                     + (ROOT / "sim" / "staffing.js").read_text(encoding="utf-8"))
            .replace("__ENGINE__", ENGINE_PATH.read_text(encoding="utf-8")))
    OUT.write_text(page, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    p = build()
    print(f"wrote {p} ({len(DECK) + 2} slides incl. title and contents)")
    if "--open" in sys.argv:
        webbrowser.open(p.resolve().as_uri())
