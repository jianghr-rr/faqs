# FinAgents 行业知识图谱 Schema 草案

> **项目**：FinAgents OS
> **创建日期**：2026-03-09
> **状态**：草案，可作为 `apps/faqs-web/db/schema.ts` 改造参考

---

## 1. 文档目的

本文档是 `INDUSTRY_KNOWLEDGE_GRAPH_DESIGN.md` 的工程补充，目标是提供一版更接近代码实现的：

- Drizzle Schema 草案
- 枚举与字段命名建议
- 表之间的关联关系
- 推荐 migration 顺序

当前仓库已经使用 `Drizzle ORM + PostgreSQL + Supabase`，因此本方案优先保持与现有 `apps/faqs-web/db/schema.ts` 的风格一致。

---

## 2. 推荐新增枚举

### 2.1 `kg_entity_type`

```typescript
export const kgEntityTypeEnum = pgEnum('kg_entity_type', ['theme', 'industry', 'chain_node', 'company']);
```

### 2.2 `kg_alias_type`

```typescript
export const kgAliasTypeEnum = pgEnum('kg_alias_type', [
    'common',
    'short_name',
    'ticker_name',
    'english_name',
    'synonym',
]);
```

### 2.3 `kg_relation_type`

第一阶段建议先收敛，不要一开始放太多关系类型。

**重要约束**：上下游关系建议只保留一个规范方向，即只存 `upstream_of`。
反向的“下游”语义通过查询层推导，不单独存 `downstream_of`，避免双向关系写入不一致。

```typescript
export const kgRelationTypeEnum = pgEnum('kg_relation_type', [
    'relates_to',
    'contains',
    'upstream_of',
    'belongs_to',
    'participates_in',
]);
```

### 2.4 `kg_entity_status`

```typescript
export const kgEntityStatusEnum = pgEnum('kg_entity_status', ['active', 'inactive']);
```

### 2.5 `kg_security_list_status`

```typescript
export const kgSecurityListStatusEnum = pgEnum('kg_security_list_status', ['listed', 'delisted', 'suspended']);
```

---

## 3. 推荐表结构

### 3.1 `kgEntities`

```typescript
export const kgEntities = pgTable(
    'kg_entities',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        entityType: kgEntityTypeEnum('entity_type').notNull(),
        name: varchar('name', {length: 200}).notNull(),
        canonicalName: varchar('canonical_name', {length: 200}).notNull(),
        description: text('description'),
        status: kgEntityStatusEnum('status').notNull().default('active'),
        metadata: jsonb('metadata')
            .notNull()
            .default(sql`'{}'::jsonb`),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        index('kg_entities_type_idx').on(t.entityType),
        index('kg_entities_name_idx').on(t.name),
        unique('kg_entities_type_canonical_name_unique').on(t.entityType, t.canonicalName),
    ],
);
```

**字段建议：**

- `name`：前台显示名称
- `canonicalName`：标准化名称，用于去重
- `metadata`：承载扩展字段，避免一期过度拆表

`metadata` 示例：

```json
{
    "classificationSystem": "sw2021",
    "industryLevel": 2,
    "businessTags": ["储能", "PCS"],
    "importance": "core"
}
```

### 3.2 `kgEntityAliases`

```typescript
export const kgEntityAliases = pgTable(
    'kg_entity_aliases',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        entityId: uuid('entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        alias: varchar('alias', {length: 200}).notNull(),
        aliasType: kgAliasTypeEnum('alias_type').notNull().default('common'),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (t) => [
        unique('kg_entity_aliases_entity_alias_unique').on(t.entityId, t.alias),
        index('kg_entity_aliases_alias_idx').on(t.alias),
    ],
);
```

### 3.3 `kgRelations`

```typescript
export const kgRelations = pgTable(
    'kg_relations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        fromEntityId: uuid('from_entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        toEntityId: uuid('to_entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        relationType: kgRelationTypeEnum('relation_type').notNull(),
        weight: decimal('weight', {precision: 8, scale: 4}),
        confidence: decimal('confidence', {precision: 5, scale: 4}),
        source: varchar('source', {length: 200}),
        evidence: jsonb('evidence')
            .notNull()
            .default(sql`'{}'::jsonb`),
        validFrom: timestamp('valid_from', {withTimezone: true}),
        validTo: timestamp('valid_to', {withTimezone: true}),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        unique('kg_relations_from_to_type_unique').on(t.fromEntityId, t.toEntityId, t.relationType),
        index('kg_relations_from_idx').on(t.fromEntityId),
        index('kg_relations_to_idx').on(t.toEntityId),
        index('kg_relations_type_idx').on(t.relationType),
    ],
);
```

`evidence` 示例：

```json
{
    "sourceType": "annual_report",
    "sourceTitle": "2025 年报",
    "sourceUrl": "https://example.com/report",
    "notes": "主营储能 PCS，国内出货领先"
}
```

**关系维护建议：**

- `contains`、`belongs_to`、`participates_in` 作为主数据关系直接维护
- `upstream_of` 只维护一个方向
- 所有“反向关系”统一在 service 层通过查询推导，不作为主存储写回
- 这样可以避免 `A upstream_of B` 和 `B downstream_of A` 只写了一边导致的数据不一致

### 3.4 `securities`

```typescript
export const securities = pgTable(
    'securities',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        companyEntityId: uuid('company_entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        stockCode: varchar('stock_code', {length: 20}).notNull(),
        stockName: varchar('stock_name', {length: 100}).notNull(),
        exchange: varchar('exchange', {length: 20}).notNull(),
        listStatus: kgSecurityListStatusEnum('list_status').notNull().default('listed'),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        unique('securities_exchange_stock_code_unique').on(t.exchange, t.stockCode),
        index('securities_company_entity_idx').on(t.companyEntityId),
    ],
);
```

**注意**：`companyEntityId` 在数据库层只是外键到 `kg_entities.id`，单靠外键本身无法保证它一定指向 `entity_type = 'company'`。

因此第一阶段至少应增加以下约束策略之一：

1. seed 脚本写入前校验 `companyEntityId` 对应实体类型必须为 `company`
2. repository / service 层封装统一写入入口，禁止直接裸写 `securities`
3. 如后续需要更强约束，再增加 trigger 或拆出独立 `companies` 表

**推荐做法**：第一阶段采用 “seed 脚本校验 + service 层校验” 双保险，先不引入额外复杂度。

### 3.5 `events`

事件使用独立表，不纳入 `kg_entities`。事件有 `event_time`、`source_news_id` 等专属字段，与主图谱实体的 schema 差异较大。

```typescript
export const events = pgTable(
    'events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        title: varchar('title', {length: 300}).notNull(),
        eventType: varchar('event_type', {length: 100}).notNull(),
        summary: text('summary'),
        sourceNewsId: uuid('source_news_id').references(() => news.id, {onDelete: 'set null'}),
        eventTime: timestamp('event_time', {withTimezone: true}),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [index('events_event_type_idx').on(t.eventType), index('events_source_news_id_idx').on(t.sourceNewsId)],
);
```

### 3.6 `eventEntityMap`

```typescript
export const eventEntityMap = pgTable(
    'event_entity_map',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        eventId: uuid('event_id')
            .notNull()
            .references(() => events.id, {onDelete: 'cascade'}),
        entityId: uuid('entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        impactType: varchar('impact_type', {length: 50}),
        impactScore: decimal('impact_score', {precision: 5, scale: 4}),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (t) => [
        unique('event_entity_map_event_entity_unique').on(t.eventId, t.entityId),
        index('event_entity_map_event_idx').on(t.eventId),
        index('event_entity_map_entity_idx').on(t.entityId),
    ],
);
```

---

## 4. 推荐 relations 定义

### 4.1 `kgEntitiesRelations`

```typescript
export const kgEntitiesRelations = relations(kgEntities, ({many}) => ({
    aliases: many(kgEntityAliases),
    outgoingRelations: many(kgRelations, {relationName: 'kg_relation_from'}),
    incomingRelations: many(kgRelations, {relationName: 'kg_relation_to'}),
    securities: many(securities),
    eventMappings: many(eventEntityMap),
}));
```

### 4.2 `kgEntityAliasesRelations`

```typescript
export const kgEntityAliasesRelations = relations(kgEntityAliases, ({one}) => ({
    entity: one(kgEntities, {
        fields: [kgEntityAliases.entityId],
        references: [kgEntities.id],
    }),
}));
```

### 4.3 `kgRelationsRelations`

```typescript
export const kgRelationsRelations = relations(kgRelations, ({one}) => ({
    fromEntity: one(kgEntities, {
        fields: [kgRelations.fromEntityId],
        references: [kgEntities.id],
        relationName: 'kg_relation_from',
    }),
    toEntity: one(kgEntities, {
        fields: [kgRelations.toEntityId],
        references: [kgEntities.id],
        relationName: 'kg_relation_to',
    }),
}));
```

### 4.4 `securitiesRelations`

```typescript
export const securitiesRelations = relations(securities, ({one}) => ({
    company: one(kgEntities, {
        fields: [securities.companyEntityId],
        references: [kgEntities.id],
    }),
}));
```

### 4.5 `eventsRelations`

```typescript
export const eventsRelations = relations(events, ({one, many}) => ({
    sourceNews: one(news, {
        fields: [events.sourceNewsId],
        references: [news.id],
    }),
    entityMappings: many(eventEntityMap),
}));
```

### 4.6 `eventEntityMapRelations`

```typescript
export const eventEntityMapRelations = relations(eventEntityMap, ({one}) => ({
    event: one(events, {
        fields: [eventEntityMap.eventId],
        references: [events.id],
    }),
    entity: one(kgEntities, {
        fields: [eventEntityMap.entityId],
        references: [kgEntities.id],
    }),
}));
```

---

## 5. 推荐引入方式

### 5.1 最小改造策略

不建议第一步就大改现有 `db/schema.ts`，建议按以下顺序：

1. 新增图谱相关枚举与表
2. 不动现有 `faqs` / `news` / `favorites`
3. 先通过脚本 seed 试点数据
4. 再补查询 service
5. 最后接入新闻慢链路

### 5.2 推荐 migration 顺序

建议拆成 3 个 migration：

1. `kg base`
    - `kg_entity_type`
    - `kg_alias_type`
    - `kg_relation_type`
    - `kg_entity_status`
    - `kg_entities`
    - `kg_entity_aliases`
    - `kg_relations`
    - `securities`

2. `kg events`
    - `events`
    - `event_entity_map`

3. `kg indexes or enhancements`
    - 补充全文索引
    - 补充 `pgvector`（如果需要）

---

## 6. 推荐查询场景

### 6.1 按行业查产业链节点

```typescript
db.select()
    .from(kgRelations)
    .where(and(eq(kgRelations.fromEntityId, industryId), eq(kgRelations.relationType, 'contains')));
```

### 6.2 按链条节点查关联公司

```typescript
db.select({
    companyId: kgEntities.id,
    companyName: kgEntities.name,
    weight: kgRelations.weight,
    confidence: kgRelations.confidence,
})
    .from(kgRelations)
    .innerJoin(kgEntities, eq(kgRelations.fromEntityId, kgEntities.id))
    .where(and(eq(kgRelations.toEntityId, chainNodeId), eq(kgRelations.relationType, 'participates_in')));
```

### 6.3 按公司查证券代码

```typescript
db.select().from(securities).where(eq(securities.companyEntityId, companyEntityId));
```

### 6.4 按别名查实体

```typescript
db.select({
    entityId: kgEntityAliases.entityId,
    alias: kgEntityAliases.alias,
})
    .from(kgEntityAliases)
    .where(eq(kgEntityAliases.alias, keyword));
```

### 6.5 别名命中后的消歧

别名查询不应被视为“唯一命中”，而应被视为“候选召回”。

推荐流程：

1. 先按 `alias` 精确召回候选实体
2. 再结合新闻上下文做 rerank：
    - `entity_type`
    - 已命中的行业/主题
    - `news.tickers`
    - `news.tags`
    - 实体历史命中优先级
3. 最终输出一个主命中实体，必要时保留次优候选

如果后续歧义问题较多，可为 `kg_entity_aliases` 增加以下字段：

- `priority`
- `confidence`
- `applicable_entity_type`

第一阶段即使不加字段，也应在 service 层明确实现“召回 + 消歧”两步，而不是 alias 命中即直接认定实体。

---

## 7. 推荐代码组织

建议第一阶段新增这些文件：

| 文件                                     | 用途              |
| ---------------------------------------- | ----------------- |
| `apps/faqs-web/db/schema.ts`             | 补充图谱相关表    |
| `apps/faqs-web/scripts/seed-kg-pilot.ts` | 导入试点行业 seed |
| `apps/faqs-web/lib/kg/types.ts`          | 图谱相关类型      |
| `apps/faqs-web/lib/kg/repository.ts`     | 基础查询封装      |
| `apps/faqs-web/lib/kg/service.ts`        | 图谱扩展逻辑      |

---

## 8. 实施建议

如果下一步要真正进入编码，最合理的顺序是：

1. 先把这里的枚举和表结构收敛确认
2. 再在 `db/schema.ts` 中正式新增 Drizzle 定义
3. 生成 migration
4. 用 `储能 / 光伏 / 算力` 先导入一小批试点 seed
5. 最后再把查询服务挂到新闻分析链路上

当前这份文档的定位是“**代码前的最后一版结构草案**”，基本可以直接作为下一步开发输入。
