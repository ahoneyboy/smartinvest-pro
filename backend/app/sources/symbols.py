"""代码规范化：600519 -> ("sh","600519")；支持 sh/sz/bj 前缀与东财 secid。"""
from __future__ import annotations


def norm(code: str) -> tuple[str, str]:
    c = code.strip().lower().replace(".", "")
    for p in ("sh", "sz", "bj"):
        if c.startswith(p) and c[2:].isdigit():
            return p, c[2:]
    if c.isdigit():
        if len(c) == 6:
            if c.startswith(("6", "9")):
                return "sh", c
            if c.startswith(("0", "2", "3")):
                return "sz", c
            if c.startswith(("4", "8")):
                return "bj", c
        if len(c) == 5:  # 港股
            return "hk", c
    raise ValueError(f"无法识别的股票代码: {code}")


def full(code: str) -> str:
    m, c = norm(code)
    return f"{m}{c}"


def em_secid(code: str) -> str:
    """东财 secid：沪 1，深/北 0。"""
    m, c = norm(code)
    return f"1.{c}" if m == "sh" else f"0.{c}"


def tencent_full(code: str) -> str:
    return full(code)


def is_index(code: str) -> bool:
    _, c = norm(code)
    return c in {
        "000001", "399001", "399006", "000300", "000688", "000905",
        "000016", "399005", "399106", "899050",
    }
