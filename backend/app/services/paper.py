"""模拟交易引擎（纸面盘）：信号触发 → 按开关执行买卖 → 账户/交易/信号历史。

规则（对自选股逐只评估，价格来自实时行情）：
- 卖出：有持仓且（价格 ≥ 上限价[止盈] 或 价格 ≤ 下限价[止损]，未设上下限时用信号建议的止盈/止损价）
- 买入：无持仓、AI 建议为「增持」且价格处于建议买点附近（≤ 买点 × 1.02），买入现金的 20%（100 股取整）
- 「模拟自动交易」开关关闭时只记录信号（executed=0），不成交
"""
from __future__ import annotations

import math

from .. import db

INITIAL_CASH = 1_000_000.0


def _init_account() -> None:
    rows = db.query("SELECT cash FROM paper_account WHERE id=1")
    if not rows:
        db.execute("INSERT INTO paper_account(id, cash) VALUES(1, ?)", (INITIAL_CASH,))


def enabled() -> bool:
    rows = db.query("SELECT value FROM settings WHERE key='paper_trading'")
    return bool(rows and rows[0]["value"] == "on")


def set_enabled(on: bool) -> None:
    db.execute("INSERT INTO settings(key,value) VALUES('paper_trading',?) "
               "ON CONFLICT(key) DO UPDATE SET value=excluded.value", ("on" if on else "off",))


def _positions() -> dict[str, dict]:
    """从成交记录聚合持仓：{code: {shares, cost_amount}}。"""
    pos: dict[str, dict] = {}
    for t in db.query("SELECT code, name, direction, price, shares FROM paper_trades ORDER BY id"):
        p = pos.setdefault(t["code"], {"name": t["name"], "shares": 0.0, "cost": 0.0})
        qty = t["shares"] or 0
        if t["direction"] == "BUY":
            p["shares"] += qty
            p["cost"] += (t["price"] or 0) * qty
        else:
            avg = p["cost"] / p["shares"] if p["shares"] else 0
            p["shares"] -= qty
            p["cost"] -= avg * qty
            if p["shares"] <= 0:
                p["shares"], p["cost"] = 0.0, 0.0
    return pos


def _recent_signal(code: str, kind: str, minutes: int = 30) -> bool:
    rows = db.query(
        "SELECT id FROM paper_signals WHERE code=? AND kind=? "
        "AND created_at > datetime('now','localtime',?)",
        (code, kind, f"-{minutes} minutes"),
    )
    return bool(rows)


def evaluate(watch_rows: list[dict], quotes: dict[str, dict], signals: dict[str, dict]) -> list[dict]:
    """对自选股逐只评估触发。quotes: {code: quote}，signals: {code: build_signal 结果}。"""
    _init_account()
    auto = enabled()
    pos = _positions()
    triggered: list[dict] = []
    for row in watch_rows:
        code = row["code"]
        q = quotes.get(code) or {}
        price = q.get("price") or 0
        if not price:
            continue
        name = row["name"] or q.get("name") or code
        adv = (signals.get(code) or {}).get("advice") or {}
        p = pos.get(code, {"shares": 0.0, "cost": 0.0})
        upper = row.get("upper_price") or 0 or adv.get("target_price") or 0
        lower = row.get("lower_price") or 0 or adv.get("stop_loss") or 0

        # ---- 卖出（止盈 / 止损）----
        if p["shares"] > 0 and upper and price >= upper:
            kind = "take_profit"
            if _recent_signal(code, kind):
                continue
            msg = f"{name}({code}) 触及止盈位 {upper}（现价 {price}）"
            selfsell = _execute(code, name, "SELL", price, p["shares"], msg, auto)
            triggered.append({"code": code, "kind": kind, "message": msg, "executed": selfsell})
            continue
        if p["shares"] > 0 and lower and price <= lower:
            kind = "stop_loss"
            if _recent_signal(code, kind):
                continue
            msg = f"{name}({code}) 跌破止损位 {lower}（现价 {price}）"
            executed = _execute(code, name, "SELL", price, p["shares"], msg, auto)
            triggered.append({"code": code, "kind": kind, "message": msg, "executed": executed})
            continue

        # ---- 买入（建议买点附近 + 增持信号）----
        if p["shares"] <= 0 and adv.get("action") in ("增持", "买入") and adv.get("buy_price"):
            if price <= adv["buy_price"] * 1.02:
                kind = "buy_signal"
                if _recent_signal(code, kind):
                    continue
                cash = db.query("SELECT cash FROM paper_account WHERE id=1")[0]["cash"]
                shares = math.floor(cash * 0.2 / price / 100) * 100
                if shares < 100:
                    continue
                msg = f"{name}({code}) 价格 {price} 逼近建议买点 {adv['buy_price']}，AI 建议{adv['action']}（置信度 {adv.get('confidence')}%）"
                executed = _execute(code, name, "BUY", price, shares, msg, auto)
                triggered.append({"code": code, "kind": kind, "message": msg, "executed": executed})
    return triggered


def _execute(code: str, name: str, direction: str, price: float, shares: float, msg: str, auto: bool) -> bool:
    """记录信号；开关开启时成交并更新现金。返回是否已成交。"""
    db.execute("INSERT INTO paper_signals(code,name,kind,message,price,executed) VALUES(?,?,?,?,?,?)",
               (code, name, "BUY" if direction == "BUY" else "SELL", msg, price, 1 if auto else 0))
    if not auto:
        return False
    db.execute("INSERT INTO paper_trades(code,name,direction,price,shares,reason) VALUES(?,?,?,?,?,?)",
               (code, name, direction, price, shares, msg))
    amount = price * shares
    if direction == "BUY":
        db.execute("UPDATE paper_account SET cash = cash - ? WHERE id=1", (amount,))
    else:
        db.execute("UPDATE paper_account SET cash = cash + ? WHERE id=1", (amount,))
    return True


def summary(quotes: dict[str, dict] | None = None) -> dict:
    _init_account()
    quotes = quotes or {}
    acc = db.query("SELECT cash FROM paper_account WHERE id=1")[0]
    cash = acc["cash"]
    pos = _positions()
    positions, market_value = [], 0.0
    for code, p in pos.items():
        if p["shares"] <= 0:
            continue
        price = (quotes.get(code) or {}).get("price") or 0
        mv = price * p["shares"] if price else p["cost"]
        market_value += mv
        positions.append({
            "code": code,
            "name": p["name"],
            "shares": p["shares"],
            "cost_price": round(p["cost"] / p["shares"], 3) if p["shares"] else 0,
            "price": price,
            "market_value": round(mv, 2),
            "profit": round(mv - p["cost"], 2),
        })
    trades = db.query("SELECT * FROM paper_trades ORDER BY id DESC LIMIT 50")
    signals = db.query("SELECT * FROM paper_signals ORDER BY id DESC LIMIT 50")
    total = cash + market_value
    return {
        "enabled": enabled(),
        "account": {
            "initial": INITIAL_CASH,
            "cash": round(cash, 2),
            "market_value": round(market_value, 2),
            "total": round(total, 2),
            "profit": round(total - INITIAL_CASH, 2),
            "profit_pct": round((total - INITIAL_CASH) / INITIAL_CASH * 100, 2),
        },
        "positions": positions,
        "trades": trades,
        "signals": signals,
    }


def reset() -> None:
    db.execute("DELETE FROM paper_trades")
    db.execute("DELETE FROM paper_signals")
    db.execute("UPDATE paper_account SET cash=? WHERE id=1", (INITIAL_CASH,))
