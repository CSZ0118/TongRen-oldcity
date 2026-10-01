@echo off
REM =====================================================================
REM  Guizhou Long Scroll / TongRen Oldcity  --  local preview launcher
REM
REM  WHY THIS FILE EXISTS
REM    This project uses ES Modules. Under the file:// protocol the browser
REM    blocks js/main.js with a CORS error (origin 'null'), so double
REM    clicking index.html just hangs on the loading screen.
REM    The page MUST be served over http:// -- that is all this file does.
REM
REM  HOW TO USE
REM    Double-click this file. The window IS the server; closing the window
REM    stops it.
REM
REM  WHY THIS FILE IS PURE ASCII
REM    cmd.exe parses batch files using the system ANSI code page (GBK on a
REM    Chinese Windows). A UTF-8 Chinese character there gets mis-decoded and
REM    the leftover bytes are then executed as commands, producing a screenful
REM    of "'xxx' is not recognized as an internal or external command" noise.
REM    Keeping this file ASCII-only avoids that entirely. The Chinese
REM    user-facing text is printed by node tools/serve.mjs instead -- Node
REM    uses the Unicode console API on Windows, so it displays correctly.
REM
REM    Chinese explanation: docs/WHY-NOT-FILE.md
REM =====================================================================

cd /d "%~dp0"
title TongRen Oldcity - Local Preview

set "PORT=5173"
set "URL=http://127.0.0.1:%PORT%/"

echo.
echo   ============================================================
echo     Guizhou Long Scroll  -  Local Preview
echo   ============================================================
echo.

where node >nul 2>nul
if not errorlevel 1 goto use_node
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if not errorlevel 1 goto use_python
goto no_runtime


:use_node
call :open_browser
node "tools\serve.mjs" --port %PORT%
goto done


:use_py
echo   Using Python (py). Node.js is recommended instead.
echo   Python's http.server does not support Range requests,
echo   so the video progress bar cannot be dragged.
echo.
call :open_browser
py -m http.server %PORT% --bind 127.0.0.1
goto done


:use_python
echo   Using Python (python). Node.js is recommended instead.
echo   Python's http.server does not support Range requests,
echo   so the video progress bar cannot be dragged.
echo.
call :open_browser
python -m http.server %PORT% --bind 127.0.0.1
goto done


:open_browser
REM Wait 2s for the server to come up, then open the default browser.
REM Set LONGPAN_NO_BROWSER=1 to skip this (used by automated tests).
if defined LONGPAN_NO_BROWSER exit /b 0
start "" /min cmd /c "timeout /t 2 /nobreak >nul && start %URL%"
exit /b 0


:no_runtime
echo   [X] Node.js / Python not found on this computer.
echo.
echo   Pick one of these:
echo.
echo     1. Install Node.js (recommended), then double-click this file again
echo        https://nodejs.org/
echo.
echo     2. In VS Code, install the "Live Server" extension, then
echo        right-click index.html  -  "Open with Live Server"
echo.
echo   3. Use the online version (after GitHub Pages is enabled):
echo        https://csz0118.github.io/TongRen-oldcity/
echo.
echo   Do NOT double-click index.html directly - it will NOT work.
echo   Reason: docs/WHY-NOT-FILE.md
echo.
pause
goto done


:done