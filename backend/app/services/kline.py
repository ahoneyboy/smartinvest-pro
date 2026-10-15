"""K 线统一入口：腾讯主源 → 东财备用，任一可用即返回。全站 K 线获取都走这里。"""
from __future__ import annotations

from ..sources import eastmoney as em
from ..sources import tencent

_KLT = {"day": 101, "week": 102, "month": 103}


async def get_kline(code: str, period: str = "day", limit: int = 120, fq: str = "qfq") -> list[list]:
    """[date, open, close, high, low, volume]，双源自动降级。全部失败抛最后异常。"""
    last_err: Exception | None = None
    try:
        return await tencent.fetch_kline(code, period, limit, fq)
    except Exception as e:  # noqa: BLE001
        last_err = e
    try:
        rows = await em.fetch_kline_em(code, klt=_KLT.get(period, 101), lmt=limit)
        if rows:
            return rows
        raise RuntimeError("东财 K 线返回空")
    except Exception as e:  # noqa: BLE001
        last_err = e
    # 新浪第三源（仅日 K，不复权——腾讯/东财同挂时的兜底）
    if period == "day":
        try:
            from ..sources import sina_kline
            rows = await sina_kline.fetch_kline_sina(code, min(limit, 120))
            if rows:
                return rows
        except Exception as e:  # noqa: BLE001
            last_err = e
    raise last_err if last_err else RuntimeError("K 线获取失败")
