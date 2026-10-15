import React from "react";
import { EChart } from "./EChart";

/** 仪表盘 gauge：情绪阶段 / 市场广度 */
export const GaugeChart: React.FC<{
  value: number;
  label: string;
  sublabel?: string;
  stages?: { name: string; color: string }[];
  height?: number;
}> = ({ value, label, sublabel, stages, height = 200 }) => {
  const axisStages = stages ?? [
    { name: "冰点", color: "#58a6ff" },
    { name: "修复", color: "#3fb950" },
    { name: "发酵", color: "#e3b341" },
    { name: "高潮", color: "#ef4444" },
    { name: "退潮", color: "#8b949e" },
  ];
  const option: any = {
    series: [
      {
        type: "gauge",
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        splitNumber: 5,
        radius: "100%",
        center: ["50%", "60%"],
        axisLine: {
          lineStyle: {
            width: 14,
            color: axisStages.map((s, i) => [ (i + 1) / axisStages.length, s.color ]),
          },
        },
        pointer: { length: "55%", width: 4, itemStyle: { color: "#e6edf3" } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: "#8b949e",
          fontSize: 10,
          distance: -38,
          formatter: (v: number) => {
            const idx = Math.min(axisStages.length - 1, Math.floor(v / (100 / axisStages.length)));
            return axisStages[idx].name;
          },
        },
        title: { show: false },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, "35%"],
          formatter: () => label,
          color: "#e6edf3",
          fontSize: 16,
          fontWeight: 600,
        },
        data: [{ value }],
      },
    ],
  };
  return (
    <div>
      <EChart option={option} height={height} />
      {sublabel && <div className="-mt-2 text-center text-[11px] text-mut">{sublabel}</div>}
    </div>
  );
};
