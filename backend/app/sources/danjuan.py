"""蛋卷基金指数估值：PE/PB 历史分位（用于估值监测：高位提醒 / 低位机会）。"""
from __future__ import annotations

from ..sources.registry import registry

SRC = "蛋卷估值"


def _label(percentile: float) -> tuple[str, str]:
    """返回 (标签, 级别)。percentile 0-1。"""
    if percentile >= 0.8:
        return "极热", "high"
    if percentile >= 0.7:
        return "偏热", "high"
    if percentile <= 0.2:
        return "极冷", "low"
    if percentile <= 0.3:
        return "偏冷", "low"
    return "适中", "mid"


async def fetch_valuation() -> list[dict]:
    url = "https://danjuanfunds.com/djapi/index_eva/dj"
    data = await registry.get_json(
        SRC, "指数 PE/PB 历史分位", url,
        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://danjuanfunds.com/"},
    )
    out = []
    for it in (data.get("data") or {}).get("items") or []:
        code = str(it.get("index_code") or "")
        if len(code) < 8:
            continue
        pure = code[2:]
        if not (len(pure) == 6 and pure.isdigit()):
            continue  # 过滤海外/非 A 股指数代码
        pe_pct = float(it.get("pe_percentile") or 0)
        pb_pct = float(it.get("pb_percentile") or 0)
        pe = float(it.get("pe") or 0)
        # PE 无效（亏损指数）时用 PB 分位
        use_pe = pe > 0 and pe_pct > 0
        pct = pe_pct if use_pe else pb_pct
        basis = "PE-TTM" if use_pe else "PB"
        label, level = _label(pct)
        out.append({
            "code": pure,
            "name": it.get("name"),
            "pe": round(pe, 2) or None,
            "pb": round(float(it.get("pb") or 0), 2) or None,
            "percentile": round(pct * 100, 1),
            "basis": basis,
            "label": label,
            "level": level,
            "roe": round(float(it.get("roe") or 0) * 100, 2) or None,
            "yield_rate": round(float(it.get("yeild") or 0) * 100, 2) or None,
        })
    out.sort(key=lambda x: -x["percentile"])
    return out
