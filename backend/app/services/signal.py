"""个股信号引擎：技术指标 → 结构化结论（建议/依据/价位/置信度）。"""
from __future__ import annotations

from . import kline as kline_svc
from . import indicators as ind

EVIDENCE_LIMIT = 3  # 决策输出规范：依据最多 3 条


async def build_signal(code: str, quote: dict | None = None, bars: list | None = None) -> dict:
    if bars is None:
        try:
            bars = await kline_svc.get_kline(code, "day", 120)
        except Exception:
            bars = []
    if not bars:
        return {"code": code, "available": False, "reason": "K线数据双源均不可用（腾讯/东财暂断连）"}
    tech = ind.compute_all(bars)
    sp = tech["support_pressure"]
    price = quote.get("price") if quote else (bars[-1][2])

    reasons: list[str] = []
    score = 50.0  # 基础分

    # 均线系统
    align = tech.get("ma_alignment")
    ma = tech["ma"]
    if align == "bull":
        score += 12
        reasons.append("均线多头排列（MA5>MA10>MA20）")
    elif align == "bear":
        score -= 12
        reasons.append("均线空头排列（MA5<MA10<MA20）")
    if ma.get("ma5") and price and price > ma["ma5"]:
        score += 4
        reasons.append(f"股价站上 MA5（{ma['ma5']}）")
    elif ma.get("ma5") and price:
        score -= 3

    # MACD
    m = tech["macd"]
    if m.get("cross") == "golden":
        score += 10
        reasons.append("MACD 金叉向上")
    elif m.get("cross") == "dead":
        score -= 10
        reasons.append("MACD 死叉向下")
    elif m.get("trend") == "bull":
        score += 5
    elif m.get("trend") == "bear":
        score -= 5

    # RSI
    rsi6 = tech.get("rsi6")
    if rsi6 is not None:
        if rsi6 >= 80:
            score -= 6
            reasons.append(f"RSI6={rsi6} 超买，短线回调风险")
        elif rsi6 <= 20:
            score += 6
            reasons.append(f"RSI6={rsi6} 超卖，存在修复动能")
        elif 50 <= rsi6 < 70:
            score += 3

    # 量价
    vol = tech["volume"]
    vr = vol.get("vol_ratio_5d")
    q_pct = quote.get("change_pct") if quote else None
    if vr and q_pct is not None:
        if q_pct > 2 and vr > 1.5:
            score += 6
            reasons.append(f"放量上涨（量比5日 {vr}，涨 {q_pct}%）")
        elif q_pct < -2 and vr > 1.5:
            score -= 8
            reasons.append(f"放量下跌（量比5日 {vr}，跌 {abs(q_pct)}%）")

    # KDJ
    k = tech["kdj"]
    if k.get("cross") == "golden":
        score += 4
    elif k.get("cross") == "dead":
        score -= 4

    score = max(2.0, min(98.0, score))

    # 建议
    if score >= 72:
        action = "增持"
    elif score >= 58:
        action = "持有"
    elif score >= 42:
        action = "观望"
    else:
        action = "减持"

    short_comment = _short_comment(align, m, rsi6, vr, q_pct)
    stop_loss = round(sp["support"] * 0.98, 2)
    target = round(sp["pressure"], 2)

    return {
        "code": code,
        "name": (quote or {}).get("name"),
        "available": True,
        "price": price,
        "kline_tail": [
            {"date": b[0], "open": b[1], "close": b[2], "high": b[3], "low": b[4], "volume": b[5]}
            for b in bars[-60:]
        ],
        "short_comment": short_comment,
        "ma": {k2: v for k2, v in ma.items() if not k2.endswith("_prev")},
        "ma_alignment": align,
        "rsi6": rsi6,
        "macd_status": m.get("trend"),
        "macd_cross": m.get("cross"),
        "volume_note": f"量比5日 {vr}" if vr else None,
        "advice": {
            "action": action,
            "confidence": round(score, 0),
            "reasons": reasons[:EVIDENCE_LIMIT],
            "buy_price": sp["support"],
            "stop_loss": stop_loss,
            "target_price": target,
            "support": sp["support"],
            "pressure": sp["pressure"],
            "risk": _top_risk(tech, q_pct),
        },
    }


def _short_comment(align, macd_t, rsi6, vr, pct) -> str:
    if align == "bull" and (macd_t in ("bull", "golden")):
        head = "强势上涨，均线多头排列，短期看涨"
    elif align == "bull":
        head = "趋势偏多，均线多头但动能待确认"
    elif align == "bear" and (macd_t in ("bear", "dead")):
        head = "弱势下行，均线空头排列，短期看跌"
    elif align == "bear":
        head = "趋势偏空，反弹需放量确认"
    else:
        head = "均线纠缠，方向待选择，建议观望"
    tail = ""
    if rsi6 is not None and rsi6 >= 80:
        tail = "，短线超买注意回撤"
    elif rsi6 is not None and rsi6 <= 20:
        tail = "，短线超卖关注修复"
    return head + tail


def _top_risk(tech: dict, pct: float | None) -> str:
    risks = []
    sp = tech["support_pressure"]
    boll = tech["boll"]
    if boll.get("position") is not None and boll["position"] > 90:
        risks.append("价格贴近布林上轨，波动放大风险")
    if pct is not None and pct > 7:
        risks.append("单日涨幅过大，获利盘回吐压力")
    if tech["volume"].get("shrink"):
        risks.append("成交量萎缩，上攻动能不足")
    if not risks:
        risks.append(f"跌破支撑位 {sp['support']} 则形态转弱")
    return risks[0]
