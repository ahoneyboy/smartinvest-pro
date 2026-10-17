import React, { useState } from "react";
import { EChart } from "./EChart";

export interface Bar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

type Indicator = "macd" | "kdj" | "rsi";

/** 对齐辅助：任意长度序列尾部对齐 bars，短序列前补 null */
const align = (arr: (number | null)[] | null | undefined, n: number): (number | null)[] => {
  if (!arr?.length) return new Array(n).fill(null);
  const a = arr.slice(-n);
  return [...new Array(n - a.length).fill(null), ...a];
};

/** K 线 + MA + BOLL(开关) + 成交量 + 指标副图（MACD/KDJ/RSI 切换），全历史展示 */
export const KLineChart: React.FC<{
  bars: Bar[];
  height?: number;
  macd?: { dif_series?: number[]; dea_series?: number[]; hist_series?: number[] } | null;
  kdj?: { k_series?: number[]; d_series?: number[]; j_series?: number[] } | null;
  rsiSeries?: (number | null)[] | null;
  bollSeries?: { upper?: number[]; mid?: number[]; lower?: number[] } | null;
}> = ({ bars, height = 460, macd, kdj, rsiSeries, bollSeries }) => {
  const [indicator, setIndicator] = useState<Indicator>("macd");
  const [showBoll, setShowBoll] = useState(false);

  if (!bars?.length) return null;
  const n = bars.length;
  const dates = bars.map((b) => b.date);
  const kdata = bars.map((b) => [b.open, b.close, b.low, b.high]);
  const vols = bars.map((b) => ({
    value: b.volume,
    itemStyle: { color: b.close >= b.open ? "#ef4444" : "#22c55e" },
  }));

  const sma = (period: number) =>
    bars.map((_, i) => {
      if (i < period - 1) return null;
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += bars[j].close;
      return +(s / period).toFixed(2);
    });

  // BOLL 序列与 bars 对齐（后端给 offset）
  const bs = bollSeries ?? {};
  const bollLen = bs.upper?.length ?? 0;
  const bollOffset = Math.max(0, n - bollLen);
  const bollX = bollLen ? Array.from({ length: bollLen }, (_, i) => dates[bollOffset + i] ?? "") : [];

  // 指标副图数据
  const difA = align(macd?.dif_series, n);
  const deaA = align(macd?.dea_series, n);
  const histA = align(macd?.hist_series, n);
  const kA = align(kdj?.k_series, n);
  const dA = align(kdj?.d_series, n);
  const jA = align(kdj?.j_series, n);
  const rA = align(rsiSeries, n);

  const gridMain = { left: 56, right: 16, top: 16, height: "48%" };
  const gridVol = { left: 56, right: 16, top: "60%", height: "11%" };
  const gridInd = { left: 56, right: 16, top: "76%", height: "15%" };

  const axisCfg = { axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: { color: "#8b949e", fontSize: 10 } };

  const indSeries: any[] =
    indicator === "macd"
      ? [
          { name: "DIF", type: "line", data: difA, xAxisIndex: 2, yAxisIndex: 2, symbol: "none", lineStyle: { width: 1.2, color: "#e3b341" } },
          { name: "DEA", type: "line", data: deaA, xAxisIndex: 2, yAxisIndex: 2, symbol: "none", lineStyle: { width: 1.2, color: "#58a6ff" } },
          {
            name: "MACD", type: "bar", data: histA, xAxisIndex: 2, yAxisIndex: 2,
            itemStyle: { color: (p: any) => (p.value >= 0 ? "#ef4444" : "#22c55e") },
          },
        ]
      : indicator === "kdj"
        ? [
            { name: "K", type: "line", data: kA, xAxisIndex: 2, yAxisIndex: 2, symbol: "none", lineStyle: { width: 1.2, color: "#e3b341" } },
            { name: "D", type: "line", data: dA, xAxisIndex: 2, yAxisIndex: 2, symbol: "none", lineStyle: { width: 1.2, color: "#58a6ff" } },
            { name: "J", type: "line", data: jA, xAxisIndex: 2, yAxisIndex: 2, symbol: "none", lineStyle: { width: 1.2, color: "#bc8cff" } },
          ]
        : [{ name: "RSI6", type: "line", data: rA, xAxisIndex: 2, yAxisIndex: 2, symbol: "none", lineStyle: { width: 1.3, color: "#e3b341" } }];

  const option: any = {
    animation: false,
    axisPointer: { link: [{ xAxisIndex: "all" }], label: { backgroundColor: "#30363d" } },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#161b22",
      borderColor: "#30363d",
      textStyle: { color: "#e6edf3", fontSize: 12 },
    },
    legend: {
      data: ["MA5", "MA10", "MA20", "MA60", ...(showBoll ? ["BOLL"] : [])],
      top: 0, left: 60, itemWidth: 14, itemHeight: 8,
      textStyle: { color: "#8b949e", fontSize: 10 },
    },
    grid: [gridMain, gridVol, gridInd],
    xAxis: [
      { type: "category", data: dates, boundaryGap: true, ...axisCfg },
      { type: "category", gridIndex: 1, data: dates, axisLabel: { show: false }, axisLine: { show: false } },
      { type: "category", gridIndex: 2, data: dates, ...axisCfg },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: "#21262d" } }, axisLabel: { color: "#8b949e", fontSize: 10 } },
      { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
      { gridIndex: 2, scale: true, splitLine: { lineStyle: { color: "#21262d" } }, axisLabel: { color: "#8b949e", fontSize: 10 } },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1, 2], start: 0, end: 100 },
      { type: "slider", xAxisIndex: [0, 1, 2], bottom: 2, height: 16, borderColor: "#30363d", backgroundColor: "#161b22", fillerColor: "rgba(88,166,255,0.15)", handleStyle: { color: "#58a6ff" }, textStyle: { color: "#8b949e" } },
    ],
    series: [
      {
        name: "日K", type: "candlestick", data: kdata, xAxisIndex: 0, yAxisIndex: 0,
        itemStyle: { color: "#ef4444", color0: "#22c55e", borderColor: "#ef4444", borderColor0: "#22c55e" },
      },
      ...(["MA5", "MA10", "MA20", "MA60"].map((nm, idx) => ({
        name: nm, type: "line", data: sma([5, 10, 20, 60][idx]), xAxisIndex: 0, yAxisIndex: 0,
        symbol: "none", lineStyle: { width: 1, color: ["#e3b341", "#58a6ff", "#bc8cff", "#f0883e"][idx] },
        connectNulls: true,
      }))),
      ...(showBoll && bollLen
        ? [
            { name: "BOLL", type: "line", data: bs.upper, xAxisIndex: 0, yAxisIndex: 0, symbol: "none", lineStyle: { width: 1, color: "#8b949e", type: "dashed" } },
            { name: "BOLL", type: "line", data: bs.mid, xAxisIndex: 0, yAxisIndex: 0, symbol: "none", lineStyle: { width: 1, color: "#d2a8ff" } },
            { name: "BOLL", type: "line", data: bs.lower, xAxisIndex: 0, yAxisIndex: 0, symbol: "none", lineStyle: { width: 1, color: "#8b949e", type: "dashed" } },
          ]
        : []),
      { name: "成交量", type: "bar", data: vols, xAxisIndex: 1, yAxisIndex: 1 },
      ...indSeries,
    ],
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2">
        <span className="text-[11px] text-mut">指标副图</span>
        {(["macd", "kdj", "rsi"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setIndicator(t)}
            className={`rounded px-2.5 py-0.5 text-[11px] uppercase ${indicator === t ? "bg-accent/20 text-accent" : "text-mut hover:text-fg"}`}
          >
            {t}
          </button>
        ))}
        {bollLen > 0 && (
          <button
            onClick={() => setShowBoll((v) => !v)}
            className={`rounded px-2.5 py-0.5 text-[11px] ${showBoll ? "bg-gold/20 text-gold" : "text-mut hover:text-fg"}`}
          >
            BOLL
          </button>
        )}
        <span className="ml-auto text-[11px] text-mut">近 {n} 个交易日 · 滚轮/拖动缩放</span>
      </div>
      <EChart option={option} height={height} />
    </div>
  );
};
