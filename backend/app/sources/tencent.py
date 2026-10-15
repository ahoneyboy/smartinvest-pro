"""腾讯行情：实时报价（qt.gtimg.cn，GBK）+ 日 K 历史（web.ifzq.gtimg.cn）。"""
from __future__ import annotations

from .registry import registry
from . import symbols

SRC = "腾讯行情"


def _parse_one(full_code: str, raw: str) -> dict | None:
    parts = raw.split("~")
    if len(parts) < 46 or not parts[3]:
        return None

    def f(i: int, default=0.0) -> float:
        try:
            return float(parts[i])
        except (ValueError, IndexError):
            return default

    return {
        "code": full_code,
        "symbol": full_code,
        "name": parts[1],
        "price": f(3),
        "prev_close": f(4),
        "open": f(5),
        "volume": f(6),          # 手
        "amount": f(37) * 1e4,   # 元
        "time": parts[30],
        "change": f(31),
        "change_pct": f(32),
        "high": f(33),
        "low": f(34),
        "turnover_rate": f(38),
        "pe": f(39),
        "amplitude": f(43),
        "float_mv": f(44) * 1e8,  # 流通市值（元，原始单位亿）
        "total_mv": f(45) * 1e8,  # 总市值（元，原始单位亿）
        "pb": f(46),
        "limit_up": f(47),
        "limit_down": f(48),
        "volume_ratio": f(49),
        "bid_ask": {
            "b1": [f(9), f(10)], "b2": [f(11), f(12)], "b3": [f(13), f(14)],
            "a1": [f(19), f(20)], "a2": [f(21), f(22)], "a3": [f(23), f(24)],
        },
        "source": SRC,
    }


async def fetch_quotes(codes: list[str]) -> dict[str, dict]:
    """批量实时报价，返回 {full_code: quote}。"""
    fulls = [symbols.full(c) for c in codes]
    if not fulls:
        return {}
    text = await registry.get_text(
        SRC, "实时股价/盘口/分时", f"https://qt.gtimg.cn/q={','.join(fulls)}", encoding="gbk"
    )
    out: dict[str, dict] = {}
    for line in text.strip().split(";"):
        line = line.strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        code = key.replace("v_", "").strip()
        val = val.strip().strip('"')
        q = _parse_one(code, val)
        if q:
            out[code] = q
    return out


async def fetch_kline(code: str, period: str = "day", limit: int = 120, fq: str = "qfq") -> list[list]:
    """日/周/月 K：[date, open, close, high, low, volume, ...]。"""
    m, c = symbols.norm(code)
    full_code = f"{m}{c}"
    pmap = {"day": "day", "week": "week", "month": "month"}
    p = pmap.get(period, "day")
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={full_code},{p},,,{limit},{fq}"
    data = await registry.get_json(SRC, "K 线历史", url)
    d = data.get("data", {}).get(full_code, {})
    rows = d.get(f"{p}") or d.get(f"qfq{p}") or []
    return [
        [r[0], float(r[1]), float(r[2]), float(r[3]), float(r[4]), float(r[5])]
        for r in rows
    ]
