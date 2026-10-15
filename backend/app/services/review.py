"""复盘大师聚合引擎：涨跌停统计 + 资金流证据 + 板块主线裁定 + 情绪仪表 + 轮动总表。"""
from __future__ import annotations

import asyncio
import json
import math
from datetime import datetime

from .. import db
from ..cache import cache
from ..sources import eastmoney as em
from ..sources import tencent
from ..sources.registry import registry
from . import review_rules
from .quotes import get_index_quotes
from .llm import review_narrative


async def latest_trade_date() -> str:
    """最近交易日（YYYY-MM-DD），以腾讯日 K 最后一根为准。"""
    cached = cache.get_fresh("latest_trade_date", 300)
    if cached:
        return cached
    try:
        from . import kline as kline_svc
        bars = await kline_svc.get_kline("sh000001", "day", 3)
        date = bars[-1][0]
    except Exception:
        date = datetime.now().strftime("%Y-%m-%d")
    cache.set("latest_trade_date", date)
    return date


async def build_review(date: str | None = None, refresh: bool = False) -> dict:
    trade_date = date or await latest_trade_date()
    if not refresh:
        rows = db.query("SELECT payload FROM review_cache WHERE date=?", (trade_date,))
        if rows:
            return json.loads(rows[0]["payload"])

    ymd = trade_date.replace("-", "")

    async def safe(coro, default, label: str, warnings: list[str]):
        try:
            return await coro
        except Exception as e:  # noqa: BLE001
            warnings.append(f"{label} 获取失败，已降级：{type(e).__name__}")
            return default

    warnings: list[str] = []
    idx_rows, board_flow, flow_in, flow_out, zt, zb, dt, lhb = await asyncio.gather(
        safe(get_index_quotes(), [], "指数行情", warnings),
        safe(em.fetch_board_flow("industry", pz=90), [], "行业板块资金流", warnings),
        safe(em.fetch_stock_flow_rank(pz=8, po=1), [], "个股资金净流入排行", warnings),
        safe(em.fetch_stock_flow_rank(pz=8, po=0), [], "个股资金净流出排行", warnings),
        safe(em.fetch_zt_pool(ymd), {"count": 0, "pool": []}, "涨停池", warnings),
        safe(em.fetch_zb_pool(ymd), {"count": 0, "pool": []}, "炸板池", warnings),
        safe(em.fetch_dt_pool(ymd), {"count": 0, "pool": []}, "跌停池", warnings),
        safe(em.fetch_lhb(trade_date, pz=10), [], "龙虎榜", warnings),
    )

    # ---- 涨跌停统计 ----
    zt_pool = zt.get("pool", [])
    zb_pool = zb.get("pool", [])
    dt_pool = dt.get("pool", [])
    zt_st = [x for x in zt_pool if "ST" in (x["name"] or "").upper()]
    zt_non_st = [x for x in zt_pool if "ST" not in (x["name"] or "").upper()]
    zt_total = zt.get("count", len(zt_pool))
    zb_count = zb.get("count", len(zb_pool))
    touched = zt_total + zb_count
    zb_rate = zb_count / touched if touched else 0.0
    ladder_pool = sorted(zt_pool, key=lambda x: (-x["lbc"], -x["fund"]))
    max_lb_item = ladder_pool[0] if ladder_pool else None
    max_lb = int(max_lb_item["lbc"]) if max_lb_item else 0

    limit_stats = {
        "zt_total": zt_total,
        "zt_non_st": len(zt_non_st),
        "zt_st": len(zt_st),
        "zb_count": zb_count,
        "zt_touched": touched,
        "zb_rate": round(zb_rate, 3),
        "dt_count": dt.get("count", len(dt_pool)),
        "max_lb": max_lb,
        "max_lb_stock": {
            "code": max_lb_item["code"], "name": max_lb_item["name"], "lbc": max_lb_item["lbc"],
            "industry": max_lb_item["hybk"],
        } if max_lb_item else None,
        "warning": "炸板率偏高，注意次日承接" if zb_rate >= 0.3 else None,
        "ladder": [
            {"code": x["code"], "name": x["name"], "lbc": int(x["lbc"]),
             "industry": x["hybk"], "fund": x["fund"], "days_ct": x["zt_stats"].get("days", 0),
             "days": x["zt_stats"].get("ct", 0), "is_st": "ST" in (x["name"] or "").upper()}
            for x in ladder_pool[:15]
        ],
    }

    # ---- 市场方向性广度 ----
    up = down = 0
    indexes = []
    for r in idx_rows:
        if r["name"] in ("上证指数", "深证成指"):
            up += r.get("up_count") or 0
            down += r.get("down_count") or 0
        if r["name"] in ("上证指数", "深证成指", "创业板指"):
            indexes.append(r)
    breadth = review_rules.direction_gauge(up, down)

    market = {
        "indexes": [
            {"name": i["name"], "code": i["code"], "price": i["price"],
             "change_pct": i["change_pct"], "sparkline": i.get("sparkline", [])}
            for i in indexes
        ],
        "breadth": breadth,
    }

    # ---- 板块行业聚合（ZT 池按行业归并 + 资金流）----
    flow_by_name = {b["name"]: b for b in board_flow}
    ind_stats: dict[str, dict] = {}
    for x in zt_pool:
        bk = x["hybk"] or "其他"
        s = ind_stats.setdefault(bk, {"name": bk, "zt": 0, "st": 0, "max_lbc": 0, "members": []})
        s["zt"] += 1
        if "ST" in (x["name"] or "").upper():
            s["st"] += 1
        s["max_lbc"] = max(s["max_lbc"], int(x["lbc"]))
        s["members"].append(x)
    for name, s in ind_stats.items():
        b = flow_by_name.get(name, {})
        s["main_inflow"] = b.get("main_inflow", 0.0)
        s["change_pct"] = b.get("change_pct", 0.0)
        s["bk_code"] = b.get("bk_code")
        s["leader"] = b.get("leader")

    def score_of(s: dict) -> float:
        inflow_yi = max(0.0, s.get("main_inflow", 0)) / 1e8
        return math.log10(1 + inflow_yi) * 4 + s["zt"] * 10 + s["max_lbc"] * 6 + s.get("change_pct", 0) * 1.5

    candidates = sorted(ind_stats.values(), key=score_of, reverse=True)

    labeled: dict[str, dict] = {}
    main_picked: list[dict] = []
    for s in candidates:
        if s["zt"] >= 2 and s.get("main_inflow", 0) > 0 and len(main_picked) < 1:
            s["label"] = "主线"
            main_picked.append(s)
    for s in candidates:
        if s in main_picked:
            continue
        if s["zt"] >= 2 and s.get("main_inflow", 0) > 0 and len(main_picked) < 3:
            s["label"] = "次主线"
            main_picked.append(s)
    labeled = {s["name"]: s for s in main_picked}
    huo = 0
    for s in candidates:
        if s["name"] in labeled:
            continue
        if s["zt"] >= 1 and s.get("main_inflow", 0) > 0 and huo < 3:
            s["label"] = "活口"
            labeled[s["name"]] = s
            huo += 1
    st_chains = sorted((s for s in candidates if s["st"] > 0 and s["st"] >= s["zt"] - s["st"]),
                       key=lambda x: -x["st"])
    for s in st_chains[:1]:
        s["label"] = "情绪链"
        labeled[s["name"]] = s
    obs = 0
    for b in board_flow:
        if obs >= 3:
            break
        n = b["name"]
        if n in labeled or ind_stats.get(n):
            continue
        if b.get("main_inflow", 0) > 2e8 and b.get("change_pct", 0) > 1:
            labeled[n] = {
                "name": n, "bk_code": b.get("bk_code"), "main_inflow": b["main_inflow"],
                "change_pct": b["change_pct"], "zt": 0, "max_lbc": 0, "members": [],
                "st": 0, "leader": b.get("leader"), "label": "观察",
            }
            obs += 1
    # 失败轮动：昨日主线/次主线今日掉队
    try:
        prev = db.query(
            "SELECT name FROM sector_history WHERE date < ? AND label IN ('主线','次主线') ORDER BY date DESC LIMIT 8",
            (trade_date,),
        )
        prev_names = {r["name"] for r in prev}
        fail = 0
        for b in board_flow:
            if fail >= 2:
                break
            n = b["name"]
            if n in prev_names and n not in labeled and (b.get("change_pct", 0) < 0 or b.get("main_inflow", 0) < 0):
                labeled[n] = {
                    "name": n, "bk_code": b.get("bk_code"), "main_inflow": b.get("main_inflow", 0),
                    "change_pct": b.get("change_pct", 0), "zt": 0, "max_lbc": 0, "members": [],
                    "st": 0, "leader": b.get("leader"), "label": "失败轮动",
                }
                fail += 1
    except Exception:
        pass

    # ---- 板块卡片 ----
    label_order = {"主线": 0, "次主线": 1, "活口": 2, "情绪链": 3, "观察": 4, "失败轮动": 5}
    sectors = []
    for s in sorted(labeled.values(), key=lambda x: (label_order[x["label"]], -score_of(x))):
        members = sorted(s["members"], key=lambda m: (-m["lbc"], -m["fund"]))[:5]
        sectors.append({
            "label": s["label"],
            "verdict": review_rules.label_verdict(s["label"]),
            "name": s["name"],
            "bk_code": s.get("bk_code"),
            "main_inflow": s.get("main_inflow", 0),
            "change_pct": s.get("change_pct", 0),
            "zt_count": s["zt"],
            "max_lbc": s["max_lbc"],
            "st_count": s["st"],
            "members": [
                {"code": m["code"], "name": m["name"], "change_pct": m["change_pct"],
                 "lbc": int(m["lbc"])} for m in members
            ],
            "analysis": review_rules.sector_analysis_text({**s, "members": members}),
        })

    # ---- 主线/次主线四分层（龙头/跟随/补涨/掉队）----
    for sec in sectors:
        if sec["label"] not in ("主线", "次主线") or not sec["bk_code"]:
            continue
        if sum(1 for x in sectors if "layers" in x) >= 3:
            continue
        try:
            stocks = await em.fetch_board_stocks(sec["bk_code"], pz=60)
        except Exception:
            continue
        zt_codes = {m["code"] for m in sec["members"]}
        leaders = [m for m in sec["members"] if m["lbc"] == sec["max_lbc"] and sec["max_lbc"] >= 2]
        followers = [m for m in sec["members"] if m not in leaders]
        changers = [
            {"code": x["code"], "name": x["name"], "change_pct": x["change_pct"]}
            for x in stocks if x["code"] not in zt_codes and 2 < x["change_pct"] < 9.5
        ][:3]
        laggards = [
            {"code": x["code"], "name": x["name"], "change_pct": x["change_pct"]}
            for x in sorted(stocks, key=lambda s2: s2["change_pct"])[:3]
            if x["change_pct"] < 0
        ]
        sec["layers"] = {
            "龙头层": leaders[:3] or [{"name": "高度不足", "lbc": sec["max_lbc"]}],
            "跟随层": followers[:3],
            "补涨层": changers,
            "掉队层": laggards,
        }

    # ---- 资金流证据 ----
    def yi(v: float) -> float:
        return round(v / 1e8, 2)

    capital = {
        "industry_in_top5": [
            {"name": b["name"], "main_inflow": b["main_inflow"], "change_pct": b["change_pct"]}
            for b in sorted(board_flow, key=lambda x: -x.get("main_inflow", 0))[:5]
        ],
        "industry_out_top5": [
            {"name": b["name"], "main_inflow": b["main_inflow"], "change_pct": b["change_pct"]}
            for b in sorted(board_flow, key=lambda x: x.get("main_inflow", 0))[:5]
            if b.get("main_inflow", 0) < 0
        ],
        "stock_in_top5": [
            {"code": s["code"], "name": s["name"], "change_pct": s["change_pct"],
             "main_inflow": s["main_inflow"]} for s in flow_in[:5]
        ],
        "stock_out_top5": [
            {"code": s["code"], "name": s["name"], "change_pct": s["change_pct"],
             "main_inflow": s["main_inflow"]} for s in flow_out[:5]
        ],
    }

    # ---- 情绪阶段 ----
    sentiment = review_rules.sentiment_stage(
        len(zt_non_st), zt_total, zb_count, limit_stats["dt_count"], max_lb
    )
    sentiment["assist"] = (
        f"封住涨停 {zt_total} 只（非ST {len(zt_non_st)} / ST {len(zt_st)}）、触及涨停+炸板 {touched} 只、"
        f"最高连板 {max_lb} 板、炸板 {zb_count} 只、跌停 {limit_stats['dt_count']} 只"
    )

    # ---- 今日核心判断（编号化结论，全部由当日数据推导） ----
    main_secs = [s for s in sectors if s["label"] in ("主线", "次主线")]
    j1_dir = "偏强" if breadth["ratio"] >= 0.55 else ("偏弱" if breadth["ratio"] <= 0.45 else "均衡")
    j1_hint = "可顺势但控仓位" if breadth["ratio"] >= 0.58 else "不必追高"
    j1 = {
        "no": 1, "tag": "指数方向",
        "text": f"市场广度{breadth['label']}（上涨 {up} 家 / 下跌 {down} 家，{breadth['gauge']}%），方向{j1_dir}，指数层面{j1_hint}。",
    }
    j2_attitude = "接力情绪尚可，前排为主" if zb_rate < 0.3 else "分歧偏大，慎追后排"
    j2 = {
        "no": 2, "tag": "情绪与温度",
        "text": f"情绪处于「{sentiment['stage']}」（温度 {sentiment['gauge']}/100），炸板率 {zb_rate*100:.0f}%，最高 {max_lb} 板；{j2_attitude}。",
    }
    if capital["industry_in_top5"]:
        top_flow = capital["industry_in_top5"][0]
        j3_text = (
            f"资金主线：{'、'.join(s['name'] for s in main_secs[:3]) if main_secs else '暂无明确主线'}；"
            f"行业净流入第一为 {top_flow['name']}（{top_flow['main_inflow']/1e8:+.1f} 亿）。"
        )
    else:
        j3_text = "资金主线暂不清晰，等待量能聚焦。"
    j3 = {"no": 3, "tag": "主线与资金", "text": j3_text}
    judgments = [j1, j2, j3]

    # ---- 下一步观察（次日关键观察点） ----
    next_watch = []
    if main_secs:
        next_watch.append(f"主线「{main_secs[0]['name']}」前排票能否继续承接量能（容量票不转弱）")
    if zb_rate >= 0.25:
        next_watch.append(f"炸板率能否从 {zb_rate*100:.0f}% 回落至 25% 以下（分歧收敛信号）")
    if limit_stats["dt_count"] >= 3:
        next_watch.append(f"跌停 {limit_stats['dt_count']} 只是否扩散（亏钱效应是否加重）")
    if max_lb >= 5 and limit_stats["max_lb_stock"]:
        next_watch.append(f"{limit_stats['max_lb_stock']['name']}能否晋级打开连板空间")
    next_watch.append("两市成交额能否维持（缩量则降低预期）")
    next_watch = [{"text": t} for t in next_watch[:5]]

    # ---- 风险雷达（六维，0-100，越高风险越大） ----
    flow_out_total = sum(abs(x["main_inflow"]) for x in capital["industry_out_top5"])
    flow_in_total = sum(x["main_inflow"] for x in capital["industry_in_top5"]) or 1.0
    risk_radar = {
        "dims": ["情绪过热", "分歧炸板", "亏钱效应", "广度失衡", "连板过热", "资金流出"],
        "values": [
            round(sentiment["gauge"]),
            round(min(100, zb_rate * 220)),
            round(min(100, limit_stats["dt_count"] * 18 + 12)),
            round(min(100, (down / max(1, up + down)) * 130)),
            round(min(100, max_lb / 7 * 100)),
            round(min(100, flow_out_total / (flow_out_total + flow_in_total) * 120)),
        ],
    }

    now = datetime.now()
    status = "intraday" if (trade_date == now.strftime("%Y-%m-%d") and now.hour < 15) else "closed"

    payload = {
        "date": trade_date,
        "status": status,
        "generated_at": db.now_str(),
        "engine": "rule",
        "summary": "",
        "risk": "",
        "market": market,
        "limit_stats": limit_stats,
        "capital": capital,
        "sectors": sectors,
        "sentiment": sentiment,
        "judgments": judgments,
        "next_watch": next_watch,
        "risk_radar": risk_radar,
        "rotation_table": [
            {
                "direction": s["name"],
                "position": s["label"],
                "volume_price": f"{'净流入' if s['main_inflow'] >= 0 else '净流出'} {abs(yi(s['main_inflow']))} 亿 / {s['change_pct']:+.2f}%",
                "members": "、".join(m["name"] for m in s["members"][:4]) or (s.get("leader") or "-"),
                "verdict": s["verdict"],
                "layers": s.get("layers"),
            }
            for s in sectors
        ],
        "lhb": lhb[:10],
        "warnings": warnings,
        "source_status": registry.all(),
    }

    # ---- 叙事生成（LLM 优先，规则兜底）----
    narrative = await review_narrative(payload)
    payload["summary"] = narrative["summary"]
    payload["risk"] = narrative["risk"]
    payload["engine"] = narrative["engine"]

    # ---- 存档 ----
    db.execute(
        "INSERT INTO review_cache(date,payload,engine) VALUES(?,?,?) "
        "ON CONFLICT(date) DO UPDATE SET payload=excluded.payload, engine=excluded.engine",
        (trade_date, json.dumps(payload, ensure_ascii=False), payload["engine"]),
    )
    db.executemany(
        "INSERT INTO sector_history(date,label,name,score) VALUES(?,?,?,?) "
        "ON CONFLICT(date,label,name) DO UPDATE SET score=excluded.score",
        [(trade_date, s["label"], s["name"], yi(s["main_inflow"])) for s in sectors],
    )
    return payload


async def cached_dates() -> list[str]:
    return [r["date"] for r in db.query("SELECT date FROM review_cache ORDER BY date DESC LIMIT 60")]
