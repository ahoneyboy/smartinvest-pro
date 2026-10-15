"""个股深度分析：技术面 + 资金面 + 基本面 + 综合评分 + 买卖建议。"""
from __future__ import annotations

from ..cache import cache
from ..sources import eastmoney as em
from ..sources import tencent
from . import signal as signal_svc
from .llm import stock_narrative

RATING_BANDS = [(80, "强烈推荐"), (65, "推荐"), (45, "中性"), (0, "回避")]


async def fetch_basic(code: str) -> dict:
    """基本面：东财 push2 stock/get（PE/市净率/营收与利润增速等）。"""
    url = (
        "{host}/api/qt/stock/get?invt=2&fltt=2"
        f"&secid={_secid(code)}"
        "&fields=f57,f58,f43,f162,f163,f164,f167,f168,f183,f184,f185,f186,f187,f116,f117,f92"
    )
    try:
        from ..sources import eastmoney as em
        data = await em._get(url, "基本面数据")
        d = (data.get("data") or {})
    except Exception:
        d = {}

    def f(k, default="—"):
        v = d.get(k)
        if v in (None, "-", ""):
            return default
        try:
            return round(float(v), 2)
        except (TypeError, ValueError):
            return v

    return {
        "name": f("f58", None),
        "pe_ttm": f("f163"),
        "pe_lyr": f("f164"),
        "pb": f("f167"),
        "roe": f("f187") if f("f187") != "—" else "—",  # 毛利率备用位
        "gross_margin": f("f187"),
        "revenue": f("f183"),
        "revenue_yoy": f("f184"),
        "profit": f("f185"),
        "profit_yoy": f("f186"),
        "total_mv": f("f116"),
        "float_mv": f("f117"),
        "bps": f("f92"),
    }


async def analyze(code: str, use_llm: bool = True) -> dict:
    key = f"stock_analysis_{code}"
    cached = cache.get_fresh(key, 60)
    if cached:
        return cached

    import asyncio

    async def safe_flow() -> list[dict]:
        try:
            return await em.fetch_stock_fflow_days(code, 5)
        except Exception:
            return []

    quote_map = await tencent.fetch_quotes([code])
    quote = quote_map.get(_full(code))
    sig_task = signal_svc.build_signal(code, quote)
    flow_task = safe_flow()
    basic_task = fetch_basic(code)
    sig, flow_days, basic = await asyncio.gather(sig_task, flow_task, basic_task)

    if not sig.get("available"):
        return {"code": code, "available": False, "reason": sig.get("reason", "数据缺失")}

    tech = sig
    flow_5d = sum(x["main"] for x in flow_days[-5:]) if flow_days else 0.0
    flow_degraded = not flow_days
    super_5d = sum(x["super"] for x in flow_days[-5:]) if flow_days else 0.0
    large_single_pct = 0.0
    if flow_days:
        day = flow_days[-1]
        denom = abs(day["main"]) + abs(day["medium"]) + abs(day["small"])
        large_single_pct = abs(day["super"] + day["large"]) / denom * 100 if denom else 0.0

    score = float(tech["advice"]["confidence"])
    if flow_5d > 0:
        score = min(98, score + 8)
        cap_note = f"近5日主力净流入 {flow_5d/1e8:.2f} 亿"
    elif flow_5d < 0:
        score = max(2, score - 8)
        cap_note = f"近5日主力净流出 {abs(flow_5d)/1e8:.2f} 亿"
    else:
        cap_note = "近5日主力资金平衡"

    rating = next(r for th, r in RATING_BANDS if score >= th)
    adv = tech["advice"]

    result = {
        "code": code,
        "available": True,
        "name": quote.get("name") if quote else basic.get("name"),
        "price": quote.get("price") if quote else tech.get("price"),
        "change_pct": quote.get("change_pct") if quote else None,
        "generated_at": _now(),
        "technical": {
            "kline": tech.get("kline_tail") or [],
            "ma": tech.get("ma"),
            "ma_alignment": tech.get("ma_alignment"),
            "macd": tech.get("macd"),
            "kdj": tech.get("kdj"),
            "rsi6": tech.get("rsi6"),
            "rsi12": tech.get("rsi12"),
            "boll": tech.get("boll"),
            "volume": tech.get("volume"),
        },
        "capital": {
            "flow_days": flow_days,
            "main_5d": flow_5d,
            "super_5d": super_5d,
            "large_single_pct": round(large_single_pct, 1),
            "note": "资金流数据源暂不可用" if flow_degraded else cap_note,
        },
        "fundamental": basic,
        "score": round(score, 0),
        "rating": rating,
        "advice": adv,
        "risk": {
            "pressure": adv["pressure"],
            "support": adv["support"],
            "stop_loss": adv["stop_loss"],
            "top_risk": adv["risk"],
        },
        "llm_comment": None,
    }

    if use_llm:
        result["llm_comment"] = await stock_narrative({
            "code": code, "name": result["name"], "price": result["price"],
            "ma": tech.get("ma"), "ma_alignment": tech.get("ma_alignment"),
            "macd": {k: tech["macd"].get(k) for k in ("dif", "dea", "hist", "trend")} if tech.get("macd") else None,
            "rsi6": tech.get("rsi6"), "boll_position": (tech.get("boll") or {}).get("position"),
            "score": result["score"], "rating": rating,
            "capital_note": cap_note, "advice": adv,
            "fundamental": {k: basic.get(k) for k in ("pe_ttm", "pb", "revenue_yoy", "profit_yoy", "net_margin")},
        })

    cache.set(key, result)
    return result


def _secid(code: str) -> str:
    from ..sources.symbols import em_secid
    return em_secid(code)


def _full(code: str) -> str:
    from ..sources.symbols import full
    return full(code)



def _now() -> str:
    from .. import db
    return db.now_str()
