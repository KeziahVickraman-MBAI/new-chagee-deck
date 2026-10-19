# Chagee Storyboard: what the new deck says (Singapore only)

Deck: `storyboard/chagee_storyboard.html` (open in a browser; PDF and notes PDF are in the same folder). All model figures are illustrative assumptions, not Chagee data.

## Big picture

- Decision-maker throughout: the GM of Chagee Singapore
- Two areas in scope
  - New stores (expansion): where the next outlet adds the most cups
  - In-store operations: the counter in its busiest hour
  - Online retailing: not covered yet, to be added later
- Two kinds of AI
  - Predictive AI: forecasts demand (where to open, cups per hour for the roster)
  - Physical AI: automation and machines at the counter (dispensers up to machines that make the drink)
  - Bucket brigade and cross-training: operations tools, not AI
- Every part is a simulation that shows the trade-off the GM has to weigh
- Each explainer ends with a side-by-side comparison
  - "Without AI / With AI" where only the AI changes (slide 05)
  - "Assumed baseline / Proposed scenario" where several things change at once (slides 06–09)

## 01 · Chagee in Singapore

- Group revenue split (group-wide, not Singapore): franchise ~88%, company-owned ~12% of FY2025 net revenue (secondary source, koalagains)
- Singapore outlets run under one company and one data system (Chagee source, anonymous)
  - Ownership form does not matter because the data sits in one system
  - Our reading: a counter design or roster rule could be rolled out across outlets
- Channels all end at one counter
  - In store: walk-in, ordering in the app (tourists can order at the counter, to confirm)
  - Chagee app: order ahead, collect
  - Delivery: third-party apps only (e.g. Grab); no Chagee-run delivery
- 44 outlets on the slide (store directory, Oct 2026); press reports vary 44–46 (notes only)
- Ground-floor mall units by preference (Mothership quote)

## 02 · From farm to cup

- Supply is standard and planned ahead
  - Tea from Yunnan through standard channels; only fresh milk and fruit bought locally (YF Chuhai)
  - Central and regional warehouses, forecast-led restocking (Form 20-F)
- The counter feels demand within minutes (lunch, mall events, rain, launches)
- Today the GM and outlet teams deploy people on local expertise (Chagee source, anonymous): that is the call we model

## 03 · The data trail

- Known: orders by channel and time (POS, app, Grab)
- To confirm: searches, customer location, wait times, walk-aways (some may need new logging)
- Six decisions the data could feed; our scope = demand forecast, site selection, staffing, queue capacity
- The app is the link to where customers live and work, so PDPA consent applies

## 04 · Our scope

- New stores (Topic 3 forecasting) and in-store operations (Topic 3 forecasting, Topic 5 bucket brigades)
- Rent, fit-out and payback for new stores: future work
- GM persona: decides where to open next, which counter steps go to machines, how many people work the peak, and how they share it

## 05 · Predict demand for a new store (Course link: Week 3, Analytics and AI, Flashion)

- Context on the slide: Chagee is looking to expand rapidly in Singapore; how many stores is confidential
- Method (synthetic app-search data, so it shows the method, not a finding about real outlets)
  - Synthetic app sessions on our map; red = no outlet within walking distance
  - DBSCAN (unsupervised clustering) groups the dense "no store nearby" searches
  - Assumed proximity demand model scores each site: cups it sells minus cups it takes from nearby outlets
- Comparison, same new outlet (45), same neighbourhood
  - Without AI: beside 34 · West Mall → sells 604 cups a day, 64% moved from nearby outlets → +216 for Chagee
  - With AI: 2.7 km away near Choa Chu Kang → sells 837 → +731 for Chagee
- Interactive: click the map for a pin, search an outlet or town, "How it works" replays DBSCAN, "See it on the map" shows both sites side by side

## 06 · Share the counter (Course link: Weeks 5 and 6, bucket-brigade simulation)

- Counter = today's split (our scenario, not Chagee's disclosed setup): machines on order and tag, tea and milk, shake and seal; people on cup and ice, toppings, hand-over
- Bucket brigade vs fixed posts, same customers on both sides
- Event day at the forecast crew (2 people): brigade 1.2% of peak-hour orders walk away; fixed posts 4.1% (well assigned) to 35% (badly assigned)
- Baseline vs proposal: a normal-day roster (1 person) on an event day → 54% walk away
- Honest caveat: with spare staff, well-assigned fixed posts are as good or slightly faster

## 07 · Split the counter (the GM's decision)

- Five options compared (mean of 20 runs): today's split, machine-made drink, all by hand, all robots, one tea-and-milk machine
- In our model, one tea-and-milk machine is the cheapest on every day type
  - S$305–335 a day vs S$372–402 for today's split
  - Reason: it lets the roster drop a person off-peak for the cost of one machine unit
- GM decision: pilot one tea-and-milk machine against today's split (not switch)
- Depends on machine cost
  - The two cost the same at about S$905 a month per machine unit (1 unit vs 3); wage, volume and crews held fixed
  - We assume S$1,909 a month per unit; Chagee's real cost is unknown
- Among the original options, robots buy a shorter wait, not a lower cost
- Interactive: Play / End to compare A and B at the end of the hour

## 08 · The GM's playbook (TBC, draft)

- 1 Where to open: where app searches cluster, not beside an existing outlet (+731 vs +216; synthetic data)
- 2 What to automate: pilot one tea-and-milk machine vs today's split
- 3 How many people: economic rule, add a person on event days only (2 → 3), not busy days
- 4 How to share: test a bucket brigade vs fixed posts; in the recommended setup 0.2% vs 0.4% (well assigned) / 22% (badly assigned) walk away
- Pilot in 3 outlets: shadow the forecast → roster by the economic rule → one machine vs today's split; KPIs: cups per labour hour, wait time, walk-aways

## 09 · The size of the benefit (TBC, draft)

- Against an illustrative baseline (all by hand, normal-day crew every day): not savings against Chagee's actual operations
- About S$1.09m a year across 44 outlets (economic rule throughout)
  - Almost all from the machine's labour saving: S$1.04m
  - Forecast + economic rule adds event-day orders on top: about S$0.05m
  - Without our minimum-crew assumption (2 by hand, 1 with machines): S$0.37m
- Pilot comparison: proposed scenario vs today's split, S$1.22m (bigger than the headline because today's split is itself below the baseline)

## Appendix (for Q&A)

- Machine ladder: what machines exist, vendor list prices, when each pays (backs slide 07)
- Benefit in detail: per-day figures, both crew rules, ranges, sensitivity chart (backs slide 09)
- How the site forecast works: DBSCAN in four moves and every simulated number
- Machine tiers and sources; sources and assumptions

## Still open / to confirm

- Real machine cost per unit (drives decision 2)
- Whether searches, location, wait times and walk-aways are logged
- Tourist counter-ordering exception
- Online retailing section (to be added)
- Slides 08 and 09 still TBC
- Do not name or identify the Chagee source; do not mention store-opening numbers (confidential)
