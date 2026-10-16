@echo off
rem Opens the TV screen in Microsoft Edge, fullscreen, on the SECOND screen (the TV),
rem with sound allowed to play by itself. If it opens on the wrong screen,
rem press Windows+Shift+Right Arrow to move it, then press F11.
cd /d "%~dp0"
set TVX=1920
start "" msedge --user-data-dir="%~dp0.browser-tv" --no-first-run --autoplay-policy=no-user-gesture-required --window-position=%TVX%,0 --start-fullscreen --app=http://localhost:3000/tv
