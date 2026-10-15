import React from "react";
import { EChart } from "./EChart";

export interface Bar {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

/** K 线 + MA + 成交量 */
export const KLineChart: React.FC<{ bars: Bar[]; height?: number; showMA?: boolean }> = ({
  bars,
  height = 380,
  showMA = true,
}) => {
  if (!bars?.length) return null;
  const dates = bars.map((b) => b.date);
  const kdata = bars.map((b) => [b.open, b.close, b.low, b.high]);
  const vols = bars.map((b, i) => ({
    value: b.volume,
    itemStyle: { color: b.close >= b.open ? "#ef4444" : "#22c55e" },
  }));

  const sma = (n: number) =>
    bars.map((_, i) => {
      if (i < n - 1) return "-";
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += bars[j].close;
      return +(s / n).toFixed(2);
    });

  const option: any = {
    animation: false,
    axisPointer: { link: [{ xAxisIndex: "all" }], label: { backgroundColor: "#30363d" } },
    tooltip: {
      trigger: "axis",
      backgroundColor: "#161b22",
      borderColor: "#30363d",
      textStyle: { color: "#e6edf3", fontSize: 12 },
    },
    grid: [
      { left: 56, right: 16, top: 12, height: "60%" },
      { left: 56, right: 16, top: "76%", height: "16%" },
    ],
    xAxis: [
      { type: "category", data: dates, boundaryGap: true, axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: { color: "#8b949e", fontSize: 10 } },
      { type: "category", gridIndex: 1, data: dates, axisLabel: { show: false }, axisLine: { show: false } },
    ],
    yAxis: [
      { scale: true, splitLine: { lineStyle: { color: "#21262d" } }, axisLabel: { color: "#8b949e", fontSize: 10 } },
      { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
    ],
    dataZoom: [
      { type: "inside", xAxisIndex: [0, 1], start: 40, end: 100 },
      { type: "slider", xAxisIndex: [0, 1], bottom: 2, height: 16, borderColor: "#30363d", backgroundColor: "#161b22", fillerColor: "rgba(88,166,255,0.15)", handleStyle: { color: "#58a6ff" }, textStyle: { color: "#8b949e" } },
    ],
    series: [
      {
        name: "日K",
        type: "candlestick",
        data: kdata,
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: { color: "#ef4444", color0: "#22c55e", borderColor: "#ef4444", borderColor0: "#22c55e" },
      },
      ...(showMA
        ? [
            { name: "MA5", type: "line", data: sma(5), xAxisIndex: 0, yAxisIndex: 0, symbol: "none", lineStyle: { width: 1, color: "#e3b341" } },
            { name: "MA10", type: "line", data: sma(10), xAxisIndex: 0, yAxisIndex: 0, symbol: "none", lineStyle: { width: 1, color: "#58a6ff" } },
            { name: "MA20", type: "line", data: sma(20), xAxisIndex: 0, yAxisIndex: 0, symbol: "none", lineStyle: { width: 1, color: "#bc8cff" } },
          ]
        : []),
      { name: "成交量", type: "bar", data: vols, xAxisIndex: 1, yAxisIndex: 1 },
    ],
  };
  return <EChart option={option} height={height} />;
};
