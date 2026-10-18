@echo off
rem Starts the dev server even in terminals with a stale PATH (e.g. opened before Node/pnpm were installed).
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
cd /d "%~dp0"
call pnpm.cmd dev %*
