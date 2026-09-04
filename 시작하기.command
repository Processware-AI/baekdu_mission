#!/bin/bash
# ICCA 백두산 여행 앱 — macOS 실행 스크립트
# 더블클릭하면 실행됩니다. 이 터미널 창을 닫으면 앱이 종료됩니다.

cd "$(dirname "$0")" || exit 1

echo ""
echo "  ================================================"
echo "   ICCA 산악회 백두산 여행 앱"
echo "  ================================================"
echo ""

if ! command -v node > /dev/null 2>&1; then
  echo "  [!] Node.js 가 설치되어 있지 않습니다."
  echo ""
  echo "      https://nodejs.org 에서 LTS 버전을 내려받아 설치한 뒤"
  echo "      이 파일을 다시 실행해 주세요."
  echo ""
  echo "      (Homebrew 를 쓰신다면:  brew install node)"
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  [!] Node.js 20 이상이 필요합니다. (현재 $(node -v))"
  echo "      https://nodejs.org 에서 LTS 버전으로 업데이트해 주세요."
  echo ""
  read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
  exit 1
fi

# 윈도우에서 복사해 왔다면 node_modules 안의 네이티브 모듈이 맞지 않으므로 다시 설치
NEED_INSTALL=0
[ -d node_modules ] || NEED_INSTALL=1
node -e "require('better-sqlite3')" > /dev/null 2>&1 || NEED_INSTALL=1

if [ "$NEED_INSTALL" -eq 1 ]; then
  echo "  이 맥에 맞게 필요한 파일을 설치하는 중입니다."
  echo "  1~2분 걸립니다. 잠시만 기다려 주세요..."
  echo ""
  rm -rf node_modules
  if ! npm install --no-audit --no-fund; then
    echo ""
    echo "  [!] 설치에 실패했습니다. 인터넷 연결을 확인해 주세요."
    echo ""
    read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
    exit 1
  fi
  echo ""
fi

echo "  서버를 시작합니다. 브라우저가 자동으로 열립니다."
echo "  이 터미널 창을 닫으면 앱이 종료됩니다."
echo ""

export OPEN_BROWSER=1

# caffeinate: 서버가 도는 동안 맥이 잠들지 않게 한다 (참가자 접속이 끊기지 않도록)
if command -v caffeinate > /dev/null 2>&1; then
  caffeinate -is node server/index.js
else
  node server/index.js
fi

echo ""
echo "  서버가 종료되었습니다."
read -n 1 -s -r -p "  아무 키나 누르면 닫힙니다..."
