"""新浪日 K 数据源（独立于腾讯/东财的第三 K 线源）。"""
from __future__ import annotations

from .registry import registry

SRC = "新浪K线"


async def fetch_kline_sina(code: str, datalen: int = 120) -> list[list]:
    """[date, open, close, high, low, volume]（仅日 K，不复权）。"""
    from . import symbols
    full_code = symbols.full(code)
    url = (
        "https://quotes.sina.com.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData"
        f"?symbol={full_code}&scale=240&ma=no&datalen={datalen}"
    )
    data = await registry.get_json(SRC, "日K历史", url, headers={"Referer": "https://finance.sina.com.cn"})
    out = []
    for r in data or []:
        try:
            out.append([r["day"], float(r["open"]), float(r["close"]), float(r["high"]), float(r["low"]), float(r["volume"])])
        except (KeyError, TypeError, ValueError):
            continue
    return out
