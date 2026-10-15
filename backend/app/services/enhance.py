"""增强功能服务：估值监测、全球市场、热门个股、指数技术信号。"""
from __future__ import annotations

import asyncio

from ..cache import cache
from ..sources import danjuan
from ..sources import eastmoney as em
from ..sources import tencent
from ..sources.symbols import full
from . import indicators as ind
from . import kline as kline_svc

CORE_KEYWORDS = ("沪深300", "上证50", "中证500", "中证1000", "创业板", "科创50",
                 "半导体", "人工智能", "机器人", "证券", "医药", "消费", "科技",
                 "新能源", "军工", "银行", "芯片", "光伏")


async def get_valuation() -> dict:
    """指数估值分位聚合：高位提醒 / 低位机会 / 重点指数。缓存 1 小时。"""
    cached = cache.get_fresh("valuation", 3600)
    if cached:
        return cached
    try:
        items = await danjuan.fetch_valuation()
    except Exception:
        items = []
    high = [x for x in items if x["level"] == "high"]
    low = [x for x in items if x["level"] == "low"]
    core = [x for x in items if any(k in (x["name"] or "") for k in CORE_KEYWORDS)][:14]
    payload = {
        "items": items,
        "core": core,
        "high": high[:10],
        "low": list(reversed(low))[:10],
        "count": len(items),
        "updated_at": _now(),
    }
    cache.set("valuation", payload)
    return payload


async def get_global_quotes() -> list[dict]:
    """全球市场（海外指数/美元/黄金/原油）+ sparkline。缓存 30 秒。"""
    cached = cache.get_fresh("global_snapshot", 30)
    if cached:
        return cached
    try:
        rows = await em.fetch_overseas_snapshot()
    except Exception:
        rows = []

    async def spark(secid: str) -> list[float]:
        try:
            tr = await em.fetch_trends(secid, 1)
            return [x[1] for x in tr[-64:]] if tr else []
        except Exception:
            return []

    if rows:
        sparks = await asyncio.gather(*[spark(r["secid"]) for r in rows])
        for r, sp in zip(rows, sparks):
            r["sparkline"] = sp
    cache.set("global_snapshot", rows)
    return rows


async def get_hot_stocks(pz: int = 6) -> list[dict]:
    """人气榜 TOP（热度排名 + 实时行情）。缓存 60 秒。"""
    cached = cache.get_fresh("hot_stocks", 60)
    if cached:
        return cached
    try:
        ranks = await em.fetch_popularity(pz)
    except Exception:
        ranks = []
    if not ranks:
        return []
    try:
        q_res = await tencent.fetch_quotes([r["code"] for r in ranks])
    except Exception:
        q_res = {}
    out = []
    for r in ranks:
        q = q_res.get(full(r["code"]))
        if not q:
            continue
        out.append({
            "rank": r["rank"],
            "code": full(r["code"]),
            "name": q.get("name"),
            "price": q.get("price"),
            "change_pct": q.get("change_pct"),
        })
    cache.set("hot_stocks", out)
    return out


async def get_index_signals(codes: list[str] | None = None) -> dict:
    """主要指数技术信号（MA 排列/MACD/RSI6）。缓存 5 分钟。"""
    cached = cache.get_fresh("index_signals", 300)
    if cached:
        return cached
    codes = codes or ["sh000001", "sz399001", "sz399006", "sh000300", "sh000688"]

    async def one(code: str) -> tuple[str, dict]:
        try:
            bars = await kline_svc.get_kline(code, "day", 60)
            if not bars:
                return code, {}
            t = ind.compute_all(bars)
            return code, {
                "ma_alignment": t.get("ma_alignment"),
                "rsi6": t.get("rsi6"),
                "macd_trend": (t.get("macd") or {}).get("trend"),
                "ma5": t.get("ma", {}).get("ma5"),
            }
        except Exception:
            return code, {}

    results = await asyncio.gather(*[one(c) for c in codes])
    payload = {c: s for c, s in results}
    cache.set("index_signals", payload)
    return payload


def _now() -> str:
    from .. import db
    return db.now_str()
