import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardTitle, SkeletonCard, Badge, Button } from "../components/ui";
import { Sparkline } from "../components/Sparkline";
import { StockCard } from "../components/StockCard";
import { pctColor, fmtPct, fmtNum } from "../lib/format";
import { useAppStore } from "../lib/store";

const MA_LABEL: Record<string, string> = { bull: "多头", bear: "空头" };
const sigKey = (secid: string, code: string) => {
  if (code.includes(".")) return code; // 降级源已是 sh000001 形式
  const m = secid.split(".")[0];
  return `${m === "1" ? "sh" : "sz"}${code}`;
};

const Dashboard: React.FC = () => {
  const { watchInterval } = useAppStore();
  const navigate = useNavigate();
  const { data: idxData, isLoading: idxLoading } = useQuery({
    queryKey: ["indexes"],
    queryFn: api.indexes,
    refetchInterval: 5000,
  });
  const { data: globalData } = useQuery({
    queryKey: ["globalQuotes"],
    queryFn: api.globalQuotes,
    refetchInterval: 30000,
  });
  const { data: sigData } = useQuery({ queryKey: ["indexSignals"], queryFn: api.indexSignals, staleTime: 300000 });
  const { data: hotData } = useQuery({ queryKey: ["hotStocks"], queryFn: api.hotStocks, refetchInterval: 60000 });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["watchOverview"],
    queryFn: api.watchOverview,
    refetchInterval: Math.max(3, watchInterval) * 1000,
  });
  const { data: llm } = useQuery({ queryKey: ["llm"], queryFn: api.llmInfo });
  const { data: reviewMeta } = useQuery({
    queryKey: ["latestReview"],
    queryFn: async () => (await api.review()).summary,
    refetchInterval: 60000,
    staleTime: 60000,
  });

  const indexes = idxData?.indexes ?? [];
  const showIdx = ["上证指数", "深证成指", "创业板指", "沪深300", "恒生指数"];
  const signals = sigData?.signals ?? {};

  return (
    <div className="space-y-4">
      {/* 全球市场条：海外指数 / 商品 / 汇率 */}
      {(globalData?.items?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
          {globalData!.items.map((g) => (
            <Card key={g.code} className="px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-mut">{g.name}</span>
                <span className={`text-[9px] ${g.kind === "商品" ? "text-gold" : g.kind === "汇率" ? "text-accent" : "text-mut/60"}`}>
                  {g.kind}
                </span>
              </div>
              <div className={`num text-sm font-semibold ${pctColor(g.change_pct)}`}>{fmtNum(g.price)}</div>
              <div className={`num text-[10px] ${pctColor(g.change_pct)}`}>{fmtPct(g.change_pct)}</div>
            </Card>
          ))}
        </div>
      )}

      {/* A 股核心指数（含技术信号） */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {idxLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} className="!p-3" />)}
        {!idxLoading &&
          indexes
            .filter((i) => showIdx.includes(i.name))
            .map((i) => {
              const sig = signals[sigKey(i.secid, i.code)];
              return (
                <Card key={i.code} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-[11px] text-mut">
                        {i.name}
                        {i.degraded_source && <span className="text-gold/70" title={i.degraded_source}>●</span>}
                      </div>
                      <div className={`num text-lg font-bold ${pctColor(i.change_pct)}`}>{fmtNum(i.price)}</div>
                      <div className={`num text-[11px] ${pctColor(i.change_pct)}`}>{fmtPct(i.change_pct)}</div>
                    </div>
                    <Sparkline data={i.sparkline} up={i.change_pct >= 0} />
                  </div>
                  {sig && (
                    <div className="mt-1.5 flex gap-1.5 text-[10px]">
                      <Badge className={sig.ma_alignment === "bull" ? "border-up/40 text-up" : sig.ma_alignment === "bear" ? "border-down/40 text-down" : "border-line text-mut"}>
                        均线{MA_LABEL[sig.ma_alignment ?? ""] ?? "纠缠"}
                      </Badge>
                      <Badge className={sig.macd_trend === "bull" || sig.macd_trend === "golden" ? "border-up/40 text-up" : sig.macd_trend === "bear" || sig.macd_trend === "dead" ? "border-down/40 text-down" : "border-line text-mut"}>
                        MACD {sig.macd_trend === "golden" ? "金叉" : sig.macd_trend === "dead" ? "死叉" : MA_LABEL[sig.macd_trend ?? ""] ?? "—"}
                      </Badge>
                      <Badge className="border-line text-mut">RSI6 {sig.rsi6 ?? "—"}</Badge>
                    </div>
                  )}
                </Card>
              );
            })}
      </div>

      {/* 复盘摘要 / 热门个股 / AI 引擎 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon="🧭" extra={<Link to="/review"><Button>进入复盘大师</Button></Link>}>
            最新复盘 · 一句话总收口
          </CardTitle>
          <div className="px-4 py-3 text-[13px] leading-6 text-fg/90">
            {reviewMeta ?? "点击「进入复盘大师」生成最新复盘…"}
          </div>
        </Card>
        <Card>
          <CardTitle icon="🔥" extra={<span className="text-[11px] text-mut">东方财富人气榜</span>}>热门个股</CardTitle>
          <div className="divide-y divide-line/40">
            {(hotData?.items ?? []).slice(0, 5).map((h) => (
              <button
                key={h.code}
                onClick={() => navigate(`/ai-analysis?code=${h.code}`)}
                className="flex w-full items-center gap-2 px-4 py-2 text-[12px] hover:bg-card2"
              >
                <span className={`num flex h-5 w-5 items-center justify-center rounded text-[10px] ${h.rank <= 3 ? "bg-up/20 text-up" : "bg-card2 text-mut"}`}>
                  {h.rank}
                </span>
                <span className="flex-1 truncate text-left">{h.name}</span>
                <span className="num text-mut">{fmtNum(h.price)}</span>
                <span className={`num w-14 text-right ${pctColor(h.change_pct)}`}>{fmtPct(h.change_pct)}</span>
              </button>
            ))}
            {(hotData?.items?.length ?? 0) === 0 && (
              <div className="px-4 py-3 text-[12px] text-mut">人气榜暂不可用</div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle icon="🤖">AI 引擎状态</CardTitle>
          <div className="space-y-2 px-4 py-3 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="text-mut">分析引擎</span>
              {llm?.available ? (
                <Badge className="border-up/40 bg-up/15 text-up">LLM · {llm.model}</Badge>
              ) : (
                <Badge className="border-gold/40 bg-gold/15 text-gold">本地规则引擎</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-mut">数据源交叉校验</span>
              <Badge className="border-line bg-card2 text-mut">腾讯 + 新浪 + 东财 + 蛋卷</Badge>
            </div>
            <div className="text-[11px] leading-4 text-mut">
              {llm?.available
                ? "已接入 LLM，复盘报告与对话由大模型生成，全部结论附带数据依据与置信度。"
                : "未配置 LLM_API_KEY，由本地规则引擎生成分析（同样附带数据依据）。在后端环境变量配置后自动升级为 LLM。"}
            </div>
          </div>
        </Card>
        <Card>
          <CardTitle icon="📌">快捷入口</CardTitle>
          <div className="grid grid-cols-2 gap-2 p-4 text-[12px]">
            <Link to="/risk-signal" className="rounded-md border border-line bg-card2 px-3 py-2 text-center hover:border-accent/40">风险雷达 / 估值</Link>
            <Link to="/sector" className="rounded-md border border-line bg-card2 px-3 py-2 text-center hover:border-accent/40">景气热力图 / ETF</Link>
            <Link to="/watchlist" className="rounded-md border border-line bg-card2 px-3 py-2 text-center hover:border-accent/40">模拟交易</Link>
            <Link to="/reports" className="rounded-md border border-line bg-card2 px-3 py-2 text-center hover:border-accent/40">历史报告</Link>
          </div>
        </Card>
      </div>

      {/* 自选股卡片墙 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">关注股票（{data?.items.length ?? 0}）</h2>
        <span className="text-[11px] text-mut">盘中每 {Math.max(3, watchInterval)} 秒自动刷新</span>
      </div>
      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {isError && <Card className="p-4 text-sm text-down">行情加载失败，请检查后端服务或点击「刷新行情」。</Card>}
      {!isLoading && data && data.items.length === 0 && (
        <Card className="p-6 text-center text-sm text-mut">
          还没有自选股。前往 <Link className="text-accent" to="/watchlist">「自选盯盘」</Link> 批量添加股票代码。
        </Card>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((it) => <StockCard key={it.code} item={it} />)}
      </div>
    </div>
  );
};

export default Dashboard;
