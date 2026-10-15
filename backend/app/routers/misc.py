"""杂项路由：选股器、龙虎榜、笔记、告警、设置、盯盘快照。"""
from fastapi import APIRouter, HTTPException

from .. import config, db
from ..cache import cache
from ..sources import eastmoney as em
from ..services import quotes as quotes_svc
from ..services import signal as signal_svc
from ..services.review import latest_trade_date

router = APIRouter(prefix="/api", tags=["misc"])


@router.get("/screener")
async def screener(
    pct_min: float = -100, pct_max: float = 100,
    turnover_min: float = 0, vr_min: float = 0,
    inflow_min: float = 0, name_contains: str = "", limit: int = 60,
):
    """简单选股器：涨幅/换手/量比/主力净流入条件（全 A 快照内筛选）。"""
    items = await em.fetch_stock_flow_rank(pz=300, po=1)
    out = []
    for s in items:
        if not (pct_min <= s["change_pct"] <= pct_max):
            continue
        if s.get("inflow_pct", 0) is not None and s["main_inflow"] / 1e8 < inflow_min:
            continue
        if name_contains and name_contains not in (s.get("name") or ""):
            continue
        out.append(s)
        if len(out) >= limit:
            break
    return {"items": out, "note": "换手率/量比筛选请在盯盘页对自选股使用（快照接口未含该字段）"}


@router.get("/lhb")
async def lhb(date: str | None = None):
    d = date or await latest_trade_date()
    return {"date": d, "items": await em.fetch_lhb(d, pz=30)}


# ---- 复盘笔记 ----

@router.get("/notes")
async def notes_list():
    return {"items": db.query("SELECT * FROM notes ORDER BY id DESC")}


@router.post("/notes")
async def notes_add(body: dict):
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(400, "内容不能为空")
    db.execute("INSERT INTO notes(date,content) VALUES(?,?)",
               (body.get("date") or db.now_str()[:10], content))
    return {"ok": True}


@router.delete("/notes/{note_id}")
async def notes_del(note_id: int):
    db.execute("DELETE FROM notes WHERE id=?", (note_id,))
    return {"ok": True}


# ---- 盯盘告警 ----

@router.get("/alerts")
async def alerts():
    return {"items": db.query("SELECT * FROM alerts ORDER BY id DESC LIMIT 50")}


def check_price_alerts(code: str, name: str, price: float, upper: float, lower: float) -> None:
    """价格越过自设上下限 → 写入告警（前端轮询拉取 + 浏览器通知）。"""
    kind, msg = None, ""
    if upper and price >= upper:
        kind, msg = "break_upper", f"{name}({code}) 突破上限价 {upper}，现价 {price}"
    elif lower and price <= lower:
        kind, msg = "break_lower", f"{name}({code}) 跌破下限价 {lower}，现价 {price}"
    if kind:
        recent = db.query(
            "SELECT id FROM alerts WHERE code=? AND kind=? AND created_at > datetime('now','localtime','-30 minutes')",
            (code, kind),
        )
        if not recent:
            db.execute("INSERT INTO alerts(code,name,kind,message,price) VALUES(?,?,?,?,?)",
                       (code, name, kind, msg, price))


@router.get("/watch/monitor")
async def watch_monitor():
    """盯盘页：自选股报价 + 信号 + 持仓盈亏 + 告警检查。"""
    rows = db.query("SELECT * FROM watchlist")
    codes = [r["code"] for r in rows]
    if not codes:
        return {"items": [], "portfolio": None, "alerts": [], "interval": config.WATCH_INTERVAL_DEFAULT}

    async def _card_signal(code: str) -> dict:
        key = f"card_signal_{code}"
        cached = cache.get_fresh(key, 120)
        if cached:
            return cached
        try:
            sig = await signal_svc.build_signal(code)
        except Exception:
            return {}
        cache.set(key, sig)
        return sig

    import asyncio

    res, signals = await asyncio.gather(
        quotes_svc.get_quotes(codes),
        asyncio.gather(*[_card_signal(c) for c in codes]),
    )
    sig_by_code = {s["code"]: s for s in signals if s.get("available")}
    items, total_mv, total_cost = [], 0.0, 0.0
    for r in rows:
        q = res["quotes"].get(r["code"], {})
        price = q.get("price") or 0
        shares, cost = r["shares"] or 0, r["cost"] or 0
        if shares and cost:
            total_mv += price * shares
            total_cost += cost * shares
        check_price_alerts(r["code"], r["name"] or q.get("name") or "", price,
                           r["upper_price"] or 0, r["lower_price"] or 0)
        sig = sig_by_code.get(r["code"], {})
        items.append({**r, "quote": q, "signal": {
            "advice": sig.get("advice"),
            "short_comment": sig.get("short_comment"),
        }})
    portfolio = None
    if total_cost > 0:
        portfolio = {
            "total_mv": round(total_mv, 2),
            "total_cost": round(total_cost, 2),
            "profit": round(total_mv - total_cost, 2),
            "profit_pct": round((total_mv - total_cost) / total_cost * 100, 2),
        }
    # 模拟交易引擎评估（止盈止损/买点触发 → 信号历史 + 按开关成交）
    paper_triggers = []
    try:
        from ..services import paper as paper_svc
        paper_triggers = paper_svc.evaluate(rows, res["quotes"], sig_by_code)
        for t in paper_triggers:
            db.execute("INSERT INTO alerts(code,name,kind,message,price) VALUES(?,?,?,?,?)",
                       (t["code"], "", f"paper_{t['kind']}", t["message"], 0))
    except Exception:
        pass
    # 钉钉推送（配置了 webhook 且本轮有新告警/触发时）
    try:
        import asyncio as _aio
        from ..services import notify as notify_svc
        push_rows = db.query(
            "SELECT code,name,message FROM alerts WHERE created_at > datetime('now','localtime','-2 minutes') LIMIT 10")
        if push_rows or paper_triggers:
            msgs = ([{"code": r["code"], "name": r["name"], "message": r["message"]} for r in push_rows]
                    + [{"code": t["code"], "name": "", "message": "模拟盘：" + t["message"]} for t in paper_triggers])
            _aio.get_running_loop().create_task(notify_svc.push_alerts(msgs))
    except Exception:
        pass
    return {"items": items, "portfolio": portfolio,
            "alerts": db.query("SELECT * FROM alerts ORDER BY id DESC LIMIT 10"),
            "paper_triggers": paper_triggers,
            "interval": config.WATCH_INTERVAL_DEFAULT}


# ---- 设置 ----

@router.get("/settings")
async def get_settings():
    rows = db.query("SELECT key,value FROM settings")
    return {"settings": {r["key"]: r["value"] for r in rows}}


@router.post("/settings")
async def set_settings(body: dict):
    for k, v in (body.get("settings") or {}).items():
        db.execute("INSERT INTO settings(key,value) VALUES(?,?) "
                   "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (k, str(v)))
    return {"ok": True}
