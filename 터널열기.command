#!/bin/bash
# ICCA 백두산 여행 앱 — 외부 접속 주소 만들기 (Cloudflare 임시 터널)
#
# 앱을 먼저 켠 뒤(시작하기) 이 파일을 더블클릭하세요.
# 이 터미널 창을 닫으면 터널이 닫히고 외부 주소는 사라집니다.

cd "$(dirname "$0")" || exit 1

echo ""
echo "  ================================================"
echo "   외부 접속 주소 만들기 (Cloudflare 터널)"
echo "  ================================================"
echo ""

# .env 에 PORT 가 적혀 있으면 그 값을, 없으면 기본 8080 을 쓴다
PORT=$(grep -E '^[[:space:]]*PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d ' \r')
[ -z "$PORT" ] && PORT=8080

if ! command -v cloudflared > /dev/null 2>&1; then
  echo "  [!] cloudflared 가 설치되어 있지 않습니다."
  echo ""
  echo "      터미널에 아래 한 줄을 붙여넣어 설치한 뒤 다시 실행해 주세요."
  echo ""
  echo "        brew install cloudflared"
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
  exit 1
fi

# 앱이 켜져 있어야 터널이 의미가 있다
if ! curl -s -o /dev/null --max-time 3 "http://localhost:$PORT/"; then
  echo "  [!] $PORT 번 포트에서 앱이 응답하지 않습니다."
  echo ""
  echo "      먼저 '시작하기' 를 실행해 앱을 켠 뒤,"
  echo "      이 파일을 다시 실행해 주세요."
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
  exit 1
fi

LOG="data/tunnel.log"
CONF="data/tunnel-config.yml"
mkdir -p data
: > "$LOG"

# cloudflared 는 아무 설정도 안 주면 ~/.cloudflared/config.yml 을 자동으로 읽는다.
# 그 파일에 다른 서비스의 ingress 규칙이 있으면 이 터널까지 그 규칙을 따라가
# 모든 요청이 404 로 떨어진다. 그래서 이 앱 전용 빈 설정을 만들어 넘긴다.
printf 'no-autoupdate: true\n' > "$CONF"

echo "  주소를 만드는 중입니다. 10초쯤 걸립니다..."
echo ""

cloudflared --config "$CONF" tunnel --url "http://localhost:$PORT" > "$LOG" 2>&1 &
CF_PID=$!
trap 'kill "$CF_PID" 2>/dev/null' EXIT INT TERM

URL=""
for _ in $(seq 1 60); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  kill -0 "$CF_PID" 2>/dev/null || break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "  [!] 주소를 만들지 못했습니다. 인터넷 연결을 확인해 주세요."
  echo "      자세한 내용은 $LOG 에 적혀 있습니다."
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
  exit 1
fi

echo "  ------------------------------------------------"
echo "   밖에서 접속할 주소 — 참가자에게 알려주세요"
echo ""
echo "     $URL"
echo ""
echo "  ------------------------------------------------"
echo ""

# 카톡에 바로 붙여넣을 수 있게 클립보드에 복사해 둔다
if printf '%s' "$URL" | pbcopy 2>/dev/null; then
  echo "  주소를 복사해 두었습니다. 카톡에 그대로 붙여넣으세요."
  echo ""
fi

echo "  * 이 창을 닫으면 주소가 사라집니다. 쓰는 동안 계속 켜두세요."
echo "  * 껐다 켜면 주소가 매번 새로 바뀝니다."
echo "  * 종료: 이 창을 닫거나 Ctrl+C"
echo ""

wait "$CF_PID"

echo ""
echo "  터널이 종료되었습니다."
read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
