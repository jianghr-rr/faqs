# FinAgents AI 投研系统产品与 API 设计

> 项目：FinAgents OS
> 创建日期：2026-03-09
> 状态：文档草案，偏前端视角

**相关文档：**

- [AI 投研系统总体架构](./FINAGENTS_AI_RESEARCH_ARCHITECTURE.md)
- [行业知识图谱落地方案](./INDUSTRY_KNOWLEDGE_GRAPH_DESIGN.md)
- [行业知识图谱 Schema 草案](./INDUSTRY_KNOWLEDGE_GRAPH_SCHEMA_DRAFT.md)

---

## 1. 文档目标

这份文档不讲底层数据库实现细节，重点回答 4 个问题：

- 用户在前端会看到哪些 AI 投研功能
- 每个页面要展示哪些信息
- 前端应该调用哪些 API
- API 返回的数据结构大致长什么样

如果你是前端，可以把这份文档理解成：

**“这个 AI 投研系统最终会长成什么页面，以及前后端怎么对接。”**

---

## 2. 用户能使用的核心功能

### 2.1 新闻智能分析

在新闻详情页增加“智能分析”能力。

用户点击后，系统会返回：

- 命中的主题或行业
- 命中的产业链环节
- 关联公司和证券代码
- 推理路径
- AI 生成的结论

### 2.2 行业知识图谱查询

用户可以查看：

- 某个行业包含哪些链条环节
- 某个链条节点的上下游有哪些节点
- 某个公司参与哪些环节
- 某个别名命中了哪个实体

### 2.3 AI 投研问答

用户输入自然语言问题，例如：

- “储能最近为什么走强？”
- “这条政策更利好哪些股票？”
- “光伏链条的弹性主要在哪一段？”

系统不会只把问题直接发给模型，而是会先接知识图谱和推理流程。

### 2.4 访问权限

以上能力仅登录用户可用。

未登录用户：

- 可以继续浏览公开新闻和 FAQ
- 不能触发图谱深度分析
- 不能使用 AI 投研问答
- 不能查看受保护的投研结果页

---

## 3. 页面拆分建议

## 3.1 新闻详情页

建议新增一个“智能分析”模块。

页面结构可以拆成：

- 新闻正文区
- 基础信息区：来源、发布时间、标签、tickers
- 智能分析卡片区
- 推理路径区
- 关联股票区
- AI 投研摘要区

### 展示字段建议

- `matchedThemes`
- `matchedIndustries`
- `matchedChainNodes`
- `candidateStocks`
- `reasoningPaths`
- `summary`
- `risks`

### 页面行为建议

- 默认先展示新闻内容
- 用户点击“开始分析”后发起异步请求
- 分析中展示 loading skeleton
- 分析成功后按模块渲染结果
- 分析失败后展示错误提示和重试按钮

---

## 3.2 智能分析页

当前项目里已经有 `analysis` 页，这一页后续可以升级成统一分析工作台。

建议支持两种模式：

- 按新闻分析
- 按自由输入分析

页面结构建议：

- 输入区
- 分析类型选择区
- 结构化结果区
- AI 结论区
- 历史记录区

### 分析类型建议

- 新闻事件分析
- 行业关系查询
- 股票受益链路分析
- 主题问答

---

## 3.3 AI 聊天页

聊天页不应只是普通聊天，而应是“带知识图谱增强”的投研问答页。

页面结构建议：

- 输入框
- 对话流
- 当前命中的行业/公司上下文
- 引用来源区
- 推理路径区

### 与普通聊天的区别

- 普通聊天：只返回文本
- 投研聊天：返回文本 + 引用节点 + 推理路径 + 候选股票

所以聊天消息结构建议支持富内容，而不是只有一段字符串。

---

## 3.4 行业知识图谱页

如果后续单独做图谱页，建议包含：

- 行业列表
- 行业详情
- 链条节点关系图
- 关联公司列表
- 实体搜索和别名搜索

前端不一定第一阶段就做“复杂可视化图谱”，可以先做：

- 卡片
- 列表
- 表格
- 简化路径展示

先把信息结构做清楚，再考虑图形化关系图。

---

## 4. API 分层建议

为了让前端更好接入，建议把 API 分成 3 类。

### 4.1 图谱查询 API

负责读取图谱事实，不直接跑完整 AI workflow。

示例：

- `GET /api/kg/industries/:id`
- `GET /api/kg/chain-nodes/:id`
- `GET /api/kg/companies/:id`
- `GET /api/kg/search?q=储能`

适合前端做：

- 行业详情页
- 公司归属页
- 搜索联想
- 关系浏览

### 4.2 分析 API

负责跑“结构化推理 + AI 总结”的完整链路。

示例：

- `POST /api/research/analyze-news`
- `POST /api/research/analyze-query`

适合前端做：

- 新闻详情页的一键分析
- 智能分析页

### 4.3 聊天 API

负责多轮投研问答。

示例：

- `POST /api/research/chat`
- `GET /api/research/sessions/:id`

适合前端做：

- AI 对话页
- 历史研究记录页

---

## 5. API 返回结构建议

为了前端好接，建议响应尽量稳定，不要把所有内容都塞成一段 markdown。

---

## 5.1 新闻分析接口

### 请求

`POST /api/research/analyze-news`

```json
{
    "newsId": "uuid"
}
```

### 返回

```json
{
    "requestId": "req_123",
    "news": {
        "id": "uuid",
        "title": "储能补贴政策出台",
        "publishedAt": "2026-03-09T10:00:00Z",
        "source": "某财经媒体"
    },
    "matchedEntities": {
        "themes": [{"id": "1", "name": "新能源", "confidence": 0.91}],
        "industries": [{"id": "2", "name": "储能", "confidence": 0.96}],
        "chainNodes": [
            {"id": "3", "name": "PCS", "confidence": 0.88},
            {"id": "4", "name": "储能系统", "confidence": 0.84}
        ],
        "companies": []
    },
    "reasoningPaths": [
        {
            "path": ["政策支持", "储能", "PCS", "阳光电源"],
            "description": "政策利好储能建设，PCS 作为关键环节受益明显"
        }
    ],
    "candidateStocks": [
        {
            "companyEntityId": "c1",
            "companyName": "阳光电源",
            "stockCode": "300274",
            "exchange": "SZSE",
            "score": 0.93,
            "reason": "PCS 核心参与者"
        }
    ],
    "report": {
        "summary": "本次政策更可能利好储能产业链中的 PCS 与系统集成环节。",
        "reasoning": [
            "新闻核心事件是政策支持储能建设",
            "图谱中储能行业包含 PCS 与储能系统等关键环节",
            "阳光电源在 PCS 环节参与度高"
        ],
        "risks": ["政策执行强度仍需跟踪", "部分受益逻辑存在预期先行风险"]
    }
}
```

---

## 5.2 自由问答分析接口

### 请求

`POST /api/research/analyze-query`

```json
{
    "query": "光伏链条里逆变器和组件谁更有弹性？"
}
```

### 返回

```json
{
    "requestId": "req_456",
    "query": "光伏链条里逆变器和组件谁更有弹性？",
    "resolvedEntities": {
        "industries": [{"id": "pv", "name": "光伏"}],
        "chainNodes": [
            {"id": "inv", "name": "逆变器"},
            {"id": "mod", "name": "组件"}
        ]
    },
    "comparison": {
        "winner": "逆变器",
        "reason": "在图谱样例中逆变器环节与高壁垒电力电子能力绑定更强，弹性通常高于标准化更强的组件环节"
    },
    "report": {
        "summary": "如果讨论阶段性弹性，逆变器通常更强；如果讨论规模和出货稳定性，组件更稳。",
        "reasoning": ["逆变器属于更偏技术和品牌驱动的环节", "组件竞争更充分，价格传导更直接"],
        "risks": ["该结论仍需要结合周期位置和海外需求验证"]
    }
}
```

---

## 5.3 聊天接口

### 请求

`POST /api/research/chat`

```json
{
    "sessionId": "session_123",
    "message": "储能链条里谁最受益？"
}
```

### 返回

```json
{
    "sessionId": "session_123",
    "messageId": "msg_789",
    "answer": {
        "text": "如果从当前图谱样例出发，PCS、储能系统、电芯相关公司最可能受益。",
        "reasoningPaths": [
            ["储能政策", "储能", "PCS", "阳光电源"],
            ["储能政策", "储能", "电芯", "宁德时代"]
        ],
        "references": {
            "entities": [
                {"id": "industry_storage", "name": "储能", "type": "industry"},
                {"id": "chain_pcs", "name": "PCS", "type": "chain_node"}
            ],
            "stocks": [
                {"stockCode": "300274", "stockName": "阳光电源"},
                {"stockCode": "300750", "stockName": "宁德时代"}
            ]
        }
    }
}
```

---

## 6. 鉴权与错误返回

### 6.1 未登录

如果用户未登录，调用投研相关接口时应返回 `401`。

示例：

```json
{
    "error": {
        "code": "UNAUTHORIZED",
        "message": "Login required"
    }
}
```

### 6.2 参数错误

示例：

```json
{
    "error": {
        "code": "INVALID_INPUT",
        "message": "newsId is required"
    }
}
```

### 6.3 分析失败

示例：

```json
{
    "error": {
        "code": "ANALYSIS_FAILED",
        "message": "Unable to finish research workflow"
    }
}
```

前端建议统一处理：

- `401`：跳登录或弹登录提示
- `400`：提示输入有误
- `500`：提示分析失败并支持重试

---

## 7. 前端组件拆分建议

为了后续好维护，建议把页面拆成稳定的小组件。

### 7.1 新闻分析页组件

- `ResearchTriggerButton`
- `ResearchSummaryCard`
- `MatchedEntitiesPanel`
- `ReasoningPathList`
- `CandidateStockTable`
- `RiskNoticeCard`

### 7.2 聊天页组件

- `ResearchChatInput`
- `ResearchChatMessage`
- `ResearchReferencePanel`
- `ResearchPathPanel`

### 7.3 行业图谱页组件

- `IndustryHeader`
- `ChainNodeList`
- `CompanyRelationTable`
- `AliasMatchPanel`

---

## 8. 前端状态建议

每个分析请求建议至少维护这些状态：

- `idle`
- `loading`
- `success`
- `error`

如果后面接入异步工作流，还可以增加：

- `queued`
- `processing`
- `streaming`

页面上最好把“结构化结果”和“AI 文本结果”拆开管理，这样即使模型文本稍晚返回，也不影响前面卡片先展示。

---

## 9. 第一阶段最值得先做的前端形态

如果先做 MVP，我建议顺序是：

1. 新闻详情页增加“智能分析”卡片
2. 分析页接入单次分析结果
3. 聊天页接入带推理路径的回答
4. 最后再补单独的知识图谱页

原因：

- 新闻详情页最容易体现价值
- 智能分析页最容易沉淀固定交互
- 聊天页要等结构化结果稳定后再增强
- 图谱可视化可以放后面做

---

## 10. 最终建议

如果你站在前端视角，最重要的不是先想数据库和 Agent，而是先想清楚：

- 页面想展示哪些稳定字段
- API 返回哪些结构化数据
- 登录态如何拦截
- 结构化数据和 AI 文本怎么一起渲染

只要这四件事清楚，后面的 LangGraph、图谱服务、排序器都能逐步接上。
