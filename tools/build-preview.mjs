#!/usr/bin/env node
// 자체완결 미리보기 생성기: web/{index.html,styles.css,app.js} + web/data/* 를
// 데이터 인라인·fetch 심(shim)한 단일 HTML(web/preview.html)로 합친다.
// 아티팩트/이메일 등 서버 없이 열람용. 실제 배포는 web/ 정적 사이트 그대로 사용.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = join(ROOT, "web"), D = join(W, "data");

const css = readFileSync(join(W, "styles.css"), "utf8");
const app = readFileSync(join(W, "app.js"), "utf8");

// data/*.json 전부 인라인
const files = readdirSync(D).filter(f => f.endsWith(".json"));
const DATA = {};
for (const f of files) DATA["data/" + f] = JSON.parse(readFileSync(join(D, f), "utf8"));

// index.html 의 <body> 내부만 추출
const html = readFileSync(join(W, "index.html"), "utf8");
const body = html.slice(html.indexOf("<header"), html.indexOf('<script src="app.js">')).trim();

const shim = `
// 자체완결 미리보기: fetch 를 인라인 DATA 로 대체
const __DATA__ = ${JSON.stringify(DATA)};
window.fetch = (u) => Promise.resolve({ json: () => Promise.resolve(__DATA__[String(u).replace(/^\\.\\//,"")]) });
`;

const out = `<style>\n${css}\n</style>\n${body}\n<script>\n${shim}\n${app}\n</script>\n`;
writeFileSync(join(W, "preview.html"), out);
console.log(`preview.html 생성: ${(out.length/1024).toFixed(0)}KB, 인라인 실행 ${files.length}건`);
