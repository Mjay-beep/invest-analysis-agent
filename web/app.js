/* 투자 분석 Agent — 워크플로우 재생형 뷰어 + 경량 마크다운 렌더러 (무의존) */

// ---------- 경량 마크다운 렌더러 (헤딩·표·리스트·인용·코드·각주) ----------
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function inline(s){
  s=s.replace(/`([^`]+)`/g,(_,c)=>`<code>${c}</code>`);
  s=s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  s=s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
  s=s.replace(/(^|[^*])\*([^*\n]+)\*/g,"$1<em>$2</em>");
  s=s.replace(/\[(\d{1,3})\]/g,'<sup class="fnref" data-n="$1">[$1]</sup>');
  return s;
}
function md2html(src){
  if(!src) return "";
  const lines=esc(src).replace(/\r\n/g,"\n").split("\n");
  let out=[],i=0,stack=[];
  const closeList=(st)=>{while(st.length){out.push(st.pop()==="ul"?"</ul>":"</ol>");}};
  while(i<lines.length){
    let ln=lines[i];
    if(/^```/.test(ln.trim())){closeList(stack);i++;let buf=[];
      while(i<lines.length&&!/^```/.test(lines[i].trim())){buf.push(lines[i]);i++;}
      i++;out.push(`<pre><code>${buf.join("\n")}</code></pre>`);continue;}
    if(/^\s*\|.*\|\s*$/.test(ln)&&i+1<lines.length&&/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1])&&/-/.test(lines[i+1])){
      closeList(stack);
      const row=(l)=>l.trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim());
      const head=row(ln);i+=2;let body=[];
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){body.push(row(lines[i]));i++;}
      let t="<table><thead><tr>"+head.map(h=>`<th>${inline(h)}</th>`).join("")+"</tr></thead><tbody>";
      for(const r of body)t+="<tr>"+r.map(c=>`<td>${inline(c)}</td>`).join("")+"</tr>";
      out.push(t+"</tbody></table>");continue;}
    let h=ln.match(/^(#{1,6})\s+(.*)$/);
    if(h){closeList(stack);out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);i++;continue;}
    if(/^\s*---+\s*$/.test(ln)){closeList(stack);out.push("<hr>");i++;continue;}
    if(/^\s*>\s?/.test(ln)){closeList(stack);let buf=[];
      while(i<lines.length&&/^\s*>\s?/.test(lines[i])){buf.push(lines[i].replace(/^\s*>\s?/,""));i++;}
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);continue;}
    let li=ln.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if(li){const type=/\d/.test(li[2])?"ol":"ul";
      if(stack[stack.length-1]!==type){closeList(stack);out.push(type==="ul"?"<ul>":"<ol>");stack.push(type);}
      out.push(`<li>${inline(li[3])}</li>`);i++;continue;}
    if(!ln.trim()){closeList(stack);i++;continue;}
    closeList(stack);out.push(`<p>${inline(ln)}</p>`);i++;
  }
  closeList(stack);return out.join("\n");
}

// ---------- 앱 ----------
const $=(s,r=document)=>r.querySelector(s);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const state={roster:[],rosterMap:{},runs:[],run:null,playing:false};
const ACCENT=k=>`var(--${k})`;

// 노드별 "진행 중" 문구 (재생 애니메이션용)
const PROG={
  orchestrator:"쿼리 분류·시장 판별·에이전트 디스패치",
  "damodaran-analyst":"Narrative → Reverse DCF → DCF 계산 중",
  "valuation-analyst":"멀티플·히스토리컬 밴드·피어 비교 중",
  "smart-money-tracker":"13F·국민연금·내부자·의회 추적 중",
  "sns-sentiment":"커뮤니티 여론 수집·온도 측정 중",
  "news-analyst":"뉴스·공시 이벤트 타임라인 구성 중",
  "macro-geopolitics":"금리·환율·지정학 영향 분석 중",
  "policy-money-tracker":"정책 자금·계약·법안 추적 중",
  "technical-analyst":"이평·RSI·MACD·지지·저항 계산 중",
  "red-team":"반대 논거·반증 검색 중",
  "report-writer":"종합·상충 감지·각주 작성 중",
};
// 종목 검색 별칭
const ALIAS={AAPL:["apple","애플","아이폰","iphone"],"삼성전자":["삼성","samsung","005930"]};

async function boot(){
  const idx=await (await fetch("data/index.json")).json();
  state.roster=idx.roster; state.runs=idx.runs;
  state.rosterMap=Object.fromEntries(idx.roster.map(r=>[r.key,r]));
  // 히어로 입력
  $("#q").addEventListener("keydown",e=>{if(e.key==="Enter")submitQuery();});
  $("#run").addEventListener("click",submitQuery);
  renderHint();
  renderArchive();
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
  $("#overlay").onclick=closePanel; $("#panelx").onclick=closePanel;
  window.addEventListener("resize",()=>state.run&&drawEdges());
}

function renderHint(){
  const chips=state.runs.map(r=>`<span class="chip" data-run="${r.runId}">${r.ticker||r.runId}</span>`).join("");
  $("#hint").innerHTML=`분석 데이터가 있는 종목을 입력하면 워크플로우가 재생됩니다 · 예시 → ${chips}`;
  $("#hint").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{$("#q").value=c.textContent;run(c.dataset.run);});
}

function matchQuery(q){
  const s=q.trim().toLowerCase();
  if(!s) return null;
  return state.runs.find(r=>{
    const t=(r.ticker||"").toLowerCase();
    if(t&&(s.includes(t)||t.includes(s))) return true;
    if(r.runId.toLowerCase().includes(s)) return true;
    const al=ALIAS[r.ticker]||[]; return al.some(a=>s.includes(a.toLowerCase()));
  });
}
function submitQuery(){
  if(state.playing) return;
  const q=$("#q").value;
  const m=matchQuery(q);
  if(!m){
    const chips=state.runs.map(r=>`<span class="chip" data-run="${r.runId}">${r.ticker}</span>`).join("");
    $("#hint").innerHTML=`"${esc(q)}" 분석 데이터가 아직 없어요. Claude Code CLI에서 <code>/투자분석 ${esc(q)}</code> 실행 후 <code>node tools/export.mjs</code> 하면 여기서 재생됩니다. · 지금 가능 → ${chips}`;
    $("#hint").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{$("#q").value=c.textContent;run(c.dataset.run);});
    return;
  }
  run(m.runId);
}

async function run(runId){
  switchTab("analysis");
  const r=await (await fetch(`data/${runId}.json`)).json();
  state.run=r;
  $("#rh-ticker").textContent=r.ticker||r.runId;
  $("#rh-price").textContent=r.price?`현재가 ${r.price}`:"";
  $("#rh-meta").textContent=`${r.date} · 분석 참여 ${r.nodes.filter(n=>n.status==="done").length-1}개 에이전트`;
  renderCanvas(r);
  $("#report").innerHTML=r.report?`<div class="md">${md2html(r.report)}</div>`
    :`<div class="md"><p style="color:var(--muted)">이 실행에는 종합 리포트(report.md)가 없습니다.</p></div>`;
  bindFootnotes();
  await playWorkflow(r);
}

function nodeHtml(n,pill){
  const acc=ACCENT(n.accent);
  return `<div class="node ${pill?"pill":""}" id="node-${n.key}" data-state="pending" style="--nc:${acc}" data-key="${n.key}">
    <div class="nlabel"><span class="dot"></span>${esc(n.label)}<span class="stat">·</span></div>
    <div class="nbody"></div></div>`;
}
function renderCanvas(run){
  const byKey=Object.fromEntries(run.nodes.map(n=>[n.key,n]));
  const g={start:[],parallel:[],review:[],report:[]};
  state.roster.forEach(r=>{const n=byKey[r.key];if(n)g[r.group].push(n);});
  $("#canvas .flow").innerHTML=`
    <div class="col"><div class="node query pill" id="node-query" data-state="done"><div class="nlabel">🔎 쿼리</div></div></div>
    <div class="col">${g.start.map(n=>nodeHtml(n,true)).join("")}</div>
    <div class="col parallel">${g.parallel.map(n=>nodeHtml(n)).join("")}</div>
    <div class="col">${g.review.map(n=>nodeHtml(n)).join("")}</div>
    <div class="col">${g.report.map(n=>nodeHtml(n)).join("")}</div>`;
  $("#canvas").querySelectorAll(".node[data-key]").forEach(el=>{
    const k=el.dataset.key; if(k==="orchestrator")return;
    el.onclick=()=>{ if(el.dataset.state==="done") openPanel(k); };
  });
  requestAnimationFrame(drawEdges);
}

// 노드 상태 전이 + 본문 갱신
function setNode(run,key,st){
  const el=$("#node-"+key); if(!el) return;
  el.dataset.state=st;
  const n=run.nodes.find(x=>x.key===key);
  const stat={pending:"·",running:"⋯",done:"✓",failed:"⚠"}[st];
  el.querySelector(".stat")&&(el.querySelector(".stat").textContent=stat);
  const body=el.querySelector(".nbody");
  if(st==="running") body.innerHTML=`<div class="nprog">${esc(PROG[key]||"분석 중…")}</div>`;
  else if(st==="done") body.innerHTML=`<div class="nsum">${esc((n.summary||[]).join(" · "))}</div>`;
  else if(st==="failed") body.innerHTML=`<div class="nsum" style="color:var(--accent-orange)">이 실행에서 산출물 없음</div>`;
  else body.innerHTML="";
}
const finalState=(run,key)=>run.nodes.find(x=>x.key===key)?.status==="missing"?"failed":"done";

async function playWorkflow(run){
  state.playing=true; $("#run").disabled=true;
  const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#report-wrap").classList.add("hidden");
  const parallel=state.roster.filter(r=>r.group==="parallel").map(r=>r.key);
  // 리셋
  run.nodes.forEach(n=> setNode(run,n.key,"pending"));
  setNode(run,"orchestrator","pending");

  if(reduce){ // 접근성: 즉시 완료
    ["orchestrator",...parallel,"red-team","report-writer"].forEach(k=>setNode(run,k,finalState(run,k)));
    revealReport(); requestAnimationFrame(drawEdges); state.playing=false; $("#run").disabled=false; return;
  }

  $("#edges").classList.add("flowing");
  // 1) 오케스트레이터
  setNode(run,"orchestrator","running"); await sleep(750); setNode(run,"orchestrator",finalState(run,"orchestrator"));
  // 2) 병렬 8종 — 동시 실행, 계단식 완료
  parallel.forEach(k=>setNode(run,k,"running"));
  await sleep(700);
  for(let i=0;i<parallel.length;i++){ setNode(run,parallel[i],finalState(run,parallel[i])); await sleep(230); }
  await sleep(200);
  // 3) 레드팀
  setNode(run,"red-team","running"); await sleep(950); setNode(run,"red-team",finalState(run,"red-team"));
  // 4) 리포트 라이터
  setNode(run,"report-writer","running"); await sleep(850); setNode(run,"report-writer",finalState(run,"report-writer"));
  $("#edges").classList.remove("flowing");
  revealReport();
  requestAnimationFrame(drawEdges);
  state.playing=false; $("#run").disabled=false;
}
function revealReport(){ $("#report-wrap").classList.remove("hidden"); requestAnimationFrame(drawEdges); }

function drawEdges(){
  const canvas=$("#canvas"), svg=$("#edges");
  const cr=canvas.getBoundingClientRect();
  svg.setAttribute("width",canvas.scrollWidth);svg.setAttribute("height",canvas.scrollHeight);
  const ctr=id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();
    return {l:r.left-cr.left+canvas.scrollLeft,r:r.right-cr.left+canvas.scrollLeft,cy:r.top-cr.top+canvas.scrollTop+r.height/2};};
  const path=(a,b)=>{if(!a||!b)return"";const x1=a.r,y1=a.cy,x2=b.l,y2=b.cy,mx=(x1+x2)/2;
    return `<path d="M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}"/>`;};
  const q=ctr("node-query"),o=ctr("node-orchestrator"),rt=ctr("node-red-team"),rp=ctr("node-report-writer");
  const e=[path(q,o)];
  state.roster.filter(r=>r.group==="parallel").forEach(r=>{const p=ctr("node-"+r.key);e.push(path(o,p));e.push(path(p,rt));});
  e.push(path(rt,rp));
  svg.innerHTML=e.join("");
}

function openPanel(key){
  const r=state.rosterMap[key]||{label:key,accent:"blue"};
  const md=key==="report-writer"?state.run.report:state.run.agents?.[key];
  $("#paneldot").style.background=ACCENT(r.accent);
  $("#panellabel").textContent=r.label+" — 상세";
  $("#panelbody").innerHTML=md?`<div class="md">${md2html(md)}</div>`:`<p style="color:var(--muted)">산출물이 없습니다.</p>`;
  $("#panelbody").scrollTop=0;
  $("#panel").classList.add("open");$("#overlay").classList.add("open");
}
function closePanel(){$("#panel").classList.remove("open");$("#overlay").classList.remove("open");}

function bindFootnotes(){
  $("#report").querySelectorAll(".fnref").forEach(el=>{
    el.onclick=()=>{const fn=(state.run.footnotes||[]).find(f=>f.n===Number(el.dataset.n));if(fn)openPanel(fn.agent);};
  });
}

function renderArchive(){
  $("#archive").innerHTML=state.runs.map(r=>`
    <div class="card" data-run="${r.runId}">
      <div class="t">${r.ticker||r.runId}</div>
      <div class="d">${r.date} · ${r.agentCount-1}개 에이전트${r.hasReport?" · 리포트 있음":""}</div>
      <div class="h">${esc(r.headline||"")}</div>
      <span class="badge">재생 ▶</span>
    </div>`).join("");
  $("#archive").querySelectorAll(".card").forEach(c=>c.onclick=()=>{$("#q").value=c.querySelector(".t").textContent;run(c.dataset.run);});
}

function switchTab(tab){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===tab));
  $("#view-analysis").classList.toggle("hide",tab!=="analysis");
  $("#view-archive").classList.toggle("hide",tab!=="archive");
  if(tab==="analysis"&&state.run)requestAnimationFrame(drawEdges);
}

boot().catch(e=>{document.body.innerHTML=`<main><p style="color:#c00">데이터 로드 실패: ${e}.<br>정적 서버로 열어야 합니다 — <code>cd web &amp;&amp; python3 -m http.server</code></p></main>`;});
