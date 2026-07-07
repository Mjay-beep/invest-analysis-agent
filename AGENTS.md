# AGENTS.md — 투자 분석 Agent (하네스 불문 요약 브리프)

> 어떤 AI 코딩 도구/에이전트가 이 저장소에서 작업하든 이 파일을 먼저 읽을 것. 상세 규칙은 `CLAUDE.md`, 전체 설계는 `docs/2026-07-07-투자분석-Agent-설계.md`.

## 시스템 한 줄 요약
사용자 쿼리 → 오케스트레이터가 모드 판별(분석/발굴/후속) → 분석 에이전트 8개 병렬 실행(각자 `reports/{실행ID}/{에이전트명}.md` 저장) → 레드팀(반대 논거) → 리포트 라이터(각주 달린 줄글 종합) → Langflow식 노드 캔버스 웹 UI로 실시간 표시.

## 에이전트 로스터 (프롬프트 원본: docs/prompts/)
1. orchestrator — 분류·디스패치·취합 (직접 분석 금지)
2. damodaran-analyst — Narrative → Reverse DCF → DCF → Comps
3. valuation-analyst — PER·PBR·PEG 등 멀티플 상대가치
4. smart-money-tracker — 13F·국민연금·내부자·의회 거래
5. sns-sentiment — Reddit·StockTwits·Threads 여론 (3~6개월)
6. news-analyst — 뉴스·공시 이벤트 타임라인 (3~6개월)
7. macro-geopolitics — 금리·인플레·환율·지정학 (당일 캐시)
8. policy-money-tracker — 재정지출·정부계약·법안 (당일 캐시)
9. technical-analyst — 이평·RSI·거래량 (타이밍 참고)
10. red-team — 반대 논거 전문 (리포트 직전 실행)
11. report-writer — 종합 리포트 (Read/Write만 — 검색 도구 부여 금지)

## 불변 원칙
- 모든 수치는 [실제]/[추정]/[가정] 태깅 + 출처. 숫자 지어내기 금지 (`docs/00-system-prompt.md`)
- 에이전트 간 데이터 전달은 파일로만 (reports/ 경유)
- 인증은 개인 Claude Code 구독 재사용 — API 키 과금 구조 도입 금지
- 프론트는 Vercel 정적 배포, 백엔드는 로컬 맥 + Cloudflare Tunnel
- 프롬프트 수정은 docs/prompts 원본 → .claude/agents 재이식 순서

## 현재 상태 (2026-07-07)
- Phase 0 거의 완료: 스캐폴드·설정·훅·k-dart 스킬 벤더링 완료. 다음 = Phase 1 (에이전트 11종 이식 + CLI 검증)
- 발급·검증 완료 키 3종: DART·FRED·Congress.gov (전부 무료, `.env`). 공공데이터포털은 국민연금 주식 보유 API 부재로 불채택 — 국민연금 지분은 DART(k-dart)로 커버
- k-dart 스킬 채택(OpenDART MCP 대체), env `API_K_DART` 사용
