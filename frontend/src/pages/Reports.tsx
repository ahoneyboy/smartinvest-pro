import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Card, CardTitle, Button, Badge, Empty } from "../components/ui";

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const { data: dates } = useQuery({ queryKey: ["reviewDates"], queryFn: api.reviewDates });
  const { data: llm } = useQuery({ queryKey: ["llm"], queryFn: api.llmInfo });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-bold">报告中心</h1>
        <Badge className={llm?.available ? "border-up/40 bg-up/10 text-up" : "border-gold/40 bg-gold/10 text-gold"}>
          {llm?.available ? "LLM 报告" : "规则引擎报告"}
        </Badge>
        <span className="ml-auto text-[11px] text-mut">每日 15:05 后自动存档，也可在复盘页手动生成</span>
      </div>

      <Card>
        <CardTitle icon="📚">历史复盘存档（{dates?.dates.length ?? 0}）</CardTitle>
        {(dates?.dates ?? []).length === 0 ? (
          <Empty text="暂无存档。前往「复盘大师」点击生成复盘。" >
            <Button variant="primary" onClick={() => navigate("/review")}>去生成</Button>
          </Empty>
        ) : (
          <div className="divide-y divide-line/50">
            {dates!.dates.map((d) => (
              <div key={d} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                <span className="num font-medium">{d}</span>
                <span className="text-[11px] text-mut">复盘报告</span>
                <div className="ml-auto flex gap-2">
                  <Button onClick={() => navigate(`/review/${d}`)}>查看</Button>
                  <Button onClick={() => window.open(`/api/review/${d}/export.md`)}>Markdown</Button>
                  <Button onClick={() => window.open(`/api/review/${d}/export.csv`)}>CSV</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle icon="💡">使用说明</CardTitle>
        <ul className="list-inside list-disc space-y-1.5 p-4 text-[12.5px] leading-6 text-mut">
          <li>PDF 导出：进入对应日期复盘页，点击「导出 PDF」，在打印对话框选择「另存为 PDF」。</li>
          <li>Markdown 文本可直接在手机查看分享；CSV 含当日行情与资金流结构化数据。</li>
          <li>配置 LLM_API_KEY 后，每日复盘的总结与风险提示将由大模型改写（仍严格基于当日数据）。</li>
          <li>连续多日生成复盘后，可通过「方向轮动总表」的标签对比追踪主线演变。</li>
        </ul>
      </Card>
    </div>
  );
};

export default Reports;
