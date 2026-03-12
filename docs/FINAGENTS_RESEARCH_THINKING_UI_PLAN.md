# FinAgents 分析思考过程可视化实现方案

> 项目：FinAgents OS / faqs-web  
> 日期：2026-03-16  
> 状态：实现草案（可进入开发）

**相关文档：**

- [AI 投研系统产品与 API 设计](./FINAGENTS_AI_RESEARCH_PRODUCT_AND_API.md)
- [AI 投研系统总体架构](./FINAGENTS_AI_RESEARCH_ARCHITECTURE.md)
- [AI 投研系统工作流设计](./FINAGENTS_AI_RESEARCH_WORKFLOW.md)
- [新闻智能分析结果持久化与强制重分析设计](./FINAGENTS_NEWS_ANALYSIS_CACHE_DESIGN.md)

---

## 1. 背景与目标

当前 `analysis` 页已经能展示结果（命中实体、候选股票、结论），但用户看不到：

- 分析到底经过了哪些步骤
- 每一步做了什么判断
- 哪一步耗时高、是否降级（如超时回退）

本方案目标是把“思考过程”显式化，让用户和研发都能看到可解释链路。

---

## 2. 范围与非目标

### 2.1 本期范围

- 在 `analysis` 页面展示“思考过程”时间线
- 后端返回结构化过程数据（而非仅日志）
- 支持新闻分析和自由问题分析两种模式
- 在缓存命中时显示“历史过程摘要”

### 2.2 非目标

- 不展示模型原始 prompt/原始长文本推理
- 不做实时流式节点进度（本期仍是请求完成后一次性展示）
- 不做跨请求对比 UI（如两次分析 diff）

---

## 3. 设计原则

1. **可解释但可控**：展示结构化步骤结论，不暴露底层提示词与敏感上下文。
2. **统一模型**：前后端共享一套 `trace` 数据结构。
3. **低侵入**：复用现有 workflow 节点与计时埋点，不重构核心分析逻辑。
4. **可降级**：某一步超时/失败时，过程仍可渲染并标注降级原因。

---

## 4. 信息架构（页面展示）

在 `analysis-view` 结果区新增模块：**思考过程（Explain Trace）**。

建议 UI 结构：

- 顶部摘要条
    - 总耗时
    - 执行步数
    - 是否命中缓存
    - 是否发生降级（如 Tavily 超时）
- 时间线步骤卡（按执行顺序）
    - 步骤名（如“提取新闻线索”）
    - 状态（成功 / 降级 / 跳过 / 失败）
    - 耗时（ms）
    - 输入摘要（关键词数、候选数等）
    - 输出摘要（命中实体数、证据条数等）
    - 说明文本（1 行）
- 末尾结论卡
    - 为什么进入 `generateReport` 或 `generateObservation`
    - 本次结果来源与置信度（复用 `resultMeta`）

---

## 5. 数据结构设计

在 `analyze-news` / `analyze-query` 响应里新增 `trace` 字段。

```json
{
    "trace": {
        "version": "v1",
        "requestId": "uuid",
        "mode": "news_analysis",
        "startedAt": "2026-03-16T10:00:00.000Z",
        "finishedAt": "2026-03-16T10:00:12.474Z",
        "elapsedMs": 12474,
        "degraded": true,
        "steps": [
            {
                "name": "extractNewsHints",
                "label": "提取新闻线索",
                "status": "done",
                "elapsedMs": 5650,
                "summary": "提取 6 个关键词，分析角度：政策影响",
                "metrics": {"keywords": 6}
            },
            {
                "name": "webSearchContext",
                "label": "外部搜索补充",
                "status": "degraded",
                "elapsedMs": 2515,
                "summary": "Tavily 超时，回退为空证据",
                "metrics": {"evidence": 0, "timeoutMs": 2500}
            }
        ]
    }
}
```

### 5.1 字段约束

- `status`：`done | skipped | degraded | failed`
- `metrics`：只放数值或短文本摘要，不放大段原始内容
- `summary`：面向用户可读，单步 1 行

---

## 6. 后端实现方案

### 6.1 Workflow 侧

在 `runResearchWorkflow` 维护一个 `traceCollector`：

- 节点开始：记录 `startedAt`
- 节点结束：记录 `elapsedMs` + 输出摘要
- 节点降级：标记 `status=degraded`
- 节点异常：记录 `status=failed` + 错误码（脱敏）

当前已有节点耗时日志，可直接扩展为“写入结构体 + 打日志”双通道。

### 6.2 Service 侧

在 `lib/research/service.ts` 组装响应时，将 workflow trace 写入：

- 实时结果：直接返回 `trace`
- 缓存命中：返回快照中的 `trace`，并在 `cache.hit=true` 下提示“历史过程”

### 6.3 持久化

`news_analysis_snapshots.result_payload` 已是 JSON，可直接承载 `trace`，无需新表。

---

## 7. 前端实现方案

### 7.1 类型

在 `analysis-view.tsx` 中给 `AnalysisResult` 增加：

- `trace.version`
- `trace.elapsedMs`
- `trace.degraded`
- `trace.steps[]`

### 7.2 组件拆分

建议新增：

- `analysis-trace-card.tsx`
- `analysis-trace-step.tsx`

并在结果区插入位置：

- `cache` 提示卡之后
- `候选股票` / `AI 结论` 之前

### 7.3 交互细节

- 默认展示前 6 步，剩余可展开
- `degraded` 步骤用 warning 色
- `failed` 步骤可显示“降级输出，结果仅供参考”

---

## 8. 状态与降级规范

统一规则：

- `done`：步骤正常完成
- `skipped`：按分支条件跳过（如无证据跳过 `extractGroundedHints`）
- `degraded`：出现超时/回退但整体可继续
- `failed`：步骤失败且导致流程中断

建议在 `webSearchContext`、`extractNewsHints`、`fillFallbackStocks` 明确记录降级原因。

---

## 9. 安全与隐私边界

前端可展示：

- 步骤名、耗时、结构化计数、简短说明

前端不展示：

- 原始 prompt
- 模型完整思维长文本
- 可能包含敏感信息的原始上下文拼接文本

---

## 10. 分阶段落地

### Phase 1（本周可完成）

- 后端返回最小 `trace`（步骤名 + 状态 + 耗时 + summary）
- `analysis` 页面展示时间线卡片

### Phase 2

- 增加 `metrics`（命中数量、候选变化、降级计数）
- 在聊天页复用同一展示组件

### Phase 3

- 过程对比（本次 vs 历史缓存）
- 慢步骤自动标记与优化建议提示

---

## 11. 验收标准（DoD）

1. `POST /api/research/analyze-news` 返回 `trace` 字段。
2. `analysis` 页可渲染步骤时间线，且顺序与后端执行一致。
3. `webSearchContext` 超时时，步骤状态为 `degraded`，页面可见。
4. 缓存命中时仍可展示历史 `trace`。
5. 不在前端输出 prompt 或原始链路敏感文本。

---

## 12. 建议任务拆分

- Task A：定义 `trace` TS 类型与响应协议
- Task B：workflow 节点写入 `traceCollector`
- Task C：service 层透传与快照落库
- Task D：`analysis` 页新增“思考过程”组件
- Task E：联调与验收用例（超时、跳过、缓存命中）
