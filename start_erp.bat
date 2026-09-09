@echo off
title Trading Engineers ERP Launcher
echo ====================================================
echo Starting Trading Engineers DPR & Payroll System...
echo ====================================================

echo Starting Backend Server on port 5000...
start "Backend Server (Port 5000)" cmd /k "cd /d D:\DPR_TRADING_ENGINEERS\backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Frontend Server on port 5173...
start "Frontend Client (Port 5173)" cmd /k "cd /d D:\DPR_TRADING_ENGINEERS\frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo Opening browser...
start http://localhost:5173/

echo.
echo ====================================================
echo Both servers started!
echo Frontend: http://localhost:5173/
echo Backend:  http://localhost:5000/
echo ====================================================
