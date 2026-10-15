"""LLM 服务：OpenAI 兼容接口（DeepSeek/豆包/GPT 等）。

未配置 Key 时返回 None，由调用方降级到本地规则引擎。
所有 LLM 结论都必须附带结构化数据依据，prompt 中强制要求引用数据。
"""
from __future__ import annotations

import json

import httpx

from .. import config
from ..cache import cache


def llm_available() -> bool:
    return bool(config.LLM_API_KEY)


def llm_info() -> dict:
    return {
        "available": llm_available(),
        "base_url": config.LLM_BASE_URL if llm_available() else None,
        "model": config.LLM_MODEL if llm_available() else None,
        "engine": "llm" if llm_available() else "rule",
    }


async def chat(messages: list[dict], temperature: float = 0.4, max_tokens: int = 2200) -> str | None:
    if not llm_available():
        return None
    body = {
        "model": config.LLM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT) as client:
        r = await client.post(
            f"{config.LLM_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {config.LLM_API_KEY}"},
            json=body,
        )
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]


async def chat_with_history(session_messages: list[dict], market_context: str) -> dict:
    """对话式分析：注入实时市场上下文，要求引用具体数据。"""
    if not llm_available():
        return {"engine": "rule", "reply": None}
    system = (
        "你是 SmartInvest Pro 的 A 股分析助手。回答规则：\n"
        "1. 必须引用下方【实时市场数据】中的具体数字作为依据，不允许无依据的空泛建议；\n"
        "2. 每条结论标注置信度（高/中/低）；不承诺收益，不构成投资建议；\n"
        "3. 简洁专业，用中文回答。\n\n【实时市场数据】\n" + market_context
    )
    reply = await chat([{"role": "system", "content": system}] + session_messages)
    return {"engine": "llm", "reply": reply}


_REVIEW_PROMPT = """你是 A 股复盘大师。基于下方 JSON 结构化数据（当日全市场），生成复盘报告的两个部分：
1. "summary"：一句话总收口（80-140字），概括今日市场性质（如修复/扩散/退潮）、主线方向、风险所在，风格直接犀利，必须引用数据（涨停数、炸板数、连板高度、主线板块名）。
2. "risk"：风险提示段（60-120字），点出次日最需要防范的误判，引用炸板率/跌停/后排数据。

只输出 JSON：{"summary": "...", "risk": "..."}
数据中的结论若与你的判断冲突，以数据为准。

【当日结构化数据】
{data}
"""


async def review_narrative(structured: dict) -> dict:
    """生成复盘叙事。返回 {"summary","risk","engine"}。"""
    if llm_available():
        try:
            compact = json.dumps(structured, ensure_ascii=False, default=str)[:9000]
            text = await chat(
                [{"role": "user", "content": _REVIEW_PROMPT.replace("{data}", compact)}],
                temperature=0.3,
            )
            if text:
                text = text.strip()
                if text.startswith("```"):
                    text = text.strip("`").lstrip("json").strip()
                obj = json.loads(text)
                if obj.get("summary"):
                    return {
                        "summary": obj["summary"],
                        "risk": obj.get("risk", ""),
                        "engine": "llm",
                    }
        except Exception:
            pass
    from .review_rules import narrative_fallback

    fb = narrative_fallback(structured)
    fb["engine"] = "rule"
    return fb


async def stock_narrative(structured: dict) -> str | None:
    """个股深度分析的 LLM 综合点评（可选增强）。"""
    if not llm_available():
        return None
    key = f"stock_narr_{structured.get('code')}_{structured.get('price')}"
    cached = cache.get_fresh(key, 300)
    if cached:
        return cached
    try:
        compact = json.dumps(structured, ensure_ascii=False, default=str)[:6000]
        reply = await chat(
            [{
                "role": "user",
                "content": (
                    "你是 A 股分析师。基于以下结构化数据，写 120-180 字综合点评：先给结论与评级，"
                    "再列最多 3 条数据依据（必须引用数字），最后给最大风险。不要空话。\n" + compact
                ),
            }],
            temperature=0.3,
            max_tokens=800,
        )
        if reply:
            cache.set(key, reply)
        return reply
    except Exception:
        return None
