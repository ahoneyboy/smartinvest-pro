"""新浪行情：用于交叉校验收盘价/涨跌幅（hq.sinajs.cn，GBK，需 Referer）。"""
from __future__ import annotations

from .registry import registry
from . import symbols

SRC = "新浪财经"


async def fetch_quotes(codes: list[str]) -> dict[str, dict]:
    fulls = [symbols.full(c) for c in codes if not symbols.full(c).startswith("bj")]
    if not fulls:
        return {}
    text = await registry.get_text(
        SRC, "交叉校验：收盘价、涨跌幅",
        f"https://hq.sinajs.cn/list={','.join(fulls)}",
        encoding="gbk",
        headers={"Referer": "https://finance.sina.com.cn"},
    )
    out: dict[str, dict] = {}
    for line in text.strip().splitlines():
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        code = key.replace("var hq_str_", "").strip()
        val = val.strip().strip('"')
        parts = val.split(",")
        if len(parts) < 32:
            continue
        try:
            price = float(parts[3])
            prev = float(parts[2])
            out[code] = {
                "code": code,
                "name": parts[0],
                "price": price,
                "prev_close": prev,
                "open": float(parts[1]),
                "high": float(parts[4]),
                "low": float(parts[5]),
                "volume": float(parts[8]),      # 股
                "amount": float(parts[9]),      # 元
                "date": parts[30],
                "time": parts[31],
                "change_pct": (price - prev) / prev * 100 if prev else 0.0,
                "source": SRC,
            }
        except (ValueError, IndexError):
            continue
    return out
