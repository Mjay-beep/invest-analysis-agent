/* 투자 분석 Agent — 정적 뷰어 로직 + 경량 마크다운 렌더러 (무의존) */

// ---------- 경량 마크다운 렌더러 (헤딩·표·리스트·인용·코드·각주) ----------
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function inline(s){
  // 인라인 코드
  s=s.replace(/`([^`]+)`/g,(_,c)=>`<code>${c}</code>`);
  // 링크 [text](url)
  s=s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  // 굵게/기울임
  s=s.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
  s=s.replace(/(^|[^*])\*([^*\n]+)\*/g,"$1<em>$2</em>");
  // 각주 참조 [n] → 클릭 가능한 sup (링크 처리 이후라 [text](url)와 안 겹침)
  s=s.replace(/\[(\d{1,3})\]/g,'<sup class="fnref" data-n="$1">[$1]</sup>');
  return s;
}
function md2html(src){
  if(!src) return "";
  const lines=esc(src).replace(/\r\n/g,"\n").split("\n");
  let out=[],i=0;
  const closeList=(st)=>{while(st.length){out.push(st.pop()==="ul"?"</ul>":"</ol>");}};
  let stack=[];
  while(i<lines.length){
    let ln=lines[i];
    // 코드펜스
    if(/^```/.test(ln.trim())){closeList(stack);i++;let buf=[];
      while(i<lines.length&&!/^```/.test(lines[i].trim())){buf.push(lines[i]);i++;}
      i++;out.push(`<pre><code>${buf.join("\n")}</code></pre>`);continue;}
    // 표
    if(/^\s*\|.*\|\s*$/.test(ln)&&i+1<lines.length&&/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1])&&/-/.test(lines[i+1])){
      closeList(stack);
      const row=(l)=>l.trim().replace(/^\||\|$/g,"").split("|").map(c=>c.trim());
      const head=row(ln);i+=2;let body=[];
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){body.push(row(lines[i]));i++;}
      let t="<table><thead><tr>"+head.map(h=>`<th>${inline(h)}</th>`).join("")+"</tr></thead><tbody>";
      for(const r of body)t+="<tr>"+r.map(c=>`<td>${inline(c)}</td>`).join("")+"</tr>";
      t+="</tbody></table>";out.push(t);continue;}
    // 헤딩
    let h=ln.match(/^(#{1,6})\s+(.*)$/);
    if(h){closeList(stack);out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);i++;continue;}
    // 구분선
    if(/^\s*---+\s*$/.test(ln)){closeList(stack);out.push("<hr>");i++;continue;}
    // 인용
    if(/^\s*>\s?/.test(ln)){closeList(stack);let buf=[];
      while(i<lines.length&&/^\s*>\s?/.test(lines[i])){buf.push(lines[i].replace(/^\s*>\s?/,""));i++;}
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);continue;}
    // 리스트
    let li=ln.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if(li){const type=/\d/.test(li[2])?"ol":"ul";
      if(stack[stack.length-1]!==type){closeList(stack);out.push(type==="ul"?"<ul>":"<ol>");stack.push(type);}
      out.push(`<li>${inline(li[3])}</li>`);i++;continue;}
    // 빈 줄
    if(!ln.trim()){closeList(stack);i++;continue;}
    // 문단
    closeList(stack);out.push(`<p>${inline(ln)}</p>`);i++;
  }
  closeList(stack);
  return out.join("\n");
}

// ---------- 앱 ----------
const $=(s,r=document)=>r.querySelector(s);
const state={roster:[],rosterMap:{},runs:[],run:null};
const ACCENT=k=>`var(--${k})`;

async function boot(){
  const idx=await (await fetch("data/index.json")).json();
  state.roster=idx.roster; state.runs=idx.runs;
  state.rosterMap=Object.fromEntries(idx.roster.map(r=>[r.key,r]));
  // 실행 셀렉터
  const sel=$("#runsel");
  sel.innerHTML=state.runs.map(r=>`<option value="${r.runId}">${r.ticker||r.runId} · ${r.date}</option>`).join("");
  sel.onchange=()=>loadRun(sel.value);
  renderArchive();
  if(state.runs.length)await loadRun(state.runs[0].runId);
  // 탭
  document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
  // 패널 닫기
  $("#overlay").onclick=closePanel;
  $("#panelx").onclick=closePanel;
  window.addEventListener("resize",()=>state.run&&drawEdges());
}

async function loadRun(runId){
  const run=await (await fetch(`data/${runId}.json`)).json();
  state.run=run;
  $("#runsel").value=runId;
  $("#rh-ticker").textContent=run.ticker||run.runId;
  $("#rh-price").textContent=run.price?`현재가 ${run.price}`:"";
  $("#rh-meta").textContent=`${run.date} · 분석 참여 ${run.nodes.filter(n=>n.status==="done").length-1}개 에이전트`;
  renderCanvas(run);
  const rep=run.nodes.find(n=>n.key==="report-writer");
  $("#report").innerHTML=run.report?`<div class="md">${md2html(run.report)}</div>`
    :`<div class="md"><p style="color:var(--muted)">이 실행에는 종합 리포트(report.md)가 없습니다.</p></div>`;
  bindFootnotes();
  switchTab("analysis");
}

function renderCanvas(run){
  const byKey=Object.fromEntries(run.nodes.map(n=>[n.key,n]));
  const groups={start:[],parallel:[],review:[],report:[]};
  state.roster.forEach(r=>{const n=byKey[r.key];if(n)groups[r.group].push(n);});
  const nodeHtml=(n,pill=false)=>{
    const acc=ACCENT(n.accent);
    const stat=n.status==="done"?`<span class="stat done">✓</span>`:`<span class="stat missing">⚠</span>`;
    const sum=pill?"":`<div class="nsum">${esc((n.summary||[]).join(" · "))}</div>`;
    return `<div class="node ${n.status==="missing"?"missing":""} ${pill?"pill":""}" id="node-${n.key}" style="--nc:${acc}" data-key="${n.key}">
      <div class="nlabel"><span class="dot"></span>${esc(n.label)} ${n.key==="orchestrator"?"":stat}</div>${sum}</div>`;
  };
  const canvas=$("#canvas");
  canvas.querySelector(".flow").innerHTML=`
    <div class="col"><div class="node query pill" id="node-query"><div class="nlabel">🔎 쿼리</div></div></div>
    <div class="col">${groups.start.map(n=>nodeHtml(n,true)).join("")}</div>
    <div class="col parallel">${groups.parallel.map(n=>nodeHtml(n)).join("")}</div>
    <div class="col">${groups.review.map(n=>nodeHtml(n)).join("")}</div>
    <div class="col">${groups.report.map(n=>nodeHtml(n)).join("")}</div>`;
  canvas.querySelectorAll(".node[data-key]").forEach(el=>{
    const k=el.dataset.key;
    if(k==="orchestrator")return;
    el.onclick=()=>openPanel(k);
  });
  requestAnimationFrame(drawEdges);
}

function drawEdges(){
  const canvas=$("#canvas"), svg=$("#edges");
  const cr=canvas.getBoundingClientRect();
  svg.setAttribute("viewBox",`0 0 ${canvas.scrollWidth} ${canvas.scrollHeight}`);
  svg.setAttribute("width",canvas.scrollWidth);svg.setAttribute("height",canvas.scrollHeight);
  const ctr=id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();
    return {l:r.left-cr.left+canvas.scrollLeft,r:r.right-cr.left+canvas.scrollLeft,
            t:r.top-cr.top+canvas.scrollTop,cy:r.top-cr.top+canvas.scrollTop+r.height/2};};
  const path=(a,b)=>{if(!a||!b)return"";const x1=a.r,y1=a.cy,x2=b.l,y2=b.cy,mx=(x1+x2)/2;
    return `<path d="M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}" fill="none" stroke="var(--hairline)" stroke-width="1.5"/>`;};
  const edges=[];
  const q=ctr("node-query"),o=ctr("node-orchestrator"),rt=ctr("node-red-team"),rp=ctr("node-report-writer");
  edges.push(path(q,o));
  state.roster.filter(r=>r.group==="parallel").forEach(r=>{const p=ctr("node-"+r.key);edges.push(path(o,p));edges.push(path(p,rt));});
  edges.push(path(rt,rp));
  svg.innerHTML=edges.join("");
}

function openPanel(key){
  const r=state.rosterMap[key]||{label:key,accent:"blue"};
  let md;
  if(key==="report-writer")md=state.run.report;
  else md=state.run.agents?.[key];
  $("#paneldot").style.background=ACCENT(r.accent);
  $("#panellabel").textContent=r.label+" — 상세";
  $("#panelbody").innerHTML=md?`<div class="md">${md2html(md)}</div>`
    :`<p style="color:var(--muted)">이 에이전트의 산출물이 없습니다.</p>`;
  $("#panelbody").scrollTop=0;
  $("#panel").classList.add("open");$("#overlay").classList.add("open");
}
function closePanel(){$("#panel").classList.remove("open");$("#overlay").classList.remove("open");}

function bindFootnotes(){
  $("#report").querySelectorAll(".fnref").forEach(el=>{
    el.onclick=()=>{const n=Number(el.dataset.n);
      const fn=(state.run.footnotes||[]).find(f=>f.n===n);
      if(fn)openPanel(fn.agent);};
  });
}

function renderArchive(){
  $("#archive").innerHTML=state.runs.map(r=>`
    <div class="card" data-run="${r.runId}">
      <div class="t">${r.ticker||r.runId}</div>
      <div class="d">${r.date} · ${r.agentCount-1}개 에이전트${r.hasReport?" · 리포트 있음":""}</div>
      <div class="h">${esc(r.headline||"")}</div>
      <span class="badge">열기 →</span>
    </div>`).join("");
  $("#archive").querySelectorAll(".card").forEach(c=>c.onclick=()=>loadRun(c.dataset.run));
}

function switchTab(tab){
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===tab));
  $("#view-analysis").classList.toggle("hide",tab!=="analysis");
  $("#view-archive").classList.toggle("hide",tab!=="archive");
  if(tab==="analysis"&&state.run)requestAnimationFrame(drawEdges);
}

boot().catch(e=>{document.body.innerHTML=`<main><p style="color:#c00">데이터 로드 실패: ${e}. <br>정적 서버로 열어야 합니다 — 예: <code>cd web &amp;&amp; python3 -m http.server</code></p></main>`;});
