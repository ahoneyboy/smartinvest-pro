"""新浪财经 7x24 市场资讯直播流（借鉴 go-stock 的 AI 资讯思路，轻量直采）。"""
from __future__ import annotations

from ..cache import cache
from ..sources.registry import registry

SRC = "新浪资讯"


async def fetch_live_news(count: int = 18) -> list[dict]:
    cached = cache.get_fresh("live_news", 120)
    if cached:
        return cached
    url = f"https://zhibo.sina.com.cn/api/zhibo/feed?page=1&page_size={count}&zhibo_id=152&tag_id=0"
    data = await registry.get_json(SRC, "7x24 财经直播", url, headers={"Referer": "https://finance.sina.com.cn"})
    items = []
    for x in (((data.get("result") or {}).get("data") or {}).get("feed") or {}).get("list") or []:
        text = str(x.get("rich_text") or "").strip()
        if not text:
            continue
        items.append({
            "id": x.get("id"),
            "time": str(x.get("create_time") or "")[11:16] or str(x.get("create_time") or ""),
            "text": text[:160],
        })
    out = items[:count]
    cache.set("live_news", out)
    return out
