import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, Badge, Skeleton } from "./ui";
import { pctColor, pctBg, fmtPct, fmtNum, arrow, maDir, MACD_LABEL, ACTION_STYLE } from "../lib/format";
import type { WatchItem } from "../lib/api";

/** 仪表盘关注股票卡片 */
export const StockCard: React.FC<{ item: WatchItem }> = ({ item }) => {
  const navigate = useNavigate();
  const q = item.quote ?? ({} as any);
  const sig = item.signal ?? {};
  const adv = sig.advice;
  const pct = q.change_pct;
  const profit =
    item.cost && q.price ? (q.price - item.cost) * (item.shares || 1) : null;

  return (
    <Card className="flex flex-col p-4 transition-colors hover:border-accent/40">
      <button className="text-left" onClick={() => navigate(`/ai-analysis?code=${q.code || item.code}`)}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">{q.name || item.name || item.code}</div>
            <div className="num text-[11px] text-mut">{item.code}</div>
          </div>
          <div className={`num text-right ${pctBg(pct)} rounded px-2 py-1`}>
            <div className={`text-lg font-bold leading-5 ${pctColor(pct)}`}>{fmtNum(q.price)}</div>
            <div className={`text-xs ${pctColor(pct)}`}>
              {arrow(pct)} {fmtPct(pct)}
            </div>
          </div>
        </div>

        {/* 均线 */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          {(["ma5", "ma10", "ma20"] as const).map((k) => (
            <div key={k} className="rounded bg-card2 px-2 py-1.5">
              <div className="text-mut">{k.toUpperCase()}</div>
              <div className="num">
                {fmtNum(sig.ma?.[k] ?? null)}{" "}
                <span className={pctColor(sig.ma_alignment === "bull" ? 1 : sig.ma_alignment === "bear" ? -1 : 0)}>
                  {k === "ma5" ? maDir(sig.ma) : ""}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* RSI / MACD / 量 */}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-mut">
          <span>RSI6 <span className="num text-fg">{sig.rsi6 ?? "—"}</span></span>
          <span>MACD <span className="text-fg">{MACD_LABEL[sig.macd_status ?? ""] ?? "—"}</span></span>
          <span>换手 <span className="num text-fg">{q.turnover_rate ? `${q.turnover_rate}%` : "—"}</span></span>
        </div>

        {/* 短期信号 */}
        <div className="mt-3 min-h-[32px] text-[12px] leading-5 text-fg/90">
          {sig.short_comment || <Skeleton className="h-4 w-full" />}
        </div>

        {/* 买卖价 */}
        {adv && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded bg-down/10 px-2 py-1.5">
              <span className="text-mut">支撑/买点 </span>
              <span className="num text-down">{fmtNum(adv.buy_price)}</span>
            </div>
            <div className="rounded bg-up/10 px-2 py-1.5">
              <span className="text-mut">压力/目标 </span>
              <span className="num text-up">{fmtNum(adv.target_price)}</span>
            </div>
          </div>
        )}

        {/* AI 建议 */}
        {adv && (
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <div className="flex items-center gap-2">
              <Badge className={ACTION_STYLE[adv.action] ?? ""}>{adv.action}</Badge>
              <span className="num text-[11px] text-mut">置信度 {adv.confidence}%</span>
            </div>
            {profit != null && (
              <span className={`num text-[11px] ${pctColor(profit)}`}>浮动 {fmtNum(profit)}</span>
            )}
          </div>
        )}
        {adv?.reasons && adv.reasons.length > 0 && (
          <div className="mt-1.5 text-[11px] leading-4 text-mut">{adv.reasons.slice(0, 2).join("；")}</div>
        )}
      </button>
    </Card>
  );
};
