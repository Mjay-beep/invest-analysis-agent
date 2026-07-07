#!/usr/bin/env bash
# 완료 알림 (Stop 훅, 1단계용)
# 분석 세션 종료 시 최신 리포트를 찾아 텔레그램으로 완료 알림을 보낸다.
# 토큰이 없거나 새 리포트가 없으면 조용히 통과 (알림 실패가 세션을 막지 않도록 항상 exit 0).

DIR="${CLAUDE_PROJECT_DIR:-.}"

# .env 에서 토큰 로드 (이 스크립트는 훅이므로 에이전트 컨텍스트에 키가 노출되지 않음)
if [ -f "$DIR/.env" ]; then
  set -a; . "$DIR/.env"; set +a
fi
[ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ] || exit 0

# 가장 최근 생성된 report.md 탐색
latest=$(ls -dt "$DIR"/reports/*/report.md 2>/dev/null | head -1)
[ -n "$latest" ] || exit 0

# 최근 10분 이내 생성분만 알림 (오래된 리포트 재알림 방지)
if [ -n "$(find "$latest" -mmin -10 2>/dev/null)" ]; then
  runid=$(basename "$(dirname "$latest")")
  msg="✅ 투자 분석 완료: ${runid}
리포트: ${latest}"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${msg}" >/dev/null 2>&1
fi
exit 0
