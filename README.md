# SmartInvest Pro · 智能金融与股市分析系统

面向 A 股个人投资者的全栈智能分析系统：行情盯盘、盘后复盘、资金流向追踪、情绪量化、板块轮动识别、AI 决策辅助。所有行情数据通过后端代理多源获取并交叉校验，AI 结论全部附带数据依据与置信度。

![tech](https://img.shields.io/badge/React%2018-TypeScript-blue) ![tech](https://img.shields.io/badge/FastAPI-Python%203.11-green) ![tech](https://img.shields.io/badge/ECharts-5-orange) ![tech](https://img.shields.io/badge/TailwindCSS-3-38bdf8)

## 一键启动

### 方式〇：双击脚本（最简单，Mac / Windows 通用）

| 文件 | 作用 |
|---|---|
| `一键启动-Mac.command` | 双击自动部署并启动，完成后自动打开浏览器 |
| `一键启动-Windows.bat` | 同上（Windows 双击） |
| `一键停止-Mac.command` / `一键停止-Windows.bat` | 停止后台服务 |

脚本会自动完成：检测运行状态（已在运行则秒开浏览器）→ 准备 Python 解释器（三级：已有虚拟环境 → 系统 Python → **自动下载便携版 Python 运行时**，免安装、免管理员权限，仅首次约 30MB）→ 安装依赖（仅首次，约 1 分钟）→ 检查前端产物（项目已内置 `frontend/dist`，缺失时才需要 Node 构建）→ 后台启动服务 → 等待就绪 → 打开 `http://127.0.0.1:8000`。

> **前置要求：电脑不装 Python 也能运行**——没有任何 Python 时脚本会自动到 `runtime/` 下载便携版 Python 3.11（GitHub 直连失败自动切镜像）；便携运行时约占 130MB 磁盘（运行时 + 虚拟环境），请勿删除 `runtime/` 文件夹。Windows 下服务以最小化窗口 `SmartInvest Server` 运行，关闭该窗口即停止服务。

### 方式一：Docker

```bash
docker compose up -d --build
# 打开 http://localhost:8000
```

可选接入 LLM（复盘总结 / AI 对话由大模型生成）：

```bash
LLM_API_KEY=sk-xxx LLM_BASE_URL=https://api.deepseek.com/v1 LLM_MODEL=deepseek-chat docker compose up -d --build
```

### 方式二：本地开发

```bash
# 后端（端口 8000，同时托管前端构建产物）
cd backend && pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000

# 前端开发模式（端口 5173，/api 代理到 8000）
cd frontend && npm install && npm run dev
```

## 功能模块

| 模块 | 路由 | 说明 |
|---|---|---|
| 仪表盘 | `/` | **全球市场条**（恒生/恒科/日经/KOSPI/道指/标普/纳指/美元指数/COMEX黄金/NYMEX原油）、A 股指数卡（sparkline + **均线/MACD/RSI 技术信号**）、自选股卡片墙（买卖点/AI 建议+置信度）、**热门个股人气榜** |
| AI 分析中心 | `/ai-analysis` | 个股深度分析（K线+技术面+资金面+基本面+评分评级+风险位）、AI 对话（结合实时行情）、**策略选股**（放量上涨/均线多头/超跌反弹/强势突破/主力抢筹 + **K线形态**（早晨之星/看涨吞没/锤头线/双针探底，借鉴 Sequoia-X），每条命中附带依据；东财断连自动切新浪成交额榜降级） |
| 自选盯盘 | `/watchlist` | 批量导入、成本/持股/上下限价、持仓盈亏、突破提醒、**模拟交易引擎**（纸面盘 100 万本金：止盈止损/买点信号自动触发虚拟成交，账户/交易记录/信号历史，可开关）、**钉钉群推送** |
| 复盘大师 | `/review` | 一句话总收口、**今日核心判断（01/02/03）**、**下一步观察 + 近期事件日历（限售解禁/新股申购）**、盘型环境仪表、涨跌停/炸板统计、资金流证据、主线板块裁定（四分层）、风险边界、情绪阶段仪表、方向轮动总表、龙虎榜、PDF/Markdown/CSV 导出 |
| 板块中心 | `/sector` | 行业/概念资金流排行、**行业景气热力图**（资金45%+涨幅35%+广度20% 合成景气分）、**ETF 监控**（涨幅榜 + 主力净流入榜 TOP20）、成分股下钻、AI 轮动路径 |
| **宏观风险 A-RISK** | `/macro-risk` | 整合 [a-share-monitor](../a-share-monitor) 项目：**两层漏斗决策模型**（L1 信用脉冲 × L2 安全边际 → 综合仓位建议，回测 2016-2026 Sharpe 0.41）、ERP 股权风险溢价、沪深300 PE、10Y 国债、破净率、HV30、两融余额、两市成交/换手、社融脉冲、申万一级行业 60 日热力图、ETF 分类资金流向、偏股基金新发；支持一键触发外部项目抓数更新 |
| 风险信号 | `/risk-signal` | 情绪温度、**六维风险雷达**（情绪过热/分歧炸板/亏钱效应/广度失衡/连板过热/资金流出）、**估值监测**（38+ 指数 PE/PB 历史分位、高位提醒/低位机会）、当日风险清单、失败轮动追踪 |
| 复盘笔记 / 报告中心 / 设置 | `/notes` `/reports` `/settings` | 笔记存档、历史复盘浏览与导出、数据源状态、LLM 配置、**钉钉机器人 webhook** |

## 数据源与校验

- **腾讯行情**（主源）：实时股价/盘口、日/周/月 K
- **新浪财经**：交叉校验，价格偏差 > 0.5% 触发告警；腾讯失败时自动降级
- **东方财富**：资金流向（行业/个股/ETF 主力净额）、涨停/炸板/跌停池、龙虎榜、基本面、全球指数/商品/汇率、个股人气榜、限售解禁/新股日历；主站限流时自动切换 `push2delay` 镜像
- **蛋卷基金**：指数 PE/PB 历史分位（估值监测，缓存 1 小时）
- **a-share-monitor 项目**（`ARISK_DATA_PATH` 环境变量，默认 `../a-share-monitor/arisk_data.json`）：ERP/破净率/两融/社融/申万热力图等宏观指标，由其 `update_arisk_data.py` 每交易日收盘后抓取，本系统读取其 JSON 并可一键触发更新
- - **新浪资讯**：7x24 财经直播流（复盘页市场资讯卡）
- **股票搜索**：顶栏与 AI 分析页支持名称/拼音/代码自动补全（东财 suggest + 本地全 A 名称表双重降级）
顶栏「数据源」面板实时显示各源状态（正常/异常/延迟/最后成功时间），异常红色高亮
- 自选股行情 3s 轮询、指数 5s；每日 15:05 后自动生成当日复盘存档

## AI 决策引擎

1. **数据采集** → 多源行情/资金/涨停/板块数据
2. **指标计算** → 纯 Python 实现 MA/MACD/KDJ/RSI/BOLL/量价
3. **规则引擎** → 大盘强弱、板块地位裁定（主线/次主线/活口/情绪链/失败轮动）、个股信号、情绪阶段（冰点→修复→发酵→高潮→退潮）
4. **LLM 生成**（可选）→ 结构化数据喂给 OpenAI 兼容接口，生成总收口/风险提示/对话回答，数据为准
5. **置信度标注** → 每条建议附置信度百分比、最多 3 条数据依据、关键价位、最大风险

> 未配置 `LLM_API_KEY` 时自动使用本地规则引擎，结论同样附带数据依据。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `LLM_API_KEY` | 空 | OpenAI 兼容接口 Key，空则用规则引擎 |
| `LLM_BASE_URL` | `https://api.deepseek.com/v1` | 接口地址（豆包/GPT 等可换） |
| `LLM_MODEL` | `deepseek-chat` | 模型名 |
| `SI_DATA_DIR` | `backend/data` | SQLite 数据目录 |
| `SI_HTTP_TIMEOUT` | `4.0` | 行情请求超时（秒） |
| `ARISK_DATA_PATH` | `../a-share-monitor/arisk_data.json` | A-RISK 宏观数据文件路径 |

## 项目结构

```
gushi/
├── 一键启动-Mac.command / 一键启动-Windows.bat     # 双击部署 + 自动打开浏览器
├── 一键停止-Mac.command / 一键停止-Windows.bat     # 停止后台服务
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口（托管前端 + 定时复盘）
│   │   ├── config.py / db.py / cache.py
│   │   ├── sources/             # 腾讯 / 新浪 / 东财适配器 + 健康注册表
│   │   ├── services/            # 指标引擎 / 信号引擎 / 复盘聚合 / 规则叙事 / LLM
│   │   └── routers/             # 行情 / 自选 / 复盘 / AI / 板块 / 杂项
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/          # ECharts 封装 / 仪表盘 / K线 / 卡片 / 数据源状态
│       ├── pages/               # 10 个路由页面
│       └── lib/                 # API 客户端 / A股配色与格式化 / 状态
├── Dockerfile                   # 多阶段：前端构建 + 后端运行
└── docker-compose.yml
```

## 免责声明

数据来自公开行情接口，本系统分析结果仅供参考，不构成投资建议。投资有风险，入市需谨慎。
