# FinAgents AI 投研系统工作流设计

> 项目：FinAgents OS
> 创建日期：2026-03-09
> 状态：工作流草案，面向 LangGraph / LangChain 落地

**相关文档：**

- [AI 投研系统总体架构](./FINAGENTS_AI_RESEARCH_ARCHITECTURE.md)
- [AI 投研系统产品与 API 设计](./FINAGENTS_AI_RESEARCH_PRODUCT_AND_API.md)
- [行业知识图谱 Seed 样例](./INDUSTRY_KNOWLEDGE_GRAPH_SEED_EXAMPLES.md)

---

## 1. 文档目标

这份文档专门解释：

- AI 投研分析链路应该按什么步骤运行
- 每个 Agent 或节点负责什么
- LangGraph 适合放在哪一层
- 工作流状态要保存哪些字段

如果你已经用过 LangChain 做 RAG，可以把这份文档理解成：

**“从单次检索问答，升级成多步骤投研工作流后的结构图。”**

---

## 2. 为什么这里适合用 LangGraph

普通 RAG 一般是：

```text
用户问题
-> 检索
-> 把上下文拼给模型
-> 输出答案
```

但投研系统的分析链路更长：

```text
新闻 / 用户问题
-> 解析文本
-> 抽取事件
-> 命中实体
-> 别名归一
-> 查询知识图谱
-> 扩展链条和公司
-> 排序股票
-> 生成结论
-> 保存分析记录
```

这里有几个特点：

- 不是一步完成，而是多步串联
- 有结构化工具调用
- 有中间状态
- 有失败重试空间
- 后续还可能加人工审核节点

所以这个场景更像“工作流系统”，而不只是“检索增强生成”。

---

## 3. 工作流总览

建议先把整个工作流理解成一个状态图。

```text
Start
-> Load Request
-> Check Auth
-> Load Source Data
-> Parse Input
-> Extract Event
-> Resolve Entities
-> Query Graph
-> Expand Candidates
-> Rank Stocks
-> Generate Report
-> Persist Output
-> Return Response
```

这个流程既适用于新闻分析，也适用于自由提问分析。

区别在于输入来源不同：

- 新闻分析：输入是 `newsId`
- 自由问答：输入是 `query`

---

## 4. 节点拆分建议

## 4.1 `loadRequest`

职责：

- 读取用户请求
- 标准化输入结构
- 生成 `requestId`
- 识别当前模式是 `news_analysis` 还是 `chat_research`

输入示例：

```json
{
    "newsId": "uuid"
}
```

或：

```json
{
    "query": "储能链条里谁最受益？"
}
```

输出重点：

- `requestId`
- `mode`
- `newsId` 或 `query`

---

## 4.2 `checkAuth`

职责：

- 校验用户是否登录
- 未登录直接中断流程

输出重点：

- `userId`
- `authorized`

这个节点虽然不“智能”，但必须放进完整工作流视角里，因为它是所有投研能力的第一道门。

---

## 4.3 `loadSourceData`

职责：

- 如果是新闻分析，读取 `news` 表中的标题、摘要、正文、tag、ticker、发布时间
- 如果是聊天问答，读取用户消息和必要上下文

输出重点：

- `rawText`
- `title`
- `summary`
- `publishedAt`
- `tickers`
- `tags`

---

## 4.4 `parseInput`

职责：

- 对原始文本做标准化
- 提取关键词
- 生成更适合后续处理的中间摘要

这一步可以先轻量，后面再增强。

输出重点：

- `normalizedText`
- `keywords`
- `draftSummary`

---

## 4.5 `extractEvent`

职责：

- 把新闻或问题抽象成事件
- 确定事件类型
- 补齐事件时间、事件强度、事件方向

常见事件类型示例：

- 政策支持
- 产品涨价
- 行业供给收缩
- 订单落地
- 财报超预期

输出重点：

- `eventType`
- `eventTitle`
- `eventSummary`
- `eventTime`
- `eventStrength`

---

## 4.6 `resolveEntities`

职责：

- 识别文本中的主题、行业、产业链节点、公司
- 调用别名表做归一
- 做候选实体消歧

这里建议区分两个概念：

- `matchedEntities`：最终主命中
- `candidateEntities`：召回但未最终确认的候选

输出重点：

- `matchedThemes`
- `matchedIndustries`
- `matchedChainNodes`
- `matchedCompanies`
- `candidateEntities`

---

## 4.7 `queryGraph`

职责：

- 调用知识图谱查询工具
- 从已命中的实体出发，查找相关行业、链条节点、公司、证券

常见查询：

- 行业包含哪些链条节点
- 某节点上下游有哪些节点
- 哪些公司参与该环节
- 哪些公司归属于该行业
- 公司对应哪些证券

输出重点：

- `graphHits`
- `expandedNodes`
- `companyCandidates`
- `securityCandidates`

---

## 4.8 `expandCandidates`

职责：

- 把图谱命中整理成可用于排序的候选股票集合
- 生成可解释路径

示例：

```text
政策支持
-> 储能
-> PCS
-> 阳光电源
```

输出重点：

- `reasoningPaths`
- `candidateStocks`

---

## 4.9 `rankStocks`

职责：

- 对候选股票打分排序

建议初期使用规则打分，后期再叠加模型重排。

打分维度示例：

- 与事件的关系距离
- 公司参与环节的权重
- 命中关系的置信度
- 新闻时效性
- 历史命中表现

输出重点：

- `rankedStocks`
- `scoreBreakdown`

---

## 4.10 `generateReport`

职责：

- 根据结构化结果生成自然语言报告
- 输出摘要、推理逻辑、风险提示

这一层的大模型输入不应只有新闻文本，还应包括：

- 事件抽取结果
- 图谱推理路径
- 排序后的股票候选
- 关键关系说明

输出重点：

- `summary`
- `reasoning`
- `risks`

---

## 4.11 `persistOutput`

职责：

- 保存分析结果
- 保存工作流 metadata
- 为历史研究记录和回放调试做准备

第一阶段即使不完整落库，也建议至少保留：

- `requestId`
- `userId`
- `mode`
- `summary`
- `topStocks`
- `createdAt`

---

## 5. 推荐的 Agent 划分

如果你想把节点进一步抽象成 Agent，可以按下面拆。

### 5.1 `News Parser Agent`

负责：

- 理解新闻文本
- 提取关键词
- 生成标准化摘要

### 5.2 `Event Extraction Agent`

负责：

- 抽取事件类型
- 判断事件影响方向和强度

### 5.3 `Entity Resolver Agent`

负责：

- 识别实体
- 调别名库
- 做消歧

### 5.4 `Graph Reasoner Agent`

负责：

- 调图谱查询工具
- 扩展行业、环节、公司、证券
- 产出推理路径

### 5.5 `Stock Ranker Agent`

负责：

- 计算候选股票优先级
- 给出打分理由

### 5.6 `Report Generator Agent`

负责：

- 组织最终报告
- 输出用户可读的投研结论

---

## 6. 推荐的 Tool 设计

LangGraph 中的节点不应该直接把所有事情都交给模型，应把确定性的部分做成 tools。

建议工具分成 4 类。

### 6.1 数据读取工具

- `getNewsById`
- `getUserResearchContext`
- `getSavedAnalysis`

### 6.2 图谱工具

- `searchKgEntities`
- `resolveEntityAliases`
- `getIndustryChainNodes`
- `getNodeUpstreamDownstream`
- `getCompaniesByChainNode`
- `getSecuritiesByCompany`

### 6.3 排序工具

- `scoreCandidateStocks`
- `dedupeCandidateStocks`
- `buildReasoningPaths`

### 6.4 LLM 工具

- `summarizeEvent`
- `classifyEventType`
- `generateResearchReport`

原则是：

- 查事实，用工具
- 跑规则，用代码
- 写结论，用模型

---

## 7. 状态对象建议

工作流里建议维护一个统一状态对象。

```ts
type ResearchGraphState = {
    requestId: string;
    userId: string;
    mode: 'news_analysis' | 'chat_research';
    authorized: boolean;
    newsId?: string;
    query?: string;
    rawText: string;
    normalizedText?: string;
    keywords: string[];
    event?: {
        eventType: string;
        title: string;
        summary?: string;
        eventTime?: string;
        strength?: number;
    };
    matchedEntities: {
        themes: Array<{id: string; name: string; confidence: number}>;
        industries: Array<{id: string; name: string; confidence: number}>;
        chainNodes: Array<{id: string; name: string; confidence: number}>;
        companies: Array<{id: string; name: string; confidence: number}>;
    };
    candidateEntities: Array<{
        id: string;
        name: string;
        entityType: string;
        confidence: number;
    }>;
    reasoningPaths: Array<{
        path: string[];
        description?: string;
    }>;
    candidateStocks: Array<{
        companyEntityId: string;
        companyName: string;
        stockCode?: string;
        exchange?: string;
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
    errors: string[];
};
```

这个状态对象的意义是：

- 每一步不用重新猜上下文
- 前一个节点的输出可以直接交给下一个节点
- 后续做 tracing 和调试会更容易

---

## 8. 新闻分析模式与问答模式的区别

这两种模式可以共用大部分工作流，但输入和部分策略不同。

### 8.1 新闻分析模式

输入：

- `newsId`

特点：

- 更依赖新闻正文、发布时间、source、ticker、tag
- 更适合做事件驱动分析

### 8.2 问答模式

输入：

- `query`

特点：

- 更依赖用户语义解析
- 可能没有明确事件
- 更适合做行业比较、逻辑解释、链条问答

所以在工作流里可以共享：

- 鉴权
- 实体识别
- 图谱查询
- 股票排序
- 报告生成

但在 `extractEvent` 节点里，问答模式可以允许“无明确事件”的分支。

---

## 9. 失败与回退策略

AI 工作流不是每一步都一定成功，所以要设计回退路径。

### 9.1 事件抽取失败

策略：

- 回退为基于关键词和 tag 的轻量分析

### 9.2 实体消歧失败

策略：

- 返回候选实体列表
- 降低结论确定性

### 9.3 图谱扩展为空

策略：

- 直接返回“未命中明确产业链映射”
- 仍允许模型输出保守结论

### 9.4 股票排序信息不足

策略：

- 只返回候选，不给强排序结论

这样做的目标不是“永远不失败”，而是“失败时也有可解释的退化输出”。

---

## 10. 可观测性建议

后续如果真要把它做成长期维护的 AI 投研系统，工作流必须可观测。

建议记录：

- 每次请求的 `requestId`
- 每个节点的输入摘要
- 每个节点的输出摘要
- 节点耗时
- 模型调用耗时
- 最终命中的实体和股票
- 失败原因

这样后面你排查问题时，就不会只看到一句“模型回答不对”。

---

## 11. 第一阶段怎么接入才不太重

虽然最终设计看起来很完整，但第一阶段不需要把所有节点都做得很重。

推荐最小版本：

1. `loadRequest`
2. `checkAuth`
3. `loadSourceData`
4. `resolveEntities`
5. `queryGraph`
6. `rankStocks`
7. `generateReport`

先把这 7 步跑通，就已经能形成一个可演示、可落地的投研工作流。

后面再补：

- `extractEvent`
- `persistOutput`
- 更复杂的分支和回退

---

## 12. 和现有知识图谱文档的关系

这份工作流文档并不替代知识图谱设计文档。

关系可以这样理解：

- `INDUSTRY_KNOWLEDGE_GRAPH_DESIGN.md`
  解决“为什么做图谱、图谱在业务里怎么用”
- `INDUSTRY_KNOWLEDGE_GRAPH_SCHEMA_DRAFT.md`
  解决“图谱表结构怎么设计”
- `INDUSTRY_KNOWLEDGE_GRAPH_SEED_EXAMPLES.md`
  解决“试点数据怎么组织”
- `FINAGENTS_AI_RESEARCH_WORKFLOW.md`
  解决“这些结构化数据怎么进入 AI 工作流”

也就是说：

**知识图谱文档解决“知识怎么存”，工作流文档解决“知识怎么被 AI 用起来”。**

---

## 13. 最终建议

如果你已经用过 LangChain 做 RAG，那么可以这样理解这次升级：

- 以前：`检索 -> 生成`
- 现在：`解析 -> 事件 -> 实体 -> 图谱 -> 排序 -> 生成`

真正的关键不是“Agent 数量有多少”，而是：

- 每一步职责是否清楚
- 哪些步骤该用规则
- 哪些步骤该用工具
- 哪些步骤该交给模型
- 状态是否能持续传递

只要这几个点设计清楚，这套系统就能从一个简单 RAG，演进成真正可维护的 AI 投研工作流。
