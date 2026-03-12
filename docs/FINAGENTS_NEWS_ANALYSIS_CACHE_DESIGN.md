# 新闻智能分析结果持久化与强制重分析设计

> 项目：FinAgents OS / faqs-web  
> 日期：2026-03-12  
> 状态：设计草案（可直接进入开发）

---

## 1. 背景与问题

当前 `POST /api/research/analyze-news` 的行为是每次请求都实时执行 `runResearchWorkflow`。  
这会导致：

- 同一条新闻被重复分析，耗时和成本较高
- 用户重复进入分析页时，体验不稳定（每次等待时间不同）
- 没有“历史分析结果”可复用，也不利于后续追踪

---

## 2. 目标与非目标

### 2.1 目标

- 新闻分析结果持久化到数据库
- 同一 `newsId` 已有可用结果时默认直接返回缓存
- 前端提供“强制重新分析”按钮，可绕过缓存并刷新结果
- 返回结果中标记“是否命中缓存”，便于页面提示

### 2.2 非目标

- 本期不处理“自由问题分析（analyze-query）”缓存
- 本期不做多版本历史比对 UI（只保留最新成功快照）
- 本期不做异步队列化（仍保持同步请求返回）

---

## 3. 当前链路（现状）

1. 前端 `analysis-view.tsx` 调用 `POST /api/research/analyze-news`，请求体仅有 `newsId`
2. Route 调用 `analyzeNewsById(newsId)`
3. `analyzeNewsById` 读取新闻后直接执行 `runResearchWorkflow`
4. 返回结果给前端，但不落库

结论：当前不存在新闻分析结果复用能力。

---

## 4. 方案总览

新增一个“新闻分析快照表”，默认读缓存，按需强制刷新。

- 默认分析：`forceReanalyze = false`
    - 如果有缓存：直接返回缓存
    - 如果无缓存：执行实时分析并落库
- 强制重分析：`forceReanalyze = true`
    - 跳过缓存，实时分析后覆盖快照

---

## 5. 数据模型设计

建议新增表：`news_analysis_snapshots`

### 5.1 字段

- `id` `uuid` 主键
- `news_id` `uuid` not null，关联 `news.id`，并加唯一约束（每条新闻仅保留一条最新快照）
- `result_payload` `jsonb` not null（完整分析结果）
- `result_meta` `jsonb` not null default `'{}'`（可选：缓存来源、workflow 版本、耗时）
- `analyzed_at` `timestamptz` not null（本次分析时间）
- `created_at` `timestamptz` not null default `now()`
- `updated_at` `timestamptz` not null default `now()`

### 5.2 索引与约束

- `unique(news_id)`
- `index(updated_at)`（后续便于运维排查）

### 5.3 设计取舍

- 只存“最新成功结果”，实现简单、查询快、覆盖当前需求
- 若后续需要审计历史，可再拆分为 `news_analysis_runs`（流水）+ `news_analysis_latest`（快照）

---

## 6. API 设计变更

接口仍为：`POST /api/research/analyze-news`

### 6.1 请求

```json
{
    "newsId": "uuid",
    "forceReanalyze": false
}
```

- `forceReanalyze` 可选，默认 `false`

### 6.2 响应新增字段

在现有响应中新增：

```json
{
    "cache": {
        "hit": true,
        "forced": false,
        "analyzedAt": "2026-03-12T09:30:00.000Z"
    }
}
```

字段说明：

- `hit`: 是否命中缓存
- `forced`: 本次是否强制重分析
- `analyzedAt`: 当前返回结果对应的分析时间

---

## 7. 服务层实现建议

### 7.1 新增 repository

建议新增：`lib/research/repository.ts`

提供最小接口：

- `getNewsAnalysisSnapshot(newsId: string)`
- `upsertNewsAnalysisSnapshot(input: { newsId: string; payload: unknown; meta?: unknown; analyzedAt: Date })`

### 7.2 `analyzeNewsById` 新逻辑

伪流程：

1. `getNewsById(newsId)`，不存在则抛 `NEWS_NOT_FOUND`
2. 若 `forceReanalyze !== true`，先查快照
    - 命中：直接返回快照中的 payload，并补充 `cache.hit = true`
3. 未命中或强制重算：执行 `runResearchWorkflow`
4. 组装标准响应 payload
5. `upsert` 快照
6. 返回 payload，并标记 `cache.hit = false`

---

## 8. 前端交互设计

目标页面：`/analysis?mode=news&newsId=...`（`analysis-view.tsx`）

### 8.1 按钮行为

- 主按钮文案：`执行分析`（默认复用缓存）
- 新增次按钮：`强制重新分析`
    - 点击后请求体附带 `forceReanalyze: true`
    - loading 中禁用两个按钮，避免重复提交

### 8.2 结果提示

当返回 `cache.hit = true` 时在结果头部展示轻提示：

- `已使用历史分析结果`
- `分析时间：xxxx-xx-xx xx:xx`

当 `cache.hit = false` 且 `forced = true`：

- `已重新分析并更新结果`

### 8.3 自动触发策略

- 从新闻卡片跳转到分析页后，首次自动触发仍使用默认模式（不强制）
- 用户显式点击“强制重新分析”才覆盖缓存

---

## 9. 并发与一致性

最简实现可先接受偶发并发重复分析；但建议加一个轻量保护：

- 方案 A（推荐）：应用层单飞（in-memory promise map，短期有效）
- 方案 B：数据库 advisory lock（按 `newsId` hash 加锁）

本期建议优先保证正确性：即便并发重复跑，最终 `upsert` 结果一致，不影响用户数据。

---

## 10. 兼容性与风险

### 10.1 兼容性

- 不改接口路径，不影响现有调用方
- `forceReanalyze` 为可选字段，老请求仍可用
- 响应新增字段为向后兼容扩展

### 10.2 风险

- `result_payload` 体积较大，需关注单行 JSONB 大小增长
- 工作流输出结构变化时，历史 payload 可能与最新前端字段预期不一致

缓解策略：

- 在 `result_meta` 中记录 `workflowVersion`
- 前端渲染使用可选链和兜底逻辑

---

## 11. 分阶段落地计划

### Phase 1（本需求最小闭环）

1. DB schema + migration：新增 `news_analysis_snapshots`
2. repository：读写快照
3. service：`analyzeNewsById(newsId, { forceReanalyze? })`
4. API route：解析 `forceReanalyze`
5. 前端：增加“强制重新分析”按钮 + 缓存命中提示

### Phase 2（优化）

- 增加命中率/耗时日志
- 支持缓存 TTL（例如 24h 后自动重算）
- 增加后台定时刷新热点新闻分析

---

## 12. 验收标准（DoD）

- 同一 `newsId` 连续请求两次，第二次返回 `cache.hit = true`
- 点击“强制重新分析”后，返回 `forced = true` 且 `cache.hit = false`
- 强制分析后再次普通请求，可命中新快照
- `newsId` 不存在仍返回 `404 NOT_FOUND`
- 页面上可明确区分“历史结果”与“重新分析结果”

---

## 13. 测试建议

- **单元测试**
    - repository 的 `get/upsert` 行为
    - `analyzeNewsById` 在命中/未命中/强制三类分支
- **接口测试**
    - `POST /api/research/analyze-news` 参数校验与响应字段
- **前端交互测试**
    - 默认分析 vs 强制重分析按钮的请求体差异
    - 缓存提示文案展示条件

---

## 14. 推荐的实现顺序（工程视角）

先后顺序建议：

1. 数据表与 repository
2. 服务层分支逻辑
3. 路由入参与响应补充
4. 前端按钮与提示
5. 测试与日志补齐

这样可以最小化回归风险，并且每一步都可单独验证。
