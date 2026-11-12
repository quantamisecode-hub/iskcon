@echo off
REM =============================================================
REM Development launcher.
REM All secrets (DATABASE_URL etc.) come from backend/.env,
REM which is Git-ignored. Never hard-code credentials here.
REM =============================================================
set NODE_ENV=development
cd /d "%~dp0"
echo Starting server...
.\node_modules\.bin\tsx src\server.ts
