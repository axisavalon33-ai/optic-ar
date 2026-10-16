@echo off
chcp 65001 >nul
title Time is Brain - game server (keep this window open)
mode con: cols=110 lines=45 >nul 2>nul
color 1F
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed on this laptop.
  echo   Install the "LTS" version from https://nodejs.org and then double-click start.bat again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\socket.io\package.json" (
  echo.
  echo   FIRST TIME SET-UP: installing the game. This needs internet and takes about 1 minute...
  echo.
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   Install FAILED. Check the internet connection and double-click start.bat again.
    pause
    exit /b 1
  )
)

rem Open the host panel in the browser a few seconds after the server starts
start "" cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:3000/host"

:run
node server.js
if errorlevel 2 goto end
echo.
echo   The game stopped unexpectedly. Restarting in 3 seconds... (close this window to stop)
timeout /t 3 /nobreak >nul
goto run

:end
pause
