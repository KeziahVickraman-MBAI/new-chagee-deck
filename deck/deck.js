/* ================= deck explainers =================
 * Every number comes from RAW (assumptions.json), DATA (sim/precompute.js output)
 * or a live call into Sim (sim/sim.js). Slide 2's band is shared state: moving its
 * slider updates slides 3, 4 (marker) and 5.
 */
const $=(r,s)=>r.querySelector(s), $$=(r,s)=>[...r.querySelectorAll(s)];
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const money=v=>(v<0?"−":"")+"S$"+Math.abs(v).toFixed(2);
const money0=v=>(v<0?"−":"")+"S$"+Math.round(Math.abs(v)).toLocaleString("en-SG");
const moneyM=v=>(v<0?"−":"")+"S$"+(Math.abs(v)/1e6).toFixed(1)+"m";
const int=v=>Math.round(v).toLocaleString("en-SG");
const pct=v=>Math.round(v*100)+"%", pct1=v=>(v*100).toFixed(1)+"%";
const SETUPS=Sim.SETUPS, LABEL={all_human:"All-human",mixed:"Mixed",all_machine:"All-machine"}, SHORT={all_human:"Human",mixed:"Mixed",all_machine:"Machine"};
const COL={all_human:css("--c-human"),mixed:css("--c-mixed"),all_machine:css("--c-machine")};
const SURGE0=RAW.surge.surge_default.value, SURGES=Object.keys(RAW.surge.surge_multiplier.value);
const SURGE_LABEL=g=>`${g[0].toUpperCase()+g.slice(1)} ×${RAW.surge.surge_multiplier.value[g]}`;

/* ---------- shared state ---------- */
const STATE={signal:RAW.predict.signal_strength_default.value, removeHype:RAW.predict_toggles.remove_hype_default.value, band:null};
const LISTEN=[];
const onBand=fn=>LISTEN.push(fn);
function emit(){ STATE.band=Sim.band(P,STATE.signal,STATE.removeHype); LISTEN.forEach(f=>f(STATE.band)); }

/* ---------- small SVG helpers ---------- */
function niceStep(range,n){ const raw=range/n, mag=Math.pow(10,Math.floor(Math.log10(raw))), f=raw/mag;
  return mag*(f<1.5?1:f<3?2:f<7?5:10); }
const ticks=(max,n)=>{ const s=niceStep(max,n), out=[]; for(let v=0;v<=max+1e-9;v+=s) out.push(+v.toFixed(10)); return out; };
const txt=(x,y,s,a="")=>`<text x="${x}" y="${y}" ${a}>${s}</text>`;
function nudge(items,minGap,lo,hi){            // keep direct labels apart vertically
  items.sort((a,b)=>a.y-b.y);
  for(let i=1;i<items.length;i++) if(items[i].y-items[i-1].y<minGap) items[i].y=items[i-1].y+minGap;
  const over=items.length?items[items.length-1].y-hi:0; if(over>0) items.forEach(it=>it.y-=over);
  items.forEach(it=>it.y=Math.max(lo,it.y)); return items;
}

/* ================= scope slide: eight course topics ================= */
function scopeWidget(root){
  $$(root,".topic").forEach(b=>b.onclick=()=>{
    $$(root,".topic").forEach(x=>x.classList.toggle("on",x===b));
    $$(root,".tdetail").forEach(d=>d.classList.toggle("on",d.dataset.t===b.dataset.t));
  });
}

/* ================= context slide: where AI enters ================= */
function aimapWidget(root){
  $$(root,".mstep").forEach(b=>b.onclick=()=>{
    $$(root,".mstep").forEach(x=>x.classList.toggle("on",x===b));
    $$(root,".mcard").forEach(c=>c.classList.toggle("on",c.dataset.st===b.dataset.st));
  });
}

/* ================= slide 1: where does uncertainty land ================= */
function whereWidget(root){
  $$(root,".variants button").forEach(b=>b.onclick=()=>{
    $$(root,".variants button").forEach(x=>x.classList.toggle("on",x===b));
    $$(root,".scen").forEach(s=>s.classList.toggle("on",s.dataset.sc===b.dataset.sc));
  });
}

/* ================= slide 2: demand band ================= */
function bandWidget(root){
  const body=$(root,".body");
  body.innerHTML=`<div class="exgrid"><div>
      <svg class="chart" viewBox="0 0 470 206" role="img" aria-label="Weekly demand bands"></svg>
      <div class="controls"><label for="sig">Assumed signal strength</label><div class="rng"><input id="sig" type="range" min="0" max="1" step="any"><span class="val sigv"></span></div></div>
      <div class="variants" style="margin-top:5px"><button data-h="1">Opening hype removed</button><button data-h="0">Hype included</button></div>
      <p class="plan"></p>
    </div><div class="out"></div></div>`;
  const svg=$(body,"svg"), out=$(body,".out"), sig=$(body,"#sig");
  sig.value=STATE.signal;
  sig.oninput=e=>{STATE.signal=+e.target.value; emit();};
  $$(body,"[data-h]").forEach(b=>b.onclick=()=>{STATE.removeHype=b.dataset.h==="1"; emit();});
  const xmax=7*Sim.dailyBase(P)*P.hype*(1+P.uNone);
  onBand(b=>{
    $$(body,"[data-h]").forEach(x=>x.classList.toggle("on",(x.dataset.h==="1")===b.removeHype));
    $(body,".sigv").textContent=`${pct(STATE.signal)} → ±${pct1(b.u)}`;
    const steady=Sim.band(P,STATE.signal,true), hype=Sim.band(P,STATE.signal,false);
    const L=12,R=458,X=v=>L+(R-L)*v/xmax, amber=css("--amber"), grey="#c5cad3";
    let s=ticks(xmax,5).map(v=>`<line x1="${X(v)}" x2="${X(v)}" y1="18" y2="176" stroke="#e5e7eb"/>`+
      txt(X(v),192,int(v),'font-size="10" fill="#6b7280" text-anchor="middle"')).join("");
    [[steady,"Steady demand (repeat habit)",40,b.removeHype],[hype,"Opening weeks, with hype",116,!b.removeHype]].forEach(([bd,lab,y,act])=>{
      s+=txt(L,y-6,lab+(act?" · handed on":""),`font-size="11.5" font-weight="700" fill="${act?"#23272f":"#6b7280"}"`);
      s+=`<rect x="${X(bd.low)}" y="${y}" width="${X(bd.high)-X(bd.low)}" height="22" rx="4" fill="${act?amber:grey}" opacity="${act?0.9:0.7}"/>`;
      s+=`<line x1="${X(bd.base)}" x2="${X(bd.base)}" y1="${y-3}" y2="${y+25}" stroke="#23272f" stroke-width="2"/>`;
      s+=txt(X(bd.low),y+36,int(bd.low),'font-size="10.5" fill="#374151" text-anchor="middle"');
      s+=txt(X(bd.high),y+36,int(bd.high),'font-size="10.5" fill="#374151" text-anchor="middle"');
      s+=txt(X(bd.base)+4,y+16,int(bd.base),'font-size="10.5" font-weight="700" fill="#23272f"');
    });
    s+=txt(R,204,"cups per week","font-size=\"10\" fill=\"#6b7280\" text-anchor=\"end\"");
    svg.innerHTML=s;
    const ds=root.closest(".slide").querySelector('.dstrip[data-lever="u"]');
    if(ds && ds.dataset.x!==""){ const x=+ds.dataset.x, above=b.u>x;
      ds.querySelector(".dnow").textContent=`Now ±${pct1(b.u)}: ${above?"above":"below"} the trigger, so on the band alone ${above?"mixed":"all-human"} is cheaper.`; }
    const cov=RAW.demand.band_coverage.value, kind=b.removeHype?"steady demand (opening hype removed)":"opening-week demand (hype included)";
    $(body,".plan").innerHTML=`<b>Plan on about ${int(b.base)} cups a week</b> of ${kind}. Illustrative ${pct(cov)} demand range: ${int(b.low)} to ${int(b.high)}. The range is assumed, not calibrated; demand can fall outside it.`;
    out.innerHTML=`<h4>WHAT THE RANGE IS FOR</h4>
      <div class="stat"><span>Low end (${int(b.low)})</span></div><p class="note" style="margin:0 0 4px">Risk of excess fresh stock and unused capacity.</p>
      <div class="stat"><span>High end (${int(b.high)})</span></div><p class="note" style="margin:0 0 4px">Risk of shortages, queues and lost sales.</p>
      <p class="note" style="margin:0 0 3px"><b>Provision</b> uses the range with shortage and waste costs to choose the milk order.</p>
      <p class="note" style="margin:0"><b>Counter</b> uses demand, uncertainty and local wages and machine costs together.</p>
      <div class="handoff"><b>Not in the signal:</b> tourists and non-app orders.</div>`;
    gateSet(root,{action:`Plan on about ${int(b.base)} cups a week, within an illustrative ${pct(cov)} range of ${int(b.low)} to ${int(b.high)}; treat it as an assumption to test.`,
      base:`${int(b.base)} cups/week`, range:`${int(b.low)}–${int(b.high)}`, half:`±${pct1(b.u)}`});
  });
}

/* ================= slide 3: opening stock ================= */
function stockWidget(root){
  const body=$(root,".body"), [lo,hi]=RAW.provision.opening_stock_days.range;
  let days=RAW.provision.opening_stock_days.value;
  body.innerHTML=`<div class="exgrid"><div>
      <svg class="chart" viewBox="0 0 470 196" role="img" aria-label="Expected cost by days of opening stock"></svg>
      <div class="dlegend" style="margin:4px 0 0"><span><span class="sw" style="background:#23272f"></span>Total expected cost</span>
        <span><span class="sw" style="background:${css("--c-human")}"></span>Milk wasted</span><span><span class="sw" style="background:${css("--red")}"></span>Cups missed</span></div>
      <div class="controls"><label for="days">Days of opening stock</label><div class="rng"><input id="days" type="range" min="${lo}" max="${hi}" step="1" value="${days}"><span class="val dv"></span></div></div>
      <p class="rec"></p>
    </div><div class="out"></div></div>`;
  const svg=$(body,"svg"), out=$(body,".out");
  $(body,"#days").oninput=e=>{days=+e.target.value; draw(STATE.band);};
  function draw(b){
    const daily=b.base/7, r=Sim.provision(P,b.u,days,daily), strong=Sim.provision(P,P.uStrong,days,daily);
    $(body,".dv").textContent=`${days} days`;
    const n=40, pts=[...Array(n+1)].map((_,i)=>{const d=lo+(hi-lo)*i/n, c=r.curve(d); return {d,w:c.waste,s:c.stockout,t:c.waste+c.stockout};});
    const ymax=Math.max(...pts.map(p=>p.t))*1.05, L=46,R=458,T=12,B=170;
    const X=d=>L+(R-L)*(d-lo)/(hi-lo), Y=v=>B-(B-T)*v/ymax;
    const path=k=>pts.map((p,i)=>(i?"L":"M")+X(p.d).toFixed(1)+" "+Y(p[k]).toFixed(1)).join("");
    let s=ticks(ymax,4).map(v=>`<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e5e7eb"/>`+txt(L-5,Y(v)+3,money0(v),'font-size="10" fill="#6b7280" text-anchor="end"')).join("");
    for(let d=lo; d<=hi; d+=Math.max(1,Math.round((hi-lo)/6))) s+=txt(X(d),B+14,d,'font-size="10" fill="#6b7280" text-anchor="middle"');
    s+=txt(R,B+25,"days of base demand","font-size=\"10\" fill=\"#6b7280\" text-anchor=\"end\"");
    s+=`<path d="${path("w")}" fill="none" stroke="${css("--c-human")}" stroke-width="2" stroke-dasharray="5 3"/>`;
    s+=`<path d="${path("s")}" fill="none" stroke="${css("--red")}" stroke-width="2" stroke-dasharray="5 3"/>`;
    s+=`<path d="${path("t")}" fill="none" stroke="#23272f" stroke-width="2.5"/>`;
    s+=`<line x1="${X(days)}" x2="${X(days)}" y1="${T}" y2="${B}" stroke="${css("--amber")}" stroke-width="2"/>`;
    s+=`<circle cx="${X(days)}" cy="${Y(r.total)}" r="5" fill="${css("--amber")}" stroke="#fff" stroke-width="2"/>`;
    if(r.optDays>=lo && r.optDays<=hi){
      s+=`<circle cx="${X(r.optDays)}" cy="${Y(r.optTotal)}" r="6" fill="#fff" stroke="${css("--green")}" stroke-width="3"/>`;
      s+=txt(X(r.optDays),Y(r.optTotal)-11,"lowest cost",`font-size="10.5" font-weight="700" fill="${css("--green")}" text-anchor="middle"`);
    }
    svg.innerHTML=s;
    const rows=DATA.sweeps[SURGE0].rows, cost=k=>Sim.atU(rows,b.u,r=>r[k].cost);
    const best=SETUPS.reduce((a,k)=>cost(k)<cost(a)?k:a), gap=cost("all_machine")-cost("mixed");
    const litres=r.optDays*daily*P.milkPerCup, shelf=RAW.provision.milk_shelf_life_days.value, under=P.stockoutCost/P.milkPerCup;
    const kind=b.removeHype?"steady demand (opening hype removed)":"opening-week demand (hype included)";
    const topDays=shelf*b.high/b.base, rel=r.optDays>topDays+0.05?"just above the top of the range":r.optDays<r.base?"below base":"inside the range";
    $(body,".rec").innerHTML=`<b>Order about ${int(litres)} L for the first ${shelf} days</b>, using ${kind}. That is ${r.optDays.toFixed(1)} days of base demand, ${rel} (top of range ${topDays.toFixed(1)} days).`+
      (b.removeHype?` <span class="warn">The opening weeks are forecast higher (hype ×${RAW.demand.opening_hype_multiplier.value}); if that hype is real, this first delivery runs short: include it on slide ${REF.s2} to size for it.</span>`:"");
    gateSet(root,{action:`Order about ${int(litres)} L for the first ${shelf} days, using ${kind}.`,
      cost:`${money(under)} vs ${money(P.wasteCost)}`, cover:`${pct(r.criticalRatio)} of outcomes`,
      waste:`${int(r.optWaste/P.wasteCost)} L`, short:`${int(r.optStockout/P.stockoutCost)} cups`});
    out.innerHTML=`<h4>AT ${days} DAYS OF STOCK</h4>
      <div class="big">${money0(r.total)} <small>expected</small></div>
      <div class="stat"><span>Milk wasted</span><b>${money0(r.waste)}</b></div>
      <div class="stat"><span>Cups missed</span><b>${money0(r.stockout)}</b></div>
      <hr><h4>BEST ORDER AT THIS BAND (±${pct1(b.u)})</h4>
      <div class="stat best"><span>${r.optDays.toFixed(1)} days</span><b>${money0(r.optTotal)}</b></div>
      <div class="stat"><span>Same order, strong signal</span><b>${money0(strong.optTotal)}</b></div>
      <div class="handoff"><b>Hand-off:</b> open with ${int(r.optDays*daily*P.milkPerCup)} L of milk. The counter is decided by volume and input costs, not this band (slide ${REF.cost}).</div>`;
    const ds=root.closest(".slide").querySelector('.dstrip[data-lever="milk"]');
    if(ds) ds.querySelector(".dnow").textContent=`Now ±${pct1(b.u)}: best order ${r.optDays.toFixed(1)} days, about ${int(r.optDays*daily*P.milkPerCup)} L of milk.`;
  }
  onBand(draw);
}

/* ================= slide 4: crossover chart ================= */
function crossWidget(root){
  const body=$(root,".body"), shiftRows=$(root,".shiftrows");
  const st={surge:SURGE0, u:null, shift:null};
  const allRuns=[...Object.values(DATA.sweeps),...Object.values(DATA.shift).flatMap(s=>[s.lowRun,s.highRun])];
  const ymax=Math.max(...allRuns.flatMap(r=>r.rows.flatMap(x=>SETUPS.map(k=>x[k].cost))))*1.06;
  const grid=DATA.sweeps[SURGE0].rows.map(r=>r.u), umin=grid[0], umax=grid[grid.length-1];
  body.innerHTML=`<div class="exgrid"><div>
      <div class="variants">${SURGES.map(g=>`<button data-g="${g}">${SURGE_LABEL(g)} surge</button>`).join("")}</div>
      <div class="chartwrap"><svg class="chart" viewBox="0 0 470 178" role="img" aria-label="Cost per cup against demand uncertainty"></svg><div class="tip"></div></div>
      <p class="note xo" style="margin-top:3px"></p>
      <div class="controls"><label for="uu">Demand uncertainty</label><div class="rng"><input id="uu" type="range" min="${umin}" max="${umax}" step="any"><span class="val uv"></span></div></div>
    </div><div class="out"></div></div>`;
  const svg=$(body,"svg"), out=$(body,".out"), tip=$(body,".tip");
  const SHIFT=[
    ["machine_cost","Machine cost per month",x=>money0(x)],
    ["staff_turnover","Staff turnover (share new)",x=>pct(x)],
  ];
  shiftRows.innerHTML=SHIFT.map(([k,lab,f])=>{const s=DATA.shift[k];
    return `<div class="srow" data-shift="${k}"><span>${lab}</span><span class="seg">
      <button data-l="low">Low ${f(s.low)}</button><button data-l="def">Default</button><button data-l="high">High ${f(s.high)}</button></span><span class="sval"></span></div>`;}).join("")+
    `<div class="srow" data-shift="forecast"><span>Forecast narrows (slide ${REF.s2} band)</span><span class="seg">
      <button data-u="${P.uNone}">No signal ±${pct(P.uNone)}</button><button data-u="def">Slide ${REF.s2}</button><button data-u="${P.uStrong}">Strong ±${pct(P.uStrong)}</button></span><span class="sval"></span></div>`;
  const run=()=>{ if(st.shift && st.surge===DATA.shift[st.shift.k].surge){ const s=DATA.shift[st.shift.k]; return s[st.shift.l+"Run"]; } return DATA.sweeps[st.surge]; };
  const KIND={
    mixed_cheaper_everywhere:"No crossover: mixed is cheaper than full automation at every uncertainty level shown.",
    machine_cheaper_everywhere:"No crossover: full automation is cheaper than mixed at every uncertainty level shown.",
    reverse:"Mixed is cheaper only when demand is predictable: the reverse of our hypothesis.",
  };
  const kindText=c=>c.kind==="crossover"?`Crossover at ±${pct1(c.u)}: mixed is cheaper above it.`:KIND[c.kind];
  const L=44,R=378,T=10,B=150, X=u=>L+(R-L)*(u-umin)/(umax-umin), Y=v=>B-(B-T)*v/ymax;
  function draw(){
    const rs=run(), rows=rs.rows, u=st.u;
    $$(body,"[data-g]").forEach(b=>b.classList.toggle("on",b.dataset.g===st.surge));
    $(body,"#uu").value=u; $(body,".uv").textContent=`±${pct1(u)}`;
    let s=`<rect x="${X(P.uStrong)}" y="${T}" width="${X(P.uNone)-X(P.uStrong)}" height="${B-T}" fill="${css("--amber-soft")}" opacity=".6"/>`+
      txt(X(P.uStrong)+4,B-5,`slide ${REF.s2} range`,`font-size="10" fill="${css("--amber-ink")}"`);
    s+=ticks(ymax,4).map(v=>`<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e5e7eb"/>`+txt(L-5,Y(v)+3,money(v),'font-size="10" fill="#6b7280" text-anchor="end"')).join("");
    s+=grid.filter((_,i)=>i%2===0).map(g=>txt(X(g),B+13,"±"+pct(g),'font-size="10" fill="#6b7280" text-anchor="middle"')).join("");
    s+=txt(R,B+25,"demand uncertainty (band half-width)","font-size=\"10\" fill=\"#6b7280\" text-anchor=\"end\"");
    const labs=[];
    SETUPS.forEach(k=>{
      s+=`<path d="${rows.map((r,i)=>(i?"L":"M")+X(r.u).toFixed(1)+" "+Y(r[k].cost).toFixed(1)).join("")}" fill="none" stroke="${COL[k]}" stroke-width="${k==="mixed"?2.6:2}"/>`;
      labs.push({k,y:Y(rows[rows.length-1][k].cost)+4});
    });
    nudge(labs,13,T+8,B).forEach(l=>{ s+=txt(R+6,l.y,`${LABEL[l.k]} ${money(rows[rows.length-1][l.k].cost)}`,`font-size="10.5" fill="#23272f"`);
      s+=`<line x1="${R+1}" x2="${R+5}" y1="${l.y-4}" y2="${l.y-4}" stroke="${COL[l.k]}" stroke-width="3"/>`; });
    s+=`<line x1="${X(u)}" x2="${X(u)}" y1="${T}" y2="${B}" stroke="#23272f" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    SETUPS.forEach(k=>{ s+=`<circle cx="${X(u)}" cy="${Y(Sim.atU(rows,u,r=>r[k].cost))}" r="4.5" fill="${COL[k]}" stroke="#fff" stroke-width="2"/>`; });
    if(rs.crossover.kind==="crossover"){ const cu=rs.crossover.u, cy=Y(Sim.atU(rows,cu,r=>r.mixed.cost));
      s+=`<circle cx="${X(cu)}" cy="${cy}" r="7" fill="none" stroke="#23272f" stroke-width="2"/>`+txt(X(cu),cy-11,"crossover",'font-size="10.5" font-weight="700" fill="#23272f" text-anchor="middle"'); }
    s+=`<rect class="hit" x="${L}" y="${T}" width="${R-L}" height="${B-T}" fill="transparent"/>`;
    svg.innerHTML=s;
    $(body,".xo").textContent=kindText(rs.crossover)+(st.shift&&st.surge===DATA.shift[st.shift.k].surge?" (with the shifted assumption)":"");
    const c=Object.fromEntries(SETUPS.map(k=>[k,Sim.atU(rows,u,r=>r[k].cost)]));
    const best=SETUPS.reduce((a,k)=>c[k]<c[a]?k:a);
    const parts=k=>["machine","labour","lost"].map(p=>Sim.atU(rows,u,r=>r[k][p]));
    const pmax=Math.max(...SETUPS.map(k=>c[k]));
    const PC={machine:"#8b95a7",labour:"#4b5563",lost:css("--red")};
    out.innerHTML=`<h4>COST PER CUP AT ±${pct1(u)}</h4>
      ${SETUPS.map(k=>`<div class="stat ${k===best?"best":""}"><span><span class="sw" style="background:${COL[k]}"></span>${LABEL[k]}</span><b>${money(c[k])}</b></div>`).join("")}
      <div class="stat"><span>Mixed − machine</span><b>${money(c.mixed-c.all_machine)}</b></div>
      <hr><h4>WHAT THE COST IS MADE OF</h4>
      ${SETUPS.map(k=>{const [m,l,o]=parts(k);return `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;font-size:11px"><span style="width:44px">${SHORT[k]}</span>
        <span style="display:flex;gap:2px;flex:1">${[["machine",m],["labour",l],["lost",o]].map(([p,v])=>v>0.004?`<span title="${p} ${money(v)}" style="height:10px;border-radius:2px;background:${PC[p]};width:${(100*v/pmax).toFixed(1)}%"></span>`:"").join("")}</span></div>`;}).join("")}
      <div class="dlegend" style="margin-top:2px;gap:8px"><span><span class="sw" style="background:${PC.machine}"></span>machines</span><span><span class="sw" style="background:${PC.labour}"></span>labour</span><span><span class="sw" style="background:${PC.lost}"></span>lost</span></div>
      <hr>
      <div class="stat"><span>Automated line busy</span><b>${pct(Sim.atU(rows,u,r=>r.all_machine.busy))}</b></div>
      <div class="stat"><span>Orders lost: mixed</span><b>${pct1(Sim.atU(rows,u,r=>r.mixed.lostShare))}</b></div>`;
    // shift rows
    $$(shiftRows,".srow").forEach(row=>{
      const k=row.dataset.shift;
      if(k==="forecast"){
        $$(row,"button").forEach(b=>b.classList.toggle("on",Math.abs((b.dataset.u==="def"?STATE.band.u:+b.dataset.u)-u)<1e-9));
        $(row,".sval").textContent=""; return;
      }
      const s=DATA.shift[k], enabled=st.surge===s.surge, lvl=st.shift&&st.shift.k===k?st.shift.l:"def";
      $$(row,"button").forEach(b=>{ b.disabled=!enabled; b.classList.toggle("on",enabled&&b.dataset.l===lvl); });
      const kind=lvl==="def"?DATA.sweeps[s.surge].crossover:s[lvl+"Run"].crossover;
      $(row,".sval").textContent=enabled?(kind.kind==="crossover"?`→ crossover at ±${pct1(kind.u)}`:`→ ${kind.kind.replace(/_/g," ")}`):`computed at ${s.surge} surge only`;
    });
  }
  svg.addEventListener("mousemove",e=>{
    const pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const p=pt.matrixTransform(svg.getScreenCTM().inverse());
    if(p.x<L||p.x>R){ tip.style.display="none"; return; }
    const rows=run().rows, uu=umin+(umax-umin)*(p.x-L)/(R-L), r=rows.reduce((a,b)=>Math.abs(b.u-uu)<Math.abs(a.u-uu)?b:a);
    tip.innerHTML=`<div>±${pct(r.u)} uncertainty</div>`+SETUPS.map(k=>`<div><span class="sw" style="background:${COL[k]}"></span>${LABEL[k]} <b>${money(r[k].cost)}</b></div>`).join("");
    const sc=svg.getBoundingClientRect().width/470;
    tip.style.display="block"; tip.style.left=((X(r.u)+10)*sc/SCALE)+"px"; tip.style.top=(12*sc/SCALE)+"px";
  });
  svg.addEventListener("mouseleave",()=>tip.style.display="none");
  $$(body,"[data-g]").forEach(b=>b.onclick=()=>{st.surge=b.dataset.g; draw();});
  $(body,"#uu").oninput=e=>{st.u=+e.target.value; draw();};
  $$(shiftRows,"[data-shift] button").forEach(b=>b.onclick=()=>{
    const k=b.closest(".srow").dataset.shift;
    if(k==="forecast"){ st.u=b.dataset.u==="def"?STATE.band.u:+b.dataset.u; }
    else st.shift=b.dataset.l==="def"?null:{k,l:b.dataset.l};
    draw();
  });
  onBand(b=>{ st.u=b.u; draw(); });
}

/* ================= slide 5: benefit calculator ================= */
function benefitWidget(root){
  // Comparator: Chagee's semi-automated counter (our mixed setup) at every new store, against choosing per store by
  // trigger. Openings spread evenly over the volume range you set; each curve point (DATA.volumeCurve, sim/) stands
  // for the volumes within half a step of it. Per-store cost x open days; zero where the standard is already best.
  const body=$(root,".body"), B=RAW.benefit, days=RAW.store.open_days_per_year.value, vc=DATA.volumeCurve;
  const be=DATA.breakEven.find(r=>r.lever==="cupsPerDay"&&r.a==="all_human"&&r.b==="mixed").x;
  const best=r=>Math.min(...SETUPS.map(k=>r[k].cost));
  const per=vc.map(r=>({v:r.cupsPerDay, std:(r.mixed.cost-best(r))*r.cupsPerDay*days, full:(r.all_machine.cost-best(r))*r.cupsPerDay*days}));
  const V0=vc[0].cupsPerDay, V1=vc[vc.length-1].cupsPerDay, step=vc[1].cupsPerDay-vc[0].cupsPerDay;
  const days0=RAW.provision.opening_stock_days.value, [s0,s1]=B.overseas_stores_per_year.range;
  const st={stores:B.overseas_stores_per_year.value, lo:V0, hi:V1, stock:0};
  body.innerHTML=`<svg class="chart" viewBox="0 0 640 116" role="img" aria-label="What the standard counter costs across the pipeline, by volume"></svg>
    <div class="controls" style="grid-template-columns:230px 1fr;margin-top:2px">
      <label for="bst">Overseas openings a year</label><div class="rng"><input id="bst" type="range" min="${s0}" max="${s1}" step="1" value="${st.stores}"><span class="val v1"></span></div>
      <label for="blo">Expected steady volume: lowest</label><div class="rng"><input id="blo" type="range" min="${V0}" max="${V1}" step="any" value="${st.lo}"><span class="val v2"></span></div>
      <label for="bhi">Expected steady volume: highest</label><div class="rng"><input id="bhi" type="range" min="${V0}" max="${V1}" step="any" value="${st.hi}"><span class="val v3"></span></div>
    </div>
    <div class="formula"></div>`;
  const svg=$(body,"svg"), L=62,R=630,T=16,Bm=86, pad=22, kS=v=>"S$"+Math.round(v/1000)+"k";
  const X=v=>L+pad+(R-L-2*pad)*(v-V0)/(V1-V0), bw=(R-L)/per.length*0.6;
  const frac=p=>{ const a=Math.max(st.lo,p.v-step/2,V0), b=Math.min(st.hi,p.v+step/2,V1); return st.hi>st.lo? Math.max(0,b-a)/(st.hi-st.lo) : (Math.abs(p.v-st.lo)<=step/2?1:0); };
  const sliders={bst:"stores",blo:"lo",bhi:"hi"};
  Object.entries(sliders).forEach(([id,k])=>$(body,"#"+id).oninput=e=>{ st[k]=+e.target.value;
    if(st.lo>st.hi){ if(k==="lo") st.hi=st.lo; else st.lo=st.hi; } draw(); });
  function draw(){
    Object.entries(sliders).forEach(([id,k])=>$(body,"#"+id).value=st[k]);
    $(body,".v1").textContent=int(st.stores); $(body,".v2").textContent=`${int(st.lo)} cups/day`; $(body,".v3").textContent=`${int(st.hi)} cups/day`;
    const bars=per.map(p=>{ const f=frac(p); return {...p, f, n:st.stores*f, total:st.stores*f*p.std}; });
    const ymax=Math.max(1000,...bars.map(p=>p.total))*1.3, Y=v=>Bm-(Bm-T)*v/ymax;                // scale follows the bars
    let g="";
    for(const v of ticks(ymax,3)) g+=`<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e5e7eb"/>`+txt(L-5,Y(v)+3,kS(v),'font-size="9.5" fill="#6b7280" text-anchor="end"');
    g+=`<rect x="${X(st.lo)}" y="${T-2}" width="${Math.max(2,X(st.hi)-X(st.lo))}" height="${Bm-T+2}" fill="${css("--amber")}" opacity=".08"/>`;
    bars.forEach(p=>{ const x=X(p.v)-bw/2, on=p.f>0;
      if(p.std>0.5 && on) g+=`<rect x="${x}" y="${Y(p.total)}" width="${bw}" height="${Math.max(0,Bm-Y(p.total))}" rx="3" fill="${COL.mixed}"/>`;
      else g+=`<rect x="${x}" y="${Bm-2}" width="${bw}" height="2" fill="${on?"#9aa3af":"#e5e7eb"}"/>`;
      if(on && p.n>=0.5) g+=txt(X(p.v),Bm-4-(p.std>0.5?Bm-Y(p.total):0),Math.round(p.n),'font-size="8.5" fill="#374151" text-anchor="middle"');
      g+=txt(X(p.v),Bm+12,int(p.v),`font-size="9" fill="${on?"#6b7280":"#c5cad3"}" text-anchor="middle"`); });
    g+=`<line x1="${X(be)}" x2="${X(be)}" y1="${T-2}" y2="${Bm}" stroke="#23272f" stroke-dasharray="4 3"/>`+
       txt(X(be),T-6,`all-human cheaper ← ≈${int(be)} cups/day → mixed cheaper (other inputs at our defaults)`,'font-size="9.5" font-weight="700" fill="#23272f" text-anchor="middle"');
    g+=txt(R,Bm+26,"steady cups per day · numbers on bars = openings",'font-size="9" fill="#6b7280" text-anchor="end"')+txt(L,T-4,"",'');
    svg.innerHTML=g;
    const counter=bars.reduce((a,p)=>a+p.total,0), nBelow=bars.filter(p=>p.v<be).reduce((a,p)=>a+p.n,0), stock=st.stores*st.stock;
    const fl=Math.min(...per.map(p=>p.full)), fh=Math.max(...per.map(p=>p.full));
    const k=v=>"S$"+Math.round(v/1000).toLocaleString("en-SG")+"k";
    $(body,".formula").innerHTML=`<div class="bsplit"><div><span>Recurring · counter costs</span><b>${k(counter)}</b><small>a year, for one year's openings</small></div>
      <div><span>One-time · opening stock</span><b>${k(stock)}</b><small>once, at opening</small></div></div>
      <span class="term"><b>${Math.round(nBelow)}</b> of ${int(st.stores)} openings sit where all-human is cheaper</span> → ${k(counter)} a year;
      <span class="term"><b>${money0(st.stock)}</b> per opening × ${int(st.stores)}</span> → ${k(stock)} once
      <small style="margin-top:2px">Stock term only if the pre-launch signal works as assumed (slide ${REF.s2}). A fully automated standard would cost ${money0(fl)}–${money0(fh)} more per store a year.</small>`;
  }
  onBand(b=>{ const daily=b.base/7; st.stock=Sim.provision(P,P.uNone,days0,daily).optTotal-Sim.provision(P,b.u,days0,daily).optTotal; draw(); });
}

/* ================= slide 5: risk toggles ================= */
function riskToggles(){
  $$(document,".risk .rt").forEach(b=>b.onclick=()=>{
    const r=b.closest(".risk"), on=!r.classList.contains("on");
    r.classList.toggle("on",on); b.setAttribute("aria-expanded",on);
  });
}

/* ================= perform: bucket brigade inside the store (mechanism) =================
 * Three lanes on the Week 5 engine (W5.Brigade, read-only) via sim/mechanism.js. Illustration only:
 * the cost model uses pooled speeds. As-sized ratios are read from sim/, never typed.
 */
function brigadeWidget(root){
  const Mech=window.ChageeMechanism, I=RAW.illustration, HRS=I.run_hours.value, [s0,s1]=I.surge_window_hours.value;
  const pu=DATA.util[SURGE0];
  const ratios={machine:DATA.mechanism.asSizedRatio, mixed:Sim.plan(P,"mixed").machineCap/pu.mixed.capacityPerMin};
  const share=Mech.handShare(RAW), speeds=I.worker_speeds.value, DT=0.002;
  const st={surge:SURGE0, sizing:"matched", L:null, peak:null, playing:false, raf:0};
  const LANES=[["people","People","bucket brigade","all_human"],["mixed","Robots + people","machines on fixed steps, people pool the rest","mixed"],["machine","Robots","fixed stations","all_machine"]];
  const body=$(root,".body");
  body.innerHTML=`<div class="mcontrols screenonly">
      <div class="variants sg">${SURGES.map(g=>`<button data-g="${g}">${SURGE_LABEL(g)}</button>`).join("")}</div>
      <button class="play">▶ Play</button>
      <div class="variants sz"><button data-z="matched">Machines matched to crew</button><button data-z="as_sized">As sized in cost model</button></div>
    </div>
    <svg class="mech" viewBox="0 0 700 300" role="img" aria-label="Three counters under a surge"></svg>
    <table class="mtab printonly"></table>`;
  const svg=$(body,"svg.mech"), play=$(body,".play");
  const fresh=()=>{ st.L=Mech.lanes(W5.Brigade,RAW,{surge:st.surge,sizing:st.sizing,ratios}); st.peak={people:0,mixed:0,machine:0}; };
  const advance=hours=>{ for(let t=0;t<hours-1e-12;t+=DT){ for(const k in st.L){ st.L[k].step(DT); st.peak[k]=Math.max(st.peak[k],st.L[k].queue()); } } };
  const X0=96,X1=520,X=f=>X0+(X1-X0)*f, LH=88;
  function workers(W,y,from,to,col){                         // W5 workers on [from,to] of the track
    return W.map((w,i)=>{ const x=from+(to-from)*w.x, back=w.mode==="back";
      return `<circle cx="${x.toFixed(1)}" cy="${y}" r="${7+2*i}" fill="${back?"#fff":col}" stroke="${col}" stroke-width="2"/>`; }).join("");
  }
  function marks(line,since,y,from,to){                       // mean handover point per worker pair, since the surge began
    return line.handoverPoints(since).map(x=>x==null?"":`<path d="M${(from+(to-from)*x).toFixed(1)} ${y-15}l-4 -6h8z" fill="#23272f"/>`).join("");
  }
  function busyBars(us,x,y,lab){
    return us.map((u,i)=>`<rect x="${x+i*26}" y="${y}" width="20" height="26" fill="#eef0f3"/><rect x="${x+i*26}" y="${y+26-26*u}" width="20" height="${26*u}" fill="#9aa3af"/>`+
      txt(x+i*26+10,y+37,pct(u),'font-size="9" fill="#6b7280" text-anchor="middle"')).join("")+txt(x,y-5,lab,'font-size="9.5" fill="#6b7280"');
  }
  function queue(n,y){
    const dots=[...Array(Math.min(12,n))].map((_,i)=>`<circle cx="${10+(i%6)*11}" cy="${y+40+Math.floor(i/6)*11}" r="4" fill="#23272f"/>`).join("");
    return txt(4,y+28,"Queue",'font-size="10" fill="#6b7280"')+txt(70,y+28,n,'font-size="15" font-weight="700" fill="#23272f" text-anchor="end"')+dots+(n>12?txt(4,y+76,`+${n-12}`,'font-size="10" fill="#6b7280"'):"");
  }
  function draw(){
    const L=st.L, t=L.people.t, since=Math.min(t,s0);
    let s="";
    LANES.forEach(([k,name,sub,col],j)=>{
      const y=j*LH+4, ty=y+50, c=COL[col], line=L[k];
      s+=`<rect x="0" y="${y}" width="10" height="10" rx="2" fill="${c}"/>`+txt(16,y+9,`<tspan font-weight="700" fill="#23272f">${name}</tspan> · ${sub}`,'font-size="11.5" fill="#6b7280"');
      s+=queue(Math.round(line.queue()),y);
      s+=`<line x1="${X0}" x2="${X1}" y1="${ty}" y2="${ty}" stroke="#d1d5db" stroke-width="2"/>`;
      if(k==="people"){ s+=marks(line,since,ty,X0,X1)+workers(line.W,ty,X0,X1,c);
        s+=busyBars(line.utilisation(),548,y+24,"Busy, per worker"); }
      if(k==="machine"){ const n=line.st.length, w=(X1-X0)/n, b=line.bottleneck(), qd=line.queue()>0;
        line.st.forEach((m,i)=>{ const x=X0+i*w+3;
          s+=`<rect x="${x}" y="${ty-14}" width="${w-6}" height="28" rx="4" fill="#fff" stroke="${i===b&&qd?css("--red"):c}" stroke-width="${i===b&&qd?3:1.5}"/>`;
          s+=`<rect x="${x+2}" y="${ty+8}" width="${(w-10)*(m.has?Math.min(1,m.p):0)}" height="4" fill="${c}"/>`;
          s+=txt(x+(w-6)/2,ty+3,`station ${i+1}`,'font-size="10" fill="#374151" text-anchor="middle"');
          if(i<n-1) s+=[...Array(line.buf[i])].map((_,q)=>`<circle cx="${x+w-3}" cy="${ty-20-q*7}" r="3" fill="#23272f"/>`).join(""); });
        s+=busyBars(line.utilisation(),548,y+24,"Busy, per station");
        if(qd) s+=txt(X0+b*w+w/2,ty+28,"slowest station sets the pace",`font-size="9.5" font-weight="700" fill="${css("--red")}" text-anchor="middle"`); }
      if(k==="mixed"){ const xm=X(1-share), m=line.M.st[0];
        s+=`<rect x="${X0+3}" y="${ty-14}" width="${xm-X0-6}" height="28" rx="4" fill="#fff" stroke="${COL.all_machine}" stroke-width="1.5"/>`;
        s+=`<rect x="${X0+5}" y="${ty+8}" width="${(xm-X0-10)*(m.has?Math.min(1,m.p):0)}" height="4" fill="${COL.all_machine}"/>`;
        s+=txt((X0+xm)/2,ty+3,"machine steps",'font-size="10" fill="#374151" text-anchor="middle"');
        s+=marks(line.H,since,ty,xm,X1)+workers(line.H.W,ty,xm+4,X1,c);
        s+=busyBars(line.utilisation(),548,y+24,"Busy: machine, workers"); }
      s+=txt(X1,ty+28,"→ customer",'font-size="9.5" fill="#6b7280" text-anchor="end"');
    });
    const ty=LH*3+6, TX=f=>X0+(X1-X0)*f/HRS;                  // clock with the surge window
    s+=`<rect x="${X0}" y="${ty}" width="${X1-X0}" height="6" rx="3" fill="#eef0f3"/><rect x="${TX(s0)}" y="${ty}" width="${TX(s1)-TX(s0)}" height="6" fill="${css("--amber")}"/>`;
    s+=`<circle cx="${TX(Math.min(t,HRS))}" cy="${ty+3}" r="5" fill="#23272f"/>`;
    s+=txt(4,ty+7,`Hour ${t.toFixed(1)} of ${HRS}`,'font-size="10.5" font-weight="700" fill="#23272f"')+txt(TX((s0+s1)/2),ty-3,`surge ×${RAW.surge.surge_multiplier.value[st.surge]}`,'font-size="9.5" fill="#9a6b1e" text-anchor="middle"');
    s+=txt(548,ty+7,"▼ mean handover point",'font-size="9" fill="#6b7280"');
    svg.innerHTML=s;
    $$(body,".sg button").forEach(b=>b.classList.toggle("on",b.dataset.g===st.surge));
    $$(body,".sz button").forEach(b=>b.classList.toggle("on",b.dataset.z===st.sizing));
    play.textContent=st.playing?"❚❚ Pause":t>=HRS-1e-9?"↺ Replay":"▶ Play";
  }
  function summary(){                                          // print: both sizing settings side by side, full run
    const res=Object.fromEntries(["matched","as_sized"].map(z=>{
      const L=Mech.lanes(W5.Brigade,RAW,{surge:st.surge,sizing:z,ratios}), pk={people:0,mixed:0,machine:0};
      for(let t=0;t<HRS;t+=DT) for(const k in L){ L[k].step(DT); pk[k]=Math.max(pk[k],L[k].queue()); }
      return [z,{L,pk}]; }));
    const cell=(z,k)=>{ const u=res[z].L[k].utilisation(); return `<td>${Math.round(res[z].pk[k])}</td><td>${pct(Math.min(...u))}–${pct(Math.max(...u))}</td>`; };
    $(body,".mtab").innerHTML=`<thead><tr><th rowspan="2">${SURGE_LABEL(st.surge)} surge, ${HRS}-hour run</th><th colspan="2">Machines matched to crew</th><th colspan="2">As sized in cost model</th></tr>
      <tr><th>Peak queue</th><th>Busy (range)</th><th>Peak queue</th><th>Busy (range)</th></tr></thead><tbody>`+
      LANES.map(([k,name])=>`<tr><th>${name}</th>${cell("matched",k)}${cell("as_sized",k)}</tr>`).join("")+`</tbody>`;
  }
  function loop(prev){ st.raf=requestAnimationFrame(now=>{
      const hrs=Math.min(0.02,(now-prev)/1000*HRS/16);          // a run plays in about 16 seconds
      advance(hrs); draw();
      if(st.L.people.t>=HRS){ st.playing=false; draw(); return; }
      if(st.playing) loop(now); }); }
  const restartAt=h=>{ cancelAnimationFrame(st.raf); st.playing=false; fresh(); advance(h); draw(); summary(); };
  play.onclick=()=>{ if(st.playing){ st.playing=false; cancelAnimationFrame(st.raf); draw(); return; }
    if(st.L.people.t>=HRS-1e-9 || st.L.people.t>=s1-1e-9 && !st.started){ fresh(); }
    st.started=true; st.playing=true; draw(); loop(performance.now()); };
  $$(body,".sg button").forEach(b=>b.onclick=()=>{ st.surge=b.dataset.g; st.started=false; restartAt(s1); });
  $$(body,".sz button").forEach(b=>b.onclick=()=>{ st.sizing=b.dataset.z; st.started=false; restartAt(s1); });
  restartAt(s1);                                               // static frame: the end of the surge window
}

/* ================= perform: cost per cup against volume, with break-evens ================= */
function volcostWidget(root){
  const rows=DATA.volumeCurve, x0=rows[0].cupsPerDay, x1=rows[rows.length-1].cupsPerDay, cpd0=P.cupsYear/P.days;
  const be=(a,b)=>DATA.breakEven.find(r=>r.lever==="cupsPerDay"&&r.a===a&&r.b===b);
  const b1=be("all_human","mixed"), b2=be("mixed","all_machine");
  const at=(x,k)=>{ for(let i=1;i<rows.length;i++) if(x<=rows[i].cupsPerDay){ const a=rows[i-1],b=rows[i],t=(x-a.cupsPerDay)/(b.cupsPerDay-a.cupsPerDay);
      return {cost:a[k].cost+t*(b[k].cost-a[k].cost), busy:a[k].busy+t*(b[k].busy-a[k].busy)}; } return rows[rows.length-1][k]; };
  const body=$(root,".body");
  body.innerHTML=`<div class="dlegend" style="margin:0 0 2px">${SETUPS.map(k=>`<span><span class="sw" style="background:${COL[k]}"></span>${LABEL[k]}</span>`).join("")}</div>
    <svg class="chart" viewBox="0 0 680 206" role="img" aria-label="Cost per cup against cups per day"></svg>
    <div class="controls screenonly"><label for="cpd">Steady cups per day</label><div class="rng"><input id="cpd" type="range" min="${x0}" max="${x1}" step="any" value="${cpd0}"><span class="val cv"></span></div></div>
    <div class="vout"></div>`;
  const svg=$(body,"svg"), inp=$(body,"#cpd"), out=$(body,".vout");
  const ys=rows.flatMap(r=>SETUPS.map(k=>r[k].cost)), lo=Math.floor(Math.min(...ys)*10)/10, hi=Math.max(...ys)*1.04;
  const L=50,R=590,T=12,B=180, X=v=>L+(R-L)*(v-x0)/(x1-x0), Y=v=>B-(B-T)*(v-lo)/(hi-lo);
  const strip=root.closest(".slide").querySelector('.dstrip[data-lever="cupsPerDay"]');
  function draw(x){
    let s="";
    for(let v=lo;v<=hi+1e-9;v+=niceStep(hi-lo,4)) s+=`<line x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e5e7eb"/>`+txt(L-5,Y(v)+3,money(v),'font-size="9.5" fill="#6b7280" text-anchor="end"');
    for(const v of ticks(x1,4).filter(v=>v>=x0)) s+=txt(X(v),B+13,int(v),'font-size="9.5" fill="#6b7280" text-anchor="middle"');
    s+=txt(R,B+25,"steady cups per day",'font-size="9.5" fill="#6b7280" text-anchor="end"');
    s+=`<line x1="${X(cpd0)}" x2="${X(cpd0)}" y1="${T}" y2="${B}" stroke="#9aa3af" stroke-dasharray="2 3"/>`+txt(X(cpd0)-3,T+8,"default forecast",'font-size="9" fill="#6b7280" text-anchor="end"');
    if(b1.kind==="value") s+=`<line x1="${X(b1.x)}" x2="${X(b1.x)}" y1="${T}" y2="${B}" stroke="#23272f" stroke-width="1.5" stroke-dasharray="5 3"/>`+
      txt(X(b1.x)+3,T+8,`break-even ≈${int(b1.x)}`,'font-size="9.5" font-weight="700" fill="#23272f"')+txt(X(b1.x)+3,T+19,"mixed overtakes all-human",'font-size="9" fill="#374151"');
    const labs=nudge(SETUPS.map(k=>({k,y:Y(rows[rows.length-1][k].cost)})),12,T,B);
    SETUPS.forEach(k=>{ s+=`<path d="${rows.map((r,i)=>(i?"L":"M")+X(r.cupsPerDay).toFixed(1)+" "+Y(r[k].cost).toFixed(1)).join("")}" fill="none" stroke="${COL[k]}" stroke-width="2"/>`;
      s+=`<circle cx="${X(x)}" cy="${Y(at(x,k).cost)}" r="4" fill="${COL[k]}" stroke="#fff" stroke-width="2"/>`; });
    labs.forEach(l=>s+=txt(R+6,l.y+3,LABEL[l.k],'font-size="10" font-weight="700" fill="#374151"'));
    s+=`<line x1="${X(x)}" x2="${X(x)}" y1="${T}" y2="${B}" stroke="#23272f" stroke-opacity=".35"/>`;
    svg.innerHTML=s;
    const c=Object.fromEntries(SETUPS.map(k=>[k,at(x,k)])), best=SETUPS.reduce((a,k)=>c[k].cost<c[a].cost?k:a);
    $(body,".cv").textContent=`${int(x)} cups/day`;
    out.innerHTML=`<div class="vrow">${SETUPS.map(k=>`<div class="vc${k===best?" best":""}"><span>${LABEL[k]}</span><b>${money(c[k].cost)}</b><small>${k===best?"cheapest":"+"+money(c[k].cost-c[best].cost)}</small></div>`).join("")}</div>
      <p class="note">At ${int(x)} cups/day. All-robot machines are busy ${pct(c.all_machine.busy)} of open hours.</p>`;
    const order=[...SETUPS].sort((a,b)=>c[a].cost-c[b].cost), m=c[order[1]].cost-c[order[0]].cost, TOL=RAW.validation.breakeven.value.tol_cost_sgd_per_cup;
    gateSet(root,{action: m<TOL?`At ${int(x)} cups a day ${LABEL[order[0]]} and ${LABEL[order[1]]} are within ${money(TOL)} a cup: a tie on cost. Choose using all current inputs together.`
        :`At ${int(x)} cups a day ${LABEL[order[0]].toLowerCase()} is cheaper by ${money(m)} a cup${m<3*TOL?": close, but above the "+money(TOL)+" tie line":""}. Choose using all current inputs together.`,
      costs:`all-human ${money(c.all_human.cost)} · mixed ${money(c.mixed.cost)} · all-robot ${money(c.all_machine.cost)}`, busy:`${pct(c.all_machine.busy)} of open hours`});
    if(strip && b1.kind==="value") strip.querySelector(".dnow").textContent=`Now ${int(x)} cups/day: ${x>b1.x?"above":"below"} the volume trigger, so on volume alone ${x>b1.x?"mixed":"all-human"} is cheaper.`;
  }
  inp.oninput=e=>draw(+e.target.value);
  svg.onpointermove=e=>{ const r=svg.getBoundingClientRect(), vx=(e.clientX-r.left)/r.width*680; if(vx<L||vx>R) return;
    const x=x0+(vx-L)/(R-L)*(x1-x0); inp.value=x; draw(x); };
  draw(cpd0);
}

/* ================= perform: store replica (sim/store.js), in seconds ================= */
const STORE_BUS={surge:SURGE0, fns:[], live:null};
const storeSurge=g=>{ STORE_BUS.surge=g; STORE_BUS.fns.forEach(f=>f(g)); };
const STATION_NAME={ticket:"Order & ticket",cup_ice:"Cup & ice",tea_milk:"Tea & milk",topping_finish:"Toppings",shake_seal:"Shake & seal",handover:"Hand-over"};
const STORE_SETUPS=[["mixed","Today's counter"],["all_human","All-human"],["all_machine","All-robot"]];
const mmss=s=>`${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;

function storefrontWidget(root){
  // Two counters stacked for comparison, each chosen from a dropdown; both see the same customers (same seed).
  const Store=window.ChageeStore, body=$(root,".body"), WB=RAW.illustration.walk_back_speed.value;
  const [sp0,sp1]=RAW.people.worker_speed_spread.range, reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  const OPTS=[["human_slow","People, slowest first (Week 5)","all_human","slow_first"],
              ["human_fast","People, fastest first","all_human","fast_first"],
              ["mixed","Today's counter: robots + people","mixed","slow_first"],
              ["all_machine","All-robot","all_machine","slow_first"]];
  const opt=k=>OPTS.find(o=>o[0]===k);
  const st={playing:!reduce, speed:10, spread:P.spread, lanes:[{key:"human_slow"},{key:"human_fast"}]};
  const Pq=()=>({...P, spread:st.spread});
  body.innerHTML=`<div class="mcontrols screenonly">
      <div class="variants sg">${SURGES.map(g=>`<button data-g="${g}">${SURGE_LABEL(g)}</button>`).join("")}</div>
      <button class="play">▶ Play</button>
      <div class="variants sp"><button data-v="10">×10</button><button data-v="60">×60</button></div>
      <label class="slw">Slowest worker <input type="range" min="${1-sp1}" max="${1-sp0}" step="0.05" value="${1-st.spread}"><span class="val swv"></span></label>
    </div>
    ${st.lanes.map((l,j)=>`<div class="lane" data-j="${j}">
      <div class="lanehead"><span class="lpos">${j?"Bottom":"Top"}</span>
        <select aria-label="${j?"Bottom":"Top"} counter">${OPTS.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join("")}</select>
        <span class="lname printonly"></span><span class="sstats"></span></div>
      <svg class="storesvg" viewBox="0 0 1180 150" role="img" aria-label="Store replica"></svg></div>`).join("")}
    <p class="slegend">Number = worker speed · cup above = drink in hand · faded = walking back · red ring = held back by the colleague ahead · ▲ = handover. Robots stay put; cups move. Both counters see the same customers.</p>`;
  const play=$(body,".play"), slw=$(body,".slw input");
  const n=P.stations.length, XR=1060, XL=140, X=x=>XR-x*(XR-XL)/n, BW=(XR-XL)/n-10;
  const wood="#d9c3a0", woodDark="#b89870", ink="#23272f", mute="#6b7280", amber=css("--amber"), red=css("--red");
  st.lanes.forEach((l,j)=>{ l.el=$(body,`.lane[data-j="${j}"]`); l.svg=$(l.el,"svg"); l.stats=$(l.el,".sstats"); l.sel=$(l.el,"select"); l.sel.value=l.key;
    l.sel.onchange=()=>{ l.key=l.sel.value; fresh(l); advance(l,DATA.storePrintMinute*60); draw(l); }; });
  function fresh(l){ const o=opt(l.key); l.S=Store.create(Sim,Pq(),o[2],{surge:STORE_BUS.surge,seed:P.seed,walkBack:WB,order:o[3]}); l.pos=new WeakMap(); }
  const advance=(l,sec,dt=0.5)=>{ const S=l.S, end=S.t+sec; while(S.t<end-1e-9) S.step(Math.min(dt,end-S.t)); };
  const minute=l=>(l.S.t-l.S.measureFrom)/60;
  const cupIcon=(x,y,c)=>`<path d="M${(x-5).toFixed(1)} ${(y-7).toFixed(1)}h10l-1.6 13h-6.8z" fill="${c}" stroke="#fff" stroke-width="1"/>`;
  function draw(l){
    const S=l.S, m=minute(l), cupAt=(cup,tx,ty)=>{ const p=l.pos.get(cup)||{x:tx,y:ty}; p.x+=(tx-p.x)*0.4; p.y+=(ty-p.y)*0.4; l.pos.set(cup,p); return cupIcon(p.x,p.y,"#8b6b43"); };
    let s=`<rect x="0" y="0" width="1180" height="150" rx="10" fill="#faf6ef"/><rect x="20" y="20" width="1140" height="52" rx="8" fill="#efe4d2"/>`;
    const sign=(x,t)=>`<rect x="${x-44}" y="3" width="88" height="18" rx="9" fill="#fff" stroke="#d6cbb8"/>`+txt(x,16,t,`font-size="10.5" font-weight="700" fill="${ink}" text-anchor="middle" letter-spacing=".08em"`);
    s+=sign(X(n)-10,"PICK UP")+sign(X(0)+40,"ORDER");
    S.stations.forEach((o,k)=>{ const cx=X(k+0.5), mach=o.machine, col=mach?COL.all_machine:woodDark;
      s+=`<rect x="${cx-BW/2}" y="26" width="${BW}" height="40" rx="6" fill="#fff" stroke="${col}" stroke-width="${mach?2:1.4}"/>`;
      if(o.id==="tea_milk") s+=[0,1,2].map(j=>`<rect x="${cx-20+j*16}" y="28" width="6" height="9" rx="2" fill="${woodDark}"/>`).join("");
      s+=txt(cx,o.id==="tea_milk"?50:45,STATION_NAME[o.id]||o.id,`font-size="11" font-weight="700" fill="${ink}" text-anchor="middle"`);
      s+=txt(cx,o.id==="tea_milk"?61:58,mach?`robot${o.units>1?" ×"+o.units:""} · ${Math.round(o.sec)} s`:`by hand · ${Math.round(o.sec)} s`,`font-size="9" fill="${mach?COL.all_machine:mute}" text-anchor="middle"`);
      if(mach){
        o.busy.forEach((b,j)=>{ s+=`<rect x="${cx-BW/2+6}" y="${62-j*4}" width="${(BW-12)*(1-Math.max(0,b.left)/o.sec)}" height="3" fill="${COL.all_machine}"/>`; s+=cupAt(b.cup,cx+18-j*10,42); });
        o.queue.slice(0,4).forEach((c,j)=>s+=cupAt(c,cx+BW/2-10-j*11,84));
        o.ready.slice(0,4).forEach((c,j)=>s+=cupAt(c,cx-BW/2+10+j*11,84));
        if(o.queue.length>4) s+=txt(cx+BW/2-60,88,`+${o.queue.length-4}`,`font-size="9.5" fill="${mute}"`);
      }
    });
    if(!S.stations[0].machine){ S.stations[0].queue.slice(0,6).forEach((c,j)=>s+=cupAt(c,X(0)+14+j*11,84)); }
    S.handovers.filter(h=>S.t-h.t<120).forEach(h=>s+=`<path d="M${X(h.x).toFixed(1)} 108l-4 6h8z" fill="${amber}" opacity="${(1-(S.t-h.t)/120).toFixed(2)}"/>`);
    const slow=S.workers.length?Math.min(...S.workers.map(w=>w.v)):null;
    S.workers.forEach(w=>{ const near=S.workers.filter(o=>o.i<w.i && Math.abs(o.x-w.x)<0.15).length, x=X(w.x)+near*26, faded=w.mode!=="work";
      s+=`<g opacity="${faded?0.45:1}">`;
      if(w.cup) s+=cupAt(w.cup,x,84).replace('fill="#8b6b43"',`fill="${amber}"`);
      s+=`<circle cx="${x.toFixed(1)}" cy="98" r="10.5" fill="${COL.all_human}"/>`;
      if(w.blocked) s+=`<circle cx="${x.toFixed(1)}" cy="98" r="14.5" fill="none" stroke="${red}" stroke-width="3"/>`;
      s+=txt(x,102,`${w.v.toFixed(1)}`,`font-size="9.5" font-weight="700" fill="#fff" text-anchor="middle"`)+`</g>`;
      if(S.workers.length>1 && w.v===slow) s+=txt(x,121,"slowest",`font-size="8.5" fill="${mute}" text-anchor="middle"`);
    });
    if(!S.workers.length) s+=txt(X(n)+40,101,"no staff at the line: an attendant restocks and handles exceptions",`font-size="10" fill="${mute}"`);
    s+=`<rect x="120" y="124" width="960" height="14" rx="4" fill="${wood}"/>`+txt(600,135,"TEA BAR",`font-size="9.5" font-weight="700" fill="#7a5c36" text-anchor="middle" letter-spacing=".25em"`);
    const wait=S.stations[0].queue.length;
    s+=txt(1160,146,`${wait} waiting to order`,`font-size="9.5" fill="${mute}" text-anchor="end"`)+cupIcon(30,141,"#8b6b43")+txt(42,146,`${S.done.length} handed over`,`font-size="10" font-weight="700" fill="${ink}"`);
    l.svg.innerHTML=s;
    const T=Math.max(1,S.t-S.measureFrom);
    l.stats.innerHTML=`<span><b>Minute ${Math.min(60,Math.max(0,m)).toFixed(0)}</b></span><span>Handovers <b>${S.handovers.length}</b></span>`+
      (S.workers.length?S.workers.map(w=>`<span>${w.v.toFixed(1)}× working <b>${pct(w.busyTime/T)}</b> · held back <b>${pct(w.blockedTime/T)}</b></span>`).join("")
                       :`<span>Robots busy <b>${S.stations.map(o=>pct(o.busyTime/T)).join(" / ")}</b></span>`);
    $(l.el,".lname").textContent=opt(l.key)[1];
  }
  function drawAll(){ st.lanes.forEach(draw);
    $$(body,".sg button").forEach(b=>b.classList.toggle("on",b.dataset.g===STORE_BUS.surge));
    $$(body,".sp button").forEach(b=>b.classList.toggle("on",+b.dataset.v===st.speed));
    $(body,".swv").textContent=`${(1-st.spread).toFixed(2)}× (fastest ${(1+st.spread).toFixed(2)}×)`;
    play.textContent=st.playing?"❚❚ Pause":"▶ Play"; }
  let last=null;
  function frame(ts){                                               // Week 5: a continuous loop while the slide is on screen
    const here=typeof slides!=="undefined" && slides[cur]===root.closest(".slide");
    if(last!=null && st.playing && here){
      const sec=Math.min(0.1,(ts-last)/1000)*st.speed;
      st.lanes.forEach(l=>{ advance(l,sec,0.1); if(minute(l)>=60) fresh(l); });
      drawAll();
    }
    last=ts; requestAnimationFrame(frame);
  }
  const reset=()=>{ st.lanes.forEach(l=>{ fresh(l); advance(l,DATA.storePrintMinute*60); }); drawAll(); };
  function liveServe(){                                            // the time-to-serve panel follows the slowest-worker slider
    if(Math.abs(st.spread-P.spread)<1e-9){ STORE_BUS.live=null; return; }
    const g=STORE_BUS.surge, N=RAW.validation.crossover_stability.value.seeds, Q=Pq(), out={};
    for(const [k] of STORE_SETUPS) out[k]={...Sim.serveTimes(Q,k,{surge:g,seeds:N}), staff:DATA.store[g][k].staff};
    STORE_BUS.live={surge:g, spread:st.spread, data:out};
  }
  play.onclick=()=>{ st.playing=!st.playing; drawAll(); };
  $$(body,".sg button").forEach(b=>b.onclick=()=>{ STORE_BUS.surge=b.dataset.g; liveServe(); storeSurge(b.dataset.g); });
  $$(body,".sp button").forEach(b=>b.onclick=()=>{ st.speed=+b.dataset.v; drawAll(); });
  slw.oninput=e=>{ st.spread=1-(+e.target.value); reset(); };
  slw.onchange=()=>{ liveServe(); storeSurge(STORE_BUS.surge); };
  STORE_BUS.fns.push(reset);
  reset();                                                          // first frame (and the printed one): minute 20
  requestAnimationFrame(frame);
}

function serveWidget(root){
  const body=$(root,".body"), lim=RAW.service.target_wait_minutes.value*60;
  body.innerHTML=`<svg class="chart" viewBox="0 0 640 176" role="img" aria-label="Time to serve by counter"></svg>`;
  const svg=$(body,"svg");
  function draw(g){
    const live=STORE_BUS.live&&STORE_BUS.live.surge===g?STORE_BUS.live:null, D=live?live.data:DATA.store[g];
    const max=Math.max(lim,...STORE_SETUPS.map(([k])=>D[k].p90))*1.08;
    const L=196,R=470,X=v=>L+(R-L)*v/max;
    let s=txt(L,12,"median ▮  ·  90th percentile ┤"+(live?`  ·  slowest worker ${(1-live.spread).toFixed(2)}×`:""),`font-size="9.5" fill="${live?"#9a6b1e":"#6b7280"}"`)+txt(R+12,12,"handed over / h",`font-size="9.5" fill="#6b7280"`)+txt(R+104,12,"lost",`font-size="9.5" fill="#6b7280"`);
    for(let v=0;v<=max;v+=60) s+=`<line x1="${X(v)}" x2="${X(v)}" y1="18" y2="150" stroke="#e5e7eb"/>`+txt(X(v),163,`${v/60} min`,`font-size="9.5" fill="#6b7280" text-anchor="middle"`);
    s+=`<line x1="${X(lim)}" x2="${X(lim)}" y1="18" y2="150" stroke="${css("--red")}" stroke-dasharray="4 3"/>`+txt(X(lim)-3,174,"orders lost beyond this wait",`font-size="9" fill="${css("--red")}" text-anchor="end"`);
    const rows=[...STORE_SETUPS.map(([k,n])=>({k,n:k==="mixed"?`${n} (our reading)`:n,sub:k==="mixed"?"our reading: machines on fixed steps":`${D[k].staff} staff at the peak`})),
                {k:null,n:"Observed in a store",sub:"not measured yet"}];
    rows.forEach((r,j)=>{ const y=24+j*32;
      s+=txt(0,y+12,r.n,`font-size="11.5" font-weight="700" fill="#23272f"`)+txt(0,y+25,r.sub,`font-size="9.5" fill="#6b7280"`);
      if(!r.k){ s+=`<rect x="${L}" y="${y+4}" width="${R-L}" height="16" rx="3" fill="none" stroke="#c5cad3" stroke-dasharray="4 3"/>`+txt((L+R)/2,y+16,"time 30 orders at a Chagee store to fill this row",`font-size="9.5" fill="#6b7280" text-anchor="middle"`); return; }
      const d=D[r.k], c=COL[r.k];
      s+=`<rect x="${L}" y="${y+4}" width="${X(d.median)-L}" height="16" rx="3" fill="${c}"/>`;
      s+=`<line x1="${X(d.median)}" x2="${X(d.p90)}" y1="${y+12}" y2="${y+12}" stroke="${c}" stroke-width="2"/><line x1="${X(d.p90)}" x2="${X(d.p90)}" y1="${y+6}" y2="${y+18}" stroke="${c}" stroke-width="2"/>`;
      s+=txt(L+4,y+16,mmss(d.median),`font-size="10" font-weight="700" fill="#fff"`)+txt(X(d.p90)+4,y+16,mmss(d.p90),`font-size="9.5" fill="#374151"`);
      s+=txt(R+40,y+16,int(d.servedPerHour),`font-size="11" font-weight="700" fill="#23272f" text-anchor="end"`)+txt(R+130,y+16,pct(d.lostShare),`font-size="11" font-weight="700" fill="${d.lostShare>0.05?css("--red"):"#23272f"}" text-anchor="end"`);
    });
    svg.innerHTML=s;
    const sum=root.closest(".slide").querySelector(".ssum");
    if(sum) sum.innerHTML=STORE_SETUPS.map(([k,nm])=>`<span><i style="background:${COL[k]}"></i>${nm} <b>${mmss(D[k].median)}</b> · ${mmss(D[k].p90)} · ${pct(D[k].lostShare)} lost</span>`).join("")+
      `<span class="obs">Observed: not measured yet</span>`;
  }
  STORE_BUS.fns.push(draw); draw(STORE_BUS.surge);
}

/* ================= decide: the playbook's "Your market" panel =================
 * Verdict and costs: sim runPoint with the full simulation.monte_carlo_draws, so at our defaults they match the
 * cost slide. Nearest flip: bisection per input with simulation.live_draws (a live estimate), other inputs held.
 */
function playbookWidget(root){
  const body=$(root,".body"), N=RAW.simulation.live_draws.value, TOL=RAW.validation.breakeven.value.tol_cost_sgd_per_cup;
  const IN=[
    {k:"wage", label:"Wage per hour", r:P.ranges.wage, v:P.wage, f:v=>money(v)},
    {k:"machineMonth", label:"Machine cost, per unit per month", r:P.ranges.machineMonth, v:P.machineMonth, f:v=>money0(v)},
    {k:"cupsPerDay", label:"Expected steady cups per day", r:P.ranges.cupsPerDayTrigger, v:P.cupsYear/P.days, f:v=>int(v)},
    {k:"u", label:"Forecast band (±)", r:P.ranges.u, v:Sim.defaultU(P), f:v=>"±"+(+(v*100).toFixed(1))+"%"},
    {k:"milk", label:"Milk waste cost per litre", r:P.ranges.milkWaste, v:P.wasteCost, f:v=>money(v)},
  ];
  const val=Object.fromEntries(IN.map(i=>[i.k,i.v])), base=Object.fromEntries(IN.map(i=>[i.k,i.v]));
  let orig=null;                                                     // the original plan: our default inputs
  body.innerHTML=`<div class="ymin">${IN.map(i=>`<label for="ym-${i.k}">${i.label}</label><div class="rng"><input id="ym-${i.k}" type="range" min="${i.r[0]}" max="${i.r[1]}" step="any" value="${i.v}"><span class="val" data-v="${i.k}"></span></div>`).join("")}</div>

    <div class="ymout"></div>`;
  const out=$(body,".ymout");
  const params=(o=val)=>({...P, wage:o.wage, machineMonth:o.machineMonth, cupsYear:o.cupsPerDay*P.days, wasteCost:o.milk});
  const costs=(o=val,n=N)=>{ const r=Sim.runPoint(params(o),o.u,P.surgeDefault,P.seed,n); return Object.fromEntries(SETUPS.map(s=>[s,r[s].costPerCup])); };
  function nearestFlip(win,run){                                     // per input: where the runner-up overtakes, inputs held
    let best=null;
    for(const i of IN.filter(i=>i.k!=="milk")){
      const g=x=>{ const c=costs({...val,[i.k]:x}); return c[win]-c[run]; };          // <0: winner still cheaper (live draws)
      for(const end of i.r){
        if(Math.abs(end-val[i.k])<1e-9 || g(end)<=0) continue;
        let lo=val[i.k], hi=end;
        for(let s=0;s<9;s++){ const m=(lo+hi)/2; if(g(m)>0) hi=m; else lo=m; }
        const x=(lo+hi)/2, d=Math.abs(x-val[i.k])/Math.abs(val[i.k]||1);
        if(!best || d<best.d) best={i, x, d, dir:end>val[i.k]?"rises to":"falls to"};
      }
    }
    return best;
  }
  function compute(){
    out.classList.add("busy"); gateSet(root,{},"computing");
    setTimeout(()=>{ try{
      if(!orig){ const c0=costs(base,P.draws), o0=[...SETUPS].sort((a,b)=>c0[a]-c0[b]); orig={win:o0[0],run:o0[1],m:c0[o0[1]]-c0[o0[0]]}; }
      const c=costs(val,P.draws), order=[...SETUPS].sort((a,b)=>c[a]-c[b]), [win,run]=order, margin=c[run]-c[win], tie=margin<TOL;
      const flip=tie?null:nearestFlip(win,run);
      const under=P.stockoutCost/P.milkPerCup, cr=under/(under+val.milk);
      out.innerHTML=`<div class="ymv"><span>Counter</span><b>${tie?"Too close to call":LABEL[win]}</b>
          <small>${tie?`${LABEL[win]} and ${LABEL[run]} within ${money(TOL)} a cup`:`cheaper than ${LABEL[run]} by ${money(margin)} a cup`}</small></div>
        <div class="ymc">${SETUPS.map(s=>`<span class="${s===win?"w":""}"><i style="background:${COL[s]}"></i>${LABEL[s]} <b>${money(c[s])}</b></span>`).join("")}</div>
        <p class="ymf">${flip?`<b>Nearest threshold</b> (live estimate): ${LABEL[run]} would be cheaper if ${flip.i.label.toLowerCase()} ${flip.dir} about <b>${flip.i.f(flip.x)}</b> (${flip.d<0.005?"<1":Math.round(flip.d*100)}% away).`
          :tie?"<b>Tie:</b> decide on service, staffing risk or brand.":"<b>Nearest threshold:</b> none within the input ranges for a single change."}</p>
        <p class="ymf"><b>Stock:</b> ${val.milk<under?`order above the base forecast (best order at the ${pct(cr)} point of demand); flips only if waste costs over ${money(under)} a litre.`
          :`order at or below the base forecast: waste costs more than ${money(under)} a litre.`}</p>`;
      const same=IN.every(i=>Math.abs(val[i.k]-base[i.k])<1e-9);
      const planTxt=`${LABEL[orig.win]} by ${money(orig.m)} a cup`, updTxt=tie?`a tie (${LABEL[win]} and ${LABEL[run]})`:`${LABEL[win]} by ${money(margin)} a cup`;
      out.insertAdjacentHTML("afterbegin",`<p class="ymcmp"><b>Original plan:</b> ${planTxt}. <b>Updated scenario:</b> ${same?"same inputs as the plan":updTxt+(orig.win===win?" (same choice)":" (different choice: review it with the full comparison)")}.</p>`);
      out.classList.remove("busy");
      gateSet(root,{action:`Create an updated scenario using observed inputs and compare it with the original plan (${planTxt}).`+(same?"":` Updated: ${updTxt}.`)});
    }catch(err){ out.classList.remove("busy"); out.innerHTML=`<p class="note err">Could not compute this scenario. The previous result no longer applies.</p>`; gateSet(root,{},"error"); }
    },20);
  }
  IN.forEach(i=>{ const el=$(body,`#ym-${i.k}`), lab=$(body,`[data-v="${i.k}"]`);
    lab.textContent=i.f(val[i.k]);
    el.oninput=e=>{ val[i.k]=+e.target.value; lab.textContent=i.f(val[i.k]); out.classList.add("busy"); gateSet(root,{},"stale"); };
    el.onchange=compute; });
  compute();
}

/* ================= decision strips: collapsed by default, open on demand (always open in print) ================= */
document.addEventListener("click",e=>{
  const b=e.target.closest&&e.target.closest(".dtoggle"); if(!b) return;
  const d=b.closest(".dstrip"), open=d.classList.toggle("collapsed")===false;
  b.setAttribute("aria-expanded",String(open)); b.textContent=open?"Hide ▾":"What to do ▸";
});

/* ================= gate cards: details open on request; widgets fill data-g fields live ================= */
document.addEventListener("click",e=>{
  const b=e.target.closest&&e.target.closest(".gc-toggle"); if(!b) return;
  const c=b.closest(".gate-card"), open=c.classList.toggle("collapsed")===false;
  b.setAttribute("aria-expanded",String(open)); b.textContent=open?"Hide ▾":"Who does what · how it is calculated ▸";
});
function gateSet(root,vals,state=""){                               // vals: {action, <evidence key>: text}; state: "", "stale", "computing", "error"
  const c=root.closest(".slide").querySelector(".gate-card"); if(!c) return;
  for(const [k,v] of Object.entries(vals)){ const el=c.querySelector(`[data-g="${k}"]`); if(el) el.textContent=v; }
  c.classList.toggle("stale",!!state);
  const st=c.querySelector(".gstate"); if(st) st.textContent=state==="stale"?"· inputs changed, recomputing on release":state==="computing"?"· computing…":state==="error"?"· could not compute":"";
}
