import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, AriskData } from "../lib/api";
import { Card, CardTitle, Button, Badge, Stat, Skeleton, Empty } from "../components/ui";
import { EChart } from "../components/EChart";
import { pctColor, fmtNum, fmtYi } from "../lib/format";

/** 宏观风险 A-RISK：两层漏斗决策模型 + ERP/破净率/两融/成交/热力图/ETF 流向 */
const MacroRisk: React.FC = () => {
  const qc = useQueryClient();
  const [msg, setMsg] = React.useState("");
  const { data: d, isLoading } = useQuery({
    queryKey: ["arisk"],
    queryFn: api.arisk,
    staleTime: 600000,
  });

  const triggerUpdate = async () => {
    const r = await api.ariskUpdate();
    setMsg(r.started ? "已触发 A-RISK 全量抓数（约 2–3 分钟），完成后点「重读数据」" : r.reason || "触发失败");
    setTimeout(() => setMsg(""), 8000);
  };

  if (isLoading) return <Card className="p-6"><Skeleton className="h-64" /></Card>;
  if (!d?.available)
    return (
      <Card className="p-6 space-y-3">
        <div className="text-sm text-gold">A-RISK 数据不可用：{d?.reason}</div>
        <div className="text-[12px] text-mut">{d?.hint}</div>
      </Card>
    );

  const dm = d.decision!;
  const c = d.cards!;
  const schemeStyle: Record<string, string> = {
    ok: "border-up/50 bg-up/10 text-up",
    warn: "border-gold/50 bg-gold/10 text-gold",
    danger: "border-down/50 bg-down/10 text-down",
  };
  const l1Style = dm.l1.state === "expansion" ? "text-up" : dm.l1.state === "contraction" ? "text-down" : "text-mut";
  const ageH = d.age_hours ?? 999;
  const freshColor = ageH > 6 ? "text-down" : ageH > 2 ? "text-gold" : "text-up";
  const staleBadge = (stale?: boolean) =>
    stale ? <Badge className="border-gold/50 text-gold">⚠ 停留旧值</Badge> : null;

  const lineOpt = (series: { d: string; v: number }[], color: string, name: string, pctFmt = false): any => ({
    tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#e6edf3", fontSize: 12 } },
    grid: { left: 52, right: 14, top: 18, bottom: 24 },
    xAxis: { type: "category", data: series.map((x) => x.d.slice(2)), axisLabel: { color: "#8b949e", fontSize: 10 }, axisLine: { lineStyle: { color: "#30363d" } } },
    yAxis: { type: "value", scale: true, axisLabel: { color: "#8b949e", fontSize: 10, formatter: (v: number) => (pctFmt ? `${v}%` : v) }, splitLine: { lineStyle: { color: "#21262d" } } },
    series: [{ name, type: "line", data: series.map((x) => x.v), symbol: "none", lineStyle: { color, width: 1.6 }, areaStyle: { color: `${color}18` } }],
  });

  const turnSeries = c.turnover.series;
  const limitSeries = d.limit_7d ?? [];
  const etfSorted = [...(d.etf_categories?.categories ?? [])].sort((a, b) => (b.change_yi || 0) - (a.change_yi || 0));
  const etfMax = Math.max(1, ...etfSorted.map((x) => Math.abs(x.change_yi)));
  const sectors = [...(d.sector_live ?? [])].sort((a, b) => b.ret60 - a.ret60);
  const sectorColor = (r: number) => (r >= 20 ? "#ef4444" : r >= 8 ? "#e36248" : r >= 0 ? "#e3b341" : r >= -10 ? "#3f7d4e" : "#22c55e");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-base font-bold">宏观风险 · A-RISK</h1>
        <span className="num text-[11px] text-mut">
          数据 {d.generated_date} · <span className={freshColor}>{ageH < 1 ? `${Math.round(ageH * 60)} 分钟前` : `${ageH.toFixed(1)} 小时前`}更新</span>
        </span>
        <div className="no-print ml-auto flex gap-2">
          <Button onClick={triggerUpdate}>触发抓数更新</Button>
          <Button variant="primary" onClick={async () => { await api.ariskRefresh(); qc.invalidateQueries({ queryKey: ["arisk"] }); }}>重读数据</Button>
        </div>
      </div>
      {msg && <div className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent">{msg}</div>}

      {/* 两层漏斗决策模型 */}
      <Card>
        <CardTitle icon="🎯" extra={<span className="text-[11px] text-mut">战略预警 → 安全边际 → 仓位（回测 2016-2026：Sharpe 0.41）</span>}>
          两层漏斗决策模型 · 综合仓位建议
        </CardTitle>
        <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-card2/40 p-4">
            <Badge className="border-line bg-card text-mut">第一层 · 战略预警</Badge>
            <div className="mt-2 text-[12px] text-mut">{dm.l1.name}</div>
            <div className={`num mt-1 text-2xl font-bold ${l1Style}`}>{dm.l1.label}</div>
            <div className="mt-2 text-[11px] leading-5 text-mut">
              社融存量同比最新 {dm.l1.latest_yoy}%，Δ 序列（近月）：
              <span className="num"> {dm.l1.impulse.slice(-4).join(" / ")}</span>
              ；连续 2 月同号才确认方向。
            </div>
          </div>
          <div className="rounded-lg border border-line bg-card2/40 p-4">
            <Badge className="border-line bg-card text-mut">第二层 · 安全边际</Badge>
            <div className="mt-2 text-[12px] text-mut">{dm.l2.name}</div>
            <div className="num mt-1 text-2xl font-bold" style={{ color: dm.l2.score >= 80 ? "#ef4444" : dm.l2.score >= 60 ? "#e3b341" : "#22c55e" }}>
              {dm.l2.score} <span className="text-sm">{dm.l2.label}</span>
            </div>
            <div className="mt-2 space-y-1 text-[11px] text-mut">
              <div>ERP 位置（越低越贵）：<span className="num text-fg">{dm.l2.erp_position}%</span> · 权重 55%</div>
              <div>换手率位置：<span className="num text-fg">{dm.l2.turnover_position}%</span> · 权重 45%</div>
            </div>
          </div>
          <div className={`rounded-lg border p-4 ${schemeStyle[dm.position.scheme]}`}>
            <Badge className={schemeStyle[dm.position.scheme]}>决策输出</Badge>
            <div className="mt-2 text-[12px] text-mut">综合仓位建议</div>
            <div className="num mt-1 text-3xl font-bold">{dm.position.pct}</div>
            <div className="mt-2 text-[11.5px] leading-5 text-fg/85">{dm.position.desc}</div>
          </div>
        </div>
        {!dm.available && <div className="border-t border-line px-4 py-2 text-[11px] text-down">决策输入缺失：{dm.inputs_missing.join("；")}</div>}
      </Card>

      {/* 核心指标卡 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Stat label={<>沪深300 PE(TTM) {staleBadge(c.pe300.stale)}</>} value={<span className="num">{fmtNum(c.pe300.value)}</span>} sub={`ERP ${fmtNum(c.erp.value)}%`} />
        <Stat label={<>ERP 股权风险溢价 {staleBadge(c.erp.stale)}</>} value={<span className="num text-up">{fmtNum(c.erp.value)}%</span>} sub={`决策映射 ${c.erp.pct_mapped} · 5年分位 ${c.erp.pct_5y}%`} />
        <Stat label="中国 10Y 国债" value={<span className="num">{fmtNum(c.bond10y.value)}%</span>} />
        <Stat label={<>破净率（{c.below_net.count}/{c.below_net.total}）{staleBadge(c.below_net.stale)}</>} value={<span className="num">{fmtNum(c.below_net.ratio)}%</span>} sub={`5 年分位 ${c.below_net.pct5y}%`} />
        <Stat label={<>HV30 波动率 {staleBadge(c.hv30.stale)}</>} value={<span className="num">{fmtNum(c.hv30.value)}%</span>} sub={`分位 ${c.hv30.pct}%（仅描述颠簸）`} />
        <Stat label={<>两融余额 {staleBadge(c.margin.stale)}</>} value={<span className="num">{fmtNum(c.margin.latest)} 亿</span>} sub={c.margin.prev ? `较前期 ${(c.margin.latest! - c.margin.prev!).toFixed(0)} 亿` : ""} />
        <Stat label={<>两市成交额 {staleBadge(c.turnover.stale)}</>} value={<span className="num">{fmtNum(c.turnover.amount_yi, 0)} 亿</span>} sub={`换手 ${c.turnover.pct}%`} />
        <Stat label="涨跌停（最新日）" value={<span className="num"><span className="text-up">{limitSeries[limitSeries.length - 1]?.up ?? "—"}</span> / <span className="text-down">{limitSeries[limitSeries.length - 1]?.down ?? "—"}</span></span>} sub="涨停 / 跌停" />
      </div>

      {/* 图表区 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle icon="📈">ERP 股权风险溢价（近 5 年月末，%）</CardTitle>
          <div className="p-2"><EChart option={lineOpt(c.erp.series, "#58a6ff", "ERP")} height={220} /></div>
        </Card>
        <Card>
          <CardTitle icon="🏦">两融余额（亿元）</CardTitle>
          <div className="p-2"><EChart option={lineOpt(c.margin.daily, "#e3b341", "两融余额")} height={220} /></div>
        </Card>
        <Card>
          <CardTitle icon="💧">两市成交额（亿元）与换手率（%）</CardTitle>
          <div className="p-2">
            <EChart
              option={{
                tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#e6edf3", fontSize: 12 } },
                grid: { left: 56, right: 52, top: 18, bottom: 24 },
                legend: { data: ["成交额", "换手率"], textStyle: { color: "#8b949e", fontSize: 10 }, top: 0 },
                xAxis: { type: "category", data: turnSeries.map((x) => x.label), axisLabel: { color: "#8b949e", fontSize: 10 }, axisLine: { lineStyle: { color: "#30363d" } } },
                yAxis: [
                  { type: "value", axisLabel: { color: "#8b949e", fontSize: 10 }, splitLine: { lineStyle: { color: "#21262d" } } },
                  { type: "value", axisLabel: { color: "#8b949e", fontSize: 10, formatter: "{value}%" }, splitLine: { show: false } },
                ],
                series: [
                  { name: "成交额", type: "bar", data: turnSeries.map((x) => x.amount_yi), itemStyle: { color: "#58a6ff", opacity: 0.75 } },
                  { name: "换手率", type: "line", yAxisIndex: 1, data: turnSeries.map((x) => x.pct), symbol: "none", lineStyle: { color: "#ef4444", width: 1.6 } },
                ],
              }}
              height={220}
            />
          </div>
        </Card>
        <Card>
          <CardTitle icon="🧯">社融存量同比（%）与脉冲 Δ</CardTitle>
          <div className="p-2">
            <EChart
              option={{
                tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#e6edf3", fontSize: 12 } },
                grid: { left: 44, right: 44, top: 18, bottom: 24 },
                legend: { data: ["同比", "Δ 脉冲"], textStyle: { color: "#8b949e", fontSize: 10 }, top: 0 },
                xAxis: { type: "category", data: c.credit.rows.map((r) => r.m), axisLabel: { color: "#8b949e", fontSize: 10 }, axisLine: { lineStyle: { color: "#30363d" } } },
                yAxis: [
                  { type: "value", axisLabel: { color: "#8b949e", fontSize: 10, formatter: "{value}%" }, splitLine: { lineStyle: { color: "#21262d" } } },
                  { type: "value", splitLine: { show: false } },
                ],
                series: [
                  { name: "同比", type: "line", data: c.credit.rows.map((r) => r.g), symbol: "circle", symbolSize: 4, lineStyle: { color: "#3fb950", width: 1.6 } },
                  { name: "Δ 脉冲", type: "bar", yAxisIndex: 1, data: c.credit.rows.map((_: any, i: number) => c.credit.impulse[i] ?? null), itemStyle: { color: (p: any) => (p.value >= 0 ? "#ef4444" : "#22c55e") } },
                ],
              }}
              height={220}
            />
          </div>
        </Card>
      </div>

      {/* 申万行业热力图 */}
      <Card>
        <CardTitle icon="🔥" extra={<span className="text-[11px] text-mut">颜色=60 日累计涨跌（&gt;25% 估值透支警戒，&lt;-15% 启动潜力候选），小字=今日涨跌</span>}>
          申万一级行业热力图（60 日）
        </CardTitle>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-6">
          {sectors.map((s) => (
            <div key={s.code} className="rounded-lg border p-2.5" style={{ backgroundColor: `${sectorColor(s.ret60)}1f`, borderColor: `${sectorColor(s.ret60)}55` }}>
              <div className="truncate text-[12px] font-medium" style={{ color: sectorColor(s.ret60) }}>{s.n}</div>
              <div className="num text-base font-bold" style={{ color: sectorColor(s.ret60) }}>{s.ret60 >= 0 ? "+" : ""}{s.ret60.toFixed(1)}%</div>
              <div className={`num text-[10px] ${pctColor(s.today)}`}>今日 {s.today >= 0 ? "+" : ""}{s.today.toFixed(2)}%</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ETF 分类流向 + 偏股基金新发 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle icon="🧲" extra={<span className="text-[11px] text-mut">{d.etf_categories?.latest_date} vs {d.etf_categories?.prev_date}（约 60 交易日前）· 沪市份额变化</span>}>
            ETF 分类资金流向（亿元）
          </CardTitle>
          {etfSorted.length === 0 ? (
            <Empty text="暂无 ETF 分类数据" />
          ) : (
            <div className="space-y-1.5 p-4">
              {etfSorted.map((x) => {
                const chg = x.change_yi || 0;
                const inten = Math.abs(chg) / etfMax;
                const color = chg >= 0 ? "#ef4444" : "#22c55e";
                return (
                  <div key={x.category} className="flex items-center gap-2 text-[12px]">
                    <span className="w-24 shrink-0 truncate text-right text-mut">{x.category}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-card2">
                      <div className="h-full rounded" style={{ width: `${inten * 100}%`, backgroundColor: color, opacity: 0.75 }} />
                    </div>
                    <span className="num w-16 shrink-0 text-right" style={{ color }}>{chg >= 0 ? "+" : ""}{chg.toFixed(0)} 亿</span>
                    <span className="num hidden w-16 shrink-0 text-right text-mut sm:inline">{x.scale_yi.toFixed(0)} 亿</span>
                    <Badge className={`w-20 justify-center ${chg > 0 ? (inten >= 0.5 ? "border-up/50 text-up" : "border-up/20 text-up/70") : inten >= 0.5 ? "border-down/50 text-down" : "border-down/20 text-down/70"}`}>
                      {chg > 0 ? (inten >= 0.5 ? "主力流入" : "流入") : inten >= 0.5 ? "主力流出" : "流出"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card>
          <CardTitle icon="🆕">偏股基金新发（亿份/月）</CardTitle>
          <div className="p-2">
            <EChart
              option={{
                tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#e6edf3", fontSize: 12 } },
                grid: { left: 44, right: 12, top: 18, bottom: 24 },
                xAxis: { type: "category", data: (d.fund_issuance ?? []).map((x) => x.m), axisLabel: { color: "#8b949e", fontSize: 9 }, axisLine: { lineStyle: { color: "#30363d" } } },
                yAxis: { type: "value", axisLabel: { color: "#8b949e", fontSize: 10 }, splitLine: { lineStyle: { color: "#21262d" } } },
                series: [{ type: "bar", data: (d.fund_issuance ?? []).map((x) => x.v), itemStyle: { color: "#58a6ff", opacity: 0.8 } }],
              }}
              height={260}
            />
          </div>
          <div className="px-4 pb-3 text-[11px] leading-5 text-mut">新发冰点常对应底部区域（情绪反指），放量发行常出现在情绪高位。</div>
        </Card>
      </div>

      <div className="text-center text-[11px] text-mut">
        数据来源：乐咕乐股 / 央行 / 沪深交易所 / 东财 / 新浪（由 a-share-monitor 项目每交易日收盘后抓取）· 决策模型口径与回测结果仅供参考，不构成投资建议
      </div>
    </div>
  );
};

export default MacroRisk;
