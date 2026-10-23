"""Add the Steer demand chapter (slides 13-15) and its appendix page, and renumber the deck around it.

python3 storyboard/static_patch/steer.py storyboard/static_patch/stage1.html storyboard/chagee_storyboard.html
"""
import os
import re
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
s = open(SRC, encoding="utf-8").read()


def section(doc, sid):
    m = re.search(r'<section[^>]*\bid="%s"[\s\S]*?</section>' % re.escape(sid), doc)
    assert m, sid
    return m


def rep(old, new, count=1, sid=None):
    """Replace exactly `count` occurrences (in one section when sid is given); fail loudly otherwise."""
    global s
    if sid:
        m = section(s, sid)
        block = m.group(0)
        n = block.count(old)
        assert n == count, f"{sid}: expected {count} of {old!r}, found {n}"
        s = s[:m.start()] + block.replace(old, new) + s[m.end():]
    else:
        n = s.count(old)
        assert n == count, f"expected {count} of {old!r}, found {n}"
        s = s.replace(old, new)


def rep_section(sid, html):
    global s
    m = section(s, sid)
    s = s[:m.start()] + html + s[m.end():]


def insert_after(sid, html):
    global s
    m = section(s, sid)
    s = s[:m.end()] + "\n\n" + html + s[m.end():]


# ------------------------------------------------------------------ inputs (the deck's own, plus four Steer assumptions)
OUTLETS, CUPS_OUTLET, OPEN_DAYS = 44, 200_000, 360
PRICE, MARGIN, DELIV_SHARE, COMMISSION = 5.90, 0.60, 0.30, 0.30
PEAK_SHARE, KEPT, EXTRA_OFFPEAK, SHIFT, VOUCHER = 0.21, 0.03, 6, 0.10, 1.00   # peak = 12:00-14:00 on the deck's hourly shares (0.10 + 0.11)
CUPS = OUTLETS * CUPS_OUTLET                                   # 8.8M cups a year
reroute_cups = CUPS * PEAK_SHARE * KEPT                         # 55,440
reroute = {m: reroute_cups * PRICE * m for m in (0.5, MARGIN, 0.7)}
offpeak_cups = EXTRA_OFFPEAK * OUTLETS * OPEN_DAYS              # 95,040
offpeak = {m: offpeak_cups * (PRICE - VOUCHER - PRICE * (1 - m)) for m in (0.5, MARGIN, 0.7)}
pickup_cups = CUPS * DELIV_SHARE * SHIFT                        # 264,000
pickup = {c: pickup_cups * PRICE * c for c in (0.25, COMMISSION, 0.35)}
ING = PRICE * (1 - MARGIN)                                      # 2.36
COMM = PRICE * COMMISSION                                       # 1.77
K = lambda x: f"S${x / 1000:,.0f}k"
assert (round(reroute[MARGIN]), round(offpeak[MARGIN]), round(pickup[COMMISSION])) == (196258, 241402, 467280)

# ------------------------------------------------------------------ styles
CSS = """
<style id="steer-chapter">
/* Steer demand chapter (slides 13-15), its appendix page, and the four-part scope and recommendation */
.st .s3.s4.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;margin-top:4px}
.st .s4 .s3p{position:relative;padding:14px 15px;gap:8px}
.st .s4 .s3p:not(:last-child)::after{content:"→";position:absolute;right:-21px;top:46%;font:22px/1 var(--serif);color:var(--gold)}
.st .s4 .s3p h5{font-size:24px}
.st .s4 .s3p .what{font-size:14.5px}
.st .s4 .s3v svg{max-height:120px}
.st .s4 .s3p .how{font-size:12.5px}
.st .s4 .s3p .who{min-height:96px;font-size:13.5px;padding:9px 12px}
.rec3.rec4{grid-template-columns:repeat(4,1fr);gap:10px}
.rec4 .c{padding:12px 14px;font-size:13.5px;gap:8px}
.rec4 .c h5{font-size:20px}
.rec4 .c .own{min-height:2.6em}
.st .mini.wrap td{white-space:normal;text-align:left;vertical-align:top;padding:6px 6px}
.st .mini.wrap td:first-child{width:150px;font-weight:600;color:var(--ink)}
.st .mini.wrap{font-size:13px}
/* slide 13: the app screen and the 10-minute slots */
.st .strr{display:grid;grid-template-columns:240px 1fr;gap:14px;flex:1;min-height:0;align-items:center}
.st .strr .chart{align-self:stretch}
.st .stphone{background:#fff;border:2px solid var(--navy);border-radius:24px;padding:16px 13px;display:flex;flex-direction:column;justify-content:center;gap:9px;font:12.5px/1.4 var(--sans);color:var(--ink2)}
.st .stphone .stpt{font:600 10px/1.2 var(--sans);letter-spacing:.12em;text-transform:uppercase;color:var(--taupe);text-align:center}
.st .stphone .stpc{border-radius:10px;padding:9px 11px;background:#FBEDEC;border:1px solid #EBC2BE}
.st .stphone .stpc.stalt{background:#EEF5F0;border-color:#BFD8C7}
.st .stphone .stpc b{color:var(--ink)}
.st .stphone .stpc>b:first-of-type{display:block;font-size:13.5px}
.st .stphone .sttag{display:inline-block;margin-bottom:4px;padding:1px 8px;border-radius:999px;background:#2F6B45;color:#fff;font:600 9.5px/1.6 var(--sans);letter-spacing:.06em;text-transform:uppercase}
.st .stphone .stpb{display:block;margin-top:7px;text-align:center;border-radius:999px;padding:5px 0;background:var(--navy);color:#fff;font-weight:600}
.st .stphone .stpk{text-align:center;font-size:12px;text-decoration:underline}
/* slide 15: what Chagee keeps from a cup */
.st .stkeep{width:100%;display:flex;flex-direction:column;gap:16px}
.st .kpi2{display:flex;align-items:center;gap:14px;margin-top:4px;padding:10px 14px;border-radius:9px;background:#EEF5F0;font:13px/1.4 var(--sans);color:var(--ink)}
.st .kpi2>b{flex:none;font:600 26px/1 var(--sans);color:#2F6B45}
.st .stkeep .strow{display:grid;grid-template-columns:118px 1fr;align-items:center;gap:12px;font:600 14px/1.3 var(--sans);color:var(--ink)}
.st .stkeep .strow small{display:block;font:400 11.5px/1.3 var(--sans);color:var(--taupe)}
.st .stkeep .stbar{display:flex;height:32px;border-radius:6px;overflow:hidden;font:600 12.5px/32px var(--sans);color:#fff;text-align:center}
.st .stkeep .stbar span{white-space:nowrap;overflow:hidden}
.st .stkeep .sting{background:#A39B8D}
.st .stkeep .stcom{background:var(--red)}
.st .stkeep .stkp{background:#2F6B45}
.st .stkeep .lg2{display:flex;gap:16px;font:11.5px/1.3 var(--sans);color:var(--taupe)}
.st .stkeep .lg2 i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
/* appendix: Steer working */
.st .apx2{display:grid;grid-template-columns:1fr 1.3fr;gap:16px;margin-top:12px;flex:1;min-height:0}
.st .apx2 .mini{font-size:13.5px}
.st .apx2 .mini td{padding:6px 5px}
.st .apx2 .mini td:nth-child(2){text-align:left}
.st .apx2 .mini td:first-child{white-space:nowrap}
.st .apx2 .mini td:last-child,.st .apx2 .mini td:nth-child(3){white-space:nowrap}
.st .apx2 .mini td{white-space:normal}
.st .apx2 .mini td.stsrc{color:var(--taupe);font-size:11.5px}
.st .apx2 .mini tr.stours td{background:#FBF6EA}
.st .apx2 .stin td:first-child{white-space:normal}
.st .apx2 .stin td:nth-child(2),.st .apx2 .stin td.stsrc{white-space:nowrap}
</style>
"""
s = s.replace("</head>", CSS + "</head>", 1)


# ------------------------------------------------------------------ charts
def slot_svg():
    slots = ["13:00", "13:10", "13:20", "13:30", "13:40", "13:50"]
    cap, unit = 15, 4.4
    rows = [("This outlet", "", [15, 15, 12, 9, 7, 6], 2, "ready about 13:25", "#B8322B", 112),
            ("Outlet B", "4-min walk", [10, 8, 7, 6, 6, 5], 1, "ready about 13:12", "#2F6B45", 236)]
    x0, step, bw = 118, 52, 34
    o = ['<svg class="stsvg" viewBox="0 0 440 262" aria-label="Cups booked in each 10-minute slot at two outlets: the busy outlet is full until 13:20, the nearby outlet has room at 13:10">']
    for name, sub, booked, pick, lab, col, base in rows:
        o.append(f'<text x="0" y="{base - (22 if sub else 8)}" font-size="13" font-weight="600" fill="#262626">{name}</text>')
        if sub:
            o.append(f'<text x="0" y="{base - 6}" font-size="11" fill="#9A9387">{sub}</text>')
        top = base - cap * unit
        o.append(f'<line x1="{x0 - 8}" x2="{x0 + step * 5 + bw + 8}" y1="{top:.1f}" y2="{top:.1f}" stroke="#9A9387" stroke-dasharray="4 3"/>')
        o.append(f'<text x="{x0 - 12}" y="{top + 4:.1f}" font-size="10" fill="#9A9387" text-anchor="end">capacity</text>')
        for i, (t, b) in enumerate(zip(slots, booked)):
            x = x0 + i * step
            h = b * unit
            full = b >= cap
            fill, stroke = ("#EBC2BE", "#B8322B") if full else ("#DCE2EC", "#6F86AE")
            sw = "2.6" if i == pick else "1"
            o.append(f'<rect x="{x}" y="{base - h:.1f}" width="{bw}" height="{h:.1f}" rx="3" fill="{fill}" stroke="{stroke if i != pick else col}" stroke-width="{sw}"/>')
            o.append(f'<text x="{x + bw / 2}" y="{base + 14}" font-size="10.5" fill="#9A9387" text-anchor="middle">{t}</text>')
            if full:
                o.append(f'<text x="{x + bw / 2}" y="{base - h + 14:.1f}" font-size="10" font-weight="600" fill="#B8322B" text-anchor="middle">full</text>')
        px = x0 + pick * step + bw / 2
        o.append(f'<text x="{px}" y="{top - 6:.1f}" font-size="11.5" fill="{col}" text-anchor="middle">▼</text>')
        o.append(f'<text x="{px + 9}" y="{top - 6:.1f}" font-size="11.5" font-weight="700" fill="{col}">{lab}</text>')
        o.append(f'<line x1="{x0 - 8}" x2="{x0 + step * 5 + bw + 8}" y1="{base}" y2="{base}" stroke="#4A4A4A"/>')
    o.append("</svg>")
    return "".join(o)


def price_svg():
    hours = list(range(10, 22))
    cups = [22.2, 33.3, 83.3, 91.7, 44.4, 44.4, 50, 55.6, 55.6, 50, 44.4, 38.9]      # busy-day forecast, slide 09
    peak = {12, 13}
    W, x0, step, bw, base, sc = 760, 44, 58, 40, 178, 1.5
    o = [f'<svg class="stsvg" viewBox="0 0 {W} 206" aria-label="Busy-day forecast cups an hour against one person&#39;s capacity: no voucher at the 12:00 to 14:00 peak, vouchers in the quiet hours">']
    for v in (0, 50, 100):
        y = base - v * sc
        o.append(f'<line x1="{x0}" x2="{x0 + step * 12}" y1="{y}" y2="{y}" stroke="#E4DED2"/>')
        o.append(f'<text x="{x0 - 6}" y="{y + 4}" font-size="10" fill="#9A9387" text-anchor="end">{v}</text>')
    for i, (h, c) in enumerate(zip(hours, cups)):
        x = x0 + 9 + i * step
        pk = h in peak
        fill, stroke = ("#EBC2BE", "#B8322B") if pk else ("#DDEBE1", "#2F6B45")
        o.append(f'<rect x="{x}" y="{base - c * sc:.1f}" width="{bw}" height="{c * sc:.1f}" rx="3" fill="{fill}" stroke="{stroke}"/>')
        if h % 2 == 0:
            o.append(f'<text x="{x + bw / 2}" y="{base + 15}" font-size="10.5" fill="#9A9387" text-anchor="middle">{h}:00</text>')
    HALO = 'stroke="#fff" stroke-width="4" paint-order="stroke"'
    cap = 83.25                                                                     # one person, normal-day roster (slide 09 chart; appendix: one per 83 cups)
    o.append(f'<line x1="{x0}" x2="{x0 + step * 12}" y1="{base - cap * sc:.1f}" y2="{base - cap * sc:.1f}" stroke="#4A4A4A" stroke-width="1.4" stroke-dasharray="6 4"/>')
    o.append(f'<text x="{x0 + step * 12}" y="{base - cap * sc - 6:.1f}" font-size="10.5" fill="#4A4A4A" text-anchor="end" {HALO}>one person can serve about 83 cups an hour (slide 09)</text>')
    px = x0 + 9 + 2 * step
    o.append(f'<text x="{px + step - (step - bw) / 2:.0f}" y="{base - 91.7 * sc - 20:.1f}" font-size="12" font-weight="700" fill="#B8322B" text-anchor="middle" {HALO}>peak: needs a second person</text>')
    o.append(f'<text x="{px + step - (step - bw) / 2:.0f}" y="{base - 91.7 * sc - 7:.1f}" font-size="10.5" fill="#B8322B" text-anchor="middle" {HALO}>no voucher · S$0.50 off if pre-ordered before 12:00</text>')
    gx = x0 + 9 + 4 * step
    o.append(f'<line x1="{gx}" x2="{x0 + 9 + 11 * step + bw}" y1="{base - 64 * sc}" y2="{base - 64 * sc}" stroke="#2F6B45" stroke-width="1.4"/>')
    o.append(f'<text x="{(gx + x0 + 9 + 11 * step + bw) / 2:.0f}" y="{base - 64 * sc - 7}" font-size="12" font-weight="700" fill="#2F6B45" text-anchor="middle" {HALO}>spare capacity: app voucher up to S$1</text>')
    o.append(f'<text x="{x0 + 9 + bw + 9:.0f}" y="{base - 33.3 * sc - 8:.1f}" font-size="12" font-weight="700" fill="#2F6B45" text-anchor="middle" {HALO}>up to S$1</text>')
    o.append(f'<text transform="translate(12 {base - 50}) rotate(-90)" font-size="10" fill="#9A9387" text-anchor="middle">cups an hour</text>')
    o.append(f'<line x1="{x0}" x2="{x0 + step * 12}" y1="{base}" y2="{base}" stroke="#4A4A4A"/>')
    o.append("</svg>")
    return "".join(o)


STEER_ICON = """<svg viewBox="0 0 300 160" aria-label="An order is steered from a full outlet to a quieter one nearby"><rect x="20" y="22" width="58" height="104" rx="10" fill="#fff" stroke="#24406B" stroke-width="2.5"/><rect x="28" y="34" width="42" height="80" rx="4" fill="#DCE2EC"/><circle cx="49" cy="64" r="14" fill="#fff" stroke="#24406B" stroke-width="2"/><path d="M49 64V55M49 64l7 4" stroke="#24406B" stroke-width="2" stroke-linecap="round" fill="none"/><rect x="35" y="88" width="28" height="8" rx="4" fill="#24406B"/><path d="M86 60 Q128 36 166 40" fill="none" stroke="#C8A96A" stroke-width="2" stroke-dasharray="4 4"/><path d="M86 92 Q128 120 160 114" fill="none" stroke="#2F6B45" stroke-width="2.4"/><path d="M168 114l-10 -6v12z" fill="#2F6B45"/><line x1="176" x2="282" y1="22" y2="22" stroke="#9A9387" stroke-dasharray="3 3"/><rect x="182" y="22" width="24" height="36" rx="2" fill="#EBC2BE" stroke="#B8322B"/><rect x="214" y="22" width="24" height="36" rx="2" fill="#EBC2BE" stroke="#B8322B"/><rect x="246" y="22" width="24" height="36" rx="2" fill="#EBC2BE" stroke="#B8322B"/><text x="226" y="74" font-size="13" font-family="Roboto,sans-serif" fill="#B8322B" text-anchor="middle">busy outlet: full</text><line x1="176" x2="282" y1="96" y2="96" stroke="#9A9387" stroke-dasharray="3 3"/><rect x="182" y="114" width="24" height="18" rx="2" fill="#DCE2EC" stroke="#6F86AE"/><rect x="214" y="108" width="24" height="24" rx="2" fill="#DCE2EC" stroke="#6F86AE"/><rect x="246" y="118" width="24" height="14" rx="2" fill="#DCE2EC" stroke="#6F86AE"/><line x1="176" x2="282" y1="132" y2="132" stroke="#4A4A4A"/><line x1="176" x2="282" y1="58" y2="58" stroke="#4A4A4A"/><text x="226" y="150" font-size="13" font-family="Roboto,sans-serif" fill="#2F6B45" text-anchor="middle">quieter outlet nearby</text></svg>"""

STG = lambda on: '<span class="stg"><b>Steer</b>' + "".join(('<i class="on">' if k in on else "<i>") + k + "</i>" for k in ("Problem", "Solution", "Decision")) + "</span>"

# ------------------------------------------------------------------ slide 13: ready times and rerouting
S1 = f"""<!-- ======================================================= 13 STEER: READY TIMES AND REROUTING -->
<section class="slide content st" id="s1" data-chapter="Steer" data-title="When an outlet is full">
  <div class="leafart" aria-hidden="true"></div>
  <div class="inner">
    <p class="kicker">13 · Steer · when an outlet is full{STG(("Problem", "Solution"))}<span class="ctag">Course link · Topic 4, fulfilment flexibility</span></p>
    <h2 class="head">Quote an honest ready time, or offer a quieter outlet</h2>
    <p class="bprob"><b>Business problem</b><span>At the peak, app orders keep arriving after an outlet's counter is full, so customers meet waits they did not expect, cancel or walk away.
      <span class="ev obs">Observed</span> long reopening queues (Vulcan Post). <span class="ev inf">To confirm</span> Chagee's cancellations and pickup waits.</span></p>
    <div class="body" style="grid-template-columns:1fr 300px">
      <div class="panel">
        <p class="stt">In the app · cups booked per 10-minute slot · illustrative prototype, not Chagee data</p>
        <div class="strr">
          <div class="stphone"><div class="stpt">Order ahead · pickup</div>
            <div class="stpc"><b>This outlet is busy</b>Next free slot: ready about <b>13:25</b></div>
            <div class="stpc stalt"><span class="sttag">Faster nearby</span><b>Outlet B · 4-min walk</b>Ready about <b>13:12</b><span class="stpb">Switch outlet</span></div>
            <div class="stpk">Keep this outlet · 13:25</div></div>
          <div class="chart">{slot_svg()}</div>
        </div>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">How it works</div><ol><li>Cut slide 09's forecast into <b>10-minute slots</b> and add live drink-making speed.</li><li>When a slot is full, quote the <b>next free slot</b>, not a guess.</li><li>Rank nearby outlets by <b>predicted ready time</b> and walk; the customer chooses.</li></ol><p class="note" style="margin-top:6px">Chagee's app lists outlets and opening hours (App Store listing); this adds each one's ready time.</p></div>
        <div class="bc ok"><div class="k">Why it pays</div><p>A known 15-minute wait is forgiven more than an unexpected 40. The quieter outlet's crew is already paid for.</p></div>
        <div class="bc warn"><div class="k">A safety net for slide 09</div><p>On a busy day, a forecast 15% too low lets about <b>21%</b> walk away (simulated). Rerouting catches that overflow.</p></div>
      </div>
    </div>
    <div class="takeaway" style="margin-top:10px;padding:9px 20px;font-size:14px"><span class="lab">TAKEAWAY</span><span class="t">Keeping <b>3%</b> more lunch-peak cups is worth about <b>{K(reroute[MARGIN])}</b> of gross profit a year. Illustrative; working in the appendix.</span></div>
  </div>
  <div class="foot"><span>OPIM639 · Group 3 · app screen and slots are illustrative · not Chagee data</span><span class="rail"></span><span class="pg"></span></div>
  <aside class="notes">
    <p>Part three: steer demand, for the digital channel manager. Even with the right crew, the counter has a limit. At the peak, app orders keep arriving after an outlet is full, so customers meet waits they did not expect, cancel or walk away. Chagee's app already lists outlets and their opening hours; our proposal adds each outlet's predicted ready time.</p>
    <p>The app cuts slide 09's forecast into ten-minute slots and adds live drink-making speed. When a slot is full, it quotes the next free slot instead of a guess, and offers a nearby outlet ranked by its predicted ready time and walking distance; the customer chooses. A known fifteen-minute wait is forgiven more easily than an unexpected forty, and the quieter outlet's crew is already paid for. It is also the safety net for slide 09: on a busy day, a forecast fifteen percent too low lets about twenty-one percent walk away in the simulation.</p>
    <p>If rerouting keeps three percent more lunch-peak cups, that is about S$196 thousand of gross profit a year on the deck's own inputs: S$5.90 a cup, a 60% margin, 44 outlets, and the 12:00 to 14:00 peak carrying 21% of cups. That assumes peak losses of at least three percent, as when the forecast is too low; with the Serve pilot in place the simulation loses far fewer, so the gain would be smaller. Illustrative; the working is in the appendix. Course link: Topic 4, fulfilment flexibility, serving an order from another location when one is full. About forty-five seconds.</p>
  </aside>
</section>"""

# ------------------------------------------------------------------ slide 14: discounts follow capacity
S2 = f"""<!-- ======================================================= 14 STEER: DISCOUNTS FOLLOW CAPACITY -->
<section class="slide content st" id="s2" data-chapter="Steer" data-title="Discount only when there is spare capacity">
  <div class="leafart" aria-hidden="true"></div>
  <div class="inner">
    <p class="kicker">14 · Steer · discounts follow capacity{STG(("Solution",))}<span class="ctag">Course link · Topic 3, price optimisation</span></p>
    <h2 class="head">Discount only when there is spare capacity</h2>
    <div class="body" style="grid-template-columns:1fr 300px;margin-top:10px">
      <div class="panel">
        <p class="stt">Busy day · forecast cups an hour against one person's capacity (slide 09) · illustrative</p>
        <div class="chart">{price_svg()}</div>
        <table class="mini wrap" style="margin-top:10px">
          <tr><th>Situation</th><th style="text-align:left">Offer in the app</th></tr>
          <tr><td>Off-peak</td><td>Voucher up to <b>S$1</b>, on a high-margin drink</td></tr>
          <tr><td>Peak</td><td><b>No voucher.</b> S$0.50 off orders placed before the peak</td></tr>
          <tr><td>Weather and events</td><td>Hot S$0.50 · normal S$1 · rain S$1 on pickup at sheltered outlets (malls, MRT links) · big events: none, push pre-orders · quiet office weekends S$1</td></tr>
          <tr><td>Dormant members</td><td>Away twice their usual gap (30 days if little history): up to S$1 off their usual drink, 7 days, off-peak pickup; still away after 14 days: a free upsize or bonus points</td></tr>
        </table>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">Guardrails</div><ul><li>Menu prices never change</li><li>Vouchers in the app only, capped at S$1</li><li>No voucher in hours that need extra crew</li></ul></div>
        <div class="bc ok"><div class="k">The number</div><p>After a S$1 voucher an extra cup still earns about <b>S$2.54</b>. About 6 extra off-peak cups per outlet a day is about <b>{K(offpeak[MARGIN])}</b> a year. Illustrative.</p></div>
        <div class="bc"><div class="k">Measure it</div><p>A hold-out group gets no voucher, so we count only the orders vouchers add, not the ones that would have happened anyway.</p></div>
        <div class="bc"><div class="k">Fits with slide 08</div><p>Dormant-member offers sit beside the CRM manager's squads and are judged the same way: extra orders after the cost of the reward.</p></div>
      </div>
    </div>
    <div class="takeaway" style="margin-top:10px;padding:9px 20px;font-size:14px"><span class="lab">TAKEAWAY</span><span class="t">Vouchers fill the quiet hours; at the peak, the best price is the normal price.</span></div>
  </div>
  <div class="foot"><span>OPIM639 · Group 3 · offers and uplift are illustrative assumptions · working: appendix</span><span class="rail"></span><span class="pg"></span></div>
  <aside class="notes">
    <p>Second, pricing, with one rule: discount only when there is spare capacity. This is the price-optimisation idea from Topic 3, with a brand floor as the binding constraint. Our rule, to protect the premium brand: menu prices never change, and only app vouchers move.</p>
    <p>On this busy-day forecast from slide 09, the lunch peak is at or above what one person can serve, so the counter already needs its second person; a voucher there would only lengthen the queue, so there is none. Customers who order before the peak get fifty cents off, which moves demand earlier. In the quiet hours the app offers up to a dollar, on a high-margin drink. Weather and events change the depth, not the rule: a smaller discount on hot days, a dollar on rainy days for pickup at sheltered outlets, none on big event days, a dollar when office areas are quiet. Dormant members get a personal nudge: up to a dollar off their usual drink, off-peak pickup only, then a free upsize or bonus points if they are still away after fourteen days.</p>
    <p>After a one-dollar voucher an extra cup still earns about S$2.54 at the deck's 60% margin. Six extra off-peak cups per outlet a day is about S$241 thousand a year. A hold-out group with no voucher shows how many orders the vouchers really add. Illustrative. About forty-five seconds.</p>
  </aside>
</section>"""

# ------------------------------------------------------------------ slide 15: the digital channel manager's decision
pk_keep, dl_keep = PRICE - ING, PRICE - ING - COMM
S3 = f"""<!-- ======================================================= 15 STEER: THE DIGITAL CHANNEL MANAGER'S DECISION -->
<section class="slide content st" id="s3" data-chapter="Steer" data-title="The digital channel manager's decision">
  <div class="leafart" aria-hidden="true"></div>
  <div class="inner">
    <p class="kicker">15 · Steer · the digital channel manager's decision{STG(("Decision",))}<span class="ctag">Course link · Topic 7, buy online, pick up in store</span></p>
    <h2 class="head">Move delivery orders to app pickup, once pickup times are reliable</h2>
    <div class="body" style="grid-template-columns:1fr 300px;margin-top:10px">
      <div class="panel">
        <p class="stt">What Chagee keeps from a S$5.90 cup · deck inputs: 60% margin, 30% commission</p>
        <div class="chart grow"><div class="stkeep">
          <div class="strow"><div>App pickup<small>no commission</small></div><div class="stbar"><span class="sting" style="width:{ING / PRICE * 100:.1f}%">S${ING:.2f}</span><span class="stkp" style="width:{pk_keep / PRICE * 100:.1f}%">Chagee keeps S${pk_keep:.2f}</span></div></div>
          <div class="strow"><div>Delivery app<small>30% commission</small></div><div class="stbar"><span class="sting" style="width:{ING / PRICE * 100:.1f}%">S${ING:.2f}</span><span class="stcom" style="width:{COMM / PRICE * 100:.1f}%">S${COMM:.2f}</span><span class="stkp" style="width:{dl_keep / PRICE * 100:.1f}%">S${dl_keep:.2f}</span></div></div>
          <div class="lg2" style="margin-left:130px"><span><i style="background:#A39B8D"></i>ingredients and packaging</span><span><i style="background:#B8322B"></i>platform commission</span><span><i style="background:#2F6B45"></i>Chagee keeps</span></div>
          <div class="kpi2"><b>S$1.77</b><span>saved on every cup moved from a delivery app to pickup. Moving 10% of delivery cups is about <b>{K(pickup[COMMISSION])}</b> a year, before incentive costs. Illustrative.</span></div>
        </div></div>
        <div class="steps3">
          <div><span class="n">1</span><b>Bonus points</b> and a pickup challenge (5 a month earn a free upsize); show the saving at checkout.</div>
          <div><span class="n">2</span>A first-order app voucher for customers who already collect <b>GrabFood pickup</b> orders.</div>
          <div><span class="n">3</span><b>Group pickup</b> for offices: one person collects for the team.</div>
        </div>
      </div>
      <div class="cards">
        <div class="bc"><div class="k">Why pickup</div><ul><li>No platform commission</li><li>Chagee keeps the customer data (course Topic 2, slide 17)</li><li>Drinks do not wait for riders</li></ul></div>
        <div class="bc warn"><div class="k">Fix pickup first</div><p>Incentives fail while pickup waits are long and inaccurate, so slide 13's honest ready times come first.</p></div>
        <div class="bc ok"><div class="k">Where AI helps</div><ul><li>Targets the customers most likely to switch</li><li>Pushes pickup at the peak, delivery off-peak</li><li>Predicts ready times from live volume</li></ul></div>
      </div>
    </div>
    <div class="mdec"><div class="who"><span class="lab">Manager's decision</span><b>Digital channel manager</b></div>
      <div><span class="q">How should the app steer orders?</span>
        <span class="k">Proposed</span>Pilot in 3 outlets apart from the Serve pilot's, with their neighbours: ready times, rerouting, off-peak vouchers and pickup incentives against a hold-out group.</div>
      <div><span class="k">Proceed if</span><ul><li>peak cancellations and walk-aways fall</li><li>pickup share rises without longer waits</li><li>contribution after vouchers and incentives beats the hold-out</li></ul></div></div>
    <p class="nextl"><b>Next</b>Where steering cannot reach, open a new outlet.</p>
  </div>
  <div class="foot"><span>OPIM639 · Group 3 · S$ · deck inputs, illustrative · working: appendix</span><span class="rail"></span><span class="pg"></span></div>
  <aside class="notes">
    <p>The decision for part three belongs to the digital channel manager: how should the app steer orders across time, outlets and channels? Delivery is the dearest channel. On a S$5.90 cup, a delivery app takes about S$1.77 at the deck's thirty percent commission, so Chagee keeps half of what it keeps on an app pickup, and the platform, not Chagee, holds the customer data.</p>
    <p>Three levers move orders to pickup: bonus points, a pickup challenge and showing the saving at checkout; a first-order app voucher on the cups of GrabFood pickup orders, since those customers already walk in; and group pickup for offices. But incentives fail while pickup waits are long and inaccurate, so honest ready times from slide 13 come first. Moving ten percent of delivery cups to pickup saves about S$467 thousand a year in commission, before incentive costs; illustrative, and the working is in the appendix.</p>
    <p>We propose a pilot in three outlets other than the Serve pilot's, and their neighbours, against a hold-out group. Proceed if peak cancellations and walk-aways fall, pickup share rises without longer waits, and contribution after vouchers and incentives beats the hold-out. Then the transition: where steering cannot reach, open a new outlet. About one minute.</p>
  </aside>
</section>"""

# ------------------------------------------------------------------ appendix: Steer working
row = lambda a, b, c, cls="": f'<tr class="{cls}"><td>{a}</td><td>{b}</td><td class="stsrc">{c}</td></tr>'
INPUTS = "".join([
    row("Outlets in Singapore", "44", "deck"),
    row("Cups per outlet a year", "200,000 (556 a day)", "deck"),
    row("Cups a year, all outlets", "8.8 million", "44 × 200,000"),
    row("Price per cup", "S$5.90", "deck"),
    row("Gross margin", "60% (50–70%)", "deck"),
    row("Share of cups via delivery apps", "30% (15–45%)", "deck"),
    row("Delivery commission", "30% (25–35%)", "deck"),
    row("Lunch-peak share, 12:00–14:00", "21%", "deck hourly shares"),
    row("Peak cups kept by rerouting", "3%", "ours", "stours"),
    row("Extra off-peak cups from vouchers", "6 an outlet a day", "ours, restated", "stours"),
    row("Delivery cups moved to pickup", "10%", "ours", "stours"),
])
w = lambda a, b, c, d: f"<tr><td><b>{a}</b></td><td>{b}</td><td style='text-align:right'><b>{c}</b></td><td style='text-align:right'>{d}</td></tr>"
WORK = "".join([
    w("Rerouting · slide 13", f"8.8M × 21% × 3% = {reroute_cups:,.0f} cups × S$5.90 × 60%", K(reroute[MARGIN]), f"{K(reroute[0.5])}–{K(reroute[0.7])[2:]}<br><small>margin 50–70%</small>"),
    w("Off-peak vouchers · slide 14", f"6 × 44 × 360 = {offpeak_cups:,.0f} cups × S$2.54 <span class='nw'>(S$5.90 − S$1 voucher − S${ING:.2f} cost)</span>", K(offpeak[MARGIN]), f"{K(offpeak[0.5])}–{K(offpeak[0.7])[2:]}<br><small>margin 50–70%</small>"),
    w("Pickup over delivery · slide 15", f"8.8M × 30% × 10% = {pickup_cups:,.0f} cups × S${COMM:.2f} commission", K(pickup[COMMISSION]), f"{K(pickup[0.25])}–{K(pickup[0.35])[2:]}<br><small>commission 25–35%</small>"),
])
APX = f"""<section class="slide content st" id="asteer" data-chapter="Appendix" data-title="Steer demand: assumptions and working">
  <div class="leafart" aria-hidden="true"></div>
  <div class="inner">
    <p class="kicker">Appendix · Steer, slides 13 to 15: assumptions and working</p>
    <h2 class="head" style="font-size:32px">Three illustrative benefits on the deck's own inputs, never added together</h2>
    <p class="sub">Deck inputs are the ones in Sources and assumptions; the three shaded rows are ours. Not Chagee data.</p>
    <div class="apx2">
      <div class="panel"><p class="stt">Inputs</p>
        <table class="mini stin"><tr><th>Input</th><th style="text-align:left">Value</th><th>Source</th></tr>{INPUTS}</table></div>
      <div class="panel"><p class="stt">Working · a year, base case</p>
        <table class="mini"><tr><th>Lever</th><th style="text-align:left">Working</th><th>Base</th><th>Range</th></tr>{WORK}</table>
        <div class="bc warn" style="margin-top:12px"><div class="k">Read with care</div><p>3% assumes peak losses at least that large, as when the forecast is too low (busy day, 15% low: about 21% walk away, slide 09). With the Serve pilot in place the simulation loses only 0.2% to 1.2% of peak orders, so the rerouting gain would be smaller.</p></div>
        <div class="bc" style="margin-top:10px"><div class="k">Changes from the draft</div><p>Price S$6 to S$5.90 and margin 70% to 60%, peak 40% to 21% (the deck's 12:00–14:00 share), delivery 25% of sales to 30% of cups and commission 18–30% to 30%: all to match the deck. Off-peak: "+5% of delivery volume at about 40% after commission" restated as about 6 extra app cups per outlet a day, about the same volume (100,000 cups a year), with no commission.</p></div>
        <div class="bc" style="margin-top:10px"><div class="k">Why they are not added</div><p>A rerouted order can also be a pickup order, and a voucher can land on an order that would have happened anyway: the hold-out group measures that. Pickup savings are before bonus points and vouchers. None is added to the counter benefit (The size of the benefit).</p></div>
      </div>
    </div>
  </div>
  <div class="foot"><span>OPIM639 · Group 3 · appendix · illustrative assumptions, not Chagee data</span><span class="rail"></span><span class="pg"></span></div>
  <aside class="notes"><p>Backup for questions on slides 13 to 15. Every figure uses the deck's own inputs: 44 outlets at 200,000 cups a year, S$5.90 a cup, a 60% margin, 30% of cups through delivery apps at a 30% commission. The three shaded assumptions are ours: rerouting keeps 3% more lunch-peak cups, vouchers add about six off-peak cups per outlet a day, and 10% of delivery cups move to pickup. The lunch peak, 12:00 to 14:00, carries 21% of cups on the deck's hourly shares. The three benefits overlap, so we never add them to each other or to the counter benefit.</p></aside>
</section>"""

# ------------------------------------------------------------------ insert the chapter and the appendix page
insert_after("o2s", S1 + "\n\n" + S2 + "\n\n" + S3)
insert_after("a3", APX)

# ------------------------------------------------------------------ page 6: four decisions
c4 = section(s, "c4").group(0)
svgs = re.findall(r'<div class="s3v">(<svg[\s\S]*?</svg>)</div>', c4)
assert len(svgs) == 3
foot = re.search(r'<div class="foot">[\s\S]*?</div>', c4).group(0)


def card(n, title, what, svg, how, who, q, where):
    return (f'<div class="s3p"><span class="num">{n}</span><h5>{title}</h5><p class="what">{what}</p><div class="s3v">{svg}</div>\n'
            f'          <p class="how"><b>How we show it</b>{how}</p>\n'
            f'          <p class="who"><b>{who}</b>{q}</p><p class="where">{where}</p></div>')


C4 = f"""<section class="slide content st" id="c4" data-chapter="Scope" data-title="Our scope">
  <div class="leafart" aria-hidden="true"></div>
  <div class="inner">
    <p class="kicker">04 · Our scope</p>
    <h2 class="head">Grow demand, serve and steer it, then expand access</h2>
    <p class="sub">Four connected decisions, four owners. Each chapter: business problem → demonstration → manager’s decision.</p>
    <div class="body" style="grid-template-columns:1fr;margin-top:10px">
      <div class="s3 s4 cards">
        {card(1, "Grow demand", "Make membership more rewarding.", svgs[0], "Network-effects model for tier progress; group orders become demand data.", "CRM manager", "Which features and rewards should we pilot?", "Slides 05 to 08")}
        {card(2, "Serve demand", "Match staffing and workflow to demand.", svgs[1], "A forecast sets the crew; a brigade and machines share the work.", "Operations manager", "What crew and counter setup should we use?", "Slides 09 to 12")}
        {card(3, "Steer demand", "Send orders to spare capacity.", STEER_ICON, "Honest ready times, rerouting, capacity-based vouchers and pickup over delivery.", "Digital channel manager", "How should the app steer orders?", "Slides 13 to 15")}
        {card(4, "Expand access", "Open where we add new customers.", svgs[2], "Clusters of unserved app searches and a demand model for a new outlet.", "Expansion manager", "Which location justifies investment?", "Slides 16 and 17")}
      </div>
    </div>
    <div class="takeaway"><span class="lab">TAKEAWAY</span><span class="t">A connected story, not one combined model: no simulated benefit is carried from one part to the next.</span></div>
  </div>
  {foot}
  <aside class="notes">
    <p>Our scope is four connected decisions, each with its own owner, and each chapter runs the same way: the business problem, a demonstration, then the manager's decision.</p>
    <p>One, grow demand, for the CRM manager: make membership more rewarding. Which features and rewards should we pilot? Two, serve demand, for the operations manager: a more engaging membership has to be matched by reliable fulfilment, so match staffing and workflow to demand. What crew and counter setup should we use? Three, steer demand, for the digital channel manager: even a well-run counter has a limit, so the app sends orders to quieter times, outlets and pickup. How should the app steer orders? Four, expand access, for the expansion manager: serving customers better also means being where demand is still unserved. Which location justifies the investment?</p>
    <p>It is a connected story, not one model: we never carry a simulated benefit from one part into another. The tools each part uses come up in its own chapter. About forty-five seconds.</p>
  </aside>
</section>"""
rep_section("c4", C4)

# ------------------------------------------------------------------ title, agenda
rep("Three decisions, three owners: membership, the counter and the next outlet",
    "Four decisions, four owners: membership, the counter, online orders and the next outlet")
rep("our story has three connected decisions: grow demand through a better membership experience, serve that demand well at the counter, and open where customers are underserved.",
    "our story has four connected decisions: grow demand through a better membership experience, serve that demand well at the counter, steer app orders to spare capacity, and open where customers are underserved.")
rep("Each part has its own owner: the CRM manager, the operations manager and the expansion manager.",
    "Each part has its own owner: the CRM manager, the operations manager, the digital channel manager and the expansion manager.")
rep('<span class="why">Grow demand → serve demand → expand access</span>',
    '<span class="why">Grow demand → serve it → steer it → expand access</span>')
rep('<li data-go="c5"><span class="no">13–14</span>',
    '<li data-go="s1"><span class="no">13–15</span><span class="nm">Steer demand<span class="why">Ready times, rerouting, vouchers, pickup · digital channel manager</span></span></li>\n      <li data-go="c5"><span class="no">16–17</span>')
rep('<li data-go="rc"><span class="no">15</span><span class="nm">Our recommendation<span class="why">Three managers, three pilots</span>',
    '<li data-go="rc"><span class="no">18</span><span class="nm">Our recommendation<span class="why">Four managers, four pilots</span>')
rep("then three chapters, each with the same shape: the business problem, a demonstration, and the manager's decision. Grow demand, for the CRM manager; serve demand, for the operations manager; expand access, for the expansion manager.",
    "then four chapters, each with the same shape: the business problem, a demonstration, and the manager's decision. Grow demand, for the CRM manager; serve demand, for the operations manager; steer demand, for the digital channel manager; expand access, for the expansion manager.")

# ------------------------------------------------------------------ transitions into and out of the new chapter
rep("<b>Next</b>Serving customers better also means being where demand is still unserved.",
    "<b>Next</b>Even a well-run counter has a limit: the app can steer orders to spare capacity.", sid="o2s")
rep("Then the transition: serving customers better also means being where demand is still unserved.",
    "Then the transition: even a well-run counter has a limit, so the app should steer orders to spare capacity.", sid="o2s")
rep("<p>Part three. Serving customers better also means being available where demand remains underserved.",
    "<p>Part four. Where steering cannot reach, serving customers better means being available where demand remains underserved.", sid="c5")
rep("Our recommendation: three managers, three pilots.", "Our recommendation: four managers, four pilots.", sid="e2")
rep("The decision for part three belongs to the expansion manager", "The decision for part four belongs to the expansion manager", sid="e2")
rep("It sits outside the three-part story", "It sits outside the four-part story")
rep("The detail behind two of the three owners' decisions", "The detail behind two of the four owners' decisions", sid="c8")

# ------------------------------------------------------------------ recommendation: four pilots
rep('<p class="kicker">15 · Our recommendation</p>', '<p class="kicker">18 · Our recommendation</p>', sid="rc")
rep("Three managers, three pilots, each judged on its own evidence", "Four managers, four pilots, each judged on its own evidence", sid="rc")
rep('<div class="rec3">', '<div class="rec3 rec4">', sid="rc")
rep("""      <div class="c"><span class="own">Expand access · expansion manager</span>""",
    """      <div class="c"><span class="own">Steer demand · digital channel manager</span><h5>How should the app steer orders?</h5>
        <p class="act"><span class="k">Recommend</span>Honest ready times with rerouting, off-peak vouchers and pickup incentives in 3 outlets and their neighbours, against a hold-out group.</p>
        <p><span class="k">Proceed if</span>peak cancellations fall, pickup share rises without longer waits, and contribution after vouchers beats the hold-out.</p></div>
      <div class="c"><span class="own">Expand access · expansion manager</span>""", sid="rc")
for a, b in [("Grow demand · CRM manager", "Grow demand<br>CRM manager"), ("Serve demand · operations manager", "Serve demand<br>operations manager"),
             ("Steer demand · digital channel manager", "Steer demand<br>digital channel manager"), ("Expand access · expansion manager", "Expand access<br>expansion manager")]:
    rep(f'<span class="own">{a}</span>', f'<span class="own">{b}</span>', sid="rc")
rep("Honest ready times with rerouting, off-peak vouchers and pickup incentives in 3 outlets and their neighbours, against a hold-out group.",
    "Honest ready times with rerouting, off-peak vouchers and pickup incentives in 3 outlets other than the Serve pilot's, and their neighbours, against a hold-out group.", sid="rc")
rep("peak cancellations fall, pickup share rises without longer waits, and contribution after vouchers beats the hold-out.</p></div>",
    "peak cancellations and walk-aways fall, pickup share rises without longer waits, and contribution after vouchers and incentives beats the hold-out.</p></div>", sid="rc")
rep("Make membership more rewarding → serve demand reliably → open where we add new customers.",
    "Make membership more rewarding → serve demand reliably → steer orders to spare capacity → open where we add new customers.", sid="rc")
rep("Our recommendation mirrors the three chapters: three decisions, three owners,",
    "Our recommendation mirrors the four chapters: four decisions, four owners,", sid="rc")
rep("<p>For the expansion manager: count the cups a new outlet adds",
    "<p>For the digital channel manager: the counter has a limit, so steer orders to spare capacity. Pilot honest ready times with rerouting, off-peak vouchers and pickup incentives in three outlets other than the Serve pilot's, and their neighbours, against a hold-out group. Proceed if peak cancellations and walk-aways fall, pickup share rises without longer waits, and contribution after vouchers and incentives beats the hold-out.</p>\n    <p>For the expansion manager: count the cups a new outlet adds", sid="rc")
rep("we never add their simulated benefits together or carry membership uplift into the counter or expansion numbers.",
    "we never add their simulated benefits together or carry membership uplift into the counter, online or expansion numbers.", sid="rc")
rep("the operations manager serves the demand reliably, the expansion manager opens",
    "the operations manager serves the demand reliably, the digital channel manager steers orders to spare capacity, the expansion manager opens")

# ------------------------------------------------------------------ appendix contents and the network-effects page
rep('<div><h5>Expand access</h5><ol><li data-go="a2">',
    '<div><h5>Steer demand</h5><ol><li data-go="asteer">Steer: assumptions and working</li></ol></div>\n      <div><h5>Expand access</h5><ol><li data-go="a2">', sid="ax")
rep("Network effects across the three parts", "Network effects across the four parts", count=3)
rep("Part one grows the positive loops; parts two and three cap the crowding.",
    "Part one grows the positive loops; parts two to four cap the crowding.", sid="c1b")
rep("<span>Part two caps congestion, the same-side minus: at the peak, each extra customer adds to everyone's wait (slides 09 to 12).",
    "<span>Parts two and three cap congestion, the same-side minus: at the peak, each extra customer adds to everyone's wait (slides 09 to 15).", sid="c1b")
rep("<span>Part three caps cannibalisation: a new outlet takes cups from its neighbours, so slide 13 counts cups added, not sold.",
    "<span>Part four caps cannibalisation: a new outlet takes cups from its neighbours, so slide 16 counts cups added, not sold.", sid="c1b")
rep("② Cap · part two · slides 09 to 12", "② Cap · parts two and three · slides 09 to 15", sid="c1b")
rep("③ Cap · part three · slides 13–14", "③ Cap · part four · slides 16 and 17", sid="c1b")
rep('<span class="lab">Takeaway</span>', '<span class="lab">TAKEAWAY</span>', sid="c1b")
rep('<tspan fill="#B8322B">slides 09–12</tspan>', '<tspan fill="#B8322B">slides 09–15</tspan>', sid="c1b")
rep('fill="#24406B">slides 13–14</text>', 'fill="#24406B">slides 16–17</text>', sid="c1b")
rep("This is how the three parts use network effects.", "This is how the four parts use network effects.", sid="c1b")
rep("Two we cap. Part two, congestion:", "Two we cap. Parts two and three, congestion:", sid="c1b")
rep("Part three, cannibalisation:", "Part four, cannibalisation:", sid="c1b")

# ------------------------------------------------------------------ renumber the old 13-15 (course-slide citations untouched)
rep('<p class="kicker">13 · Expand', '<p class="kicker">16 · Expand', sid="c5")
rep('<p class="kicker">14 · Expand', '<p class="kicker">17 · Expand', sid="e2")
rep("slides 07 and 13", "slides 07 and 16", sid="adata")
rep("expansion manager · slide 13", "expansion manager · slide 16", sid="c8")
for old, new in [("(slide 13)", "(slide 16)"), ("On slide 13", "On slide 16"), ("on slide 13", "on slide 16"),
                 ("The new store in money, slide 13", "The new store in money, slide 16"), ("slide 13's P&amp;L", "slide 16's P&amp;L"),
                 ("slide 13's P&L", "slide 16's P&L"), ("slide 13 engine", "slide 16 engine"), ("same engine as slide 13", "same engine as slide 16"),
                 ("Slide 13 new-store", "Slide 16 new-store"), ("slide 13 events", "slide 16 events"), ("slides 01 to 15", "slides 01 to 18")]:
    n = s.count(old)
    s = s.replace(old, new)
    print(f"renumbered {n:2d} × {old!r}")

# ------------------------------------------------------------------ references the new chapter changes, and older ones that were wrong
rep("Delivery levers (third-party; channel margins not disclosed)", "Delivery levers (sized in Steer, slide 15; not added here)", sid="ab")
rep("(backs the benefit slide, under Things to consider)", "(backs The size of the benefit)", sid="ab")
rep("<b>delivery profit by channel</b>;", "<b>delivery profit by channel</b> beyond the illustrative 30% commission used in Steer (slide 15);", sid="a1")
rep("deducted in the profit (next slide).", "deducted in the profit (From pin to net profit).", sid="x1")
rep("cannibalisation (previous slide).", "cannibalisation (Four scores for every location).", sid="x2")
rep("Appendix · Members, slides 05 to 07: the model, the scenario table and the network check", "Appendix · Members, slides 05 and 06: the model, the scenario table and the network check", sid="am1")
rep("Appendix · Members, slides 05 to 07: break-even table, assumptions and source excerpts", "Appendix · Members, slides 05 to 08: break-even table, assumptions and source excerpts", sid="am2")
rep("<p>Backup for slide 09, for questions on which machine to buy.", "<p>Backup for slide 11, for questions on which machine to buy.", sid="cm")
rep("The supervised site model, also under Things to consider,", "The supervised site model, in the appendix (Expand access),", sid="n2")
rep("Appendix · New market (Things to consider): inputs and method", "Appendix · New market (optional extension): inputs and method", sid="an")
rep("The CRM manager's decision is on slide 08.", "The CRM manager's decision is on slide 08, and the digital channel manager's on slide 15, with its working in the Steer appendix.", sid="c8")
for a, b in [('y="94" font-size="11" font-weight="700" fill="#2F6B45" letter-spacing=".1em">① FRIENDS', 'y="86" font-size="11" font-weight="700" fill="#2F6B45" letter-spacing=".1em">① FRIENDS'),
             ('<text x="14" y="110" font-size="11.5" fill="#262626">friends on the app make</text>', '<text x="14" y="102" font-size="11.5" fill="#262626">friends on the app make</text>'),
             ('<text x="14" y="124" font-size="11.5" fill="#262626">joining worth more · slides 05–08</text>', '<text x="14" y="116" font-size="11.5" fill="#262626">joining worth more · slides 05–08</text>')]:
    rep(a, b, sid="c1b")
rep('.slide.cover .meta,aside.notes p";',
    '.slide.cover .meta,aside.notes p," +\n    ".bprob>span,.stt,.bc .k,.bc p,.bc li,.mdec .q,.mdec li,.nextl,.steps3>div,.kpi2>span,.s3p h5,.s3p .what,.s3p .how,.s3p .who,.s3p .where," +\n    ".rules h6,.rules p,.stn>div,.hbar .nm,.mini td,.pa p,.act>div,.stpc,.stpk";')

# ------------------------------------------------------------------ teammates' pages 3, 14, 18 and 19: fixes from the review, content otherwise unchanged
# page 3: keep the Vulcan Post quote, and say where delivery actually runs (the deck's Chagee source)
rep("in Singapore, <b>in-app ordering and delivery</b> followed the reopening queues.",
    "in Singapore, <b>in-app ordering</b> followed the reopening queues, with delivery through third-party apps.", sid="c1")
rep("Vulcan Post reports that Chagee Singapore rolled out in-app ordering and delivery after the long reopening queues.",
    "Vulcan Post reports that Chagee Singapore rolled out in-app ordering and delivery after the long reopening queues; our Chagee source says the delivery itself runs through third-party apps.", sid="c1")

# page 14: the third column swaps today's three machine steps for one machine, and the forecast sets its crew
rep('<span class="rtag">Proposed pilot</span>+ one machine<br><small style="text-transform:none;letter-spacing:0">forecast roster · tea-and-milk machine</small>',
    '<span class="rtag">Proposed pilot</span>One-machine split<br><small style="text-transform:none;letter-spacing:0">forecast roster · tea-and-milk machine only</small>', sid="o2s")
rep("One lever per column · peak hour · bucket brigade · event day · mean of 20 runs",
    "Peak hour · bucket brigade · event day · mean of 20 runs", sid="o2s")
rep("is the proposed pilot. Each column adds one lever: the forecast changes only the crew, the machine only the equipment. The last row swaps the brigade for fixed posts. Illustrative simulation.</p>",
    "is the proposed pilot. The second column changes only the crew, to the forecast. The third swaps today's three machine steps for one tea-and-milk machine; the forecast then sets its crew. The last row swaps the brigade for fixed posts. Illustrative simulation.</p><p>Cups per person fall at the peak with a third person; the machine saves off-peak, in the cost a day.</p>", sid="o2s")
rep("<li>cups per labour hour and contribution at least today's</li>",
    "<li>cups per labour hour over the day and contribution at least today's</li>", sid="o2s")
rep("Read the table left to right; each column changes one lever. First, today: today's split and the normal-day roster. Second, the forecast changes only the crew. Third, a machine changes only the equipment, with the forecast crew.",
    "Read the table left to right. First, today: today's split and the normal-day roster. Second, the forecast changes only the crew. Third, the one-machine split swaps today's three machine steps for one tea-and-milk machine, and the forecast then sets its crew: three at the peak.", sid="o2s")
rep("productivity as cups served per person at the peak, and operating contribution.",
    "productivity as cups served per person at the peak, and operating contribution. Cups per person fall at the peak with the third person; the machine's saving comes off-peak, in the cost a day, so the pilot judges cups per labour hour over the whole day.", sid="o2s")
rep("Proceed only if waits, walk-aways, cups per labour hour and contribution hold up, including when the forecast is off.",
    "Proceed only if waits and walk-aways hold up and cups per labour hour over the day and contribution are at least today's, including when the forecast is off.", sid="o2s")
rep("<span class=\"k\">Proceed if</span>waits, walk-aways, cups per labour hour and contribution beat today's, even when the forecast is off.",
    "<span class=\"k\">Proceed if</span>waits and walk-aways improve, and cups per labour hour over the day and contribution are at least today's, even when the forecast is off.", sid="rc")
rep("Proceed if waits, walk-aways, productivity and contribution beat today's, including when the forecast is wrong.",
    "Proceed if waits and walk-aways improve and productivity over the day and contribution are at least today's, including when the forecast is wrong.", sid="rc")

# page 18: problem bar, notes and caption say what the numbers on slides 16-17 say
rep("A new outlet may look successful while mostly moving sales from nearby stores, while other customers have no convenient outlet.",
    "A new outlet may look successful while mostly moving sales from nearby stores, and other customers still have no convenient outlet.", sid="c5")
rep("the number of stores is confidential (Chagee source, anonymous).", "the number of planned openings is confidential (Chagee source, anonymous).", sid="c5")
rep("a store beside an existing outlet would sell plenty, but about 80% of it is moved from that outlet.",
    "a store beside an existing outlet would sell plenty, but about two-thirds of it, 388 of 604 cups a day, is moved from nearby outlets (slide 17).", sid="c5")
rep("The forecast's peak hour sets the opening roster for today's split (our scenario), which slides 10 and 11 run.",
    "The forecast's peak hour sets the opening roster for the counter modelled on slides 10 and 11.", sid="c5")
# page 18 map: callouts clear the outlet markers and read at about 10px; only the outlets the panel names carry a number
rep("const placed = [], W = 210, H = 34;",
    "const placed = GEO.outlets.map(([x, y]) => ({ x: x - 20, y: y - 36, w: 40, h: 40 })), W = 250, H = 40;   // outlet markers count as taken")
rep("const opts = [[30, -17], [30, 26], [30, -60], [-30 - W, -17], [-30 - W, 26]];",
    "const opts = [[30, -20], [30, 26], [30, -66], [-30 - W, -20], [-30 - W, 26], [-W / 2, -78], [-W / 2, 32], [30, 72], [-30 - W, -66], [-30 - W, 72]];")
rep("""        M.candidates.slice(0, SP.candidates_shown.value).forEach((c, k) => {
          placed.push({ x: c.x - 24, y: c.y - 24, w: 48, h: 48 });""",
    """        M.candidates.slice(0, SP.candidates_shown.value).forEach(c => placed.push({ x: c.x - 24, y: c.y - 24, w: 48, h: 48 }));   // every pin first
        const clash = r => placed.reduce((a, q) => a + Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x)) * Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y)), 0) +
          (r.x < 0 || r.y < 0 || r.x + r.w > 1672 || r.y + r.h > 640 ? 1e6 : 0);
        M.candidates.slice(0, SP.candidates_shown.value).forEach((c, k) => {""")
rep("const [dx, dy] = opts.find(([dx, dy]) => !hits({ x: c.x + dx, y: c.y + dy, w: W, h: H })) || opts[0];",
    "const [dx, dy] = opts.map(o => [o, clash({ x: c.x + o[0], y: c.y + o[1], w: W, h: H })]).sort((a, b) => a[1] - b[1])[0][0];   // least overlap, first choice on ties")
rep('T(c.x + dx + W / 2, c.y + dy + 24, `+${Math.round(c.f.netNew)} cups for Chagee`, `font-size="20" font-weight="700" fill="${COL.navy}" text-anchor="middle"`)',
    'T(c.x + dx + W / 2, c.y + dy + 28, `+${Math.round(c.f.netNew)} cups for Chagee`, `font-size="24" font-weight="700" fill="${COL.navy}" text-anchor="middle"`)')
rep("""      GEO.outlets.forEach(([x, y], j) => (s += `<g class="ol" data-j="${j}">` +
        `<circle cx="${x}" cy="${y - 14}" r="14" fill="${COL.navy}" stroke="#fff" stroke-width="3"/>` +
        T(x, y - 9, GEO.numbers[j], `font-size="14" font-weight="700" fill="#fff" text-anchor="middle"`) + `</g>`));""",
    """      const named = new Set(sel != null ? [sel] : step >= 4 ? f.hit.slice(0, 2).map(h => h.j) : []);   // the outlets the panel names
      GEO.outlets.forEach(([x, y], j) => (s += `<g class="ol" data-j="${j}">` + (named.has(j)
        ? `<circle cx="${x}" cy="${y - 14}" r="22" fill="${COL.navy}" stroke="#fff" stroke-width="3"/>` +
          T(x, y - 5, GEO.numbers[j], `font-size="24" font-weight="700" fill="#fff" text-anchor="middle"`)
        : `<circle cx="${x}" cy="${y - 14}" r="12" fill="${COL.navy}" stroke="#fff" stroke-width="3"/>`) + `</g>`));""")
rep('${Math.round(f.cannibal)} of those move from outlets nearby${f.hit.length ? ":" : "."}',
    '${Math.round(f.cannibal)} of those move from outlets nearby${f.hit.length ? ", mainly:" : "."}')

# page 19: the column sub-headers were rendering at about 8px
s = s.replace("</head>", "<style id=\"teammate-fixes\">.e2tab th small{font-size:10.5px;letter-spacing:.02em}</style>\n</head>", 1)

# ------------------------------------------------------------------ edit mode reaches each decision strip's proposal; old in-browser edits are not misapplied
n_mdec = 0
def _wrap_proposal(m):
    global n_mdec
    n_mdec += 1
    return m.group(1) + '<span class="pv">' + m.group(2) + "</span>" + m.group(3)
s = re.sub(r'(<span class="k">Proposed</span>)(.*?)(</div>)', _wrap_proposal, s, flags=re.S)
assert n_mdec == 4, n_mdec                                       # pages 10, 14, 17, 19
rep('".rules h6,.rules p,.stn>div,.hbar .nm,.mini td,.pa p,.act>div,.stpc,.stpk";',
    '".rules h6,.rules p,.stn>div,.hbar .nm,.mini td,.mini th,.pa p,.act>div,.stpc,.stpk,.stpt,.mdec .pv,.mdec .who b,.kpi2>b,.strow>div,.stbar>span,.lg2>span";')
rep('const STORE = "opim639-storyboard-edits";', 'const STORE = "opim639-storyboard-edits-v46";   // new key: edits saved against the 42-page layout would land on the wrong slides')

# ------------------------------------------------------------------ footers: the rail gains a chapter
rep("<span>OPIM639 · Group 3 · synthetic data: the signals carry information because we assumed they do · not measured accuracy · tables: appendix</span>",
    "<span>OPIM639 · Group 3 · synthetic data, not measured accuracy · tables: appendix</span>")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8", newline="").write(s)
print("wrote", OUT, len(s))
