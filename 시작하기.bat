@echo off
chcp 65001 > nul
title ICCA 백두산 여행 앱
cd /d "%~dp0"

echo.
echo   ================================================
echo    ICCA 산악회 백두산 여행 앱
echo   ================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [!] Node.js 가 설치되어 있지 않습니다.
  echo.
  echo       https://nodejs.org 에서 LTS 버전을 설치한 뒤
  echo       이 파일을 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   처음 실행이라 필요한 파일을 받는 중입니다.
  echo   1~2분 걸립니다. 잠시만 기다려 주세요...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   [!] 설치에 실패했습니다. 인터넷 연결을 확인해 주세요.
    pause
    exit /b 1
  )
  echo.
)

echo   서버를 시작합니다. 브라우저가 자동으로 열립니다.
echo   이 검은 창을 닫으면 앱이 종료됩니다.
echo.

set OPEN_BROWSER=1
node server/index.js

echo.
echo   서버가 종료되었습니다.
pause
