"""复盘路由：复盘聚合、历史日期、Markdown/CSV 导出。"""
import csv
import io
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .. import db
from ..services.review import build_review, cached_dates

router = APIRouter(prefix="/api/review", tags=["review"])


@router.get("")
async def review(date: str | None = None, refresh: bool = False):
    try:
        return await build_review(date, refresh)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"复盘数据生成失败: {e}")


@router.get("/dates")
async def dates():
    return {"dates": await cached_dates()}


def _to_markdown(p: dict) -> str:
    ls, sent = p["limit_stats"], p["sentiment"]
    lines = [
        f"# SmartInvest Pro 复盘报告 · {p['date']}",
        f"> 生成时间 {p['generated_at']} · 引擎 {p['engine']} · 状态 {p['status']}",
        "",
        "## 一句话总收口",
        p["summary"],
        "",
        "## 盘型环境",
        f"- 上涨 {sent and p['market']['breadth']['up']} 家 / 下跌 {p['market']['breadth']['down']} 家，方向判定：{p['market']['breadth']['label']}",
        *[f"- {i['name']} {i['price']}（{i['change_pct']:+.2f}%）" for i in p["market"]["indexes"]],
        "",
        "## 涨跌停",
        f"- 涨停 {ls['zt_total']}（非ST {ls['zt_non_st']} / ST {ls['zt_st']}），炸板 {ls['zb_count']}（炸板率 {ls['zb_rate']*100:.0f}%），跌停 {ls['dt_count']}，最高连板 {ls['max_lb']} 板",
        "",
        "## 资金流向",
        "### 行业净流入 TOP5",
        *[
            f"- {x['name']}：{x['main_inflow']/1e8:+.1f} 亿（{x['change_pct']:+.2f}%）"
            for x in p["capital"]["industry_in_top5"]
        ],
        "### 行业净流出 TOP5",
        *[
            f"- {x['name']}：{x['main_inflow']/1e8:+.1f} 亿（{x['change_pct']:+.2f}%）"
            for x in p["capital"]["industry_out_top5"]
        ],
        "",
        "## 主线与观察板块",
        *[f"### [{s['label']}] {s['name']}（{s['verdict']}）\n{s['analysis']}" for s in p["sectors"]],
        "",
        "## 风险提示",
        p["risk"],
        "",
        "## 情绪阶段",
        f"- 阶段：{sent['stage']}（温度 {sent['gauge']}/100，{sent['position_text']}）",
        f"- {sent['assist']}",
        "",
        "---",
        "数据来自公开行情接口，本报告由 AI 生成，仅供参考，不构成投资建议。投资有风险，入市需谨慎。",
    ]
    return "\n".join(lines)


def _to_csv(p: dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["类型", "名称/代码", "数值1", "数值2", "说明"])
    for i in p["market"]["indexes"]:
        w.writerow(["指数", i["name"], i["price"], f"{i['change_pct']}%", ""])
    for x in p["capital"]["industry_in_top5"]:
        w.writerow(["行业净流入", x["name"], round(x["main_inflow"] / 1e8, 2), f"{x['change_pct']}%", "亿元"])
    for x in p["capital"]["industry_out_top5"]:
        w.writerow(["行业净流出", x["name"], round(x["main_inflow"] / 1e8, 2), f"{x['change_pct']}%", "亿元"])
    for x in p["capital"]["stock_in_top5"]:
        w.writerow(["个股净流入", f"{x['name']}({x['code']})", round(x["main_inflow"] / 1e8, 2), f"{x['change_pct']}%", "亿元"])
    for x in p["capital"]["stock_out_top5"]:
        w.writerow(["个股净流出", f"{x['name']}({x['code']})", round(x["main_inflow"] / 1e8, 2), f"{x['change_pct']}%", "亿元"])
    for s in p["sectors"]:
        w.writerow(["板块", f"[{s['label']}] {s['name']}", round(s["main_inflow"] / 1e8, 2), f"{s['change_pct']}%", s["verdict"]])
    ls = p["limit_stats"]
    w.writerow(["涨跌停", "涨停", ls["zt_total"], ls["zb_rate"], f"炸板{ls['zb_count']} 跌停{ls['dt_count']} 连板{ls['max_lb']}"])
    return buf.getvalue()


@router.get("/{date}/export.md")
async def export_md(date: str):
    rows = db.query("SELECT payload FROM review_cache WHERE date=?", (date,))
    if not rows:
        raise HTTPException(404, "该日期无复盘存档")
    md = _to_markdown(json.loads(rows[0]["payload"]))
    return Response(md, media_type="text/markdown; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=review_{date}.md"})


@router.get("/{date}/export.csv")
async def export_csv(date: str):
    rows = db.query("SELECT payload FROM review_cache WHERE date=?", (date,))
    if not rows:
        raise HTTPException(404, "该日期无复盘存档")
    csv_text = _to_csv(json.loads(rows[0]["payload"]))
    return Response("\ufeff" + csv_text, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=review_{date}.csv"})
