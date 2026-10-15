"""增强功能路由：估值监测 / 全球市场 / 热门个股 / ETF 榜单 / 模拟交易。"""
from fastapi import APIRouter

from .. import db
from ..cache import cache
from ..config import REFRESH_FLOW_TTL
from ..services import enhance, paper
from ..sources import eastmoney as em

router = APIRouter(prefix="/api", tags=["enhance"])


@router.get("/valuation")
async def valuation():
    return await enhance.get_valuation()


@router.get("/global")
async def global_quotes():
    return {"items": await enhance.get_global_quotes()}


@router.get("/hot")
async def hot_stocks():
    return {"items": await enhance.get_hot_stocks()}


@router.get("/index-signals")
async def index_signals():
    return {"signals": await enhance.get_index_signals()}


@router.get("/etf")
async def etf_board():
    """ETF 双榜：涨幅榜 + 主力净流入榜。缓存 60 秒。"""
    cached = cache.get_fresh("etf_board", REFRESH_FLOW_TTL)
    if cached:
        return cached
    gainers, inflow = [], []
    import asyncio
    results = await asyncio.gather(
        em.fetch_etf_board("f3", 1, 20),
        em.fetch_etf_board("f62", 1, 20),
        return_exceptions=True,
    )
    if not isinstance(results[0], Exception):
        gainers = results[0]
    if not isinstance(results[1], Exception):
        inflow = results[1]
    payload = {"gainers": gainers, "inflow": inflow}
    cache.set("etf_board", payload)
    return payload


# ---- 模拟交易（纸面盘） ----

@router.get("/paper/summary")
async def paper_summary():
    from ..services import quotes as quotes_svc
    rows = db.query("SELECT code FROM watchlist")
    quotes: dict = {}
    if rows:
        res = await quotes_svc.get_quotes([r["code"] for r in rows])
        quotes = res["quotes"]
    return paper.summary(quotes)


@router.post("/paper/toggle")
async def paper_toggle(body: dict):
    paper.set_enabled(bool(body.get("enabled")))
    return {"ok": True, "enabled": paper.enabled()}


@router.post("/paper/reset")
async def paper_reset():
    paper.reset()
    return {"ok": True}
