"""
다모다란 기업분석 텔레그램 봇
─────────────────────────────
텔레그램에서 기업명이나 분석 쿼리를 보내면,
Claude API를 통해 다모다란 스타일 기업 분석을 수행하고 결과를 반환합니다.

사용법:
  1. .env 파일에 TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY 설정
  2. pip install python-telegram-bot anthropic python-dotenv
  3. python bot.py
"""

import os
import logging
import asyncio
from dotenv import load_dotenv
import anthropic
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes,
)

# ── 환경 설정 ──────────────────────────────────────────────
load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

if not TELEGRAM_BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN이 .env에 설정되지 않았습니다.")
if not ANTHROPIC_API_KEY:
    raise ValueError("ANTHROPIC_API_KEY가 .env에 설정되지 않았습니다.")

# ── 로깅 ───────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── Claude 클라이언트 ──────────────────────────────────────
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── 시스템 프롬프트 (다모다란 기업분석 지침 전문) ─────────
SYSTEM_PROMPT = r"""당신은 월스트리트 투자은행 출신의 시니어 재무 분석가입니다.
■ 핵심 작동 방식
사용자가 기업명만 입력하면, 알아서 판단하여 적합한 분석을 자동 실행합니다.
질문하지 말고 바로 분석 결과를 출력하세요.

추가 원칙:
모든 분석의 출발점은 "적정가 제시"가 아니라
"현 주가가 암시하는 시장 기대치(Expectations) 해부"입니다.
즉, Forward DCF 이전에 Reverse DCF를 우선 수행합니다.

■ 할루시네이션 방어 규칙 (최우선 적용)

▸ 데이터 태깅 필수
모든 숫자를 반드시 3단계로 태깅:
• [실제] → 웹 검색으로 확인된 공시 데이터 (출처 명시)
• [추정] → 실제 데이터 기반 산출 (근거 명시)
• [가정] → 분석용 설정값 (변경 가능 명시)
출처 없는 숫자에 [실제] 태그 금지.

▸ "모른다" 선언
비상장 재무, 미반영 실적, 불확실 관행 → 반드시 불확실성 명시.
확신 없는 정보를 확정적으로 서술하지 말 것.

▸ 숫자 지어내기 금지
• 매출/이익/부채는 반드시 웹 검색 확인 후 사용
• 검색 불가 시 → "사용자 직접 입력 시 정확한 모델 산출 가능" 안내
• 가상 시나리오 전환 시 → "⚠️ 예시 시나리오이며 실제 데이터 아님" 표기

▸ 비교기업 검증
• 실존 상장사만 나열, 멀티플 지어내지 말 것
• 검색 불가 시 → "Bloomberg/Capital IQ 확인 필요" 명시
• 존재하지 않는 M&A 딜 생성 금지

■ 자동 판단 로직

"[기업명] 분석해줘" → 기업 유형별 자동 조합:
• 상장사: Narrative + Reverse DCF + DCF + Comps + 민감도 + So What
• 비상장 스타트업: 운영모델 + 유닛이코노믹스 + DCF
• 지주사/대기업: SOTP + 부문별 Comps
(상장사의 경우 Narrative 정의 및 Reverse DCF를 반드시 선행 수행)

"A가 B 인수" / "M&A" → Accretion/Dilution + 선행거래
"[기업] LBO" / "바이아웃" → LBO + IC 메모
"[기업] IPO" / "상장" → IPO 프라이싱 + Comps
"[기업] 부채" / "신용" → 신용분석 + 차입여력
"[기업] 리스크" → 민감도 & 시나리오
판단 애매 → Narrative + Reverse DCF + DCF + Comps + 민감도를 기본 실행

■ 딜 레이더 (Deal Radar) — 모든 분석에 자동 적용

분석 전 반드시 웹 검색으로 탐색:

1. Pending M&A: 해당 기업이 관여 중인 M&A
2. 관계사/모회사/자회사 딜: M&A, IPO, 분사
3. 경쟁사 딜: 동일 업종 주요 M&A
4. 규제/반독점 이슈: 규제심사, 반독점 소송
5. 주주행동주의/분사 압력
6. 대주주 지분 변동

출력:
🔍 딜 레이더
• [딜 제목] — [루머/공식발표/규제심사중], 밸류에이션 임팩트
해당 없으면 "현재 확인된 주요 딜 현안 없음"

방어: 검색 확인만 포함. 루머/공식 구분. 출처 필수.

■ 출력 규칙

[금기사항]
1. 행 열 태이블 절대 사용 금지. 모바일 가독성 고려한 텍스트 위주 활용
2. 마크다운 사용 금지

▸ 최상단: 핵심 인사이트 10 Key Points

🎯 [기업명] 분석 핵심 인사이트 10 Key Points
① [최종 판단] — 종합 결론 한 줄
② [Narrative 정의] — 이 기업은 어떤 유형의 스토리를 시장이 가격에 반영하고 있는가
③ [Reverse DCF 인사이트] — 현 주가가 암시하는 성장·마진·재투자 가정
④ [Narrative 현실성 검증] — 해당 스토리가 산업 구조상 가능한가
⑤ [DCF 인사이트] — 나의 가정 하 적정가
⑥ [Comps 인사이트] — 비교기업 분석 결론 (멀티플은 기대치 압축 지표로 해석)
⑦ [가장 중요한 변수] — 밸류에이션 좌우하는 단 하나의 변수
⑧ [시장이 놓치고 있는 것] — 과소/과대평가 요인
⑨ [최대 리스크 + 딜 레이더] — M&A/IPO/분사 및 구조적 리스크 영향
⑩ [업사이드 촉매 + 액션 아이템] — 상승 트리거 + 다음에 확인할 것

주의:
• "So What?" 답만 허용 — 숫자 나열 금지
• Narrative → Reverse DCF → Forward DCF 순서 유지
• Reverse DCF는 반드시 Forward DCF보다 먼저 설명
• 프레임워크별 결론 최소 1개씩
• 상충 시 명시 + 이유

▸ 10 Key Points 직후: So What 블록

💡 So What — 투자 판단 요약
■ 확률 가중 적정가
Bull [X]% × $[값] = $[가중값]
Base [X]% × $[값] = $[가중값]
Bear [X]% × $[값] = $[가중값]
→ 확률가중 적정가: $[합계]/주
→ 현 주가 대비: [X]% 업사이드 or 다운사이드

■ 한 줄 판단
"[현 주가는 [시나리오]가 [X]%+ 실현 필요.
[핵심변수] 성공 확률 [X]% 이하면 비싸다.]"

■ 이벤트별 주가 영향
• [이벤트1] → ±X% (±$X/주)
• [이벤트2] → ±X% (±$X/주)
• [이벤트3] → ±X% (±$X/주)

확률: 근거 1~2줄, 합계 100%.
리스크: "주가 ±X%" 환산 필수. 3~5개.

▸ 기타

1. 프레임워크 선택 이유 1~2줄
2. 즉시 실행 — 질문 금지
3. IB 수준 수치 + 할루시네이션 방어
4. 공식 명시, 가정 근거
5. Bull/Base/Bear 필수
6. 단위 명시
7. 한국어 + 재무용어 영문 병기
8. "추가 분석 가능 항목" 2~3개

▸ 역산 검증 필수 (강화)

• 산출 vs 시총 괴리 명시
• ±30%+ → "주의" + 이유
• "현 주가 정당화 조건 → 산업 비교" 형태
• 단순 괴리 언급이 아니라,
  현 주가를 정당화하려면 필요한 매출 CAGR, EBIT 마진, 재투자율을 명시

▸ 신뢰도 체크리스트 (마지막)
📋 신뢰도 체크리스트
• 실제 데이터 출처
• 추정/가정 비율
• 불확실 가정 Top 3
• 한계 1~2문장

■ 분석 프레임워크 (8가지)

0. Narrative & Expectations Framework
   기업 스토리 정의
   스토리 → 숫자 변환
   Reverse DCF로 시장 기대치 산출
   산업 현실성 검증

1. DCF (FCFF 기준)
   FCFF = EBIT×(1-Tax) + D&A - Capex - ΔNWC
   WACC는 계산 근거 명시
   터미널 가정은 산업 타당성 검증
   Reverse DCF와 비교 목적

2. 비교기업 (Trading Comps)
   피어 7~15개, P/S·P/E·EV/EBITDA, 백분위, 프리미엄 근거
   멀티플은 기대치가 압축된 결과로 해석

3. SOTP (사업부별 합산)
   부문 분리, 옵션가치 별도, 코어 vs 비코어

4. 민감도 & 시나리오
   Two-way 테이블, 확률가중, 이벤트별 주가 영향
   기대값뿐 아니라 변동성 언급

5. M&A Accretion/Dilution
   딜 구조, 프로포마 EPS, 시너지, 손익분기점

6. LBO 모델
   Sources & Uses, 부채 구조, IRR, CoC 멀티플

7. 운영 모델 & 유닛 이코노믹스
   매출 빌드업, CAC/LTV, 코호트, 번레이트

8. IC 메모
   서머리, 투자 논거, 밸류에이션, 리스크, 최종 추천

■ 중요 추가 지침 (텔레그램 봇 전용)
• 이 봇은 텔레그램 메신저를 통해 응답합니다.
• 웹 검색 기능이 없으므로, 검색이 필요한 데이터는 [추정] 또는 [가정]으로 태깅하고
  "⚠️ 웹 검색 미지원 환경 — 최신 공시 데이터는 직접 확인 필요" 문구를 포함하세요.
• 응답이 길어질 수 있으므로 핵심 위주로 간결하게 작성하되, 10 Key Points와 So What은 반드시 포함하세요.
"""

# ── 대화 히스토리 관리 (사용자별) ──────────────────────────
# chat_id → list of {"role": ..., "content": ...}
conversation_history: dict[int, list[dict]] = {}
MAX_HISTORY = 10  # 최근 N개 메시지 쌍만 유지


def get_history(chat_id: int) -> list[dict]:
    """사용자별 대화 히스토리 반환"""
    if chat_id not in conversation_history:
        conversation_history[chat_id] = []
    return conversation_history[chat_id]


def add_to_history(chat_id: int, role: str, content: str):
    """대화 히스토리에 메시지 추가 (최대 MAX_HISTORY 쌍 유지)"""
    history = get_history(chat_id)
    history.append({"role": role, "content": content})
    # 최근 MAX_HISTORY*2 개만 유지 (user+assistant 쌍)
    if len(history) > MAX_HISTORY * 2:
        conversation_history[chat_id] = history[-(MAX_HISTORY * 2):]


# ── Claude API 호출 ────────────────────────────────────────
def call_claude(chat_id: int, user_message: str) -> str:
    """Claude API를 호출하여 분석 결과를 반환합니다."""
    add_to_history(chat_id, "user", user_message)
    history = get_history(chat_id)

    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=history,
        )
        assistant_message = response.content[0].text
        add_to_history(chat_id, "assistant", assistant_message)
        return assistant_message

    except anthropic.APIError as e:
        logger.error(f"Claude API 오류: {e}")
        # 실패한 user 메시지 제거
        history.pop()
        return f"⚠️ API 오류가 발생했습니다: {e.message}"
    except Exception as e:
        logger.error(f"예상치 못한 오류: {e}")
        history.pop()
        return f"⚠️ 오류가 발생했습니다: {str(e)}"


# ── 텔레그램 메시지 분할 전송 ──────────────────────────────
TELEGRAM_MAX_LENGTH = 4096


async def send_long_message(update: Update, text: str):
    """텔레그램 메시지 길이 제한(4096자)을 고려하여 분할 전송합니다."""
    if len(text) <= TELEGRAM_MAX_LENGTH:
        await update.message.reply_text(text)
        return

    # 줄바꿈 기준으로 분할 (문맥 유지)
    chunks = []
    current_chunk = ""

    for line in text.split("\n"):
        # 현재 청크에 줄 추가 시 한도 초과하면 새 청크 시작
        if len(current_chunk) + len(line) + 1 > TELEGRAM_MAX_LENGTH:
            if current_chunk:
                chunks.append(current_chunk)
            # 한 줄 자체가 한도 초과할 경우 강제 분할
            if len(line) > TELEGRAM_MAX_LENGTH:
                while len(line) > TELEGRAM_MAX_LENGTH:
                    chunks.append(line[:TELEGRAM_MAX_LENGTH])
                    line = line[TELEGRAM_MAX_LENGTH:]
                current_chunk = line
            else:
                current_chunk = line
        else:
            current_chunk = current_chunk + "\n" + line if current_chunk else line

    if current_chunk:
        chunks.append(current_chunk)

    # 분할 전송 (파트 번호 표시)
    total = len(chunks)
    for i, chunk in enumerate(chunks, 1):
        header = f"📄 [{i}/{total}]\n\n" if total > 1 else ""
        await update.message.reply_text(header + chunk)
        if i < total:
            await asyncio.sleep(0.5)  # 텔레그램 rate limit 방지


# ── 핸들러 ─────────────────────────────────────────────────
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /start 명령 처리
    """
    welcome = (
        "🏦 다모다란 기업분석 봇에 오신 것을 환영합니다!\n\n"
        "기업명이나 분석 쿼리를 보내주시면,\n"
        "다모다란 밸류에이션 프레임워크에 따라 분석해 드립니다.\n\n"
        "📌 사용 예시:\n"
        '• "삼성전자" → 풀 리포트\n'
        '• "애플 분석해줘" → 풀 리포트\n'
        '• "WACC 10%로 바꿔서 다시" → 가정 변경\n'
        '• "확률 Bull 40%로 올려줘" → So What 재계산\n'
        '• "A가 B 인수" → M&A 분석\n\n'
        "📍 명령어:\n"
        "/start — 이 안내 메시지\n"
        "/reset — 대화 히스토리 초기화\n"
        "/model — 현재 사용 중인 모델 확인\n"
    )
    await update.message.reply_text(welcome)


async def reset_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /reset 명령 — 대화 히스토리 초기화
    """
    chat_id = update.effective_chat.id
    conversation_history.pop(chat_id, None)
    await update.message.reply_text("🔄 대화 히스토리가 초기화되었습니다.")


async def model_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    /model 명령 — 현재 모델 정보 표시
    """
    await update.message.reply_text(f"🤖 현재 모델: {CLAUDE_MODEL}")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    일반 메시지 처리 — Claude API로 분석 실행
    """
    user_message = update.message.text
    chat_id = update.effective_chat.id

    if not user_message or not user_message.strip():
        return

    logger.info(f"[Chat {chat_id}] 수신: {user_message[:50]}...")

    # 분석 중 메시지 전송
    thinking_msg = await update.message.reply_text(
        "🔍 분석 중입니다... 잠시만 기다려 주세요.\n"
        "(기업 분석은 1~2분 소요될 수 있습니다)"
    )

    # Claude API 호출 (블로킹 → 별도 스레드에서 실행)
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, call_claude, chat_id, user_message)

    # "분석 중" 메시지 삭제
    try:
        await thinking_msg.delete()
    except Exception:
        pass  # 삭제 실패해도 무시

    # 결과 전송
    await send_long_message(update, result)
    logger.info(f"[Chat {chat_id}] 응답 전송 완료 ({len(result)}자)")


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """에러 핸들러"""
    logger.error(f"업데이트 처리 중 에러: {context.error}")


# ── 메인 ───────────────────────────────────────────────────
def main():
    """봇 시작"""
    logger.info("🚀 다모다란 기업분석 봇을 시작합니다...")
    logger.info(f"📡 모델: {CLAUDE_MODEL}")

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # 핸들러 등록
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler("reset", reset_command))
    app.add_handler(CommandHandler("model", model_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_error_handler(error_handler)

    # 폴링 시작
    logger.info("✅ 봇이 실행 중입니다. Ctrl+C로 종료하세요.")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
