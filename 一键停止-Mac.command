#!/bin/bash
# SmartInvest Pro 停止服务（macOS：双击运行）
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

if [ -f logs/server.pid ]; then
  kill "$(cat logs/server.pid)" 2>/dev/null
  rm -f logs/server.pid
fi

if pkill -f "uvicorn app.main:app" 2>/dev/null; then
  echo "[SmartInvest Pro] 已停止"
else
  echo "[SmartInvest Pro] 服务未在运行"
fi

sleep 1
if curl -s -m 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  echo "注意：端口 8000 仍被占用，可能有其他进程，请手动检查"
else
  echo "端口 8000 已释放"
fi
