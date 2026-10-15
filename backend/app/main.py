"""SmartInvest Pro 后端入口。

- 启动共享 HTTP 客户端与 SQLite
- 挂载全部 API 路由 + 前端静态构建产物
- 后台任务：交易日 15:05 后自动生成当日复盘
"""
import asyncio
import contextlib
import os
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, db
from .routers import ai, arisk, enhance, lab, misc, quotes, review, sector, system, watchlist
from .sources.registry import registry

app = FastAPI(title="SmartInvest Pro API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(quotes.router)
app.include_router(watchlist.router)
app.include_router(review.router)
app.include_router(ai.router)
app.include_router(sector.router)
app.include_router(misc.router)
app.include_router(enhance.router)
app.include_router(arisk.router)
app.include_router(lab.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "time": db.now_str(), "llm": (await _llm_state())}


async def _llm_state():
    from .services.llm import llm_info
    return llm_info()


async def _auto_review_loop():
    """交易日 15:05 后每小时检查一次，自动生成当日复盘存档。"""
    from .services.review import build_review, latest_trade_date

    while True:
        try:
            now = datetime.now()
            if now.weekday() < 5 and (now.hour, now.minute) >= (15, 5):
                trade_date = await latest_trade_date()
                row = db.query("SELECT 1 FROM review_cache WHERE date=?", (trade_date,))
                if not row:
                    with contextlib.suppress(Exception):
                        await build_review(trade_date)
        except Exception:  # noqa: BLE001
            pass
        await asyncio.sleep(1800)


@app.on_event("startup")
async def startup():
    db.init()
    await registry.start()
    app.state.review_task = asyncio.create_task(_auto_review_loop())


@app.on_event("shutdown")
async def shutdown():
    app.state.review_task.cancel()
    await registry.stop()


# 前端构建产物（Docker/单进程部署时直接托管，SPA 路由回退到 index.html）
_dist = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend", "dist")
if os.path.isdir(_dist):
    from fastapi.responses import FileResponse

    if os.path.isdir(os.path.join(_dist, "assets")):
        app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        candidate = os.path.normpath(os.path.join(_dist, full_path))
        if full_path and candidate.startswith(_dist) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist, "index.html"))

