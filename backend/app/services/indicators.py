"""技术指标计算（纯 Python，无 pandas 依赖）。

bars 格式: [date, open, close, high, low, volume]
"""
from __future__ import annotations

import statistics


def sma(closes: list[float], n: int) -> list[float | None]:
    out: list[float | None] = []
    s = 0.0
    for i, c in enumerate(closes):
        s += c
        if i >= n:
            s -= closes[i - n]
        out.append(s / n if i >= n - 1 else None)
    return out


def ema(values: list[float], n: int) -> list[float]:
    k = 2 / (n + 1)
    out: list[float] = []
    prev: float | None = None
    for v in values:
        prev = v if prev is None else v * k + prev * (1 - k)
        out.append(prev)
    return out


def macd(closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> dict:
    if len(closes) < slow + signal:
        return {"dif": None, "dea": None, "hist": None, "cross": None, "trend": None}
    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)
    dif = [a - b for a, b in zip(ema_fast, ema_slow)]
    dea = ema(dif, signal)
    hist = [(a - b) * 2 for a, b in zip(dif, dea)]
    cross = None
    if len(hist) >= 2:
        h0, h1 = hist[-2], hist[-1]
        d0, d1 = dif[-2], dif[-1]
        if d0 <= dea[-2] and d1 > dea[-1]:
            cross = "golden"
        elif d0 >= dea[-2] and d1 < dea[-1]:
            cross = "dead"
    trend = None
    if cross:
        trend = cross
    elif dif[-1] > dea[-1]:
        trend = "bull"
    else:
        trend = "bear"
    return {
        "dif": round(dif[-1], 4), "dea": round(dea[-1], 4),
        "hist": round(hist[-1], 4), "cross": cross, "trend": trend,
        "hist_series": [round(h, 4) for h in hist[-250:]],
        "dif_series": [round(h, 4) for h in dif[-250:]],
        "dea_series": [round(h, 4) for h in dea[-250:]],
    }


def kdj(bars: list[list], n: int = 9) -> dict:
    if len(bars) < n + 2:
        return {"k": None, "d": None, "j": None, "cross": None}
    k_prev, d_prev = 50.0, 50.0
    ks, ds = [], []
    for i in range(len(bars)):
        lo = min(float(bars[j][4]) for j in range(max(0, i - n + 1), i + 1))
        hi = max(float(bars[j][3]) for j in range(max(0, i - n + 1), i + 1))
        rsv = (float(bars[i][2]) - lo) / (hi - lo) * 100 if hi > lo else 50.0
        k_prev = 2 / 3 * k_prev + 1 / 3 * rsv
        d_prev = 2 / 3 * d_prev + 1 / 3 * k_prev
        ks.append(k_prev)
        ds.append(d_prev)
    j = 3 * ks[-1] - 2 * ds[-1]
    cross = None
    if len(ks) >= 2:
        if ks[-2] <= ds[-2] and ks[-1] > ds[-1]:
            cross = "golden"
        elif ks[-2] >= ds[-2] and ks[-1] < ds[-1]:
            cross = "dead"
    return {
        "k": round(ks[-1], 2), "d": round(ds[-1], 2), "j": round(j, 2), "cross": cross,
        "k_series": [round(v, 2) for v in ks[-250:]],
        "d_series": [round(v, 2) for v in ds[-250:]],
        "j_series": [round(3 * k - 2 * d, 2) for k, d in zip(ks[-250:], ds[-250:])],
    }


def rsi(closes: list[float], n: int = 14) -> float | None:
    if len(closes) < n + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        ch = closes[i] - closes[i - 1]
        gains.append(max(ch, 0))
        losses.append(max(-ch, 0))
    avg_gain = statistics.fmean(gains[:n])
    avg_loss = statistics.fmean(losses[:n])
    for i in range(n, len(gains)):
        avg_gain = (avg_gain * (n - 1) + gains[i]) / n
        avg_loss = (avg_loss * (n - 1) + losses[i]) / n
    if avg_loss == 0:
        return 100.0
    return 100 - 100 / (1 + avg_gain / avg_loss)


def rsi_series(closes: list[float], n: int = 6, tail: int = 250) -> list[float | None]:
    """Wilder RSI 序列。"""
    if len(closes) < n + 1:
        return []
    gains, losses = [], []
    for i in range(1, len(closes)):
        ch = closes[i] - closes[i - 1]
        gains.append(max(ch, 0))
        losses.append(max(-ch, 0))
    avg_gain = statistics.fmean(gains[:n])
    avg_loss = statistics.fmean(losses[:n])
    out: list[float | None] = [None] * n
    ag, al = avg_gain, avg_loss
    for i in range(n, len(gains)):
        ag = (ag * (n - 1) + gains[i]) / n
        al = (al * (n - 1) + losses[i]) / n
        out.append(100 - 100 / (1 + ag / al) if al else 100.0)
    return [round(v, 2) if v is not None else None for v in out[-tail:]]


def boll_series(closes: list[float], n: int = 20, k: float = 2.0, tail: int = 250) -> dict:
    """布林带上/中/下轨序列。"""
    if len(closes) < n:
        return {"upper": [], "mid": [], "lower": []}
    upper, mid, lower = [], [], []
    for i in range(n - 1, len(closes)):
        window = closes[i - n + 1: i + 1]
        m = statistics.fmean(window)
        sd = statistics.pstdev(window)
        upper.append(round(m + k * sd, 3))
        mid.append(round(m, 3))
        lower.append(round(m - k * sd, 3))
    return {
        "upper": upper[-tail:], "mid": mid[-tail:], "lower": lower[-tail:],
        "dates_offset": n - 1,  # 序列相对 bars 的起始偏移
    }


def boll(closes: list[float], n: int = 20, k: float = 2.0) -> dict:
    if len(closes) < n:
        return {"upper": None, "mid": None, "lower": None, "bandwidth": None}
    window = closes[-n:]
    mid = statistics.fmean(window)
    sd = statistics.pstdev(window)
    upper, lower = mid + k * sd, mid - k * sd
    return {
        "upper": round(upper, 3), "mid": round(mid, 3), "lower": round(lower, 3),
        "bandwidth": round((upper - lower) / mid * 100, 2) if mid else None,
        "position": round((closes[-1] - lower) / (upper - lower) * 100, 1) if upper > lower else None,
    }


def volume_stats(bars: list[list]) -> dict:
    vols = [float(b[5]) for b in bars]
    if len(vols) < 6:
        return {"vol_ma5": None, "vol_ratio": None, "shrink": None}
    ma5 = statistics.fmean(vols[-5:])
    prev5 = statistics.fmean(vols[-10:-5]) if len(vols) >= 10 else ma5
    ratio = vols[-1] / ma5 if ma5 else None
    return {
        "vol_ma5": round(ma5, 1),
        "vol_ma10": round(statistics.fmean(vols[-10:]), 1),
        "vol_ratio_5d": round(ratio, 2) if ratio else None,
        "shrink": (vols[-1] < prev5 * 0.7) if prev5 else None,
    }


def support_pressure(bars: list[list]) -> dict:
    """支撑/压力：近期摆动低点/高点 + 均线。最近 60 根，剔除最后一根当期。"""
    closes = [float(b[2]) for b in bars]
    ma20 = sma(closes, 20)
    window = bars[-61:-1] if len(bars) > 61 else bars[:-1] or bars
    low = min(float(b[4]) for b in window)
    high = max(float(b[3]) for b in window)
    price = closes[-1]
    # 压力 = price 上方最近的高点/均线；支撑 = 下方低点/均线
    pressure = high if high > price else round(price * 1.05, 2)
    support = low if low < price else round(price * 0.95, 2)
    if ma20 and ma20[-1] and ma20[-1] > price:
        pressure = min(pressure, ma20[-1])
    if ma20 and ma20[-1] and ma20[-1] < price:
        support = max(support, ma20[-1])
    return {"support": round(support, 2), "pressure": round(pressure, 2)}


def compute_all(bars: list[list]) -> dict:
    closes = [float(b[2]) for b in bars]
    mas = {}
    for n in (5, 10, 20, 60):
        s = sma(closes, n)
        mas[f"ma{n}"] = round(s[-1], 3) if s[-1] is not None else None
        mas[f"ma{n}_prev"] = round(s[-2], 3) if len(s) > 1 and s[-2] is not None else None
    # 均线多空排列
    vals = [mas.get(f"ma{p}") for p in (5, 10, 20)]
    alignment = None
    if all(v is not None for v in vals):
        if vals[0] > vals[1] > vals[2]:
            alignment = "bull"
        elif vals[0] < vals[1] < vals[2]:
            alignment = "bear"
    return {
        "bars_tail": [
            {"date": b[0], "open": b[1], "close": b[2], "high": b[3], "low": b[4], "volume": b[5]}
            for b in bars
        ],
        "ma": mas,
        "ma_alignment": alignment,
        "macd": macd(closes),
        "kdj": kdj(bars),
        "rsi6": round(v, 1) if (v := rsi(closes, 6)) is not None else None,
        "rsi12": round(v, 1) if (v := rsi(closes, 12)) is not None else None,
        "rsi24": round(v, 1) if (v := rsi(closes, 24)) is not None else None,
        "rsi6_series": rsi_series(closes, 6),
        "boll_series": boll_series(closes),
        "boll": boll(closes),
        "volume": volume_stats(bars),
        "support_pressure": support_pressure(bars),
    }
