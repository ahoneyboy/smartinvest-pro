"""策略选股引擎（借鉴 InStock/qstock 思路）+ 财经事件日历（解禁/新股）。"""
from __future__ import annotations

import asyncio

from ..cache import cache
from ..sources import eastmoney as em
from ..sources import tencent
from ..sources.symbols import full
from . import indicators as ind
from . import kline as kline_svc

SNAPSHOT_SIZE = 220     # 主力净流入排行快照数量
KLINE_POOL = 110        # 需要算 K 线的候选池
CONCURRENCY = 12

STRATEGIES = {
    "volume_up": "放量上涨",
    "ma_bull": "均线多头",
    "oversold": "超跌反弹",
    "breakout": "强势突破",
    "main_inflow": "主力抢筹",
    "pattern": "K线形态",
}


async def _snapshot() -> tuple[list[dict], str]:
    cached = cache.get_fresh("screener_snapshot", 300)
    if cached:
        return cached  # 缓存的是 (rows, source) 二元组
    rows = []
    try:
        rows = await em.fetch_stock_flow_rank(pz=SNAPSHOT_SIZE, po=1)
    except Exception:
        rows = []
    source = "东财主力净流入 TOP220"
    if not rows:
        rows = await _sina_snapshot()
        source = "新浪成交额 TOP300（东财断连降级：主力净流入/放量上涨类策略暂不可用）"
    if rows:
        cache.set("screener_snapshot", (rows, source))
    return rows, source


async def _sina_snapshot(pages: int = 3, num: int = 100) -> list[dict]:
    """新浪沪深 A 股按成交额降序列表（东财断连时的选股快照降级源）。"""
    from ..sources.registry import registry
    out: list[dict] = []
    for pg in range(1, pages + 1):
        url = (
            "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/"
            f"Market_Center.getHQNodeData?page={pg}&num={num}&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=page"
        )
        try:
            data = await registry.get_json("新浪行情", "A股活跃股列表", url,
                                           headers={"Referer": "https://finance.sina.com.cn"})
        except Exception:
            break
        if not data:
            break
        for r in data:
            try:
                out.append({
                    "code": str(r.get("code") or ""),
                    "name": r.get("name"),
                    "price": float(r.get("trade") or 0),
                    "change_pct": float(r.get("changepercent") or 0),
                    "main_inflow": 0.0,
                    "inflow_pct": 0.0,
                })
            except (TypeError, ValueError):
                continue
    return out


_bars_lock = asyncio.Lock()


async def _bars_map(codes: list[str]) -> dict[str, list[list]]:
    """批量拉日 K（120 根），带进程内缓存。"""
    async with _bars_lock:
        cached = cache.get_fresh("screener_bars", 600)
    if cached:
        return cached

    sem = asyncio.Semaphore(CONCURRENCY)

    async def one(code: str) -> tuple[str, list[list]]:
        async with sem:
            try:
                return code, await kline_svc.get_kline(code, "day", 120)
            except Exception:
                return code, []

    pairs = await asyncio.gather(*[one(c) for c in codes])
    bars = {c: b for c, b in pairs if b}
    cache.set("screener_bars", bars)
    return bars


async def _quotes_map(codes: list[str]) -> dict[str, dict]:
    try:
        return await tencent.fetch_quotes(codes)
    except Exception:
        return {}


def _pick_bars(snapshot: list[dict]) -> list[str]:
    """K 线候选池：净流入前列 + 全部快照中涨幅居中的（覆盖超跌股）。"""
    by_inflow = [s["code"] for s in snapshot[:KLINE_POOL]]
    oversold = [s["code"] for s in sorted(snapshot, key=lambda x: x["change_pct"])[:40]]
    seen, pool = set(), []
    for c in by_inflow + oversold:
        if c not in seen:
            seen.add(c)
            pool.append(c)
    return pool


async def run_strategy(key: str) -> dict:
    if key not in STRATEGIES:
        return {"strategy": key, "name": "未知策略", "items": [], "note": "未知策略"}
    cached = cache.get_fresh(f"strategy_{key}", 600)
    if cached:
        return cached

    snapshot, snap_source = await _snapshot()
    if not snapshot:
        return {"strategy": key, "name": STRATEGIES[key], "items": [], "note": "选股快照不可用（东财/新浪均断连，稍后重试）"}

    need_bars = key in ("ma_bull", "oversold", "breakout", "pattern")
    bars_task = _bars_map(_pick_bars(snapshot)) if need_bars else _async_noop()
    quotes_task = _quotes_map([s["code"] for s in snapshot[:80]])
    bars, quotes = await asyncio.gather(bars_task, quotes_task)

    items: list[dict] = []
    if key == "volume_up":
        for s in snapshot:
            q = quotes.get(full(s["code"])) or {}
            vr = q.get("volume_ratio") or 0
            if 2 <= s["change_pct"] <= 9.5 and (vr or 0) >= 1.5 and s["main_inflow"] > 0:
                items.append({"code": full(s["code"]), "name": s["name"], "price": s["price"],
                              "change_pct": s["change_pct"],
                              "evidence": [f"涨 {s['change_pct']:.1f}%", f"量比 {vr}", f"主力净流入 {s['main_inflow']/1e8:.1f} 亿"]})
    elif key == "main_inflow":
        for s in snapshot:
            if s.get("inflow_pct", 0) >= 8 and 0 <= s["change_pct"] <= 5:
                items.append({"code": full(s["code"]), "name": s["name"], "price": s["price"],
                              "change_pct": s["change_pct"],
                              "evidence": [f"主力净流入占比 {s['inflow_pct']:.1f}%",
                                           f"净流入 {s['main_inflow']/1e8:.1f} 亿",
                                           f"涨幅 {s['change_pct']:+.1f}%（尚未大涨）"]})
    elif key == "ma_bull":
        for s in snapshot:
            b = bars.get(s["code"])
            if not b:
                continue
            t = ind.compute_all(b)
            ma = t["ma"]
            close = b[-1][2]
            if (t.get("ma_alignment") == "bull" and ma.get("ma5") and close > ma["ma5"]
                    and (t["macd"] or {}).get("trend") in ("bull", "golden")):
                items.append({"code": full(s["code"]), "name": s["name"], "price": close,
                              "change_pct": s["change_pct"],
                              "evidence": ["MA5>MA10>MA20 多头排列", f"收盘 {close} 站上 MA5 {ma['ma5']}",
                                           f"MACD {(t['macd'] or {}).get('trend') == 'golden' and '金叉' or '多头'}"]})
    elif key == "oversold":
        for s in snapshot:
            b = bars.get(s["code"])
            if not b or len(b) < 25:
                continue
            chg20 = (b[-1][2] / b[-21][2] - 1) * 100
            t = ind.compute_all(b)
            if chg20 <= -12 and s["change_pct"] > 0.5 and (t.get("rsi6") or 100) < 32:
                items.append({"code": full(s["code"]), "name": s["name"], "price": b[-1][2],
                              "change_pct": s["change_pct"],
                              "evidence": [f"20 日累计跌 {chg20:.1f}%", f"RSI6 {t['rsi6']} 超卖",
                                           f"今日反弹 +{s['change_pct']:.1f}%"]})
    elif key == "pattern":
        for s in snapshot:
            b = bars.get(s["code"])
            if not b:
                continue
            hit = _detect_patterns(b)
            if hit:
                items.append({"code": full(s["code"]), "name": s["name"], "price": b[-1][2],
                              "change_pct": s["change_pct"],
                              "evidence": [f"形态「{hit[0]}」"] + hit[1]})
    elif key == "breakout":
        for s in snapshot:
            b = bars.get(s["code"])
            if not b or len(b) < 60:
                continue
            prev_high = max(x[3] for x in b[-61:-1])
            close = b[-1][2]
            q = quotes.get(full(s["code"])) or {}
            vr = q.get("volume_ratio") or 0
            if close >= prev_high * 0.985 and 2 <= s["change_pct"] <= 10.6 and vr >= 1.2:
                items.append({"code": full(s["code"]), "name": s["name"], "price": close,
                              "change_pct": s["change_pct"],
                              "evidence": [f"突破 60 日高点 {prev_high:.2f}", f"量比 {vr}",
                                           f"主力净流入 {s['main_inflow']/1e8:.1f} 亿"]})

    items = items[:15]
    payload = {"strategy": key, "name": STRATEGIES[key], "items": items,
               "note": f"数据池：{snap_source} + 腾讯日K，收盘口径，仅供研究"}
    cache.set(f"strategy_{key}", payload)
    return payload




def _detect_patterns(bars: list[list]) -> tuple[str, list[str]] | None:
    """单只股票 K 线形态识别，返回 (形态名, 依据) 或 None。基于最近 3 根已收 K 线。"""
    if len(bars) < 5:
        return None
    o1, c1, h1, l1 = bars[-3][1], bars[-3][2], bars[-3][3], bars[-3][4]
    o2, c2, h2, l2 = bars[-2][1], bars[-2][2], bars[-2][3], bars[-2][4]
    o0, c0, h0, l0 = bars[-1][1], bars[-1][2], bars[-1][3], bars[-1][4]
    body1, body2, body0 = abs(c1 - o1), abs(c2 - o2), abs(c0 - o0)
    rng1, rng2 = h1 - l1 or 1e-9, h2 - l2 or 1e-9
    lower2 = min(o2, c2) - l2
    lower0 = min(o0, c0) - l0
    upper0 = h0 - max(o0, c0)
    trend_down = bars[-8][2] > bars[-2][2]  # 前期处于下跌

    # 早晨之星：长阴 + 跳空/低开小实体 + 阳线收复
    if trend_down and body1 / rng1 > 0.5 and c1 < o1 and body2 / rng2 < 0.35 and c0 > o0 and c0 > (o1 + c1) / 2:
        return "早晨之星", [f"前日长阴（实体 {body1/rng1*100:.0f}%）", "次日小实体止跌", "今日阳线收复阴线中位"]
    # 看涨吞没：阴线后阳线实体完全包住前阴
    if trend_down and c1 < o1 and c0 > o0 and c0 >= o1 and o0 <= c1 and body0 > body1:
        return "看涨吞没", [f"今日阳线实体 {body0:.2f} 完全包住前日阴线 {body1:.2f}", "出现在下跌末端"]
    # 锤头线：下跌后长下影小实体
    if trend_down and lower0 > body0 * 2 and upper0 < body0 and body0 / (h0 - l0 or 1e-9) < 0.35:
        return "锤头线", [f"下影线 {lower0:.2f} 超实体 2 倍", "下跌末端出现，等待确认"]
    # 双针探底：连续两根长下影
    if trend_down and lower2 > body2 * 1.8 and lower0 > body0 * 1.8:
        return "双针探底", [f"连续两日长下影（{lower2:.2f} / {lower0:.2f}）", "底部支撑区反复确认"]
    return None

async def _async_noop():
    return {}


# ---- 财经事件日历 ----

def _dc_url(report: str, flt: str, sort: str, size: int = 12) -> str:
    return (
        "https://datacenter-web.eastmoney.com/api/data/v1/get"
        f"?reportName={report}&columns=ALL&source=WEB&sortColumns={sort}&sortTypes=1"
        f"&pageSize={size}&pageNumber=1&filter={flt}"
    )


async def _lift_stocks(today: str) -> list[dict]:
    url = _dc_url("RPT_LIFT_STAGE", f"(FREE_DATE>='{today}')", "FREE_DATE", 12)
    try:
        data = await em.registry.get_json("东方财富", "限售解禁日历", url)
        rows = (data.get("result") or {}).get("data") or []
    except Exception:
        return []
    out = []
    for d in rows:
        out.append({
            "code": d.get("SECURITY_CODE"),
            "name": d.get("SECURITY_NAME_ABBR"),
            "date": (d.get("FREE_DATE") or "")[:10],
            "cap_yi": round(d["ALIFT_MARKET_CAP"] / 1e4, 2) if d.get("ALIFT_MARKET_CAP") else None,  # 本次解禁市值（万元→亿）
            "type": d.get("FREE_SHARES_TYPE"),
            "kind": "解禁",
        })
    return out


async def _ipo_list(today: str) -> list[dict]:
    url = _dc_url("RPTA_APP_IPOAPPLY", f"(APPLY_DATE>='{today}')", "APPLY_DATE", 12)
    try:
        data = await em.registry.get_json("东方财富", "新股申购日历", url)
        rows = (data.get("result") or {}).get("data") or []
    except Exception:
        return []
    out = []
    for d in rows:
        out.append({
            "code": d.get("SECURITY_CODE"),
            "name": d.get("SECURITY_NAME_ABBR") or d.get("SECURITY_NAME") or d.get("SECUCODE"),
            "date": (d.get("APPLY_DATE") or "")[:10],
            "price": d.get("ISSUE_PRICE"),
            "listing": (d.get("LISTING_DATE") or "")[:10] or None,
            "kind": "新股申购",
        })
    return out


async def event_calendar() -> dict:
    today = datetime_today()
    lift, ipo = await asyncio.gather(_lift_stocks(today), _ipo_list(today))
    events = sorted(lift + ipo, key=lambda x: x["date"])[:14]
    return {"events": events, "lift_count": len(lift), "ipo_count": len(ipo)}


def datetime_today() -> str:
    from datetime import datetime as dt
    return dt.now().strftime("%Y-%m-%d")


async def _all_stocks() -> list[dict]:
    """全 A 股代码/名称表（东财 clist 分页拉取，缓存 6 小时，供本地降级搜索）。"""
    cached = cache.get_fresh("all_stocks", 6 * 3600)
    if cached:
        return cached
    out: list[dict] = []
    for pn in range(1, 8):
        url = (
            f"https://push2delay.eastmoney.com/api/qt/clist/get?fid=f3&po=1&pz=800&pn={pn}"
            f"&np=1&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14"
        )
        try:
            data = await em.registry.get_json("东方财富", "全A名称表", url)
        except Exception:
            break
        rows = (data.get("data") or {}).get("diff") or []
        out += [{"code": ("sh" if str(r.get("f12", "")).startswith("6") else "sz") + str(r.get("f12")),
                 "name": r.get("f14")} for r in rows if r.get("f12")]
        total = (data.get("data") or {}).get("total") or 0
        if len(out) >= total or not rows:
            break
    cache.set("all_stocks", out)
    return out


async def search_suggest(q: str, count: int = 8) -> list[dict]:
    """股票名称/拼音/代码模糊搜索：东财 suggest 主路 → 本地名称表降级，绝不抛异常。"""
    import urllib.parse
    from ..sources.registry import registry
    out: list[dict] = []
    try:
        url = ("https://searchapi.eastmoney.com/api/suggest/get"
               f"?input={urllib.parse.quote(q)}&type=14&count={count}")
        data = await registry.get_json("东方财富", "股票搜索建议", url)
        for r in ((data.get("QuotationCodeTable") or {}).get("Data")) or []:
            if r.get("Classify") != "AStock" or "." not in str(r.get("QuoteID") or ""):
                continue
            mkt, pure = str(r["QuoteID"]).split(".", 1)
            out.append({
                "code": f"{'sh' if mkt == '1' else 'sz'}{pure}",
                "name": r.get("Name"),
                "pinyin": r.get("PinYin"),
                "type": r.get("SecurityTypeName"),
            })
    except Exception:
        out = []
    if len(out) >= count:
        return out[:count]
    # 本地降级：名称/代码 前缀优先、包含次之
    try:
        all_stocks = await _all_stocks()
        ql = q.strip().lower()
        starts = [s for s in all_stocks if s["name"].startswith(ql) or s["code"].endswith(ql)]
        contains = [s for s in all_stocks if s not in starts and ql in s["name"]]
        out += [dict(s, type="A股") for s in (starts + contains)][: count - len(out)]
    except Exception:
        pass
    return out[:count]

