import React, { useEffect, useRef } from "react";
import * as echarts from "echarts";

export const EChart: React.FC<{
  option: echarts.EChartsOption;
  height?: number | string;
  className?: string;
  onEvents?: Record<string, (params: any) => void>;
}> = ({ option, height = 260, className = "", onEvents }) => {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts>();

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, null, { renderer: "canvas" });
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption({ backgroundColor: "transparent", ...option }, true);
    if (onEvents) {
      chart.off("click");
      Object.entries(onEvents).forEach(([evt, fn]) => chart.on(evt, fn));
    }
  }, [option, onEvents]);

  return <div ref={ref} className={className} style={{ height, width: "100%" }} />;
};
