# FinAgents 首页新闻内容规划与数据源方案

> 创建于 2026-03-03 | 状态：待评审

---

## 一、当前首页现状分析

### 问题

| 项目     | 现状                                               | 问题                       |
| -------- | -------------------------------------------------- | -------------------------- |
| 内容来源 | `MOCK_FAQS` 硬编码 6 条数据                        | 无法更新，不是真实数据     |
| 内容类型 | 纯 FAQ 知识库条目                                  | 缺少市场动态、实时资讯     |
| 分类体系 | 市场分析 / 量化策略 / 风控合规 / AI Agent / 数据源 | 分类偏知识库，缺少新闻维度 |
| 数据库   | Schema 已建好但首页未接入                          | FAQ 读写流程未打通         |
| 实时性   | `updatedAt` 写死为 "2h ago"                        | 无时间感知能力             |

### 结论

首页需要从「纯知识库列表」升级为「知识库 + 实时金融资讯」的双内容流，体现 FinAgents 作为金融智能代理系统的专业性和时效性。

---

## 二、首页新闻内容规划

### 2.1 推荐的首页结构（自上而下）

```
┌─────────────────────────────────────────────┐
│  搜索栏（保留）                               │
├─────────────────────────────────────────────┤
│  🔥 市场快讯（滚动条/轮播）                    │
│  "沪指涨0.5%..." | "美联储议息..." | "..."    │
├─────────────────────────────────────────────┤
│  分类 Tab                                    │
│  全部 | 要闻 | 研报 | 策略 | AI洞察 | 数据   │
├─────────────────────────────────────────────┤
│  📰 新闻 + FAQ 混合信息流                     │
│  ┌─ 新闻卡片（带来源、时间、情感标签）         │
│  ├─ FAQ 卡片（保留现有样式）                   │
│  ├─ AI 洞察卡片（Agent 生成的分析）            │
│  └─ ...                                     │
├─────────────────────────────────────────────┤
│  分页 / 加载更多                              │
└─────────────────────────────────────────────┘
```

### 2.2 新闻内容分类与展示优先级

| 优先级 | 分类            | 内容描述                                       | 更新频率     | 来源                |
| ------ | --------------- | ---------------------------------------------- | ------------ | ------------------- |
| P0     | **市场要闻**    | A 股 / 港股 / 美股重大新闻、政策变动、监管动态 | 实时 ~ 5分钟 | 新闻 API            |
| P0     | **宏观经济**    | CPI/PPI/PMI/社融等关键经济数据发布、央行政策   | 实时         | 新闻 API + 数据 API |
| P1     | **研报精选**    | 券商研报摘要、评级变动、目标价调整             | 每日更新     | 爬虫/API + LLM 摘要 |
| P1     | **策略洞察**    | 量化策略表现、因子动态、行业轮动信号           | 每日更新     | 自建分析            |
| P2     | **AI/科技动态** | AI 在金融领域的应用进展、大模型更新            | 每日更新     | 新闻 API            |
| P2     | **数据源动态**  | 数据接口变更、新数据产品上线                   | 每周更新     | 人工 + FAQ          |

### 2.3 新闻卡片字段设计

```typescript
interface NewsItem {
    id: string;
    title: string;
    summary: string; // 150字以内摘要
    category: NewsCategory;
    source: string; // 来源: "财联社" | "Wind" | "FinAgent-AI"
    sourceUrl?: string; // 原始链接
    publishedAt: Date; // 发布时间
    sentiment?: 'positive' | 'negative' | 'neutral'; // 情感分析
    sentimentScore?: number; // 0-1 情感分数
    tickers?: string[]; // 关联股票: ["600519", "000001"]
    tags: string[];
    isAiGenerated: boolean; // 是否为 AI Agent 生成
    agentId?: string; // 生成该内容的 Agent ID
    imageUrl?: string;
    importance: 1 | 2 | 3; // 重要性: 1=最重要
}

type NewsCategory = '要闻' | '宏观' | '研报' | '策略' | 'AI洞察' | '数据';
```

---

## 三、数据源方案（核心）

### 3.1 方案总览

采用 **多源聚合 + AI 加工** 架构：

```
                    ┌──────────────┐
  外部 API ────────►│              │
  RSS Feed ────────►│  快链路采集层 │──► 清洗/双层去重 ──► news 表(秒级入库)
  爬虫数据 ────────►│  (Backend)   │                    │
                    └──────────────┘                    │
                                                        ▼
                                               首页先展示（低延迟）
                                                        │
                                                        ▼
                                                  慢链路 AI 增强
                                               （摘要/情感/分类/打分）
                                                        │
                                                        ▼
                                               回填 news 表增强字段
                                                        │
                                          ┌─────────────┼─────────────┐
                                          ▼             ▼             ▼
                                       首页重排      推送通知      搜索索引
```

### 3.2 推荐数据源（按优先级排序）

#### 3.2.0 数据源准入与验证矩阵（上线前必须打勾）

> 说明：以下矩阵用于防止“看起来可用，实际不可商用/不稳定”的风险。  
> 状态建议：`✅ 已验证` / `⚠️ 待验证` / `❌ 不通过`

| 数据源         | 商用授权               | 限频/配额      | 平均延迟             | 可用性(SLA) | 失败率阈值 | 当前状态  |
| -------------- | ---------------------- | -------------- | -------------------- | ----------- | ---------- | --------- |
| Finnhub        | 需确认条款             | 60次/分(免费)  | < 1-3 分钟（视源站） | 需压测验证  | < 3%       | ⚠️ 待验证 |
| 银禾金融数据库 | 需确认条款             | 待确认         | 待确认               | 待确认      | < 5%       | ⚠️ 待验证 |
| AKShare        | 非官方聚合（谨慎商用） | 受源站限制     | 取决于源站           | 无官方 SLA  | < 8%       | ⚠️ 待验证 |
| TianAPI        | 需确认条款             | 100次/天(免费) | 分钟级               | 待确认      | < 5%       | ⚠️ 待验证 |
| Marketaux      | 需确认条款             | 100次/天(免费) | 分钟级               | 待确认      | < 5%       | ⚠️ 待验证 |

**准入规则（建议）**

1. 必须通过：商用授权明确 + 限频明确 + 基础压测通过
2. 进入生产需满足：连续 7 天失败率低于阈值
3. 未通过准入的数据源仅可用于研发和回放环境

#### 第一梯队：核心数据源（必接）

| 数据源             | 类型             | 费用           | 覆盖                        | 接入难度 | 推荐理由                                 |
| ------------------ | ---------------- | -------------- | --------------------------- | -------- | ---------------------------------------- |
| **银禾金融数据库** | REST API         | 免费           | A股/美股/期货/外汇/新闻     | ⭐ 低    | 完全免费无需注册，覆盖面广，包含金融新闻 |
| **AKShare**        | Python SDK       | 免费           | A股/港股/期货/宏观/新闻     | ⭐ 低    | 开源免费，数据全面，社区活跃             |
| **Finnhub**        | REST + WebSocket | 免费 (60次/分) | 全球股票/外汇/加密货币/新闻 | ⭐⭐ 中  | 全球覆盖，含新闻+情感分析，免费额度充足  |

#### 第二梯队：增强数据源（按需接入）

| 数据源               | 类型       | 费用            | 覆盖               | 接入难度 | 推荐理由                       |
| -------------------- | ---------- | --------------- | ------------------ | -------- | ------------------------------ |
| **Marketaux**        | REST API   | 免费 (100次/天) | 全球金融新闻       | ⭐ 低    | 内置情感分析，支持股票代码过滤 |
| **天聚数行 TianAPI** | REST API   | 免费 (100次/天) | 中文财经新闻       | ⭐ 低    | 中文新闻质量好，接入简单       |
| **Tushare Pro**      | Python SDK | 免费 (需Token)  | A股基本面/财报     | ⭐⭐ 中  | 财报数据标准化好，适合研报分析 |
| **Alpha Vantage**    | REST API   | 免费 (25次/天)  | 全球股票/外汇/加密 | ⭐ 低    | NASDAQ 授权，数据权威          |

#### 第三梯队：RSS 聚合（零成本补充）

| 来源            | RSS 地址                               | 内容                  |
| --------------- | -------------------------------------- | --------------------- |
| **财联社**      | 需爬取或接入合作                       | A股实时要闻、公司公告 |
| **华尔街见闻**  | `https://wallstreetcn.com/rss`         | 全球宏观、市场要闻    |
| **36氪 - 金融** | `https://36kr.com/feed` (过滤金融标签) | AI+金融、Fintech      |
| **FT中文网**    | RSS 可用                               | 深度财经分析          |
| **Bloomberg**   | 需付费                                 | 全球金融权威          |

### 3.3 推荐接入方案（第一阶段 MVP）

**目标**：用最低成本实现首页新闻流，验证产品方向。

#### 数据源组合

```
银禾金融数据库（中国市场新闻） + Finnhub（全球市场新闻+情感分析）
                                    ↓
                   后端动态频率任务（盘中提频/夜间降频）
                                    ↓
                    快链路：清洗 + 去重 + 入库 + 首页展示
                                    ↓
                    慢链路：LLM 摘要/分类/情感/重要性评分
                                    ↓
                          news 表（PostgreSQL）
                                    ↓
                          首页 API → 前端展示
```

#### 为什么选这两个

1. **银禾**：完全免费、无需注册、覆盖 A 股新闻 → 解决国内市场
2. **Finnhub**：免费额度大 (60次/分)、自带情感分析、WebSocket 实时推送 → 解决全球市场 + 智能分析

#### 3.4 时效性 SLO 与验收标准（核心）

> 目标：可量化地定义“最新”，并能持续监控。

| 指标                    | 定义                            | 目标值    | 告警阈值       |
| ----------------------- | ------------------------------- | --------- | -------------- |
| `ingest_latency_p95`    | 源发布时间 → news 表入库时间    | <= 3 分钟 | > 5 分钟       |
| `display_latency_p95`   | news 表入库 → 首页可见时间      | <= 30 秒  | > 60 秒        |
| `freshness_ratio_top20` | 首页 Top20 中 30 分钟内新闻占比 | >= 70%    | < 50%          |
| `source_failure_rate`   | 数据源抓取失败率（5分钟窗口）   | < 3%      | >= 5%          |
| `dedup_hit_rate`        | 去重命中率（同事件聚合）        | 20%~60%   | < 10% 或 > 80% |

**验收方式（MVP）**

1. 连续 3 个交易日达到上述目标
2. 盘中任意 30 分钟窗口，首页至少有 1 条高重要性新闻更新
3. 数据源故障时 5 分钟内自动降级到备源

#### 3.5 交易时段动态采集频率

| 时段                                | 采集频率            | 说明           |
| ----------------------------------- | ------------------- | -------------- |
| A 股盘中（9:30-11:30, 13:00-15:00） | 1-2 分钟            | 优先保障时效   |
| 盘前/盘后                           | 5 分钟              | 平衡成本与更新 |
| 夜间                                | 10-15 分钟          | 低频保活       |
| 重大事件窗口（如议息/非农）         | 临时提频到 30-60 秒 | 事件驱动       |

#### 3.6 重要性评分（解决“最重要”）

将 `importance` 从人工枚举升级为算法打分：

```text
importance_score =
0.35 * source_trust
+ 0.25 * market_impact
+ 0.20 * timeliness
+ 0.10 * cross_source_confirm
+ 0.10 * user_interest
```

字段说明：

- `source_trust`：来源可信度（白名单媒体/官方公告更高）
- `market_impact`：涉及指数权重股、政策级事件、宏观数据发布
- `timeliness`：新闻发布时间衰减函数（越新分越高）
- `cross_source_confirm`：多源交叉验证一致性
- `user_interest`：点击率/收藏率/跟踪标的匹配度

映射规则（建议）：

- `score >= 0.75` → `importance = 1`（最重要）
- `0.45 <= score < 0.75` → `importance = 2`
- `score < 0.45` → `importance = 3`

#### 3.7 双层去重与事件聚类

当前“标题相似度 + URL”不足以应对跨源同题新闻，建议升级为：

1. **第一层（精确去重）**：`canonical_url + source_id + publish_time_bucket`
2. **第二层（语义去重）**：标题/摘要向量相似度聚类（同一事件归并）
3. **展示策略**：保留“主稿 + 最新跟进稿”，其余折叠到“同事件 N 条”

#### API 调用示例

**Finnhub - 获取市场新闻**

```bash
# 一般市场新闻
GET https://finnhub.io/api/v1/news?category=general&token=YOUR_API_KEY

# 特定公司新闻
GET https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-03-01&to=2026-03-03&token=YOUR_API_KEY

# 新闻情感分析
GET https://finnhub.io/api/v1/news-sentiment?symbol=AAPL&token=YOUR_API_KEY
```

**Finnhub 返回示例**

```json
{
    "category": "technology",
    "datetime": 1709424000,
    "headline": "Apple announces new AI features for financial apps",
    "id": 123456,
    "image": "https://...",
    "related": "AAPL",
    "source": "Reuters",
    "summary": "Apple Inc unveiled...",
    "url": "https://..."
}
```

**银禾金融数据库 - 获取金融新闻**

```bash
# 金融新闻列表（免费、无需认证）
GET https://api.yinhedata.com/news/finance?page=1&pageSize=20
```

**AKShare - 获取新闻（Python 后端）**

```python
import akshare as ak

# 财经新闻
news_df = ak.stock_news_em()

# 个股新闻
stock_news = ak.stock_individual_info_em(symbol="000001")

# 宏观经济数据
cpi_data = ak.macro_china_cpi_monthly()
```

---

## 四、数据库设计

### 4.1 新增 news 表

```sql
CREATE TABLE news (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(500) NOT NULL,
  summary       TEXT,
  content       TEXT,
  category      VARCHAR(50) NOT NULL,
  source        VARCHAR(100) NOT NULL,
  source_url    VARCHAR(1000),
  published_at  TIMESTAMPTZ NOT NULL,
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  sentiment     VARCHAR(20),            -- positive / negative / neutral
  sentiment_score DECIMAL(3,2),         -- 0.00 ~ 1.00
  tickers       TEXT[],                 -- 关联股票代码
  tags          TEXT[],
  image_url     VARCHAR(1000),
  importance    SMALLINT DEFAULT 2,     -- 1=高 2=中 3=低
  is_ai_generated BOOLEAN DEFAULT FALSE,
  agent_id      VARCHAR(100),
  is_published  BOOLEAN DEFAULT TRUE,
  view_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_news_published_at ON news(published_at DESC);
CREATE INDEX idx_news_category ON news(category);
CREATE INDEX idx_news_importance ON news(importance);
CREATE INDEX idx_news_tickers ON news USING GIN(tickers);
```

### 4.2 Drizzle Schema 定义

```typescript
import {pgTable, uuid, varchar, text, timestamp, decimal, smallint, boolean, integer} from 'drizzle-orm/pg-core';

export const news = pgTable('news', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', {length: 500}).notNull(),
    summary: text('summary'),
    content: text('content'),
    category: varchar('category', {length: 50}).notNull(),
    source: varchar('source', {length: 100}).notNull(),
    sourceUrl: varchar('source_url', {length: 1000}),
    publishedAt: timestamp('published_at', {withTimezone: true}).notNull(),
    fetchedAt: timestamp('fetched_at', {withTimezone: true}).defaultNow(),
    sentiment: varchar('sentiment', {length: 20}),
    sentimentScore: decimal('sentiment_score', {precision: 3, scale: 2}),
    tickers: text('tickers').array(),
    tags: text('tags').array(),
    imageUrl: varchar('image_url', {length: 1000}),
    importance: smallint('importance').default(2),
    isAiGenerated: boolean('is_ai_generated').default(false),
    agentId: varchar('agent_id', {length: 100}),
    isPublished: boolean('is_published').default(true),
    viewCount: integer('view_count').default(0),
    createdAt: timestamp('created_at', {withTimezone: true}).defaultNow(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).defaultNow(),
});
```

---

## 五、实施路线图

### Phase 1：MVP（1-2 周）

**目标**：首页展示真实金融新闻

| 任务                  | 详情                              | 工时         |
| --------------------- | --------------------------------- | ------------ |
| 注册 Finnhub API Key  | 免费注册，获取 API Key            | 10 分钟      |
| 新增 news 表          | Drizzle schema + migration        | 1 小时       |
| 后端新闻采集服务      | 动态频率任务（盘中提频/夜间降频） | 5 小时       |
| 银禾/AKShare 数据接入 | Python 脚本，接入中国市场新闻     | 4 小时       |
| 首页 API              | `/api/news` 接口，支持分类、分页  | 2 小时       |
| 首页改造              | 新增市场快讯滚动条 + 新闻卡片组件 | 4 小时       |
| 去重逻辑              | URL 规范化 + 语义聚类双层去重     | 4 小时       |
| SLO 监控              | 增加时效性指标、告警与降级开关    | 3 小时       |
| **合计**              |                                   | **~23 小时** |

### Phase 2：AI 增强（2-3 周）

| 任务         | 详情                                  | 工时         |
| ------------ | ------------------------------------- | ------------ |
| LLM 摘要生成 | 对原始新闻自动生成中文摘要            | 4 小时       |
| 情感分析     | 结合 Finnhub 自带 + 自建 LLM 情感判断 | 4 小时       |
| 智能分类     | LLM 自动将新闻归类到系统分类体系      | 3 小时       |
| AI 洞察卡片  | Agent 生成每日市场综述、策略建议      | 6 小时       |
| **合计**     |                                       | **~17 小时** |

### Phase 3：完善运营（持续）

| 任务       | 详情                            |
| ---------- | ------------------------------- |
| 更多数据源 | 接入 Marketaux、TianAPI、RSS 源 |
| 个性化推荐 | 基于用户行为推荐相关新闻        |
| 推送通知   | 重大新闻实时推送                |
| 搜索优化   | 全文搜索 + 向量搜索             |
| 数据看板   | 新闻趋势、热门话题分析          |

---

## 六、环境变量新增

在 `.env.local` 中新增：

```bash
# Finnhub
FINNHUB_API_KEY=your_finnhub_api_key

# 银禾金融数据库（免费，无需Key）
YINHE_API_BASE_URL=https://api.yinhedata.com

# Marketaux（可选）
MARKETAUX_API_KEY=your_marketaux_api_key

# TianAPI（可选）
TIANAPI_KEY=your_tianapi_key

# 新闻采集配置
NEWS_FETCH_INTERVAL_MS=300000          # 采集间隔：5分钟
NEWS_MAX_AGE_DAYS=30                   # 新闻保留天数
NEWS_AI_SUMMARY_ENABLED=false          # AI摘要开关（Phase 2 开启）
```

---

## 七、风险与注意事项

| 风险              | 应对                                       |
| ----------------- | ------------------------------------------ |
| API 免费额度用尽  | 设置调用计数器 + 降级策略（缓存旧数据）    |
| 数据源条款不清晰  | 建立准入矩阵，未通过条款验证不入生产       |
| 新闻版权问题      | 只存摘要，保留原始链接跳转，不存全文       |
| 数据源不稳定      | 多源冗余，A 源挂了自动切 B 源              |
| 爬虫合规风险      | 优先用官方 API，避免高频爬取               |
| 新闻内容质量      | AI Agent 过滤低质量/重复内容               |
| 实时性要求高      | 快慢链路解耦 + 交易时段动态提频 + SLO 监控 |
| AI 增强阻塞主链路 | AI 全部异步回填，首页先展示原始快讯        |

---

## 八、关键决策点（需确认）

1. **首页定位**：是「新闻为主 + FAQ 为辅」还是「FAQ 为主 + 新闻为辅」？
2. **语言**：新闻是否需要中英双语？全球市场新闻是否自动翻译？
3. **后端语言**：新闻采集服务用 Node.js（统一技术栈）还是 Python（AKShare 生态）？
4. **付费预算**：是否有 API 付费预算？这决定了数据源选择范围。
5. **合规要求**：是否需要金融信息服务资质？（若面向 C 端用户需考虑）
6. **时效目标**：MVP 接受 5-15 分钟，还是要直接冲 1-5 分钟？
