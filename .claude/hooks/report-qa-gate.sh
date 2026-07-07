#!/usr/bin/env bash
# 리포트 QA 게이트 (PostToolUse: Write)
# report.md 저장을 감지하면 필수 3요소를 검증하고, 누락 시 에이전트에 보완을 요청한다.
#   ① 면책 문구  ② 각주 [1]  ③ 상충 감지 섹션
# stdin 으로 훅 페이로드(JSON)를 받는다. jq 없이 grep 으로 파일 경로만 추출.

payload=$(cat)
# tool_input.file_path 추출 (jq 있으면 사용, 없으면 grep 폴백)
if command -v jq >/dev/null 2>&1; then
  file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')
else
  file=$(printf '%s' "$payload" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')
fi

# report.md 만 검사 (에이전트 개별 결과 파일은 통과)
case "$file" in
  */report.md) : ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

missing=()
grep -q "투자 자문이 아니며" "$file" || missing+=("면책 문구")
grep -qE '\[[0-9]+\]' "$file"        || missing+=("각주 [1] 형식")
grep -qE '상충|상충 감지|상반' "$file" || missing+=("상충 감지 섹션")

if [ ${#missing[@]} -gt 0 ]; then
  # exit 2 = 차단성 피드백. stderr 메시지가 에이전트에게 전달되어 보완 유도.
  echo "리포트 QA 실패 — 다음 필수 요소 누락: ${missing[*]}. report.md 를 보완하세요." >&2
  exit 2
fi
exit 0
