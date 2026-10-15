import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ValItem } from "../lib/api";
import { Card, CardTitle, Button, Badge, Stat, Skeleton } from "../components/ui";
import { GaugeChart } from "../components/Gauge";
import { EChart } from "../components/EChart";
import { pctColor, fmtPct, fmtYi } from "../lib/format";

/** 风险提示与情绪监控 + 风险雷达 + 估值监测（整合） */
const RiskSignal: React.FC = () => {
  const navigate = useNavigate();
  const { data: d, isLoading } = useQuery({
    queryKey: ["review", undefined],
    queryFn: () => api.review(),
    refetchInterval: 120000,
  });
  const { data: val } = useQuery({
    queryKey: ["valuation"],
    queryFn: api.valuation,
    staleTime: 3600000,
  });

  if (isLoading || !d)
    return <Card className="p-6 text-sm text-mut">情绪与风险数据加载中…（首次生成约需数秒）</Card>;

  const ls = d.limit_stats;
  const sent = d.sentiment;
  const zbRate = ls.zb_rate;
  const risks: { level: "high" | "mid" | "low"; text: string }[] = [];
  if (zbRate >= 0.3) risks.push({ level: "high", text: `炸板率 ${(zbRate * 100).toFixed(0)}% 偏高（炸板 ${ls.zb_count}/触及 ${ls.zt_touched}），次日注意前排与容量承接，勿追后排。` });
  if (ls.dt_count >= 3) risks.push({ level: "high", text: `跌停 ${ls.dt_count} 只，亏钱效应未消失，注意规避高位补跌。` });
  if (sent.stage === "退潮") risks.push({ level: "high", text: "情绪处于退潮期，降低仓位，只做确定性机会。" });
  if (sent.stage === "高潮") risks.push({ level: "mid", text: "情绪高潮区，谨防分歧转一致后的退潮，逢一致转分歧兑现。" });
  if (ls.zt_total >= 100) risks.push({ level: "mid", text: `涨停 ${ls.zt_total} 只规模较大，普涨次日分化概率高。` });
  if (!risks.length) risks.push({ level: "low", text: "当前暂无明显系统性风险信号，正常跟踪主线强度即可。" });

  const LEVEL_STYLE = {
    high: "border-down/50 bg-down/10 text-down",
    mid: "border-gold/50 bg-gold/10 text-gold",
    low: "border-up/40 bg-up/10 text-up",
  };
  const LEVEL_NAME = { high: "高风险", mid: "中风险", low: "低风险" };

  const radar = d.risk_radar;
  const radarOption: any = radar
    ? {
        tooltip: { backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#e6edf3", fontSize: 12 } },
        radar: {
          indicator: radar.dims.map((n) => ({ name: n, max: 100 })),
          splitArea: { areaStyle: { color: ["transparent", "rgba(88,166,255,0.04)"] } },
          axisLine: { lineStyle: { color: "#30363d" } },
          splitLine: { lineStyle: { color: "#21262d" } },
          axisName: { color: "#8b949e", fontSize: 11 },
        },
        series: [{
          type: "radar",
          data: [{
            value: radar.values,
            name: "风险强度",
            areaStyle: { color: "rgba(239,68,68,0.25)" },
            lineStyle: { color: "#ef4444" },
            itemStyle: { color: "#ef4444" },
          }],
        }],
      }
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold">风险提示与情绪监控</h1>
        <span className="text-[11px] text-mut">{d.date} · 每 2 分钟自动刷新</span>
        <Button className="ml-auto" onClick={() => navigate("/review")}>查看完整复盘</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="涨停（非ST/ST）" value={<span className="num text-up">{ls.zt_total}</span>} sub={`${ls.zt_non_st} / ${ls.zt_st}`} />
        <Stat label="炸板 / 炸板率" value={<span className="num text-gold">{ls.zb_count}</span>} sub={`${(zbRate * 100).toFixed(0)}%`} />
        <Stat label="跌停" value={<span className="num text-down">{ls.dt_count}</span>} />
        <Stat label="最高连板" value={<span className="num text-gold">{ls.max_lb} 板</span>} sub={ls.max_lb_stock ? `${ls.max_lb_stock.name}` : ""} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle icon="🌡">情绪温度</CardTitle>
          <GaugeChart value={sent.gauge} label={sent.stage} sublabel={sent.position_text} />
          <div className="px-4 pb-3 text-[11px] text-mut">{sent.assist}</div>
        </Card>
        <Card>
          <CardTitle icon="📡" extra={<span className="text-[11px] text-mut">六维风险强度（越高越危险）</span>}>风险雷达</CardTitle>
          {radarOption ? <EChart option={radarOption} height={260} /> : <div className="p-6 text-center text-mut text-sm">数据生成中…</div>}
        </Card>
      </div>

      <Card>
        <CardTitle icon="🚨">当日风险清单（AI 规则引擎逐项判定）</CardTitle>
        <div className="space-y-2 p-4">
          {risks.map((r, i) => (
            <div key={i} className={`rounded-md border px-3 py-2 text-[12.5px] leading-6 ${LEVEL_STYLE[r.level]}`}>
              <Badge className={`mr-2 ${LEVEL_STYLE[r.level]}`}>{LEVEL_NAME[r.level]}</Badge>
              {r.text}
            </div>
          ))}
        </div>
      </Card>

      <ValuationPanel val={val} />

      <Card className="border-down/30">
        <CardTitle icon="📋">复盘风险边界（AI 结论）</CardTitle>
        <div className="px-4 py-3 text-[13px] leading-7">{d.risk}</div>
      </Card>

      {d.sectors.some((s) => s.label === "失败轮动") && (
        <Card>
          <CardTitle icon="♻️">失败轮动追踪（昨日强方向今日掉队）</CardTitle>
          <div className="space-y-2 p-4 text-[12.5px]">
            {d.sectors.filter((s) => s.label === "失败轮动").map((s) => (
              <div key={s.name}>
                <span className="font-medium">{s.name}</span>
                <span className={`num ml-2 ${pctColor(s.change_pct)}`}>{fmtPct(s.change_pct)}</span>
                <span className="num ml-2 text-mut">{fmtYi(s.main_inflow)}</span>
                <div className="mt-1 text-mut">{s.analysis}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

/** 估值监测：指数 PE/PB 历史分位（高位提醒 / 低位机会） */
export const ValuationPanel: React.FC<{ val?: { core: ValItem[]; high: ValItem[]; low: ValItem[]; count: number; updated_at: string } | undefined }> = ({ val }) => {
  if (!val)
    return <Card className="p-4"><Skeleton className="h-40" /></Card>;
  const barColor = (level: string) => (level === "high" ? "#ef4444" : level === "low" ? "#22c55e" : "#e3b341");
  return (
    <Card>
      <CardTitle icon="📏" extra={<span className="text-[11px] text-mut">数据源：蛋卷基金 · {val.count} 个指数 · {val.updated_at?.slice(5, 16)}</span>}>
        估值监测（历史分位，仅价格参考）
      </CardTitle>
      <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-2">
        <div className="rounded-md border border-down/40 bg-down/5 px-3 py-2 text-[12px] text-down">
          ⚠ 高位提醒（分位 ≥70%）：
          {val.high.length ? val.high.slice(0, 4).map((x) => `${x.name} ${x.percentile}%`).join(" / ") : "暂无"}
        </div>
        <div className="rounded-md border border-up/40 bg-up/5 px-3 py-2 text-[12px] text-up">
          ✓ 低位机会（分位 ≤30%）：
          {val.low.length ? val.low.slice(0, 4).map((x) => `${x.name} ${x.percentile}%`).join(" / ") : "暂无"}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 pb-4 md:grid-cols-2">
        {val.core.map((x) => (
          <div key={x.code}>
            <div className="flex items-center justify-between text-[12px]">
              <span className="flex items-center gap-1.5">
                {x.name}
                <Badge className={
                  x.level === "high" ? "border-up/40 bg-up/10 text-up"
                    : x.level === "low" ? "border-down/40 bg-down/10 text-down"
                      : "border-gold/40 bg-gold/10 text-gold"
                }>{x.label}</Badge>
                <span className="num text-[10px] text-mut">{x.basis}{x.basis === "PE-TTM" ? ` ${x.pe ?? "—"}` : ` ${x.pb ?? "—"}`}</span>
              </span>
              <span className="num font-semibold" style={{ color: barColor(x.level) }}>{x.percentile}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-card2">
              <div className="h-full rounded-full" style={{ width: `${x.percentile}%`, background: `linear-gradient(90deg,#22c55e,#e3b341 55%,#ef4444)`, opacity: 0.85 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] leading-5 text-mut">
        口径说明：优先使用 PE-TTM 历史分位（面板值）；亏损行业采用 PB 分位。估值分位仅代表历史相对位置，不构成投资建议。
      </div>
    </Card>
  );
};

export default RiskSignal;
