"""Replace the interactive explainers on pages 6-7 and 9-14 with static summary slides.

python3 storyboard/static_patch/build.py storyboard/chagee_storyboard.html storyboard/static_patch/parts storyboard/static_patch/stage1.html
"""
import os
import re
import sys

SRC, PARTS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(SRC, encoding="utf-8").read()


def part(name):
    s = open(os.path.join(PARTS, name + ".html"), encoding="utf-8").read()
    s = re.sub(r'\sdata-s="[^"]*"', "", s)
    return s


def strip_class(svg, cls):
    # drop the builder's hook class so no script ever targets the static copy
    return svg.replace(f'class="{cls}"', f'class="stsvg"', 1)


SVG = {
    "mbbig": strip_class(part("m1_mbbig"), "mbbig").replace('id="mba"', 'id="mba-st"').replace("url(#mba)", "url(#mba-st)"),
    "mbtraj": strip_class(part("m1_mbtraj"), "mbtraj"),
    "sqsvg": strip_class(part("m2b_sqsvg"), "sqsvg"),
    "mbpay": strip_class(part("m3_mbpay"), "mbpay"),
    "opsvg": strip_class(part("o1_opsvg"), "opsvg"),
}
O2TAB = part("o2_res_o2tab").replace('class="res o2tab"', 'class="res o2tab st-o2tab"')

CSS = """
<style id="static-summaries">
/* Static summaries: pages 6-7 and 9-14 replace their interactive explainers with a fixed chart and short notes */
.st .body{margin-top:12px;gap:16px}
.st .panel{padding:14px 18px}
.st .stt{flex:none;margin:0 0 8px;font:500 11px/1.2 var(--sans);letter-spacing:.16em;text-transform:uppercase;color:var(--taupe)}
.st .chart{background:#fff;border-radius:10px;padding:10px 14px;display:flex;align-items:center;justify-content:center;gap:14px;min-height:0}
.st .chart svg{display:block;width:100%;height:auto}
.st .cards{gap:10px}
.st .bc p,.st .bc li{font:13px/1.42 var(--sans);color:var(--ink)}
.st .bc p{margin:4px 0 0}
.st .bc ul,.st .bc ol{margin:4px 0 0;padding-left:17px}
.st .bc li+li{margin-top:2px}
.st .bc.ok{border-left-color:#2F6B45}
.st .steps3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}
.st .steps3>div{background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 11px;font:12.5px/1.4 var(--sans);color:var(--ink)}
.st .n{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--red);color:#fff;font:600 10.5px/1 var(--sans);margin-right:6px;vertical-align:1px}
.st .mini{width:100%;border-collapse:collapse;margin-top:6px;font:12.5px/1.3 var(--sans);color:var(--ink2)}
.st .mini th{font:600 9.5px/1.2 var(--sans);letter-spacing:.1em;text-transform:uppercase;color:var(--taupe);text-align:right;padding:3px 4px;border-bottom:1px solid var(--line)}
.st .mini td{text-align:right;padding:4px;border-bottom:1px solid #F0EBE2;white-space:nowrap}
.st .mini th:first-child,.st .mini td:first-child{text-align:left}
.st .mini tr.hl td{background:#EEF5F0;color:#1F4D31;font-weight:600}
.st .note{margin:8px 0 0;font:11.5px/1.35 var(--sans);color:var(--taupe)}
/* page 6: the three decisions */
.st .s3{margin-top:4px}
.st .s3p{padding:16px 20px;gap:9px}
.st .s3p h5{font-size:28px}
.st .s3p .what{font-size:16px}
.st .s3v svg{max-height:100px}
.st .s3p .how{margin:0;font:13px/1.42 var(--sans);color:var(--ink2)}
.st .s3p .how b{display:block;font:600 9.5px/1.4 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--taupe)}
.st .s3p .who{min-height:82px;font-size:15px}
.st .nw{white-space:nowrap}
.st .chart.grow{flex:1}
/* page 7: two charts side by side */
.st .m1c{display:grid;grid-template-columns:1.9fr 1fr;align-items:center}
.st .m1c .ch{font:600 10px/1.2 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--taupe);margin:0 0 2px 8px}
/* page 9: predict and act */
.st .pa{display:grid;grid-template-columns:1fr 1.15fr;gap:10px;margin-top:10px}
.st .pa>div{background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 12px}
.st .pa .k{font:600 11px/1.2 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--navy)}
.st .pa p{margin:4px 0 0;font:13px/1.4 var(--sans);color:var(--ink)}
.st .pa .big{font:600 20px/1.1 var(--sans);color:var(--navy)}
.st .stack{display:flex;height:12px;border-radius:3px;overflow:hidden;margin-top:8px}
.st .lg{font-size:12px!important;color:var(--ink2)!important}
.st .lg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 4px 0 8px;vertical-align:0}
.st .lg i:first-child{margin-left:0}
.st .act{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:4px}
.st .act b{display:block;font:600 12.5px/1.3 var(--sans);color:var(--ink)}
.st .act span{font:12.5px/1.35 var(--sans);color:var(--ink2)}
/* pages 12 and 13: bars */
.st .hbars{display:flex;flex-direction:column;gap:10px}
.st .hbar{display:grid;align-items:center;gap:12px;font:13.5px/1.3 var(--sans);color:var(--ink)}
.st .hbar .nm small{display:block;font:12px/1.3 var(--sans);color:var(--taupe)}
.st .hbar .tr{height:18px;background:#EDE8DE;border-radius:4px;overflow:hidden}
.st .hbar .fl{height:100%;min-width:4px;background:var(--ice);border:1px solid var(--blue);border-radius:4px;box-sizing:border-box}
.st .hbar.best .fl{background:#2F6B45;border-color:#2F6B45}
.st .hbar.bad .fl{background:#EBC2BE;border-color:var(--red)}
.st .hbar .v{font-weight:600;text-align:right}
.st .hbar.best .v,.st .hbar.best .nm>b{color:#2F6B45}
.st .hbars.hb{gap:22px}
.st .hbars.hb .hbar{font-size:14.5px}
.st .hbars.hb .tr{height:22px}
.st .hbars.hb .nm small{font-size:12.5px}
.st .stdots{display:flex;gap:4px}
.st .stdots i{flex:none;width:11px;height:11px;border-radius:50%;border:1.5px solid var(--navy);box-sizing:border-box}
.st .stdots i.m{background:var(--navy)}
.st .stn{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-top:2px}
.st .stn>div{border-radius:8px;padding:11px 12px;font:600 14px/1.25 var(--sans);border:1.5px solid #D6CDBE;background:#fff;color:var(--ink)}
.st .stn>div.m{background:var(--navy);border-color:var(--navy);color:#fff}
.st .stn small{display:block;margin-top:2px;font:400 11px/1.3 var(--sans);opacity:.85}
.st .rules{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.st .rules>div{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.st .rules h6{margin:0 0 5px;font:600 15px/1.3 var(--sans);color:var(--ink)}
.st .rules h6 .ab{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:var(--ink);color:#fff;font:600 11px/1 var(--sans);margin-right:7px;vertical-align:1px}
.st .rules p{margin:0;font:14px/1.45 var(--sans);color:var(--ink2)}
.st .key{display:flex;gap:16px;margin-top:10px;font:11.5px/1.3 var(--sans);color:var(--taupe)}
.st .key i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px;border:1.5px solid #D6CDBE;background:#fff}
.st .key i.m{background:var(--navy);border-color:var(--navy)}
.st .key i.d{border-radius:50%;border-color:var(--navy)}
.st .key i.d.m{background:var(--navy)}
/* page 14 */
.st .st-o2tab{width:100%}
</style>
"""

SECTIONS = {}

# ------------------------------------------------------------------ page 6 · 04 Our scope
SECTIONS["c4"] = dict(newid="c4", cls="slide content st", inner="""
    <p class="kicker">04 · Our scope</p>
    <h2 class="head">Grow demand, serve it well, then expand access</h2>
    <p class="sub">Three connected decisions, three owners. Each chapter: business problem → demonstration → manager’s decision.</p>
    <div class="body" style="grid-template-columns:1fr;margin-top:10px">
      <div class="s3">
        <div class="s3p"><span class="num">1</span><h5>Grow demand</h5><p class="what">Make membership more rewarding.</p><div class="s3v">{SVG1}</div>
          <p class="how"><b>How we show it</b>Network-effects model for tier progress; group orders become demand data.</p>
          <p class="who"><b>CRM manager</b>Which features and rewards should we pilot?</p><p class="where">Slides 05 to 08</p></div>
        <div class="s3a">→</div>
        <div class="s3p"><span class="num">2</span><h5>Serve demand</h5><p class="what">Match staffing and workflow to demand.</p><div class="s3v">{SVG2}</div>
          <p class="how"><b>How we show it</b>A forecast sets the crew, a bucket brigade shares the work, machines take some steps.</p>
          <p class="who"><b>Operations manager</b>What crew and counter setup should we use?</p><p class="where">Slides 09 to 12</p></div>
        <div class="s3a">→</div>
        <div class="s3p"><span class="num">3</span><h5>Expand access</h5><p class="what">Open where we add new customers.</p><div class="s3v">{SVG3}</div>
          <p class="how"><b>How we show it</b>Clusters of unserved app searches and a demand model for a new outlet.</p>
          <p class="who"><b>Expansion manager</b>Which location justifies investment?</p><p class="where">Slides 13 and 14</p></div>
      </div>
    </div>
    <div class="takeaway"><span class="lab">TAKEAWAY</span><span class="t">A connected story, not one combined model: no simulated benefit is carried from one part to the next.</span></div>
""", notes=None)

# ------------------------------------------------------------------ page 7 · 05 Grow, the network-effects model
SECTIONS["m1"] = dict(newid="m1s", cls="slide content mb st", inner="""
    <p class="kicker">05 · Grow · is tiering up worth the effort?<span class="stg"><b>Grow</b><i class="on">Problem</i><i class="on">Solution</i><i>Decision</i></span><span class="ctag">Course link · Topic 8, network effects</span></p>
    <h2 class="head">Squads add value only once enough friends take part</h2>
    <p class="bprob"><b>Business problem</b><span>Chagee's Membership Operations team told us the problem they want to solve is <b>moving customers up the membership tiers</b>: customers may not think the effort of progressing is worthwhile.</span></p>
    <div class="body" style="grid-template-columns:1fr 300px">
      <div class="panel">
        <p class="stt">Benefit against effort · network-effects model, not AI · illustrative index</p>
        <div class="chart grow m1c"><div>{MBBIG}</div><div><p class="ch">Participation, round by round</p>{MBTRAJ}</div></div>
        <div class="steps3">
          <div><span class="n">1</span>Where the <b>effort line</b> crosses the curve there are two points: the tipping point (<b>28%</b>) and the stable level (<b>72%</b>).</div>
          <div><span class="n">2</span>Below the tipping point participation <b>falls to zero</b>; above it, it <b>climbs to the stable level</b>.</div>
          <div><span class="n">3</span>Raise the effort and the two points close in, then vanish: the app <b>stalls from any start</b>.</div>
        </div>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">The rule</div><p>A customer joins when <b class="nw">perceived benefit ≥ effort</b>: <b class="nw">r × k × z ≥ p</b>.</p><p>Across customers the equilibrium is <b class="nw">p = k z (1 − z)</b>, the navy hump.</p></div>
        <div class="bc"><div class="k">Symbols and assumptions</div><ul><li><b>r</b> interest, from none to full</li><li><b>k</b> value of friends taking part · 1.00</li><li><b>z</b> share of friends participating · starts at 35%</li><li><b>p</b> effort of joining or progressing · 0.20, an index, not money</li></ul></div>
        <div class="bc ok"><div class="k">So what</div><p>Squads must get enough friends past the tipping point. Lower effort or more valuable friends move it down.</p></div>
      </div>
    </div>
    <div class="takeaway"><span class="lab">TAKEAWAY</span><span class="t">Tipping point <b>28%</b>, stable level <b>72%</b>. Starting at 35%, participation rises to about <b>72%</b>. Illustrative.</span></div>
""", notes="""
    <p>Part one starts with a business problem. Chagee's Membership Operations team told us the problem they want to solve is moving customers up the membership tiers: the barrier is whether customers think the effort of tiering up is worth it. We paraphrase them, and it is their view, not a measured finding: we have no data showing customers never move tiers. Our proposed answer is squad-based progression, where friends taking part make membership worth more. To see when that works, we use the network-effects model from Topic 8. It is an analytics model, not AI. One customer joins when the benefit beats the effort: interest times the value of friends times the share of friends on, against the effort score. Customers differ in interest, so the share who would join traces a hump.</p>
    <p>Where the effort line crosses the hump there are two points. Below the lower one, the tipping point, participation falls back to zero; above it, it climbs to the stable level. At our default the tipping point is about 28% and the stable level about 72%; the small chart shows participation rising from 35% to 72% round by round. Raise the effort and the two points close in, then vanish: the app stalls from any start. The rule and the assumptions are in the boxes on the right; the derivation and tables are in the appendix. About thirty seconds.</p>
""")

# ------------------------------------------------------------------ page 9 · 07 Grow, group orders as demand data
SECTIONS["m2b"] = dict(newid="m2bs", cls="slide content mb st", inner="""
    <p class="kicker">07 · Grow · group orders as demand data<span class="stg"><b>Grow</b><i>Problem</i><i class="on">Solution</i><i>Decision</i></span><span class="ctag">Course link · Topic 1, demand data</span></p>
    <h2 class="head">Every group order helps the outlet prepare for demand</h2>
    <div class="body" style="grid-template-columns:1fr 300px">
      <div class="panel">
        <p class="stt">Cups for the 13:00 to 13:30 pickups · squad rush · forecast 30 min before · synthetic</p>
        <div class="chart grow">{SQSVG}</div>
        <div class="pa">
          <div><div class="k">Predict</div><p><span class="big">38 cups</span> expected 30 min before pickup</p>
            <div class="stack"><span style="flex:21;background:#A39B8D"></span><span style="flex:13;background:#2F6B45"></span><span style="flex:3.4;background:#C8A96A"></span></div>
            <p class="lg"><span class="nw"><i style="background:#A39B8D"></i>21 usual, from history</span> <span class="nw"><i style="background:#2F6B45"></i>13 confirmed in squads</span> <span class="nw"><i style="background:#C8A96A"></i>3.4 likely</span></p></div>
          <div><div class="k">Act</div><div class="act">
            <div><b>Prepare</b><span>Jasmine 14 · Oolong 13 · Black 6</span></div>
            <div><b>Staff</b><span>1 person, 13:00 to 13:30</span></div>
            <div><b>Counter</b><span>one person, machines on tea and milk · load 76%</span></div>
            <div><b>Pickup estimate</b><span>ready in about 3 min</span></div></div></div>
        </div>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">How it works</div><ol><li><b>History only</b> (grey dashed) predicts 31 cups.</li><li>As friends open baskets and confirm drinks, the <b>navy</b> forecast moves to 38: usual orders + confirmed cups + cups still likely.</li><li>The forecast sets what to prepare, who works the window and the pickup time shown.</li></ol></div>
        <div class="bc"><div class="k">What the app would record · with consent (PDPA)</div><ul><li><b>Documented:</b> completed purchases, selected outlet and in-app order</li><li><b>To confirm:</b> drinks and customisations, pickup time chosen</li><li><b>Proposed:</b> group size, suggestions accepted or dismissed, gifts sent and redeemed</li></ul></div>
        <div class="bc warn"><div class="k">Synthetic, not measured</div><p>Over 400 synthetic windows, off by about <b>5.3 cups</b> ten minutes before pickup, against <b>7.3</b> for history alone. Walk-in surges stay invisible to squads.</p></div>
      </div>
    </div>
    <div class="takeaway"><span class="lab">TAKEAWAY</span><span class="t">Better social experience → richer customer signals → better demand forecasts → better service.</span></div>
""", notes="""
    <p>The squad experience is also a data source. As the course put it for online retailers, an app can capture demand data, not just sales data. The chart shows squad signals arriving before one outlet's pickup window, and each forecast uses only what was known at that minute. What the app would record, and which of it is already documented, is in the box on the right; the squad fields are proposed and need consent.</p>
    <p>Predict: expected cups are the cups already confirmed, plus a prediction of those not yet confirmed. An open basket or an unredeemed gift is not a drink; it counts only at the chance learned from past windows, and a confirmed cup is never counted twice. Here that is 38 cups half an hour before: 21 usual, 13 confirmed and 3.4 likely. Act: the forecast sets what to prepare, the crew for the window, how the counter is organised and the pickup time customers see.</p>
    <p>This is synthetic: the squad signals help only because we assumed they carry information, so read the mechanics, not the score. On some days the enhanced forecast is worse, because walk-in surges are invisible to squads. Averaged over 400 synthetic windows it is off by about 5.3 cups ten minutes before, against 7.3 for the calendar baseline; with no squad share the two are identical. The appendix has the table.</p>
    <p>Both sides gain: easier choices and reliable pickup for customers, a clearer view of what to prepare for Chagee. Personalisation may lower the effort from slide 05, but that is a hypothesis, and we do not turn adoption into extra orders. How the outlet organises people and machines to serve this demand is part two. First, the CRM manager's decision: is it worth piloting, and at what reward level? About one minute.</p>
""")

# ------------------------------------------------------------------ page 10 · 08 Grow, the CRM manager's decision
SECTIONS["m3"] = dict(newid="m3s", cls="slide content mb st", inner="""
    <p class="kicker">08 · Grow · the CRM manager's decision<span class="stg"><b>Grow</b><i>Problem</i><i>Solution</i><i class="on">Decision</i></span></p>
    <h2 class="head">Pilot squads only at a reward their extra orders can pay for</h2>
    <div class="body" style="grid-template-columns:1fr 300px;margin-top:10px">
      <div class="panel">
        <p class="stt">Does the reward pay for itself? · after reward and AI costs · illustrative</p>
        <div class="chart grow">{MBPAY}</div>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">How to read it</div><ol><li><b>Start:</b> no extra orders costs <b>S$0.59</b> a member a month, the credit on orders placed anyway.</li><li><b>Rise:</b> each extra order earns its margin.</li><li><b>Break-even:</b> <b>0.18</b> extra orders a member a month, about one every 5 months.</li><li><b>AI</b> adds S$0.05 a month, so <b>0.02</b> more.</li></ol></div>
        <div class="bc"><div class="k">Assumptions</div><p>Credit 5.0% of the S$5.90 price · 2.0 group orders a month anyway · AI cost S$0.05 a member a month · margin 60% (band 50% to 70%).</p></div>
        <div class="bc ok"><div class="k">Why three arms</div><p>Squads against today's membership shows the squad effect; adding suggestions shows the personalisation effect. Orders are measured directly.</p></div>
      </div>
    </div>
    <div class="mdec"><div class="who"><span class="lab">Manager's decision</span><b>CRM manager</b></div>
      <div><span class="q">Which features and rewards should we pilot?</span>
        <span class="k">Proposed</span>Three arms in Singapore (today's membership, squads, squads with suggestions) at a <b>5.0%</b> credit: squads must add <b>0.18</b> orders a member a month, suggestions <b>0.02</b> more.</div>
      <div><span class="k">Proceed if, arm against arm</span><ul><li>tier progression and orders rise against today's membership</li><li>satisfaction holds</li>
        <li>contribution after reward and AI costs is positive</li></ul></div></div>
    <p class="nextl"><b>Next</b>A more engaging membership must be matched by reliable fulfilment.</p>
""", notes="""
    <p>The decision for part one belongs to the CRM manager: which features and rewards should we pilot? The navy line is the contribution per member a month after the reward, the group-order credit. It starts below zero, because the credit is also paid on orders members would have placed anyway, and rises with each extra order. At a credit of 5% squads alone break even at about 0.18 extra orders a month at our base margin. Push the credit up to the margin and it never breaks even.</p>
    <p>The dashed gold line adds personalised suggestions. They cost something to run; we assume S$0.05 a member a month, a placeholder to replace with a real quote. That shifts the line down: break-even moves to about 0.20 extra orders, so personalisation must add about 0.02 orders a month of its own on top of squads.</p>
    <p>That is why the pilot has three arms: today's membership, squads, and squads with personalised suggestions. Squads against today shows the squad effect; adding suggestions shows the personalisation effect. Proceed only if tier progression rises, satisfaction holds, the extra orders reach these break-evens, and contribution after reward and AI costs is positive. We measure orders directly and do not read purchases off the adoption model. Then the transition: a more engaging membership experience must be matched by reliable fulfilment. About forty-five seconds.</p>
""")

# ------------------------------------------------------------------ page 11 · 09 Serve, forecasting
SECTIONS["o1"] = dict(newid="o1s", cls="slide content st", inner="""
    <p class="kicker">09 · Serve · forecasting: how many people<span class="stg"><b>Serve</b><i class="on">Problem</i><i class="on">Solution</i><i>Decision</i></span></p>
    <h2 class="head">A forecast sets the crew each hour needs</h2>
    <p class="bprob"><b>Business problem</b><span>Demand changes by the hour; staffing and fixed station assignments may not, leaving queues, walk-aways or idle capacity.
      <span class="ev obs">Observed</span> people deployed on local expertise (Chagee source, anonymous); long reopening queues (Vulcan Post).
      <span class="ev sim">Simulated</span> everything below. <span class="ev inf">To confirm</span> Chagee's waits and walk-aways.</span></p>
    <div class="body" style="grid-template-columns:1fr 318px">
      <div class="panel">
        <p class="stt">Cups an hour against crew capacity · busy day · illustrative simulation</p>
        <div class="chart grow">{OPSVG}</div>
        <div class="steps3">
          <div><span class="n">1</span>The <b>forecast</b>: cups an hour from historical order shares and the calendar.</div>
          <div><span class="n">2</span>Keep the <b>normal-day roster</b> on a busy day and the 12:00 to 14:00 peak runs short.</div>
          <div><span class="n">3</span>The <b>forecast roster</b> adds a second person only for the peak.</div>
        </div>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">Keep three things apart</div><ul><li><b>Forecast:</b> how many people (this slide)</li><li><b>Bucket brigade:</b> how they share the work (slide 10)</li><li><b>Machines:</b> which steps people do at all (slide 11)</li></ul></div>
        <div class="bc warn"><div class="k">If the forecast is wrong · busy day, peak hour</div>
          <table class="mini"><tr><th>Forecast</th><th>Crew</th><th>Away</th><th>Wait</th><th>S$/day</th></tr>
            <tr><td>15% to 30% low</td><td>1</td><td>20.8%</td><td>6:22</td><td>372</td></tr>
            <tr class="hl"><td>exact</td><td>2</td><td>0.0%</td><td>1:14</td><td>402</td></tr>
            <tr><td>15% to 30% high</td><td>2</td><td>0.0%</td><td>1:14</td><td>402</td></tr></table>
          <p class="note">Too low is costly; too high costs about S$15 more a day on an event day. Scenarios, not Chagee's measured accuracy.</p></div>
      </div>
    </div>
    <div class="takeaway" style="margin-top:10px;padding:9px 20px;font-size:14px"><span class="lab">TAKEAWAY</span><span class="t">Exact forecast: <b>2</b> at the peak, <b>0.0%</b> walk away, <b>S$402</b> a day. A forecast 15% too low leaves about <b>21%</b> walking away.</span></div>
""", notes="""
    <p>Part two. A more engaging membership experience must be matched by reliable fulfilment. The business problem: demand changes by the hour, while the roster and fixed station assignments may not. What we have observed: a Chagee source who asked not to be named told us outlet teams deploy people on local expertise, and Vulcan Post reported long queues at the Singapore reopening. What we have not observed: Chagee's own wait times and walk-aways. Everything on the chart is simulated, on our assumptions.</p>
    <p>The bars are the forecast: cups an hour from historical order shares and the calendar. App signals, like the squad signals on slide 07, could refine it nearer the time, but they are not in these numbers. Keep the normal-day roster, the dashed line, on a busier day and the peak runs short. The green forecast roster follows demand: two people at the peak, one the rest of the day. Keep three things apart: the forecast says how many people; the bucket brigade is a rule for how they share the work; machines decide which steps people do at all. The next two slides compare those.</p>
    <p>The sensitivity is in the table on the right. On a busy day, a forecast 15% too low puts on 1 person at the peak instead of 2, and walk-aways go from 0.0% to about 21%. A forecast too high costs little: about S$15 more a day on an event day. These error steps are scenarios, not Chagee's measured accuracy. About one minute.</p>
""")

# ------------------------------------------------------------------ page 12 · 10 Serve, bucket brigade
SECTIONS["c6"] = dict(newid="c6", cls="slide content st", inner="""
    <p class="kicker">10 · Serve · bucket brigade: how the crew shares the work<span class="stg"><b>Serve</b><i>Problem</i><i class="on">Solution</i><i>Decision</i></span><span class="ctag">Course link · Week 5 bucket brigade</span></p>
    <h2 class="head">A bucket brigade balances a lean crew by itself</h2>
    <div class="body" style="grid-template-columns:1fr 1.12fr;grid-template-rows:auto 1fr;gap:14px">
      <div class="panel" style="grid-column:1 / -1;padding-bottom:12px">
        <p class="stt">The counter · today's split (our scenario) · steps in order, left to right · <span style="color:var(--navy)">■</span> machine · □ by hand</p>
        <div class="stn">
          <div class="m">Order and tag<small>machine · 2 s</small></div>
          <div>Cup and ice<small>by hand · 10 s</small></div>
          <div class="m">Tea and milk<small>machine · 10 s</small></div>
          <div>Toppings<small>by hand · 12 s</small></div>
          <div class="m">Shake and seal<small>machine · 8 s</small></div>
          <div>Hand-over<small>by hand · 8 s</small></div>
        </div>
      </div>
      <div class="panel">
        <p class="stt">Two ways to share the work</p>
        <div class="rules" style="grid-template-columns:1fr;margin-top:0">
          <div><h6><span class="ab">A</span>Bucket brigade</h6><p>Each person carries a cup forward. The last hands it over, walks back and takes over a colleague's cup, so work flows to whoever is free.</p></div>
          <div><h6><span class="ab">B</span>Fixed stations</h6><p>Each person owns a station. It works when posts are well assigned; a slow person on toppings becomes the bottleneck.</p></div>
        </div>
        <div class="steps3" style="grid-template-columns:1fr">
          <div>The brigade needs <b>no task timings</b> and no one to rebalance it: sequence the crew slowest to fastest and the line <b>self-balances</b>.</div>
        </div>
      </div>
      <div class="panel">
        <p class="stt">Event day · 2 people · peak hour · mean of 20 runs</p>
        <div class="hbars hb">
          <div class="hbar best" style="grid-template-columns:190px 1fr 52px"><div class="nm"><b>Bucket brigade</b><small>median wait 2:38</small></div><div class="tr"><div class="fl" style="width:3%"></div></div><div class="v">1.2%</div></div>
          <div class="hbar" style="grid-template-columns:190px 1fr 52px"><div class="nm"><b>Fixed, fastest on toppings</b><small>median wait 4:10</small></div><div class="tr"><div class="fl" style="width:10.3%"></div></div><div class="v">4.1%</div></div>
          <div class="hbar bad" style="grid-template-columns:190px 1fr 52px"><div class="nm"><b>Fixed, slowest on toppings</b><small>median wait 9:47</small></div><div class="tr"><div class="fl" style="width:87.3%"></div></div><div class="v">34.9%</div></div>
        </div>
        <p class="note">Share of peak-hour orders that walk away.</p>
        <div class="bc" style="margin-top:12px"><div class="k">The forecast's effect · event day</div>
          <table class="mini"><tr><th>Roster</th><th>Crew</th><th>Brigade away</th><th>Fixed away</th><th>S$/day</th></tr>
            <tr><td>normal-day roster</td><td>1</td><td>53.8%</td><td>54.2%</td><td>372</td></tr>
            <tr class="hl"><td>forecast roster</td><td>2</td><td>1.2%</td><td>4.1%</td><td>402</td></tr></table>
          <p class="note">Machines held fixed; only the crew changes (+1 person, +S$30 a day).</p></div>
      </div>
    </div>
    <div class="takeaway"><span class="lab">TAKEAWAY</span><span class="t">With a lean crew, work flows to whoever is free, so the line balances itself. With spare people, well-assigned fixed posts are as good or a little faster.</span></div>
""", notes="""
    <p>The forecast on slide 09 set how many people. This slide is how they share the work: same counter, same customers, two sharing rules. The counter is today's split, our scenario, not Chagee's disclosed setup. Machines, the navy boxes, take the order, brew tea and milk, and shake and seal. People do cup and ice, toppings and hand-over.</p>
    <p>A bucket brigade: each person carries a cup forward; the last hands it over, walks back and takes over a colleague's cup. Fixed stations: each person owns a station. On an event day with two people, the brigade loses about 1.2% of peak-hour orders. Fixed stations lose 4.1% when the fastest person is on toppings, and about 35% when the slowest is: the queue builds at toppings. The brigade never needed to know who was fast.</p>
    <p>Be honest about the other case: add people and fixed stations catch up, or are a little faster. About one minute.</p>
    <p>The small table shows the forecast on its own. Machines are automation, and here they stay exactly as they are. AI means AI-assisted staffing: the demand forecast sets the crew. Without AI, the normal-day roster of 1 faces an event day: about 54% of peak-hour orders walk away with a brigade, 54% with fixed posts. With AI, the forecast crew of 2 brings that to 1.2% and 4.1%, for S$402 a day against S$372. Walk-aways and wait are the peak hour, mean of 20 runs; cost is the day's roster plus machines and leaves out lost sales. All illustrative assumptions.</p>
    <p>Course link: the bucket-brigade simulation from Week 5 and Week 6, equipment and technology, inspired this counter replica. Same idea, a different use case.</p>
""")

# ------------------------------------------------------------------ page 13 · 11 Serve, automation
def setup_row(name, stats, dots, width, value, cls=""):
    d = "".join(f'<i class="m"></i>' if x == "1" else "<i></i>" for x in dots)
    return (f'<div class="hbar {cls}" style="grid-template-columns:210px 92px 1fr 52px"><div class="nm"><b>{name}</b><small>{stats}</small></div>'
            f'<div class="stdots">{d}</div><div class="tr"><div class="fl" style="width:{width}%"></div></div><div class="v">{value}</div></div>')


ROWS = "\n".join([
    setup_row("One machine (tea and milk)", "3 people · 0.2% away · wait 1:44", "001000", 59.6, "S$335", "best"),
    setup_row("Today's split (our scenario)", "2 people · 1.2% away · wait 2:38", "101010", 71.5, "S$402"),
    setup_row("All by hand", "4 people · 0.0% away · wait 1:25", "000000", 75.1, "S$422"),
    setup_row("Machine-made drink (scenario)", "2 people · 0.0% away · wait 1:06", "011110", 82.7, "S$465"),
    setup_row("All robots", "0.0% away · wait 0:58, the fastest", "111111", 100, "S$562"),
])

SECTIONS["c7"] = dict(newid="c7s", cls="slide content st", inner="""
    <p class="kicker">11 · Serve · automation: which steps a machine takes<span class="stg"><b>Serve</b><i>Problem</i><i class="on">Solution</i><i>Decision</i></span></p>
    <h2 class="head">In our model, one tea-and-milk machine is cheapest every day</h2>
    <div class="body" style="grid-template-columns:1fr 330px">
      <div class="panel">
        <p class="stt">Cost a day · event day · fewest people that keep walk-aways within 2% · mean of 20 runs</p>
        <div class="hbars hb" style="margin-top:12px">
{ROWS}
        </div>
        <div class="key"><span><i class="d m"></i>machine</span><span><i class="d"></i>by hand</span><span>steps in order: order and tag · cup and ice · tea and milk · toppings · shake and seal · hand-over</span></div>
        <div class="steps3" style="margin-top:14px">
          <div><b>Cheapest:</b> one machine lets the roster drop a person off-peak for the cost of one unit.</div>
          <div><b>Fastest:</b> all robots, but also the dearest. Robots buy a shorter wait, not a lower cost.</div>
          <div><b>Normal day:</b> same ranking. One machine S$305 a day, all by hand S$361, today's split S$372.</div>
        </div>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">Machines vs AI staffing · event day</div><p><b>Machines</b> decide which steps are automated. <b>AI</b> means the forecast sets the crew.</p><ul><li><b>All by hand:</b> the forecast puts on 4 instead of 2; walk-aways fall from 40.1% to 0.0% for +S$60 a day.</li><li><b>Machine-made drink:</b> the forecast adds no one; 7.2% still walk away.</li></ul></div>
        <div class="bc warn"><div class="k">Depends on the machine's cost</div><p>We assume <b>S$1,909</b> a month per machine unit. One machine beats today's split only while a unit costs more than about <b>S$905</b> a month. Chagee's real cost is unknown, so pilot one machine rather than switch.</p></div>
        <div class="bc ok"><div class="k">Course link</div><p>The same bucket-brigade counter as slide 10 (Weeks 5 and 6), with machines added on some stations.</p></div>
      </div>
    </div>
    <div class="takeaway" style="margin-top:12px"><span class="lab">TAKEAWAY</span><span class="t">One machine on tea and milk lets the roster drop a person off-peak for the cost of one unit. That holds only while a unit costs more than about S$905 a month; Chagee's real cost is unknown.</span></div>
""".replace("{ROWS}", ROWS), notes="""
    <p>The forecast set how many people, and the brigade how they share the work; this slide asks which counter steps go to machines. Each row is one setup; the dots show which of the six steps a machine does. All setups are our illustrative scenarios, not Chagee's disclosed setup. Chagee's own equipment cost is not public; its Singapore relaunch used semi-automated equipment, according to Vulcan Post.</p>
    <p>The bars compare cost a day on an event day, cheapest first, each setup at the fewest people that keep walk-aways within 2%. In our model, one tea-and-milk machine is the cheapest of the five on every day type, because it lets the roster drop a person off-peak at the cost of one machine unit. All robots is the fastest and the dearest: among these options robots buy a shorter wait, not a lower cost.</p>
    <p>Keep two things apart. Machine automation is the split, the equipment. AI here is AI-assisted staffing: the demand forecast sets the crew. On an event day, all by hand without AI has 2 people, and about 40% of peak-hour orders walk away; with AI the forecast puts on 4, walk-aways fall to 0.0%, median wait 5:33 to 1:25, for S$422 a day against S$361. On the machine-made drink the forecast keeps 1 person, so AI changes nothing there: 7.2% still walk away. In our model, forecasting matters most where people do the work.</p>
    <p>Qualify it out loud: these results rest on our assumptions, the machine cost of S$1,909 a month per unit, the wage, the station speeds, the demand curve and a minimum crew of 2 by hand and 1 with machines. One machine beats today's split only while a machine unit costs more than about S$905 a month, with the wage, volume and crews held fixed. Chagee's real machine cost is unknown, so the decision is to pilot one machine against today's split, not to switch.</p>
    <p>The decision itself, for the operations manager, is on the next slide. About one and a half minutes. Course link: the same bucket-brigade replica from Week 5 and Week 6, with machines added on some stations.</p>
""")

# ------------------------------------------------------------------ page 14 · 12 Serve, the operations manager's decision
SECTIONS["o2"] = dict(newid="o2s", cls="slide content st", inner="""
    <p class="kicker">12 · Serve · the operations manager's decision<span class="stg"><b>Serve</b><i>Problem</i><i>Solution</i><i class="on">Decision</i></span></p>
    <h2 class="head">Roster to the forecast, test the brigade, pilot one machine</h2>
    <div class="body" style="grid-template-columns:1fr 268px;margin-top:10px">
      <div class="panel">
        <p class="stt">One lever per column · peak hour · bucket brigade · event day · mean of 20 runs</p>
        {O2TAB}
      </div>
      <div class="cards">
        <div class="bc"><div class="k">Reading the table</div><p><b style="color:#2F6B45">Green</b> is the proposed pilot. Each column adds one lever: the forecast changes only the crew, the machine only the equipment. The last row swaps the brigade for fixed posts. Illustrative simulation.</p></div>
        <div class="bc warn"><div class="k">If the forecast is off</div><p>A busy-day forecast 15% too low leaves about <b>21%</b> walking away (slide 09).</p></div>
        <div class="bc"><div class="k">Day shown</div><p>Event day, the hardest case. Normal and busy days: appendix, Serve.</p></div>
      </div>
    </div>
    <div class="mdec"><div class="who"><span class="lab">Manager's decision</span><b>Operations manager</b></div>
      <div><span class="q">What crew and counter setup should we use?</span>
        <span class="k">Proposed</span>Pilot in 3 outlets: shadow the forecast, roster to it, then run one tea-and-milk machine against today's split.</div>
      <div><span class="k">Proceed if</span><ul><li>waits within 5 min, walk-aways within 2%</li><li>cups per labour hour and contribution at least today's</li><li>it holds when the forecast is off</li></ul></div></div>
    <p class="nextl"><b>Next</b>Serving customers better also means being where demand is still unserved.</p>
""".replace("{O2TAB}", O2TAB), notes=None)


# ------------------------------------------------------------------ assemble
def scope_svgs(section):
    return re.findall(r'<div class="s3v">(<svg[\s\S]*?</svg>)</div>', section)


out = src
for sid, spec in SECTIONS.items():
    m = re.search(r'<section[^>]*\bid="%s"[\s\S]*?</section>' % sid, out)
    assert m, sid
    old = m.group(0)
    tag = re.match(r"<section[^>]*>", old).group(0)
    new_tag = re.sub(r'class="[^"]*"', f'class="{spec["cls"]}"', tag)
    new_tag = re.sub(r'\bid="[^"]*"', f'id="{spec["newid"]}"', new_tag)
    inner = spec["inner"]
    if sid == "c4":
        s1, s2, s3 = scope_svgs(old)
        inner = inner.replace("{SVG1}", s1).replace("{SVG2}", s2).replace("{SVG3}", s3)
    for k, v in SVG.items():
        inner = inner.replace("{" + k.upper() + "}", v)
    assert "{" not in re.sub(r"<svg[\s\S]*?</svg>|<style[\s\S]*?</style>", "", inner), f"placeholder left in {sid}"
    foot = re.search(r'<div class="foot">[\s\S]*?</div>', old).group(0)
    notes = re.search(r'<aside class="notes">[\s\S]*?</aside>', old).group(0)
    if spec["notes"]:
        notes = '<aside class="notes">' + spec["notes"] + "  </aside>"
    new = (f'{new_tag}\n  <div class="leafart" aria-hidden="true"></div>\n  <div class="inner">{inner}  </div>\n'
           f"  {foot}\n  {notes}\n</section>")
    out = out.replace(old, new, 1)

# agenda links follow the renamed pages
out = out.replace('<li data-go="m1">', '<li data-go="m1s">', 1).replace('<li data-go="o1">', '<li data-go="o1s">', 1)
out = out.replace("</head>", CSS + "</head>", 1)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8", newline="").write(out)
print("wrote", OUT, len(out), "bytes (was", len(src), ")")
