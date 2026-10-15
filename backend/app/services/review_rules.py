"""复盘规则引擎：情绪阶段判定、板块定位裁定、无 LLM 时的叙事模板。"""
from __future__ import annotations


def sentiment_stage(zt_non_st: int, zt_total: int, zb_count: int, dt_count: int, max_lb: int) -> dict:
    """情绪运行阶段：冰点 → 修复 → 发酵 → 高潮 → 退潮。返回 stage + gauge(0-100)。"""
    zb_rate = zb_count / max(1, zt_total + zb_count)
    # 复合温度分：涨停数(40) + 连板高度(25) + 赚钱效应(25) + 亏钱效应修正(10)
    s_zt = min(40.0, zt_total / 130 * 40)
    s_lb = min(25.0, max_lb / 7 * 25)
    s_eff = max(0.0, 25.0 * (1 - zb_rate / 0.5))  # 炸板率越高越低
    s_dt = max(0.0, 10.0 - dt_count * 2)
    gauge = round(s_zt + s_lb + s_eff + s_dt)

    if zt_total <= 25 and dt_count >= max(3, zt_total * 0.3):
        stage, pos = "冰点", "冰点，等待出清信号"
    elif zb_rate >= 0.40 and s_zt < 20 or (dt_count > zt_total * 0.5):
        stage, pos = "退潮", "退潮收缩，严格控制仓位"
    elif zt_total >= 100 and max_lb >= 5:
        stage, pos = "高潮", "高潮区，只做前排不追后排"
    elif zt_total >= 55 or (zt_total >= 40 and max_lb >= 4):
        stage, pos = "发酵", "发酵扩散偏高潮" if gauge >= 55 else "发酵初期"
    else:
        stage, pos = "修复", "修复期，关注前排强度延续"

    return {"stage": stage, "gauge": gauge, "position_text": pos, "zb_rate": round(zb_rate, 3)}


def direction_gauge(up: int, down: int) -> dict:
    total = max(1, up + down)
    ratio = up / total
    pct = round(ratio * 100, 1)
    if ratio >= 0.58:
        label = "偏强扩散"
    elif ratio >= 0.45:
        label = "多空均衡"
    else:
        label = "偏弱收敛"
    return {"gauge": pct, "label": label, "up": up, "down": down,
            "ratio": round(ratio, 3)}


def label_verdict(label: str) -> str:
    return {
        "主线": "主线最强",
        "次主线": "次级留存",
        "活口": "活口观察",
        "情绪链": "情绪链延续",
        "观察": "观察等待",
        "失败轮动": "降级离场",
    }.get(label, "观察")


def sector_analysis_text(s: dict) -> str:
    inflow_yi = s["main_inflow"] / 1e8
    flow_txt = f"净流入 {inflow_yi:.1f} 亿" if inflow_yi >= 0 else f"净流出 {abs(inflow_yi):.1f} 亿"
    members = "、".join(m["name"] for m in s["members"][:3]) if s["members"] else "暂无代表个股"
    zt = s.get("zt", s.get("zt_count", 0))
    return (
        f"{s['name']}{flow_txt}，板块涨幅 {s['change_pct']:+.2f}%，涨停 {zt} 只，"
        f"最高 {s['max_lbc']} 板；代表个股：{members}。"
    )


def narrative_fallback(d: dict) -> dict:
    """无 LLM 时的规则叙事：用当日数据生成总收口与风险提示。"""
    ls = d.get("limit_stats", {})
    sent = d.get("sentiment", {})
    mk = d.get("market", {})
    caps = d.get("capital", {})
    sectors = d.get("sectors", [])

    main_names = [s["name"] for s in sectors if s["label"] in ("主线", "次主线")][:3]
    follow_names = [s["name"] for s in sectors if s["label"] in ("活口", "观察")][:3]
    zt, zb, dt = ls.get("zt_total", 0), ls.get("zb_count", 0), ls.get("dt_count", 0)
    lb = ls.get("max_lb", 0)
    up, down = mk.get("breadth", {}).get("up", 0), mk.get("breadth", {}).get("down", 0)
    idx_txt = "、".join(
        f"{i['name']}{i['change_pct']:+.2f}%" for i in mk.get("indexes", [])[:2]
    )

    main_txt = "、".join(main_names) if main_names else "暂无明确主线"
    follow_txt = "、".join(follow_names) if follow_names else "其他方向零散跟随"
    stage = sent.get("stage", "修复")

    if stage in ("高潮", "发酵"):
        nature = f"情绪处于{stage}区（温度 {sent.get('gauge')}/100）"
    elif stage == "退潮":
        nature = f"情绪退潮（温度 {sent.get('gauge')}/100），赚钱效应收缩"
    elif stage == "冰点":
        nature = f"情绪冰点（温度 {sent.get('gauge')}/100），等待出清"
    else:
        nature = f"情绪修复期（温度 {sent.get('gauge')}/100）"

    summary = (
        f"今日 {idx_txt}，上涨 {up} 家 / 下跌 {down} 家，{nature}。"
        f"资金主线集中在{main_txt}，{follow_txt}跟随；"
        f"涨停 {zt} 只、炸板 {zb} 只、跌停 {dt} 只，最高连板 {lb} 板。"
        f"风险不在指数方向，而在炸板率 {sent.get('zb_rate', 0)*100:.0f}% 偏高，"
        f"后排普涨不能视作主线的同等延续。"
    )
    risk = (
        f"涨停 {zt} 只的规模要求次日只看前排和容量承接，不能把普涨后排当作确定延续；"
        f"{main_names[0] if main_names else '当前主线'}若容量票转弱则主线降级；"
        f"炸板 {zb} 只、跌停 {dt} 只并未消失，后排追涨风险仍高，"
        f"情绪链（ST）只作温度参考，不做主线外推。"
    )
    return {"summary": summary, "risk": risk}
