@echo off
chcp 65001 >nul
title SmartInvest Pro 一键启动
cd /d "%~dp0"
set "URL=http://127.0.0.1:8000"
set "RTAG=20260901"
set "RVER=3.11.16"
if not exist logs mkdir logs

rem ---- 0) 已在运行？直接打开 ----
set "HEALTH="
for /f "delims=" %%h in ('powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health').Content}catch{''}"') do set "HEALTH=%%h"
echo %HEALTH% | findstr /C:"ok" >nul
if %errorlevel%==0 (
  echo [SmartInvest Pro] 服务已在运行，直接打开浏览器：%URL%
  start "" %URL%
  exit /b 0
)

rem ---- 1) 准备 Python 解释器：已有 venv → 系统 Python → 便携运行时 ----
if exist "backend\.venv\Scripts\python.exe" goto HAVE_VENV

set "SYS_PY="
where python >nul 2>nul && set "SYS_PY=python"
if not defined SYS_PY (
  where py >nul 2>nul && set "SYS_PY=py -3"
)
if defined SYS_PY (
  echo [SmartInvest Pro] 首次运行：使用系统 Python 创建虚拟环境...
  %SYS_PY% -m venv "backend\.venv"
  if errorlevel 1 (
    echo [SmartInvest Pro] 创建虚拟环境失败，请确认已安装 Python 3.10+
    pause
    exit /b 1
  )
  goto HAVE_VENV
)

rem ---- 1a) 无系统 Python：自动下载便携版运行时（免安装、免管理员权限） ----
set "RARCH=x86_64-pc-windows-msvc"
for /f %%a in ('powershell -NoProfile -Command "if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {'aarch64-pc-windows-msvc'} else {'x86_64-pc-windows-msvc'}"') do set "RARCH=%%a"
if exist "runtime\python\python.exe" goto RT_READY
if not exist runtime mkdir runtime
echo [SmartInvest Pro] 未检测到 Python，自动下载便携版 Python %RVER%（约 30MB，仅首次）...
set "ASSET=cpython-%RVER%+%RTAG%-%RARCH%-install_only.tar.gz"
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 600 -Uri 'https://github.com/astral-sh/python-build-standalone/releases/download/%RTAG%/%ASSET%' -OutFile 'runtime\py.tgz'; exit 0 } catch { exit 1 }"
if errorlevel 1 goto RT_MIRROR
goto RT_EXTRACT
:RT_MIRROR
echo GitHub 直连失败，尝试镜像下载...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 600 -Uri 'https://gh-proxy.com/https://github.com/astral-sh/python-build-standalone/releases/download/%RTAG%/%ASSET%' -OutFile 'runtime\py.tgz'; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [SmartInvest Pro] 便携 Python 下载失败，请检查网络后重试
  pause
  exit /b 1
)
:RT_EXTRACT
echo [SmartInvest Pro] 解压运行时...
tar -xzf runtime\py.tgz -C runtime
if errorlevel 1 (
  echo [SmartInvest Pro] 解压失败：需要 Windows 10 1803 及以上（内置 tar），或手动解压 runtime\py.tgz 到 runtime\
  pause
  exit /b 1
)
del runtime\py.tgz >nul 2>nul
:RT_READY
echo [SmartInvest Pro] 使用便携 Python 创建虚拟环境...
"runtime\python\python.exe" -m venv "backend\.venv"
if errorlevel 1 (
  echo [SmartInvest Pro] 创建虚拟环境失败
  pause
  exit /b 1
)

:HAVE_VENV
set "VPY=backend\.venv\Scripts\python.exe"
"%VPY%" -c "import fastapi, uvicorn, httpx" >nul 2>nul
if errorlevel 1 (
  echo [SmartInvest Pro] 安装后端依赖（首次约 1 分钟，之后秒启）...
  "%VPY%" -m pip install -q --disable-pip-version-check -r backend\requirements.txt
  if errorlevel 1 (
    echo [SmartInvest Pro] 依赖安装失败，请检查网络后重试
    pause
    exit /b 1
  )
)

rem ---- 2) 前端产物（项目已内置 frontend\dist，缺失时才需要 Node 构建） ----
if not exist "frontend\dist\index.html" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo [SmartInvest Pro] frontend\dist 缺失且未安装 Node.js，无法构建前端
    pause
    exit /b 1
  )
  echo [SmartInvest Pro] 前端产物缺失，使用 npm 构建（首次几分钟）...
  pushd frontend
  call npm install --no-fund --no-audit
  call npm run build
  popd
  if not exist "frontend\dist\index.html" (
    echo [SmartInvest Pro] 前端构建失败
    pause
    exit /b 1
  )
)

rem ---- 3) 后台启动服务（最小化窗口，关闭该窗口即停止服务） ----
echo [SmartInvest Pro] 启动服务...
pushd backend
start "SmartInvest Server（关闭此窗口即停止服务）" /MIN cmd /c ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >> ..\logs\server.log 2>&1"
popd

rem ---- 4) 等待就绪后打开浏览器 ----
set /a TRIES=0
:WAIT
ping -n 2 127.0.0.1 >nul
set "HEALTH="
for /f "delims=" %%h in ('powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%/api/health').Content}catch{''}"') do set "HEALTH=%%h"
echo %HEALTH% | findstr /C:"ok" >nul
if %errorlevel%==0 goto READY
set /a TRIES+=1
if %TRIES% lss 30 goto WAIT

echo [SmartInvest Pro] 启动超时，最近日志：
powershell -NoProfile -Command "if (Test-Path logs\server.log) { Get-Content logs\server.log -Tail 20 }"
pause
exit /b 1

:READY
echo [SmartInvest Pro] 启动成功：%URL%
start "" %URL%
echo 服务已在后台运行（任务栏最小化窗口 SmartInvest Server）；关闭该窗口或运行 一键停止-Windows.bat 可停止服务
ping -n 6 127.0.0.1 >nul
