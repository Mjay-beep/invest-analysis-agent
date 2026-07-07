# 투자 분석 Agent

한국·미국 주식을 분석·발굴하는 **멀티 에이전트 시스템**. 오케스트레이터 1 + 분석 에이전트 8(병렬) + 레드팀 + 리포트 라이터. 무료 데이터 소스만 사용.

## 구조 (하이브리드)

- **분석 실행 = Claude Code CLI** (구독 기반, 무료) — `.claude/agents/*.md` 서브에이전트가 병렬로 분석해 `reports/`에 저장
- **웹 = 정적 뷰어** — `reports/`를 정적 JSON으로 export해 브라우저에서 노드 그래프·리포트·각주로 열람 (백엔드·과금 없음)

> Anthropic 정책상 Agent SDK로 구독 rate limit을 재사용할 수 없어, 라이브 백엔드 대신 "CLI 분석 → 정적 뷰어" 하이브리드로 설계했습니다.

## 에이전트 (11)

오케스트레이터 · 다모다란 밸류에이션 · 전통 멀티플 · 스마트머니(13F·국민연금·내부자·의회) · SNS 여론 · 뉴스 · 매크로·지정학 · 재정·정책 · 기술적 분석 · 레드팀 · 리포트 라이터

## 데이터 소스 (전부 무료)

SEC EDGAR · DART(k-dart 스킬) · KRX 통계 · FRED · USAspending · Congress.gov · Reddit/StockTwits · UsStockInfo(Yahoo) · 웹 검색

## 사용법

```bash
# 1) 분석 (Claude Code에서)
/투자분석 삼성전자 분석해줘

# 2) 뷰어 데이터 생성
node tools/export.mjs

# 3) 로컬 열람
cd web && python3 -m http.server   # → localhost:8000
# 또는 Vercel 배포 (Root Directory = web)
```

## 폴더

| 경로 | 내용 |
|---|---|
| `.claude/agents/`, `.claude/skills/` | 에이전트·오케스트레이터·k-dart |
| `docs/` | 설계서·프롬프트 원본 |
| `tools/` | export·preview 생성기 |
| `web/` | 정적 뷰어 (Vercel 배포 대상) |
| `reports/` | 분석 산출물 (로컬, 미커밋) |

## 면책

본 시스템의 리포트는 정보 제공 목적이며 투자 자문이 아닙니다. 투자 판단과 책임은 본인에게 있습니다.
