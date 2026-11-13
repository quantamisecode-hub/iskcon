@echo off
title ISKCON Food Inventory System Launcher
echo ====================================================
echo Starting ISKCON Food Inventory System
echo ====================================================

REM 1. Check if MySQL is running on port 3306
powershell -Command "if (!(Test-NetConnection -ComputerName localhost -Port 3306 -InformationLevel Quiet)) { exit 1 }"
if %ERRORLEVEL% NEQ 0 (
    echo [MySQL] MySQL is not running. Starting local XAMPP MySQL...
    start /B "" "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
    timeout /t 3 /nobreak >nul
) else (
    echo [MySQL] MySQL is already running on port 3306.
)

REM 2. Start Backend API in a new window
echo [Backend] Launching backend server on http://localhost:5000 ...
start "Food Inventory - Backend (Port 5000)" cmd /k "cd /d %~dp0backend && npm run dev"

REM 3. Start Frontend in a new window
echo [Frontend] Launching frontend client on http://localhost:5173 ...
start "Food Inventory - Frontend (Port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 4 /nobreak >nul

REM 4. Open in default browser
echo Opening http://localhost:5173 in browser...
start http://localhost:5173

echo.
echo ====================================================
echo System launched successfully!
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo.
echo Admin credentials:
echo   Email:    admin@foodinventory.local
echo   Password: AdminPassword#123
echo.
echo Executor credentials:
echo   Email:    executor@foodinventory.local
echo   Password: ExecutorPassword#123
echo ====================================================
pause

