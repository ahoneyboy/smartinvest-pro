#!/bin/bash
# SmartInvest Pro 一键启动（macOS：双击运行）
# 无需预装 Python：优先用系统 Python；没有则自动下载便携版 Python 运行时（免安装、免管理员权限）
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1
URL="http://127.0.0.1:8000"
RTAG="20260901"          # python-build-standalone 版本标签
RVER="3.11.16"

log() { echo "[SmartInvest Pro] $1"; }

mkdir -p logs

# 0) 已在运行 → 直接打开
if curl -s -m 2 "$URL/api/health" 2>/dev/null | grep -q '"ok"'; then
  log "服务已在运行，直接打开浏览器 → $URL"
  open "$URL"
  exit 0
fi

VPY="backend/.venv/bin/python"

# 1) 准备 Python 解释器（已有 venv → 系统 Python → 便携运行时）
if [ ! -x "$VPY" ]; then
  SYS_PY=""
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1; then SYS_PY="$c"; break; fi
  done

  if [ -n "$SYS_PY" ]; then
    log "首次运行：使用系统 $SYS_PY 创建虚拟环境..."
    "$SYS_PY" -m venv backend/.venv \
      || { log "创建虚拟环境失败（macOS 可先在终端执行 xcode-select --install）"; exit 1; }
  else
    # 1a) 无系统 Python：下载便携运行时（约 30MB，仅首次）
    case "$(uname -m)" in
      arm64)  RARCH="aarch64-apple-darwin" ;;
      *)      RARCH="x86_64-apple-darwin" ;;
    esac
    ASSET="cpython-${RVER}+${RTAG}-${RARCH}-install_only.tar.gz"
    mkdir -p runtime
    if [ ! -x "runtime/python/bin/python3" ]; then
      log "未检测到 Python，自动下载便携版 Python ${RVER}（约 30MB，仅首次）..."
      ok=0
      for base in "https://github.com/astral-sh/python-build-standalone/releases/download/${RTAG}" "https://gh-proxy.com/https://github.com/astral-sh/python-build-standalone/releases/download/${RTAG}"; do
        curl -L --connect-timeout 10 -m 300 -o runtime/py.tgz "$base/$ASSET" && [ -s runtime/py.tgz ] && ok=1 && break
      done
      [ "$ok" = "1" ] || { log "便携 Python 下载失败，请检查网络后重试"; exit 1; }
      log "解压运行时..."
      tar -xzf runtime/py.tgz -C runtime || { log "解压失败"; exit 1; }
      rm -f runtime/py.tgz
    fi
    log "使用便携 Python 创建虚拟环境..."
    "runtime/python/bin/python3" -m venv backend/.venv \
      || { log "创建虚拟环境失败"; exit 1; }
  fi
fi

# 2) 安装依赖
if ! "$VPY" -c "import fastapi, uvicorn, httpx" >/dev/null 2>&1; then
  log "安装后端依赖（首次约 1 分钟，之后秒启）..."
  "$VPY" -m pip install -q --disable-pip-version-check -r backend/requirements.txt \
    || { log "依赖安装失败，请检查网络后重试"; exit 1; }
fi

# 3) 前端产物（项目已内置 frontend/dist；仅缺失时才需要 Node 构建）
if [ ! -f "frontend/dist/index.html" ]; then
  if command -v npm >/dev/null 2>&1; then
    log "前端产物缺失，使用 npm 构建（首次几分钟）..."
    (cd frontend && npm install --no-fund --no-audit && npm run build) || { log "前端构建失败"; exit 1; }
  else
    log "frontend/dist 缺失且未安装 Node.js，请安装 Node 18+ 后重试"
    exit 1
  fi
fi

# 4) 后台启动服务
log "启动服务..."
(cd backend && exec nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >> ../logs/server.log 2>&1) &
echo $! > logs/server.pid

# 5) 等待就绪后打开浏览器
for i in $(seq 1 30); do
  if curl -s -m 2 "$URL/api/health" 2>/dev/null | grep -q '"ok"'; then
    log "启动成功 ✔ $URL"
    open "$URL"
    log "服务已在后台运行；停止请双击 一键停止-Mac.command（日志见 logs/server.log）"
    exit 0
  fi
  sleep 1
done

log "启动超时，最近日志："
tail -20 logs/server.log
exit 1
