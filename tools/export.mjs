#!/usr/bin/env node
// 정적 export 파이프라인 (Phase 2, 무의존 Node ESM)
// reports/ 를 스캔해 web/data/index.json + web/data/{runId}.json 을 생성한다.
// 실행: node tools/export.mjs   (프로젝트 루트에서)
//
// 하이브리드 뷰어 설계: 분석은 CLI(구독·무료)가 reports/ 에 남기고,
// 이 스크립트가 그 산출물을 정적 뷰어(web/)가 읽을 JSON으로 변환한다.
// 백엔드·SSE·과금 없음.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS = join(ROOT, "reports");
const OUT = join(ROOT, "web", "data");

// 에이전트 로스터 = 노드 캔버스의 고정 DAG 순서 + 라벨 + Notion 액센트 토큰(§5-2)
// orchestrator 는 파일이 없는 진입 노드, report-writer 는 report.md 로 매핑.
const ROSTER = [
  { key: "orchestrator",        label: "오케스트레이터", accent: "blue",              group: "start"    },
  { key: "damodaran-analyst",   label: "다모다란",       accent: "accent-purple",      group: "parallel" },
  { key: "valuation-analyst",   label: "밸류에이션",     accent: "accent-sky",         group: "parallel" },
  { key: "smart-money-tracker", label: "스마트머니",     accent: "accent-green",       group: "parallel" },
  { key: "sns-sentiment",       label: "SNS 여론",       accent: "accent-pink",        group: "parallel" },
  { key: "news-analyst",        label: "뉴스",           accent: "accent-orange",      group: "parallel" },
  { key: "macro-geopolitics",   label: "매크로·지정학",  accent: "accent-teal",        group: "parallel" },
  { key: "policy-money-tracker",label: "재정·정책",      accent: "accent-brown",       group: "parallel" },
  { key: "technical-analyst",   label: "기술적 분석",    accent: "secondary",          group: "parallel" },
  { key: "red-team",            label: "레드팀",         accent: "accent-orange-deep", group: "review"   },
  { key: "report-writer",       label: "리포트",         accent: "blue",               group: "report"   },
];
const LABEL = Object.fromEntries(ROSTER.map(r => [r.key, r.label]));

// 파일명 → 로스터 key (report-writer 는 report.md)
function fileForKey(key) {
  return key === "report-writer" ? "report.md" : `${key}.md`;
}

// "3줄 요약" 섹션 추출: 해당 heading 이후 다음 heading/구분선 전까지의 불릿/문장
function extractSummary(md) {
  const lines = md.split(/\r?\n/);
  let i = -1;
  for (let k = 0; k < lines.length; k++) {
    if (/^#{1,6}\s*.*(3줄\s*요약|요약)/.test(lines[k])) { i = k + 1; break; }
  }
  if (i < 0) {
    // 폴백: 본문 첫 불릿/문장 3개
    const body = lines.filter(l => l.trim() && !/^#{1,6}\s|^>|^---|^\|/.test(l.trim()));
    return body.slice(0, 3).map(clean).filter(Boolean);
  }
  const out = [];
  for (; i < lines.length && out.length < 4; i++) {
    const t = lines[i].trim();
    if (/^#{1,6}\s|^---/.test(t)) break;
    if (!t) continue;
    out.push(clean(t));
  }
  return out.filter(Boolean);
}
function clean(s) {
  return s.replace(/^[-*\d.]+\s*/, "").replace(/\*\*/g, "").replace(/`/g, "").trim();
}

// report.md 각주 파싱: [n] {에이전트명}: "..." — {파일명}
function parseFootnotes(md) {
  const notes = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\[(\d+)\]\s+([a-z][a-z-]+):\s*(.*)$/);
    if (m) notes.push({ n: Number(m[1]), agent: m[2], label: LABEL[m[2]] || m[2], text: clean(m[3]) });
  }
  return notes;
}

// report.md 헤더에서 현재가/작성일 추출(있으면)
function parseReportHeader(md) {
  const price = (md.match(/현\s*주가[^$₩\d]*([$₩][\d,.]+|[\d,]+원)/) || [])[1] || null;
  const date = (md.match(/작성일[:\s]*([\d]{4}-[\d]{2}-[\d]{2})/) || [])[1] || null;
  return { price, date };
}

function buildRun(runId) {
  const dir = join(REPORTS, runId);
  const files = new Set(readdirSync(dir).filter(f => f.endsWith(".md")));
  const [date, ...tickerParts] = runId.split("_");
  const ticker = tickerParts.join("_");

  const reportMd = files.has("report.md") ? readFileSync(join(dir, "report.md"), "utf8") : null;
  const header = reportMd ? parseReportHeader(reportMd) : {};

  const nodes = ROSTER.map(r => {
    const fname = fileForKey(r.key);
    if (r.key === "orchestrator") {
      return { ...r, status: "done", summary: [`${ticker || runId} 분석 디스패치·취합`], file: null };
    }
    if (files.has(fname)) {
      const md = readFileSync(join(dir, fname), "utf8");
      return { ...r, status: "done", summary: extractSummary(md).slice(0, 3), file: fname };
    }
    return { ...r, status: "missing", summary: ["(이 실행에서 산출물 없음)"], file: null };
  });

  const mtime = statSync(join(dir, files.has("report.md") ? "report.md" : [...files][0])).mtime.toISOString();

  const run = {
    runId, ticker, date: header.date || date, price: header.price || null,
    mode: "analysis",
    generatedAt: mtime,
    nodes,
    footnotes: reportMd ? parseFootnotes(reportMd) : [],
    report: reportMd,
    // 에이전트별 md 전문 (사이드 패널 렌더용)
    agents: Object.fromEntries(
      nodes.filter(n => n.file && n.file !== "report.md")
        .map(n => [n.key, readFileSync(join(dir, n.file), "utf8")])
    ),
  };
  return run;
}

function main() {
  if (!existsSync(REPORTS)) { console.error("reports/ 없음"); process.exit(1); }
  mkdirSync(OUT, { recursive: true });

  const runIds = readdirSync(REPORTS)
    .filter(f => statSync(join(REPORTS, f)).isDirectory())
    .filter(f => readdirSync(join(REPORTS, f)).some(x => x.endsWith(".md")))
    .sort().reverse();

  const index = [];
  for (const runId of runIds) {
    const run = buildRun(runId);
    writeFileSync(join(OUT, `${runId}.json`), JSON.stringify(run));
    const doneCount = run.nodes.filter(n => n.status === "done").length;
    index.push({
      runId: run.runId, ticker: run.ticker, date: run.date, price: run.price,
      mode: run.mode, generatedAt: run.generatedAt,
      agentCount: doneCount, hasReport: !!run.report,
      headline: (run.nodes.find(n => n.key === "report-writer")?.summary?.[0]) || run.ticker,
    });
  }
  // 로스터도 프론트에 노출(데이터 구동)
  writeFileSync(join(OUT, "index.json"), JSON.stringify({ roster: ROSTER, runs: index }));
  console.log(`export 완료: ${runIds.length}개 실행 → web/data/`);
  for (const r of index) console.log(`  - ${r.runId} (${r.agentCount}노드, report=${r.hasReport})`);
}

main();
