"""行情聚合服务：腾讯为主源，新浪交叉校验，偏差 >0.5% 告警；失败自动降级。"""
from __future__ import annotations

from .. import config
from ..cache import cache
from ..sources import sina, tencent
from . import kline as kline_svc
from ..sources.registry import registry


async def get_quotes(codes: list[str], cross_check: bool = True) -> dict:
    """返回 {full_code: quote}，附 cross_check 告警与降级信息。"""
    if not codes:
        return {"quotes": {}, "alerts": [], "degraded": False}
    quotes: dict[str, dict] = {}
    alerts: list[str] = []
    degraded = False
    try:
        quotes = await tencent.fetch_quotes(codes)
    except Exception:
        degraded = True  # 主源失败 → 新浪降级
    if degraded or len(quotes) < len(codes):
        try:
            sina_quotes = await sina.fetch_quotes(codes)
            for k, v in sina_quotes.items():
                if k not in quotes:
                    quotes[k] = v
                    alerts.append(f"{k} 使用新浪备用源")
        except Exception:
            pass
    if cross_check and not degraded:
        try:
            sina_quotes = await sina.fetch_quotes(codes)
            for k, v in sina_quotes.items():
                tq = quotes.get(k)
                if tq and v.get("price") and tq.get("price"):
                    dev = abs(v["price"] - tq["price"]) / tq["price"]
                    if dev > config.CROSS_CHECK_THRESHOLD:
                        alerts.append(
                            f"{k} 腾讯({tq['price']}) 与新浪({v['price']}) 偏差 {dev*100:.2f}%，已触发校验告警"
                        )
                        tq["cross_check_dev"] = round(dev * 100, 3)
        except Exception:
            pass
    return {"quotes": quotes, "alerts": alerts, "degraded": degraded}


async def get_index_quotes() -> list[dict]:
    """指数行情（东财 ulist：含涨跌家数广度）+ 分时 sparkline；东财失败降级腾讯。"""
    cached = cache.get_fresh("index_snapshot", config.REFRESH_INDEX_TTL)
    if cached:
        return cached
    from ..sources import eastmoney as em

    rows: list[dict] = []
    try:
        rows = await em.fetch_index_snapshot()
    except Exception:
        rows = []

    if rows:
        import asyncio

        _SECID_TO_TENCENT = {
            "1.000001": "sh000001", "0.399001": "sz399001", "0.399006": "sz399006",
            "1.000300": "sh000300", "1.000688": "sh000688",
        }

        async def spark(secid: str):
            try:
                tr = await em.fetch_trends(secid, 1)
                if tr:
                    return [x[1] for x in tr[-64:]]
            except Exception:
                pass
            tc = _SECID_TO_TENCENT.get(secid)
            if tc:
                try:
                    bars = await kline_svc.get_kline(tc, "day", 32)
                    return [b[2] for b in bars]
                except Exception:
                    return []
            return []

        results = await asyncio.gather(*[spark(r["secid"]) for r in rows])
        for r, sp in zip(rows, results):
            r["sparkline"] = sp
    else:
        rows = await _index_fallback_tencent()
    cache.set("index_snapshot", rows)
    return rows


_TENCENT_INDEXES = [
    ("sh000001", "上证指数"), ("sz399001", "深证成指"), ("sz399006", "创业板指"),
    ("sh000300", "沪深300"), ("sh000688", "科创50"),
]


async def _index_fallback_tencent() -> list[dict]:
    """降级：腾讯行情（无广度数据，up/down 记 0，前端标注非广度来源）。"""
    import asyncio

    try:
        quotes = await tencent.fetch_quotes([c for c, _ in _TENCENT_INDEXES])
    except Exception:
        return []

    async def spark(code: str) -> list[float]:
        try:
            bars = await kline_svc.get_kline(code, "day", 32)
            return [b[2] for b in bars]
        except Exception:
            return []

    sparks = await asyncio.gather(*[spark(c) for c, _ in _TENCENT_INDEXES])
    out = []
    for (code, name), sp in zip(_TENCENT_INDEXES, sparks):
        q = quotes.get(code)
        if not q:
            continue
        out.append({
            "secid": code, "code": code, "name": name,
            "price": q["price"], "change_pct": q["change_pct"], "change": q["change"],
            "up_count": 0, "down_count": 0,
            "sparkline": sp,
            "degraded_source": "腾讯行情(降级)",
        })
    return out


async def get_source_status() -> list[dict]:
    return registry.all()
