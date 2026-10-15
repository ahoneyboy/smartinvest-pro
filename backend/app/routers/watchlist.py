"""自选股路由：CRUD + 卡片墙聚合（报价 + 缓存信号）。"""
import asyncio

from fastapi import APIRouter, HTTPException

from .. import db
from ..cache import cache
from ..sources.symbols import full, norm
from ..services import quotes as quotes_svc
from ..services import signal as signal_svc

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("")
async def list_watchlist():
    rows = db.query("SELECT * FROM watchlist ORDER BY created_at DESC")
    return {"items": rows}


@router.post("")
async def add(item: dict):
    code = (item.get("code") or "").strip()
    if not code:
        raise HTTPException(400, "code 不能为空")
    try:
        m, c = norm(code)
    except ValueError as e:
        raise HTTPException(400, str(e))
    fc = f"{m}{c}"
    db.execute(
        "INSERT INTO watchlist(code,name,group_name,cost,shares,lower_price,upper_price) "
        "VALUES(?,?,?,?,?,?,?) ON CONFLICT(code) DO NOTHING",
        (fc, item.get("name") or "", item.get("group") or "全部",
         float(item.get("cost") or 0), float(item.get("shares") or 0),
         float(item.get("lower") or 0), float(item.get("upper") or 0)),
    )
    return {"ok": True, "code": fc}


@router.post("/batch")
async def batch_add(body: dict):
    codes = body.get("codes") or []
    group = body.get("group") or "全部"
    added, invalid = [], []
    for raw in codes:
        code = str(raw).strip()
        if not code:
            continue
        try:
            m, c = norm(code)
            db.execute("INSERT INTO watchlist(code,group_name) VALUES(?,?) ON CONFLICT(code) DO NOTHING",
                       (f"{m}{c}", group))
            added.append(f"{m}{c}")
        except ValueError:
            invalid.append(code)
    return {"added": added, "invalid": invalid}


@router.put("/{code}")
async def update(code: str, item: dict):
    fields, params = [], []
    for col, key in (("name", "name"), ("group_name", "group"), ("cost", "cost"),
                     ("shares", "shares"), ("lower_price", "lower"), ("upper_price", "upper")):
        if key in item and item[key] is not None:
            fields.append(f"{col}=?")
            params.append(item[key])
    if not fields:
        raise HTTPException(400, "无可更新字段")
    params.append(code)
    db.execute(f"UPDATE watchlist SET {','.join(fields)} WHERE code=?", tuple(params))
    return {"ok": True}


@router.delete("/{code}")
async def remove(code: str):
    db.execute("DELETE FROM watchlist WHERE code=?", (code,))
    return {"ok": True}


async def _card_signal(code: str) -> dict:
    key = f"card_signal_{code}"
    cached = cache.get_fresh(key, 120)
    if cached:
        return cached
    sig = await signal_svc.build_signal(code)
    cache.set(key, sig)
    return sig


@router.get("/overview")
async def overview():
    """卡片墙：报价 + 短期信号 + AI 建议（信号 120s 缓存，报价 3s 刷新）。"""
    rows = db.query("SELECT * FROM watchlist ORDER BY created_at DESC")
    codes = [r["code"] for r in rows]
    if not codes:
        return {"items": [], "quotes": {}}
    q_res, signals = await asyncio.gather(
        quotes_svc.get_quotes(codes),
        asyncio.gather(*[_card_signal(c) for c in codes]),
    )
    sig_by_code = {s["code"]: s for s in signals if s.get("available")}
    items = []
    for r in rows:
        sig = sig_by_code.get(r["code"], {})
        q = q_res["quotes"].get(r["code"], {})
        items.append({
            **r,
            "quote": q,
            "signal": {
                "short_comment": sig.get("short_comment"),
                "ma": sig.get("ma"),
                "ma_alignment": sig.get("ma_alignment"),
                "rsi6": sig.get("rsi6"),
                "macd_status": sig.get("macd_status"),
                "advice": sig.get("advice"),
            },
        })
    return {"items": items, "quotes": q_res["quotes"], "alerts": q_res["alerts"], "degraded": q_res["degraded"]}
