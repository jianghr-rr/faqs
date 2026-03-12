# FinAgents 行业知识图谱落地方案

> **项目**：FinAgents OS
> **创建日期**：2026-03-09
> **状态**：设计阶段，待评审后实施

**配套文档：**

- [Schema 草案](./INDUSTRY_KNOWLEDGE_GRAPH_SCHEMA_DRAFT.md)
- [Seed 样例](./INDUSTRY_KNOWLEDGE_GRAPH_SEED_EXAMPLES.md)

---

## 1. 文档目标

本文档用于将“FinAgents 行业知识图谱”从概念方案整理为可落地的技术设计，回答以下问题：

- 这个需求是否值得做
- 第一阶段应该做到什么程度
- 数据模型应该如何设计
- AI 推理链路如何接入现有新闻/分析能力
- 开发实施的优先级和 TODO 如何拆分

**结论**：

- 该需求**值得做**，是 FinAgents 从“新闻聚合/聊天界面”走向“投研推理系统”的关键基础设施
- 第一阶段建议采用 **PostgreSQL + 结构化关系模型**，不急于引入独立图数据库
- 当前原始方案中“4 层树结构”过于简化，需升级为 **实体 + 关系 + 事件 + 别名 + 时间有效期** 的图谱设计

---

## 2. 业务目标与使用边界

### 2.1 业务目标

行业知识图谱用于提升以下能力：

- 新闻事件对应行业的识别准确率
- 产业链上下游推理稳定性
- 公司与产业链环节的映射能力
- LLM 输出结论的可解释性
- AI 投研分析的一致性与可复用性

### 2.2 第一阶段不做什么

为避免范围失控，MVP 明确**不包含**以下能力：

- 不做全市场、全证券品种、全概念题材的完整覆盖
- 不做自动化无人工审核的关系写入
- 不做复杂图算法平台或独立 Neo4j 系统
- 不做实时毫秒级事件传播图计算
- 不做全量向量库优先架构

### 2.3 第一阶段范围

MVP 建议只覆盖：

- A 股核心行业
- 重点产业链环节
- 核心上市公司
- 与新闻分析直接相关的事件类型

### 2.4 访问控制

- **仅登录用户可用**：行业知识图谱相关功能（图谱查询、新闻推理扩展、受益公司召回等）仅对已登录用户开放，未登录用户不可访问。

---

## 3. 为什么原始 4 层树不够

原始方案的结构是：

```text
宏观主题
↓
行业
↓
产业链
↓
上市公司
```

这个结构适合作为展示视图，但**不适合作为底层数据模型**，原因如下：

1. `宏观主题` 和 `行业` 并不是严格单继承关系
   例如“人工智能”更像投资主题，不是标准行业分类；一个行业也可能同时属于多个主题。

2. `产业链` 同时包含“从属关系”和“上下游关系”
   “光伏包含硅料”与“硅料上游/下游是什么”是两种不同语义，不能混成一种表结构。

3. `公司` 往往同时覆盖多个链条环节
   一家公司可能既做电芯又做储能系统集成，不能强制挂在一个单节点下。

4. 缺少 `事件层`
   如果没有事件层，AI 只能从新闻直接跳行业，推理路径容易漂移，解释也不稳定。

因此，底层应采用**图谱模型**，对外仍可提供“树形展示视图”。

---

## 4. 推荐总体方案

### 4.1 核心设计原则

- **结构化优先**：先把实体和关系定义准确，再考虑向量化增强
- **事件驱动**：图谱服务于新闻/研报/公告分析，而不是做静态百科
- **多对多建模**：允许主题、行业、链条、公司之间多重映射
- **可追溯**：每条关系都应带来源、置信度、更新时间
- **可演进**：第一阶段用 PostgreSQL，后续按规模决定是否升级图数据库

### 4.2 推荐实体层

建议把知识图谱拆成以下实体：

| 实体类型     | 说明             | 示例                   |
| ------------ | ---------------- | ---------------------- |
| `theme`      | 投资主题/主线    | 新能源、人工智能、军工 |
| `industry`   | 标准行业分类节点 | 光伏、储能、半导体     |
| `chain_node` | 产业链环节节点   | 硅料、逆变器、BMS      |
| `company`    | 公司主体         | 宁德时代、阳光电源     |

此外，以下概念通过**独立表**承载，不纳入 `kg_entities` 统一实体模型：

| 独立表       | 说明                                               | 示例                         |
| ------------ | -------------------------------------------------- | ---------------------------- |
| `securities` | 可交易证券，通过外键关联 company 实体              | 300750.SZ                    |
| `events`     | 新闻抽象出的事件，带有事件时间、来源新闻等专属字段 | 政策扶持、产品涨价、订单落地 |

**拆分原因**：证券有独立的交易所、上市状态等专属字段；事件有事件时间、来源新闻 ID 等专属字段，二者与主图谱实体的 schema 差异较大，放入统一实体表会导致 metadata 滥用。

### 4.3 推荐关系层

建议统一使用“关系表”承载图边，而不是为每类关系单独建零散字段。

常见关系示例：

| from         | relation_type     | to           | 示例             |
| ------------ | ----------------- | ------------ | ---------------- |
| `theme`      | `relates_to`      | `industry`   | 新能源 -> 光伏   |
| `industry`   | `contains`        | `chain_node` | 储能 -> PCS      |
| `chain_node` | `upstream_of`     | `chain_node` | 电芯 -> 储能系统 |
| `company`    | `participates_in` | `chain_node` | 阳光电源 -> PCS  |
| `company`    | `belongs_to`      | `industry`   | 隆基绿能 -> 光伏 |

> **注意**：公司到证券的映射由独立 `securities` 表承载，不走 `kg_relations`。事件到实体的影响关系由 `event_entity_map` 表承载，同样不走 `kg_relations`。
>
> **补充约束**：上下游关系建议只保留 `upstream_of` 一个规范方向；“下游”语义通过查询层反向推导，不单独落库，避免双向关系维护不一致。

---

## 5. 数据模型设计

### 5.1 总体建模思路

第一阶段推荐继续使用 **PostgreSQL**，原因如下：

- 当前项目已有 PostgreSQL / Supabase 方向，技术栈一致
- 数据规模在第一阶段完全可控
- 关系查询、全文检索、向量扩展都可在 PG 内完成
- 降低新系统引入成本

### 5.2 实体主表 `kg_entities`

```sql
CREATE TYPE kg_entity_type AS ENUM (
    'theme',
    'industry',
    'chain_node',
    'company'
);

CREATE TABLE kg_entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type kg_entity_type NOT NULL,
    name text NOT NULL,
    canonical_name text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'active',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kg_entities_type_idx ON kg_entities(entity_type);
CREATE INDEX kg_entities_name_idx ON kg_entities(name);
CREATE UNIQUE INDEX kg_entities_type_canonical_name_uniq
ON kg_entities(entity_type, canonical_name);
```

**说明：**

- `name` 用于展示
- `canonical_name` 用于标准化去重
- `metadata` 用于存储额外字段，如行业分类来源、公司主营标签等

### 5.3 别名表 `kg_entity_aliases`

```sql
CREATE TABLE kg_entity_aliases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    alias text NOT NULL,
    alias_type text NOT NULL DEFAULT 'common',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(entity_id, alias)
);

CREATE INDEX kg_entity_aliases_alias_idx ON kg_entity_aliases(alias);
```

**作用：**

- 支持简称、俗称、英文名、证券简称
- 提升新闻实体识别命中率
- 支持同义词归一化

### 5.4 关系表 `kg_relations`

```sql
CREATE TABLE kg_relations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_entity_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    to_entity_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    relation_type text NOT NULL,
    weight numeric(8,4) CHECK (weight >= 0 AND weight <= 1),
    confidence numeric(5,4) CHECK (confidence >= 0 AND confidence <= 1),
    source text,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    valid_from timestamptz,
    valid_to timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(from_entity_id, to_entity_id, relation_type)
);

CREATE INDEX kg_relations_from_idx ON kg_relations(from_entity_id);
CREATE INDEX kg_relations_to_idx ON kg_relations(to_entity_id);
CREATE INDEX kg_relations_type_idx ON kg_relations(relation_type);
```

**关键字段建议：**

- `relation_type`：关系类型，如 `contains` / `upstream_of` / `participates_in` / `belongs_to` / `relates_to`
- `weight`：业务强度（0~1），如公司在某链条环节的重要程度
- `confidence`：关系可信度（0~1），便于半自动更新
- `source`：来源，如公告、研报、人工维护
- `valid_from / valid_to`：支持时效性

**关系维护原则：**

- 主数据层只维护一个方向的关系定义
- `upstream_of` 只存正向，反向查询由 service 层推导
- 避免同时写 `upstream_of` 与 `downstream_of` 导致数据不一致

### 5.5 公司证券表 `securities`

公司主体与股票代码建议拆开。

```sql
CREATE TABLE securities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_entity_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    stock_code text NOT NULL,
    stock_name text NOT NULL,
    exchange text NOT NULL,
    list_status text NOT NULL DEFAULT 'listed',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(exchange, stock_code)
);

CREATE INDEX securities_company_idx ON securities(company_entity_id);
```

**约束说明：**

`company_entity_id` 外键指向 `kg_entities.id`，但数据库本身无法只靠外键保证该实体一定是 `company` 类型。
因此第一阶段需要在实现层增加双重保护：

1. seed 脚本写入前校验 `entity_type = 'company'`
2. repository / service 层统一封装证券写入逻辑并再次校验

如果后续对强约束要求更高，再考虑增加 trigger 或拆分独立 `companies` 表。

### 5.6 新闻与事件映射

现有 `news` 表继续保留，新增 `events` 表承载从新闻中抽象出的结构化事件，以及 `event_entity_map` 表承载事件与图谱实体的影响关系。

```sql
CREATE TABLE events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    event_type text NOT NULL,
    summary text,
    source_news_id uuid REFERENCES news(id) ON DELETE SET NULL,
    event_time timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_entity_map (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    entity_id uuid NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    impact_type text,
    impact_score numeric(5,4) CHECK (impact_score >= 0 AND impact_score <= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(event_id, entity_id)
);
```

### 5.7 与现有 `news` 表的关系

现有 `news` 表已有 `tickers`（股票代码数组）和 `tags`（标签数组）字段，与图谱系统的定位说明如下：

| 现有字段        | 图谱系统对应                            | 过渡策略                                                                     |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `news.tickers`  | `securities.stock_code` + 图谱扩展      | 短期共存，`tickers` 作为快链路直接标注；图谱作为慢链路补充扩展               |
| `news.tags`     | `kg_entities` 实体识别                  | 短期共存，`tags` 继续用于前端展示；图谱做更精确的实体归一化                  |
| `news.category` | 与 `kg_entities` 的 `industry` 不同层级 | `news.category` 是内容分类（要闻/研报等），`industry` 是行业分类，两者不冲突 |

**原则**：图谱系统作为增量能力叠加，不改动现有 `news` 表结构。`events.source_news_id` 通过外键关联现有 `news.id`，使用 `ON DELETE SET NULL` 确保新闻清理不影响事件记录。

---

## 6. AI 推理链路设计

### 6.1 推荐链路

行业知识图谱建议接入现有“新闻快链路 + AI 慢增强”架构中的**慢链路**。

推荐流程：

```text
新闻入库
↓
事件抽取
↓
实体识别与别名归一
↓
命中行业/产业链节点
↓
沿图谱扩展候选公司
↓
候选公司排序
↓
LLM 生成投研分析
```

### 6.2 详细步骤

#### Step 1：新闻清洗入库

- 保留原标题、摘要、来源、发布时间
- 提取原始 ticker、tag、source_url
- 进入 `news` 表

#### Step 2：抽取事件

将新闻抽象为结构化事件，例如：

- 政策支持
- 产品涨价
- 行业供给收缩
- 公司中标
- 财报超预期

输出到 `events` 表。

#### Step 3：实体识别与归一化

从新闻正文、标题、标签中识别：

- 主题
- 行业
- 产业链节点
- 公司

识别后通过 `kg_entity_aliases` 做归一化。

需要注意：alias 命中不等于实体唯一确定。真实流程应是：

- 先通过 alias 表召回候选实体
- 再结合新闻上下文、已命中行业、ticker、tag 等信息做消歧排序
- 最终选出主命中实体，必要时保留候选列表

#### Step 4：图谱扩展

沿关系边扩展相关节点：

- 事件影响行业
- 行业包含哪些链条环节
- 哪些公司参与这些环节
- 这些公司对应哪些可交易证券

#### Step 5：排序与打分

对公司候选结果按以下维度打分：

- 关系距离
- 环节匹配度
- 公司在该环节的权重
- 新闻时效性
- 历史命中质量

#### Step 6：LLM 生成可解释分析

向模型提供的不应只是公司列表，还应包含“推理路径”：

```text
政策支持储能
-> 储能行业
-> PCS / 储能系统环节受益
-> 阳光电源 / 科华数据具备较强业务映射
```

这样输出更稳定，也更容易人工校验。

---

## 7. 更新机制设计

### 7.1 分层更新策略

不建议统一“每月更新”，而应按数据类型分层：

| 层级           | 更新频率    | 更新方式              |
| -------------- | ----------- | --------------------- |
| 主题/行业体系  | 月更或季更  | 人工审核更新          |
| 产业链节点     | 月更        | 人工维护 + 研报校正   |
| 公司链条映射   | 周更        | 半自动识别 + 人工审核 |
| 事件与实体映射 | 日内/准实时 | AI 抽取               |
| 公司主营描述   | 月更        | 财报/公告同步         |

### 7.2 数据来源建议

关系与描述的来源建议优先级如下：

1. 上市公司公告
2. 年报 / 季报 / 招股书
3. 券商研报
4. 行业白皮书
5. 高质量财经媒体

### 7.3 写入策略

为保证准确性，建议分三类写入：

- **人工主数据写入**：主题、行业、产业链节点
- **半自动审核写入**：公司与链条映射
- **自动临时写入**：事件与新闻关系，可带较低置信度

---

## 8. 向量检索的定位

向量检索有价值，但在本项目中建议作为**增强能力**，不是主存储。

### 8.1 适合向量化的内容

- 行业描述
- 产业链节点描述
- 公司主营业务描述
- 事件摘要

### 8.2 适合解决的问题

- 行业相似性搜索
- 非标准表达匹配
- 模糊业务描述下的公司召回
- 研报段落与图谱节点对齐

### 8.3 第一阶段建议

第一阶段优先考虑：

- PostgreSQL 结构化存储
- 如确需向量能力，优先考虑 `pgvector`

暂不建议一开始就引入独立 Pinecone / Qdrant / Weaviate 服务。

---

## 9. MVP 范围建议

### 9.1 实体覆盖规模

建议第一阶段控制在以下规模：

| 类型       | 规模建议   |
| ---------- | ---------- |
| 主题       | 15 ~ 20    |
| 行业       | 50 ~ 100   |
| 产业链节点 | 150 ~ 300  |
| 核心公司   | 500 ~ 1500 |
| 事件类型   | 20 ~ 30    |

### 9.2 行业优先级

建议优先建设这些行业：

- 新能源
- 储能
- 光伏
- 半导体
- 人工智能
- 算力
- 机器人
- 汽车智能化
- 军工
- 医药

### 9.3 成功标志

MVP 的验收不应是“图谱节点数量够多”，而应是：

- 热门新闻能较稳定命中正确行业
- 主要受益公司召回率可接受
- AI 生成的推理路径具备可解释性
- 人工复核能较快发现错误映射

---

## 10. 风险与设计约束

### 10.1 主要风险

1. **图谱结构过度简化**
   如果继续使用单树结构，后期会频繁遇到多归属冲突。

2. **关系质量低于数量**
   图谱最怕“看起来很多，实际不准”。

3. **自动抽取缺少审核闭环**
   纯 AI 自动写入会污染主图谱。

4. **事件层缺失**
   没有事件层，就很难形成稳定的新闻推理链。

5. **别名覆盖不足**
   实体识别命中率会成为真实落地瓶颈。

### 10.2 设计约束

- 主图谱关系需要可审计
- 核心关系必须支持人工修正
- 事件关系允许低置信度，但需区分于主数据
- AI 生成结论必须能回溯到图谱路径

---

## 11. 分阶段实施方案

### Phase 0：设计与校准

目标：完成数据模型冻结和样本验证。

- 确认主题、行业、产业链、公司、事件五类实体定义
- 确认关系类型枚举
- 选取 3 个试点行业做样本梳理
- 形成首版字段字典和命名规范

### Phase 1：主图谱 MVP

目标：建立一套可查询、可维护、可用于推理的基础图谱。

- 建立 `kg_entities`
- 建立 `kg_entity_aliases`
- 建立 `kg_relations`
- 建立 `securities`
- 导入试点行业主数据
- 提供基础查询接口

### Phase 2：接入新闻推理

目标：让图谱真正参与 AI 分析。

- 建立 `events`
- 建立 `event_entity_map`
- 接入新闻慢链路中的事件抽取
- 实现新闻 -> 图谱节点 -> 公司候选扩展
- 输出可解释推理路径

### Phase 3：半自动维护与运营

目标：让图谱具备持续演进能力。

- 建立后台维护入口或内部管理脚本
- 增加关系审核流
- 增加关系置信度与来源回溯
- 建立定期更新机制
- 建立质量评估报表

---

## 12. 开发 TODO 清单

### 12.1 P0：本周应完成

- [ ] 冻结实体类型枚举与关系类型枚举
- [ ] 确认主数据来源与优先级
- [ ] 选取 3 个试点行业：建议 `储能 / 光伏 / 算力`
- [ ] 输出首版字段字典
- [ ] 确认 PostgreSQL 表结构

### 12.2 P1：第一阶段开发

- [ ] 新增图谱相关数据库 migration
- [ ] 新增图谱实体与关系的 seed 数据脚本
- [ ] 新增基础查询 API：按行业查询链条、按公司查询归属
- [ ] 新增实体别名匹配能力
- [ ] 新增简单的图谱扩展查询服务
- [ ] 图谱相关 API 增加登录态校验，仅对已登录用户开放

### 12.3 P2：新闻结合

- [ ] 在新闻慢链路中增加事件抽取
- [ ] 在新闻处理中增加实体识别与归一化
- [ ] 将事件映射到图谱节点
- [ ] 生成候选受益公司列表
- [ ] 输出推理路径供 LLM 使用

### 12.4 P3：质量与运营

- [ ] 建立人工审核机制
- [ ] 增加关系来源与置信度回溯
- [ ] 建立命中率/召回率评估样本集
- [ ] 建立图谱更新 SOP
- [ ] 建立错误映射修正流程

---

## 13. 验收标准

第一阶段建议以“效果验收”而不是“数量验收”为主。

### 13.1 技术验收

- 能查询任一行业的产业链节点
- 能查询任一公司参与的产业链环节
- 能基于事件扩展出候选受益公司
- 能输出至少一条可解释的推理路径
- 未登录用户访问图谱相关接口应返回 401，仅登录用户可正常使用

### 13.2 业务验收

- 对试点行业的热点新闻，行业识别准确率达到可用水平
- 对试点行业的主要受益公司召回结果基本合理
- 人工评审能基于图谱路径快速判断结论是否可信

---

## 14. 最终建议

行业知识图谱应被定义为 **FinAgents 的核心推理基础设施**，但第一阶段必须坚持“小而准”的原则：

- 先做结构化关系，不急着做大而全
- 先做试点行业，不急着覆盖全市场
- 先把事件链路打通，不急着做复杂图计算
- 先保证可解释与可维护，再追求自动化扩张

对当前项目而言，最合理的落地路径是：

```text
PostgreSQL 主图谱
-> 试点行业 seed
-> 新闻慢链路接入事件抽取
-> 图谱扩展公司候选
-> LLM 生成可解释投研分析
```

这条路径实现成本可控、与现有架构兼容、且最容易验证真实业务价值。
