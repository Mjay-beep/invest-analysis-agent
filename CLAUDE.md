# CLAUDE.md — 투자 분석 Agent

한국+미국 주식을 분석·발굴하는 멀티 에이전트 시스템. 오케스트레이터 1 + 분석 에이전트 8(병렬) + 레드팀 + 리포트 라이터. 개인 Claude Code 구독 인증 기반 (API 종량제 미사용).

## 필독 문서 (작업 전 반드시 읽기)
- 설계서: `docs/2026-07-07-투자분석-Agent-설계.md` — 아키텍처·웹 스펙·SSE 스키마·로드맵·생태계 도구(§10)의 단일 진실 원천
- 공통 시스템 프롬프트: `docs/00-system-prompt.md`
- 에이전트 프롬프트 원본: `docs/prompts/01~11-*.md`

## 폴더 구조와 원본 규칙
```
docs/prompts/*.md   ← 에이전트 프롬프트의 원본 (수정은 반드시 여기서)
.claude/agents/*.md ← 원본에서 이식된 실행본 (00-system-prompt + 해당 프롬프트 결합)
.claude/skills/투자분석/ ← 오케스트레이터 (01 원본 이식)
.claude/skills/k-dart/  ← 외부 벤더링 (NomaDamas/k-skill). DART 14 endpoint 조회 규약. 수정 금지(업스트림 원본)
tools/export.mjs    ← reports/ → web/data/ 정적 변환 (뷰어 데이터 생성, 무의존 Node)
tools/build-preview.mjs ← web/preview.html 자체완결 미리보기 생성 (아티팩트/오프라인 열람용)
web/                ← 2단계: 정적 뷰어 (index.html·styles.css·app.js·data/) — Vercel 배포 대상
~~server/~~         ← 폐기 (Agent SDK 구독 재사용 불가 피벗, 설계서 §1·§8). 라이브 백엔드 없음
reports/{YYYY-MM-DD}_{티커}/ ← 분석 결과 아카이브 (에이전트별 md + report.md)
cache/              ← 매크로·정책 당일 캐시
다모다란 기업분석/    ← 레거시 (텔레그램 봇, 지침 원본) — 수정 금지
```
- 프롬프트 수정 시: docs/prompts 원본 수정 → .claude/agents 재이식 (양쪽 불일치 금지)
- reports/·cache/는 에이전트 산출물 전용 — 수동 편집 금지

## 웹 뷰어 갱신 워크플로우 (하이브리드 뷰어)
- 분석은 CLI(`/투자분석`, 구독·무료)가 `reports/`에 남김 → 웹은 그 결과를 정적으로 렌더 (라이브 백엔드 없음)
- 갱신 3단계: ① CLI로 분석 실행 ② `node tools/export.mjs` (reports→web/data) ③ 필요 시 `node tools/build-preview.mjs`(단일 파일 미리보기) / Vercel 배포는 `web/` 정적
- ❗Agent SDK는 구독 재사용 불가(공식 금지) → 라이브 브라우저 실행·종량제 웹 불채택. 설계서 §1 피벗 참조

## 구현 규칙 (Opus 세션용)
- 로드맵 Phase 0~5 순서 준수 (설계서 §8). Phase 1 CLI 검증 통과 전 Phase 2 착수 금지
- 스택: 백엔드 Node + `@anthropic-ai/claude-agent-sdk`, 프론트 정적 HTML/CSS/JS (프레임워크·빌드 도구 없이), 노드 캔버스는 SVG 직접 구현
- 디자인: `docs/DESIGN-notion.md` 토큰만 사용 (임의 색상 금지). 원본: `CJM 대시보드-2026/앱개발/DESIGN-notion.md`에서 복사해올 것
- SSE 이벤트는 설계서 §5-3 스키마 고정 — 변경 시 설계서 먼저 갱신
- 비밀값은 `.env`에만. 커밋·로그·결과 파일에 키 노출 금지
- MCP 설치 대상과 권한 설정은 설계서 §10 판정표 기준
- 한국 공시·재무 조회는 `k-dart` 스킬 규약 사용 (OpenDART MCP 불채택). 스킬은 env `API_K_DART`(=DART_API_KEY 동일값)를 읽음 → 세션 실행 전 `set -a; . .env; set +a`로 환경 주입 (또는 Phase 1에서 런처 스크립트로 자동화). 키는 env로만, 컨텍스트·결과 파일에 원문 금지

## 대화·문서 스타일 (사용자 선호)
- 사용자는 비개발자 서비스기획자 — 기술 설명은 비유와 쉬운 말로, 대화는 해요체
- 문서는 개조식·명사형 종결, 과장 표현 금지
- 결정 사항은 즉시 파일로 박제 (설계서 갱신)

## 금지
- 실데이터 없이 숫자 지어내기 (에이전트 규약과 동일하게 개발 중 테스트에도 적용)
- 설계서와 다른 구조 임의 도입 (변경 필요 시 설계서 수정 제안 먼저)
- `다모다란 기업분석/` 폴더 수정, `.env` 읽기·출력
