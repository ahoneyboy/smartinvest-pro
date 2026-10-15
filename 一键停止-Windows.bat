@echo off
chcp 65001 >nul
title SmartInvest Pro 停止服务
cd /d "%~dp0"
set "FOUND=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
  taskkill /F /PID %%p >nul 2>nul && set "FOUND=1"
)
if "%FOUND%"=="1" (
  echo [SmartInvest Pro] 已停止（端口 8000 已释放）
) else (
  echo [SmartInvest Pro] 服务未在运行
)
pause
