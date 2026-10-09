@echo off
REM ===========================================================================
REM  tv.cmd - run project tooling on this machine.
REM
REM  This machine has no system-wide Node.js on PATH. DSH Desktop ships a Node
REM  (v24) runtime inside its Electron binary and exposes it as a node.cmd shim.
REM  pnpm is provided by DSH too. This wrapper puts both on PATH for the duration
REM  of the call so pnpm run dev / tsc / vite / eslint and the asset tooling all
REM  resolve their interpreters.
REM
REM  Usage:  tools\tv.cmd <command> [args...]
REM     e.g. tools\tv.cmd pnpm run dev
REM          tools\tv.cmd pnpm run build
REM          tools\tv.cmd pnpm run typecheck
REM          tools\tv.cmd node tools\build-brand-assets.cjs
REM
REM  On a normal machine with node on PATH this file is unnecessary: plain
REM  "pnpm install" then "pnpm run dev" works. It exists so the build is
REM  reproducible on this box.
REM ===========================================================================
setlocal EnableDelayedExpansion

set "DSH_RUNTIME=%APPDATA%\DSH Desktop\runtime-commands\generations"
set "DSH_NODE_BIN="
set "DSH_PNPM="

for /d %%G in ("%DSH_RUNTIME%\*") do (
  if exist "%%G\private\node-bin\node.cmd" if not defined DSH_NODE_BIN set "DSH_NODE_BIN=%%G\private\node-bin"
  if exist "%%G\bin\pnpm.cmd" if not defined DSH_PNPM set "DSH_PNPM=%%G\bin\pnpm.cmd"
)

if not defined DSH_NODE_BIN (
  echo [tv] Could not locate the DSH Node runtime under "%DSH_RUNTIME%".
  echo [tv] Install Node.js and run the command directly instead.
  exit /b 127
)

set "PATH=%DSH_NODE_BIN%;%PATH%"

if /i "%~1"=="pnpm" (
  if not defined DSH_PNPM (
    echo [tv] Could not locate the DSH pnpm launcher.
    exit /b 127
  )
  "!DSH_PNPM!" %2 %3 %4 %5 %6 %7 %8 %9
  exit /b !errorlevel!
)

%*
exit /b %errorlevel%
