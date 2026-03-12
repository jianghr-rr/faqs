# FinAgents AI 投研系统总体架构

> 项目：FinAgents OS
> 创建日期：2026-03-09
> 状态：架构草案，面向前端可理解的实现说明

**相关文档：**

- [行业知识图谱落地方案](./INDUSTRY_KNOWLEDGE_GRAPH_DESIGN.md)
- [行业知识图谱 Schema 草案](./INDUSTRY_KNOWLEDGE_GRAPH_SCHEMA_DRAFT.md)
- [行业知识图谱 Seed 样例](./INDUSTRY_KNOWLEDGE_GRAPH_SEED_EXAMPLES.md)

---

## 1. 先用一句话理解这个系统

FinAgents AI 投研系统，本质上是在做一件事：

```text
把新闻和用户问题，转成结构化信息
-> 用行业知识图谱做推理
-> 找到相关行业、产业链环节和股票
-> 再交给大模型生成可解释的投研结论
```

如果你是前端，可以先把它理解成：

- 页面发起一个“分析”请求
- 后端不是直接问大模型，而是先查知识、跑推理
- 最后把“结构化结果 + AI 结论”一起返回给页面

---

## 2. 产品目标

这个系统不是普通聊天机器人，而是一个面向投研场景的 AI 分析系统。

目标包括：

- 从新闻里识别事件、行业和潜在受益方向
- 把行业、产业链环节、公司、证券代码连接起来
- 输出“为什么是这些股票”的推理路径
- 让 AI 结论更稳定、更可解释，而不是只靠模型自由发挥
- 只对登录用户开放高级投研能力

---

## 3. 这个系统给用户提供什么功能

从前端产品视角，最终可以落成几类能力：

### 3.1 新闻智能分析

用户打开一条新闻后，可以看到：

- 命中的主题或行业
- 命中的产业链环节
- 关联公司和证券代码
- 推理路径
- AI 生成的投研摘要

示例：

```text
新闻：储能补贴政策出台
-> 命中行业：储能
-> 命中环节：PCS / 电芯 / 储能系统
-> 关联公司：阳光电源 / 宁德时代 / 科华数据
-> AI 结论：政策利好储能产业链，PCS 和系统集成方向弹性更强
```

### 3.2 行业知识图谱查询

用户可以查看：

- 一个行业包含哪些产业链节点
- 一个公司参与哪些环节
- 一个节点的上下游有哪些环节
- 一个别名最终归一到哪个实体

### 3.3 AI 投研问答

用户可以直接提问，例如：

- “储能最近为什么强？”
- “这条政策更利好哪些环节？”
- “光伏链条里逆变器和组件谁弹性更大？”

系统会把用户问题和当前知识图谱一起送入分析链路，而不是只把原问题直接发给模型。

### 3.4 登录后才可用

行业知识图谱、新闻智能分析、AI 投研问答，默认只对登录用户开放。

这是一个明确的产品约束，不是后面再补的技术细节。

---

## 4. 为什么不能只靠大模型直接回答

如果只把新闻正文丢给大模型，通常会出现几个问题：

- 模型知道一些概念，但不知道你项目自己的主数据
- 同一行业里的公司映射可能前后不一致
- 模型会跳步推理，缺少中间路径
- 很难审计“它为什么推荐了这只股票”

所以需要在模型前面加一层结构化知识与推理流程：

```text
新闻 / 用户问题
-> 事件抽取
-> 实体识别
-> 别名归一
-> 图谱扩展
-> 股票召回与排序
-> LLM 总结
```

这也是为什么本项目不是“聊天 UI + 一个大模型 API”这么简单。

---

## 5. 系统分层

为了让前端也能看懂，这里按 6 层来拆。

### 5.1 产品层

这一层就是用户实际看到的页面和交互。

包括：

- 新闻列表页和新闻详情页
- 智能分析页
- AI 聊天页
- 行业知识图谱页
- 收藏、个人页、设置页

这层负责：

- 收集用户输入
- 展示结构化分析结果
- 展示 AI 生成的自然语言结论
- 处理加载中、错误态、空状态

这层不负责真正的推理。

### 5.2 接口层

这一层是前端调用的 API 或 Server Action。

职责：

- 接收请求参数
- 做输入校验
- 做登录校验
- 调用后面的业务 service
- 把结果整理成前端容易消费的结构返回

示例接口可以包括：

- `GET /api/kg/industries/:id`
- `GET /api/kg/companies/:id`
- `POST /api/research/analyze-news`
- `POST /api/research/chat`

### 5.3 业务服务层

这一层是最核心的业务逻辑层。

建议拆成几个服务：

- `AuthService`
- `NewsService`
- `KgService`
- `ResearchService`
- `AiResearchService`

每个 service 的职责如下：

#### `AuthService`

- 判断用户是否登录
- 提供受保护接口统一校验
- 区分公开能力和登录后能力

#### `NewsService`

- 读取新闻
- 管理新闻源和基础清洗
- 为后续事件抽取提供标准输入

#### `KgService`

- 查询图谱实体
- 做别名匹配和消歧
- 做关系扩展
- 返回行业、链条、公司、证券之间的结构化映射

#### `ResearchService`

- 编排“新闻 -> 事件 -> 图谱 -> 股票”的分析流程
- 聚合多个下层能力
- 输出中间结构化结果，供前端和大模型共同使用

#### `AiResearchService`

- 把结构化分析结果转换成大模型可理解的 prompt 或消息格式
- 调用 LLM
- 生成最终的自然语言结论、摘要、风险提示

### 5.4 AI 编排层

这一层建议使用 `LangGraph`，必要时配合 `LangChain` 的模型、tool 和 prompt 能力。

这里要强调：

- `LangChain / LangGraph` 不是主数据层
- 也不是业务规则的唯一承载处
- 它主要解决的是“多步 AI 工作流如何组织”的问题

如果你是前端，可以把这一层理解成：

**一个能按顺序调度多个 AI 步骤和多个工具的工作流引擎。**

### 5.5 数据层

这一层是系统的事实底座。

当前和规划中的核心数据包括：

- `news`
- `profiles`
- `user_favorites`
- `kg_entities`
- `kg_entity_aliases`
- `kg_relations`
- `securities`
- `events`
- `event_entity_map`

这一层负责存：

- 主数据
- 可审计关系
- 事件映射
- 用户收藏和行为数据

### 5.6 基础设施层

这一层包括：

- `Next.js`
- `Supabase Auth`
- `PostgreSQL`
- `Drizzle ORM`
- `LLM Provider`
- 日志
- 缓存
- 定时任务
- 监控

它不直接产生业务价值，但负责让整个系统稳定运行。

---

## 6. 前端最容易理解的一条完整数据流

这里用“分析一条新闻”为例。

```text
用户登录
-> 打开新闻详情页
-> 前端点击“智能分析”
-> 请求后端分析接口
-> 接口层校验登录态
-> ResearchService 拉取新闻正文和基础 metadata
-> AI 编排层做事件抽取、实体识别、别名归一
-> KgService 查询知识图谱并扩展相关行业、环节、公司、证券
-> Stock Ranker 对候选股票排序
-> AiResearchService 调用大模型生成结论
-> 返回结构化结果 + AI 分析文本
-> 前端渲染页面
```

前端只需要记住：

- 页面展示的不是纯模型输出
- 页面拿到的是“结构化数据 + 模型总结”
- 所以可以同时展示卡片、表格、路径和自然语言结论

---

## 7. 为什么这里要上 LangChain / LangGraph

如果只是做一个简单 RAG，直接写几段 service 也能完成。

但如果目标是完整 AI 投研系统，就会出现这些需求：

- 一条分析链要跑很多步
- 每一步可能调用不同工具
- 有的步骤是规则，有的步骤是模型
- 后续可能出现多 Agent 协作
- 需要记录中间状态和推理路径
- 需要失败重试、人工审核或回放调试

这时候 LangGraph 的价值就很明显。

### 7.1 为什么不是只靠普通 service

普通 service 非常适合写确定性逻辑，但当流程逐渐变成下面这种形式时，复杂度会上升很快：

```text
先抽取事件
如果事件不明确，再补摘要
如果实体命中冲突，再做消歧
如果行业命中成功，再扩展产业链
如果公司过多，再做打分排序
最后把结果交给模型生成结论
```

这种“带状态、带分支、带回退”的流程，用 LangGraph 更适合。

### 7.2 为什么不是所有逻辑都放进 LangGraph

因为图谱查询、数据库读写、权限校验这些都属于业务真相，不应该只存在于 prompt 里。

所以推荐方式是：

- **业务规则**：写在 `service / repository`
- **工作流编排**：放到 `LangGraph`
- **大模型生成**：通过 `LangChain` 的模型封装调用

也就是：

```text
LangGraph 负责串流程
Service 负责执行业务
数据库负责保存事实
LLM 负责生成语言结果
```

---

## 8. 推荐的 Agent 拆分

这里不建议先从“6 个听起来很炫的 Agent”去理解，而是按职责拆。

### 8.1 `News Parser Agent`

输入：

- 新闻标题
- 摘要
- 正文
- 来源
- 发布时间

输出：

- 标准化摘要
- 关键词
- 候选事件类型
- 涉及的实体线索

### 8.2 `Event Extraction Agent`

输入：

- 新闻文本
- 上一步的候选摘要

输出：

- 结构化事件
- 事件类型
- 事件时间
- 事件强度

### 8.3 `Entity Resolver Agent`

输入：

- 事件文本
- 关键词
- 标题中的别名、简称、ticker

输出：

- 命中的主题
- 命中的行业
- 命中的产业链节点
- 命中的公司
- 候选实体与消歧结果

这个 Agent 很依赖 `kg_entity_aliases`。

### 8.4 `Graph Reasoner Agent`

输入：

- 已命中的行业或链条节点

输出：

- 相关产业链环节
- 上下游扩展结果
- 相关公司
- 相关证券代码
- 推理路径

这个 Agent 背后调用的其实不是“模型猜”，而是图谱查询工具。

### 8.5 `Stock Ranker Agent`

输入：

- 候选股票列表
- 关系距离
- 参与环节权重
- 新闻时效性
- 历史命中质量

输出：

- 排序后的股票候选
- 打分说明

这个阶段可以先用规则打分，后面再引入模型重排。

### 8.6 `Report Generator Agent`

输入：

- 结构化推理结果
- 推理路径
- 排序后的股票候选

输出：

- AI 投研摘要
- 受益逻辑说明
- 风险提示
- 可用于前端展示的段落化文案

---

## 9. 推荐的 LangGraph 工作流

可以把整条链路理解成一个状态流转图。

```text
Start
-> Load News Or User Query
-> Parse News
-> Extract Event
-> Resolve Entities
-> Query Knowledge Graph
-> Rank Candidate Stocks
-> Generate Research Report
-> Persist Result
-> Return Response
```

### 9.1 状态对象建议

可以在工作流里维护一个统一状态，例如：

```ts
type ResearchGraphState = {
    userId: string;
    requestId: string;
    mode: 'news_analysis' | 'chat_research';
    newsId?: string;
    userQuery?: string;
    rawText: string;
    event?: {
        eventType: string;
        title: string;
        summary?: string;
        eventTime?: string;
    };
    matchedEntities: Array<{
        entityId: string;
        entityType: 'theme' | 'industry' | 'chain_node' | 'company';
        name: string;
        confidence: number;
    }>;
    graphExpansion: Array<{
        path: string[];
        companyEntityId: string;
        companyName: string;
        stockCode?: string;
        weight?: number;
        confidence?: number;
    }>;
    rankedStocks: Array<{
        stockCode: string;
        stockName: string;
        score: number;
        reason: string;
    }>;
    report?: {
        summary: string;
        reasoning: string[];
        risks: string[];
    };
};
```

你作为前端，不一定马上实现它，但理解这个状态对象很重要，因为它就是整条 AI 流水线共享的数据上下文。

---

## 10. 数据层怎么和 AI 层配合

这部分要把“数据库 schema”和“Agent 工作流”连起来理解。

### 10.1 `news`

作用：

- 提供原始新闻内容
- 提供 `tickers`、`tags`、`category`、`publishedAt`
- 作为新闻快链路和慢链路的基础输入

### 10.2 `kg_entities`

作用：

- 存图谱里的主实体
- 包括 `theme`、`industry`、`chain_node`、`company`

### 10.3 `kg_entity_aliases`

作用：

- 做别名匹配
- 帮助识别简称、英文名、俗称、ticker 名称

### 10.4 `kg_relations`

作用：

- 表示实体之间的结构化关系
- 比如 `contains`、`upstream_of`、`belongs_to`、`participates_in`

### 10.5 `securities`

作用：

- 把 `company` 实体映射为可交易证券
- 让图谱推理结果最终能落到股票代码

### 10.6 `events`

作用：

- 把新闻抽象成更稳定的事件
- 避免每次都让模型从长文本里重新猜业务含义

### 10.7 `event_entity_map`

作用：

- 把事件和图谱实体连起来
- 为后续事件驱动分析提供中间层

---

## 11. 登录与权限应该怎么放进架构里

这是这次新增的明确需求：只有登录后的用户能用该功能。

### 11.1 产品约束

以下功能仅登录用户可用：

- 智能分析页
- AI 投研问答
- 图谱深度查询
- 个性化收藏和研究记录

### 11.2 路由层

当前项目已经有 `(protected)` 路由分组和中间层登录校验机制。

因此建议：

- 页面级功能继续走受保护路由
- API 级功能也要单独做登录态校验
- 不要只依赖前端隐藏按钮

### 11.3 服务层

建议提供统一的登录校验入口，例如：

```ts
async function requireUser() {
    const user = await getCurrentUser();

    if (!user) {
        throw new Error('UNAUTHORIZED');
    }

    return user;
}
```

这样图谱查询、分析接口、聊天接口都能复用同一套鉴权逻辑。

### 11.4 数据隔离

第一阶段图谱主数据可以是全局共享的，但以下内容应按用户维度隔离：

- 用户发起的研究记录
- 用户收藏的分析结果
- 用户对某条新闻的追踪和笔记

---

## 12. 推荐代码目录

为了让项目后续更清晰，建议补充如下目录结构：

```text
apps/faqs-web/
  app/
    api/
      research/
        analyze-news/
        chat/
      kg/
        industries/
        companies/
  lib/
    ai/
      models/
      prompts/
      tools/
      graphs/
      agents/
    kg/
      types.ts
      repository.ts
      service.ts
    research/
      service.ts
      ranker.ts
      mapper.ts
    auth/
      require-user.ts
  db/
    schema.ts
  scripts/
    seed-kg-pilot.ts
```

其中：

- `lib/ai/graphs` 放 LangGraph 工作流
- `lib/ai/tools` 放图谱查询、新闻查询、证券查询等 tools
- `lib/kg` 放知识图谱相关查询
- `lib/research` 放投研业务逻辑

---

## 13. MVP 怎么做，才不会一开始做太重

虽然最终目标是完整 AI 投研系统，但第一阶段仍然建议分步做。

### Phase 1：图谱 MVP

- 完成 `kg_entities / aliases / relations / securities`
- 导入 `储能 / 光伏 / 算力` seed
- 实现基础图谱查询
- 接入登录校验

### Phase 2：新闻智能分析

- 建立 `events / event_entity_map`
- 实现新闻 -> 事件 -> 行业 -> 股票的慢链路
- 先用规则打分排序
- 先返回结构化结果

### Phase 3：LangGraph 接入

- 把各阶段 service 包装成 tools 或 workflow nodes
- 增加状态流转
- 增加失败重试与 tracing

### Phase 4：AI 投研增强

- 增加投研问答
- 增加个性化研究记录
- 增加更复杂的 rerank 和结论生成

这样做的好处是：

- 先把“事实底座”做稳
- 再把“AI 编排”叠上去
- 避免一开始就做成只有 demo 感、没有主数据沉淀的系统

---

## 14. 你作为前端，最应该抓住的 5 个理解点

1. 这个系统不是“页面直接问大模型”，而是“页面请求一个多阶段分析系统”。
2. 页面拿到的结果应该既有结构化数据，也有 AI 文本结论。
3. 知识图谱是后端的事实底座，保证结论可解释。
4. LangGraph 是工作流编排层，不是数据库，也不是页面逻辑。
5. 高级投研能力只给登录用户开放，权限是架构级要求。

---

## 15. 最终建议

对 FinAgents 来说，最合理的演进路径不是：

```text
聊天页
-> 直接接一个大模型
-> 希望它自己会投研
```

而是：

```text
新闻与用户问题
-> 结构化事件抽取
-> 行业知识图谱推理
-> 股票召回与排序
-> 大模型生成可解释结论
-> 前端展示结构化结果和分析文本
```

在这个架构下：

- `PostgreSQL + Drizzle` 负责保存事实
- `KgService / ResearchService` 负责执行业务规则
- `LangGraph` 负责编排多步分析流程
- `LLM` 负责生成自然语言结论
- `Next.js + Supabase Auth` 负责产品承载和登录权限

这会更接近一个真正可持续演进的 AI 投研系统，而不是一次性的 AI demo。
