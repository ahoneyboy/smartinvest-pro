import React from "react";

/** 迷你走势线（无依赖，SVG） */
export const Sparkline: React.FC<{ data: number[]; up: boolean; width?: number; height?: number }> = ({
  data,
  up,
  width = 96,
  height = 28,
}) => {
  if (!data || data.length < 2) return <div style={{ width, height }} className="text-mut/30" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 2 - ((v - min) / range) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = up ? "#ef4444" : "#22c55e";
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.4" />
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={color} opacity="0.12" />
    </svg>
  );
};
