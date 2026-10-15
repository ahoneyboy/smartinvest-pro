"""AI 路由：对话式分析（带实时市场上下文与规则降级）。"""
from fastapi import APIRouter

from .. import db
from ..services import review as review_svc
from ..services.llm import chat_with_history, llm_available
from ..services import signal as signal_svc
from ..services.quotes import get_index_quotes
from ..services.stock_analysis import analyze

router = APIRouter(prefix="/api/ai", tags=["ai"])


async def _market_context() -> str:
    idx = await get_index_quotes()
    lines = []
    for i in idx:
        lines.append(f"{i['name']}: {i['price']} ({i['change_pct']:+.2f}%) 上涨{i.get('up_count') or '-'}家/下跌{i.get('down_count') or '-'}家")
    try:
        p = await review_svc.build_review()
        lines.append(f"最新交易日 {p['date']}: 涨停{p['limit_stats']['zt_total']}只/炸板{p['limit_stats']['zb_count']}只/跌停{p['limit_stats']['dt_count']}只，"
                     f"最高连板{p['limit_stats']['max_lb']}板，情绪阶段「{p['sentiment']['stage']}」")
        lines.append("主线板块: " + "、".join(s['name'] for s in p['sectors'] if s['label'] in ('主线', '次主线')))
    except Exception:
        pass
    return "\n".join(lines)


def _rule_reply(message: str, review_payload: dict | None) -> str:
    """无 LLM Key 时的本地规则回答（结构化、带数据）。"""
    import re
    m = re.search(r"(\d{6})", message)
    parts = []
    if review_payload:
        p = review_payload
        parts.append(
            f"最新交易日 {p['date']}：涨停 {p['limit_stats']['zt_total']} 只、炸板 {p['limit_stats']['zb_count']} 只"
            f"（炸板率 {p['limit_stats']['zb_rate']*100:.0f}%）、跌停 {p['limit_stats']['dt_count']} 只，最高连板 {p['limit_stats']['max_lb']} 板；"
            f"情绪阶段「{p['sentiment']['stage']}」（温度 {p['sentiment']['gauge']}/100）。"
        )
        mains = [s for s in p["sectors"] if s["label"] in ("主线", "次主线")]
        if mains:
            parts.append("当前主线：" + "；".join(f"{s['name']}（{s['verdict']}，净流入 {s['main_inflow']/1e8:+.1f} 亿）" for s in mains) + "。")
    if m:
        code = m.group(1)
        parts.append(f"检测到个股代码 {code}，请前往「AI 分析」页查看该股的深度分析（技术面/资金面/建议与置信度），"
                     "本对话引擎未配置 LLM，无法生成个性化长文。")
    parts.append("（提示：当前为本地规则引擎回答。配置 LLM_API_KEY 环境变量后可获得 AI 对话式分析。）")
    return "\n".join(parts)


@router.post("/chat")
async def chat(body: dict):
    message = (body.get("message") or "").strip()
    history = body.get("history") or []
    if not message:
        return {"reply": "请输入问题", "engine": "rule"}
    review_payload = None
    try:
        review_payload = await review_svc.build_review()
    except Exception:
        pass
    if llm_available():
        ctx = await _market_context()
        msgs = [{"role": h["role"], "content": h["content"]} for h in history[-10:]]
        res = await chat_with_history(msgs + [{"role": "user", "content": message}], ctx)
        if res["reply"]:
            reply, engine = res["reply"], "llm"
        else:
            reply, engine = _rule_reply(message, review_payload), "rule"
    else:
        reply, engine = _rule_reply(message, review_payload), "rule"
    db.execute("INSERT INTO chat_history(role,content) VALUES(?,?)", ("user", message))
    db.execute("INSERT INTO chat_history(role,content) VALUES(?,?)", ("assistant", reply))
    return {"reply": reply, "engine": engine}


@router.get("/chat/history")
async def chat_history():
    rows = db.query("SELECT * FROM chat_history ORDER BY id DESC LIMIT 40")
    return {"items": list(reversed(rows))}


@router.delete("/chat/history")
async def clear_chat():
    db.execute("DELETE FROM chat_history")
    return {"ok": True}


@router.get("/stock/{code}")
async def stock_analysis(code: str, use_llm: bool = True):
    return await analyze(code, use_llm=use_llm)
