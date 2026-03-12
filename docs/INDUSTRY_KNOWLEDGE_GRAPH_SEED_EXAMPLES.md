# FinAgents 行业知识图谱 Seed 样例

> **项目**：FinAgents OS
> **创建日期**：2026-03-09
> **状态**：样例文档，供试点行业数据录入使用

---

## 1. 文档目标

本文档提供行业知识图谱第一阶段的试点 seed 样例，目标是帮助团队快速对齐：

- 试点行业应该如何拆实体
- 关系应该如何录入
- 别名应该如何配置
- 公司与证券应该如何映射

这份样例文档不追求“事实全量”，而是提供**结构模板**。

---

## 2. 第一阶段试点建议

建议先做 3 个试点方向：

- `储能`
- `光伏`
- `算力`

原因：

- 与新闻流、政策事件结合度高
- 上下游链条清晰
- 市场关注度高，容易验证推理效果

---

## 3. Seed 数据组织建议

建议 seed 数据按以下 5 类组织：

1. `entities`
2. `aliases`
3. `relations`
4. `securities`
5. `events`（可后补）

推荐脚本输入格式：

```typescript
type KgSeedBundle = {
    entities: Array<{
        key: string;
        canonicalRef: string;
        entityType: 'theme' | 'industry' | 'chain_node' | 'company';
        name: string;
        canonicalName: string;
        description?: string;
        metadata?: Record<string, unknown>;
    }>;
    aliases: Array<{
        entityKey: string;
        alias: string;
        aliasType?: 'common' | 'short_name' | 'ticker_name' | 'english_name' | 'synonym';
    }>;
    relations: Array<{
        fromKey: string;
        toKey: string;
        relationType: 'relates_to' | 'contains' | 'upstream_of' | 'belongs_to' | 'participates_in';
        weight?: string;
        confidence?: string;
        source?: string;
    }>;
    securities: Array<{
        companyKey: string;
        stockCode: string;
        stockName: string;
        exchange: string;
    }>;
};
```

**字段说明：**

- `key`：seed 阶段的临时引用键，不是数据库主键，仅用于 bundle 内和跨 bundle 的实体引用
- `canonicalRef`：标准引用键，建议格式为 `entityType:canonicalName`，如 `theme:新能源`
- `weight`：业务强度，取值范围 0~1
- `confidence`：关系可信度，取值范围 0~1
- `exchange`：交易所代码，A 股使用 `SSE`（上交所）或 `SZSE`（深交所）

**跨 bundle 实体引用**：不同行业的 seed bundle 可能引用相同的实体（如"新能源"主题同时关联储能和光伏）。seed 脚本应使用 `entity_type + canonical_name` 做 upsert 去重，并使用 `canonicalRef` 作为标准引用键，避免不同 bundle 因本地 `key` 命名不一致而造成维护脆弱性。

---

## 4. 试点样例一：储能

### 4.1 实体样例

```typescript
export const storageSeed = {
    entities: [
        {
            key: 'theme_new_energy',
            canonicalRef: 'theme:新能源',
            entityType: 'theme',
            name: '新能源',
            canonicalName: '新能源',
        },
        {
            key: 'industry_energy_storage',
            canonicalRef: 'industry:储能',
            entityType: 'industry',
            name: '储能',
            canonicalName: '储能',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {
            key: 'chain_battery_cell',
            canonicalRef: 'chain_node:电芯',
            entityType: 'chain_node',
            name: '电芯',
            canonicalName: '电芯',
        },
        {
            key: 'chain_pcs',
            canonicalRef: 'chain_node:PCS',
            entityType: 'chain_node',
            name: 'PCS',
            canonicalName: 'PCS',
        },
        {
            key: 'chain_bms',
            canonicalRef: 'chain_node:BMS',
            entityType: 'chain_node',
            name: 'BMS',
            canonicalName: 'BMS',
        },
        {
            key: 'chain_ems',
            canonicalRef: 'chain_node:EMS',
            entityType: 'chain_node',
            name: 'EMS',
            canonicalName: 'EMS',
        },
        {
            key: 'chain_storage_system',
            canonicalRef: 'chain_node:储能系统',
            entityType: 'chain_node',
            name: '储能系统',
            canonicalName: '储能系统',
        },
        {
            key: 'company_catl',
            canonicalRef: 'company:宁德时代',
            entityType: 'company',
            name: '宁德时代',
            canonicalName: '宁德时代',
            description: '动力电池与储能电池龙头企业',
        },
        {
            key: 'company_sungrow',
            canonicalRef: 'company:阳光电源',
            entityType: 'company',
            name: '阳光电源',
            canonicalName: '阳光电源',
            description: '逆变器与储能 PCS 领域核心公司',
        },
        {
            key: 'company_kehua',
            canonicalRef: 'company:科华数据',
            entityType: 'company',
            name: '科华数据',
            canonicalName: '科华数据',
            description: '储能系统与电力电子相关企业',
        },
    ],
    aliases: [
        {entityKey: 'company_catl', alias: '宁王', aliasType: 'short_name'},
        {entityKey: 'chain_storage_system', alias: '储能集成', aliasType: 'synonym'},
    ],
    relations: [
        {fromKey: 'theme_new_energy', toKey: 'industry_energy_storage', relationType: 'relates_to'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_battery_cell', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_pcs', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_bms', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_ems', relationType: 'contains'},
        {fromKey: 'industry_energy_storage', toKey: 'chain_storage_system', relationType: 'contains'},
        {fromKey: 'chain_battery_cell', toKey: 'chain_storage_system', relationType: 'upstream_of'},
        {fromKey: 'chain_pcs', toKey: 'chain_storage_system', relationType: 'upstream_of'},
        {
            fromKey: 'company_catl',
            toKey: 'chain_battery_cell',
            relationType: 'participates_in',
            weight: '1.0000',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_sungrow',
            toKey: 'chain_pcs',
            relationType: 'participates_in',
            weight: '0.9800',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_kehua',
            toKey: 'chain_storage_system',
            relationType: 'participates_in',
            weight: '0.8600',
            confidence: '0.9000',
            source: 'manual_seed',
        },
        {fromKey: 'company_catl', toKey: 'industry_energy_storage', relationType: 'belongs_to'},
        {fromKey: 'company_sungrow', toKey: 'industry_energy_storage', relationType: 'belongs_to'},
        {fromKey: 'company_kehua', toKey: 'industry_energy_storage', relationType: 'belongs_to'},
    ],
    securities: [
        {companyKey: 'company_catl', stockCode: '300750', stockName: '宁德时代', exchange: 'SZSE'},
        {companyKey: 'company_sungrow', stockCode: '300274', stockName: '阳光电源', exchange: 'SZSE'},
        {companyKey: 'company_kehua', stockCode: '002335', stockName: '科华数据', exchange: 'SZSE'},
    ],
} satisfies KgSeedBundle;
```

### 4.2 推理路径样例

```text
储能补贴政策
-> 命中行业：储能
-> 扩展链条：电芯 / PCS / 储能系统
-> 映射公司：宁德时代 / 阳光电源 / 科华数据
```

---

## 5. 试点样例二：光伏

### 5.1 实体与关系样例

```typescript
export const solarSeed = {
    entities: [
        // 主题：引用储能 seed 中已定义的 theme_new_energy，upsert 去重
        {
            key: 'theme_new_energy',
            canonicalRef: 'theme:新能源',
            entityType: 'theme',
            name: '新能源',
            canonicalName: '新能源',
        },
        {
            key: 'industry_solar',
            canonicalRef: 'industry:光伏',
            entityType: 'industry',
            name: '光伏',
            canonicalName: '光伏',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {
            key: 'chain_poly_silicon',
            canonicalRef: 'chain_node:硅料',
            entityType: 'chain_node',
            name: '硅料',
            canonicalName: '硅料',
        },
        {
            key: 'chain_wafer',
            canonicalRef: 'chain_node:硅片',
            entityType: 'chain_node',
            name: '硅片',
            canonicalName: '硅片',
        },
        {
            key: 'chain_cell',
            canonicalRef: 'chain_node:电池片',
            entityType: 'chain_node',
            name: '电池片',
            canonicalName: '电池片',
        },
        {
            key: 'chain_module',
            canonicalRef: 'chain_node:组件',
            entityType: 'chain_node',
            name: '组件',
            canonicalName: '组件',
        },
        {
            key: 'chain_inverter',
            canonicalRef: 'chain_node:逆变器',
            entityType: 'chain_node',
            name: '逆变器',
            canonicalName: '逆变器',
        },
        {
            key: 'company_tongwei',
            canonicalRef: 'company:通威股份',
            entityType: 'company',
            name: '通威股份',
            canonicalName: '通威股份',
            description: '硅料与电池片一体化龙头企业',
        },
        {
            key: 'company_longi',
            canonicalRef: 'company:隆基绿能',
            entityType: 'company',
            name: '隆基绿能',
            canonicalName: '隆基绿能',
            description: '硅片与组件一体化龙头企业',
        },
        {
            key: 'company_jinko',
            canonicalRef: 'company:晶科能源',
            entityType: 'company',
            name: '晶科能源',
            canonicalName: '晶科能源',
            description: '全球领先的光伏组件制造商',
        },
        // 跨行业公司：阳光电源同时参与光伏逆变器和储能 PCS
        // 实体在储能 seed 中已定义，这里 upsert 去重
        {
            key: 'company_sungrow',
            canonicalRef: 'company:阳光电源',
            entityType: 'company',
            name: '阳光电源',
            canonicalName: '阳光电源',
            description: '逆变器与储能 PCS 领域核心公司',
        },
    ],
    aliases: [
        {entityKey: 'industry_solar', alias: '光伏产业', aliasType: 'synonym'},
        {entityKey: 'industry_solar', alias: 'PV', aliasType: 'english_name'},
        {entityKey: 'chain_poly_silicon', alias: '多晶硅', aliasType: 'synonym'},
    ],
    relations: [
        // 主题 -> 行业
        {fromKey: 'theme_new_energy', toKey: 'industry_solar', relationType: 'relates_to'},
        // 行业 -> 链条环节
        {fromKey: 'industry_solar', toKey: 'chain_poly_silicon', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_wafer', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_cell', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_module', relationType: 'contains'},
        {fromKey: 'industry_solar', toKey: 'chain_inverter', relationType: 'contains'},
        // 环节上下游
        {fromKey: 'chain_poly_silicon', toKey: 'chain_wafer', relationType: 'upstream_of'},
        {fromKey: 'chain_wafer', toKey: 'chain_cell', relationType: 'upstream_of'},
        {fromKey: 'chain_cell', toKey: 'chain_module', relationType: 'upstream_of'},
        // 公司 -> 链条环节（带权重和置信度）
        {
            fromKey: 'company_tongwei',
            toKey: 'chain_poly_silicon',
            relationType: 'participates_in',
            weight: '1.0000',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_longi',
            toKey: 'chain_wafer',
            relationType: 'participates_in',
            weight: '0.9500',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_jinko',
            toKey: 'chain_module',
            relationType: 'participates_in',
            weight: '0.9500',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        // 阳光电源参与逆变器环节（跨行业多对多示范）
        {
            fromKey: 'company_sungrow',
            toKey: 'chain_inverter',
            relationType: 'participates_in',
            weight: '0.9800',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        // 公司 -> 行业
        {fromKey: 'company_tongwei', toKey: 'industry_solar', relationType: 'belongs_to'},
        {fromKey: 'company_longi', toKey: 'industry_solar', relationType: 'belongs_to'},
        {fromKey: 'company_jinko', toKey: 'industry_solar', relationType: 'belongs_to'},
        {fromKey: 'company_sungrow', toKey: 'industry_solar', relationType: 'belongs_to'},
    ],
    securities: [
        {companyKey: 'company_tongwei', stockCode: '600438', stockName: '通威股份', exchange: 'SSE'},
        {companyKey: 'company_longi', stockCode: '601012', stockName: '隆基绿能', exchange: 'SSE'},
        {companyKey: 'company_jinko', stockCode: '688223', stockName: '晶科能源', exchange: 'SSE'},
        // 阳光电源的证券在储能 seed 中已定义，upsert 去重
        {companyKey: 'company_sungrow', stockCode: '300274', stockName: '阳光电源', exchange: 'SZSE'},
    ],
} satisfies KgSeedBundle;
```

### 5.2 建模提醒

光伏链条里最容易出错的是：

- 把 `光伏 -> 硅料` 写成 `upstream`
- 实际上应拆成：
    - `光伏 contains 硅料`
    - `硅料 upstream_of 硅片`

**跨行业公司注意**：阳光电源同时参与储能 PCS 和光伏逆变器，是典型的多对多映射案例。seed 脚本通过 `entity_type + canonical_name` 做 upsert 去重，确保同一公司实体不会被重复创建。

---

## 6. 试点样例三：算力

### 6.1 实体与关系样例

```typescript
export const computeSeed = {
    entities: [
        {
            key: 'theme_ai',
            canonicalRef: 'theme:人工智能',
            entityType: 'theme',
            name: '人工智能',
            canonicalName: '人工智能',
        },
        {
            key: 'industry_compute',
            canonicalRef: 'industry:算力',
            entityType: 'industry',
            name: '算力',
            canonicalName: '算力',
            metadata: {classificationSystem: 'custom_mvp'},
        },
        {key: 'chain_gpu', canonicalRef: 'chain_node:GPU', entityType: 'chain_node', name: 'GPU', canonicalName: 'GPU'},
        {
            key: 'chain_server',
            canonicalRef: 'chain_node:服务器',
            entityType: 'chain_node',
            name: '服务器',
            canonicalName: '服务器',
        },
        {
            key: 'chain_datacenter',
            canonicalRef: 'chain_node:数据中心',
            entityType: 'chain_node',
            name: '数据中心',
            canonicalName: '数据中心',
        },
        {
            key: 'chain_optical_module',
            canonicalRef: 'chain_node:光模块',
            entityType: 'chain_node',
            name: '光模块',
            canonicalName: '光模块',
        },
        {
            key: 'company_inspur',
            canonicalRef: 'company:浪潮信息',
            entityType: 'company',
            name: '浪潮信息',
            canonicalName: '浪潮信息',
            description: 'AI 服务器龙头企业',
        },
        {
            key: 'company_zhongji',
            canonicalRef: 'company:中际旭创',
            entityType: 'company',
            name: '中际旭创',
            canonicalName: '中际旭创',
            description: '全球领先的光模块供应商',
        },
    ],
    aliases: [
        {entityKey: 'industry_compute', alias: 'AI算力', aliasType: 'synonym'},
        {entityKey: 'industry_compute', alias: '算力基础设施', aliasType: 'synonym'},
        {entityKey: 'chain_datacenter', alias: 'IDC', aliasType: 'english_name'},
        {entityKey: 'chain_gpu', alias: '图形处理器', aliasType: 'synonym'},
    ],
    relations: [
        // 主题 -> 行业
        {fromKey: 'theme_ai', toKey: 'industry_compute', relationType: 'relates_to'},
        // 行业 -> 链条环节
        {fromKey: 'industry_compute', toKey: 'chain_gpu', relationType: 'contains'},
        {fromKey: 'industry_compute', toKey: 'chain_server', relationType: 'contains'},
        {fromKey: 'industry_compute', toKey: 'chain_datacenter', relationType: 'contains'},
        {fromKey: 'industry_compute', toKey: 'chain_optical_module', relationType: 'contains'},
        // 环节上下游
        {fromKey: 'chain_gpu', toKey: 'chain_server', relationType: 'upstream_of'},
        {fromKey: 'chain_server', toKey: 'chain_datacenter', relationType: 'upstream_of'},
        {fromKey: 'chain_optical_module', toKey: 'chain_datacenter', relationType: 'upstream_of'},
        // 公司 -> 链条环节（带权重和置信度）
        {
            fromKey: 'company_inspur',
            toKey: 'chain_server',
            relationType: 'participates_in',
            weight: '0.9500',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        {
            fromKey: 'company_zhongji',
            toKey: 'chain_optical_module',
            relationType: 'participates_in',
            weight: '1.0000',
            confidence: '0.9500',
            source: 'manual_seed',
        },
        // 公司 -> 行业
        {fromKey: 'company_inspur', toKey: 'industry_compute', relationType: 'belongs_to'},
        {fromKey: 'company_zhongji', toKey: 'industry_compute', relationType: 'belongs_to'},
    ],
    securities: [
        {companyKey: 'company_inspur', stockCode: '000977', stockName: '浪潮信息', exchange: 'SZSE'},
        {companyKey: 'company_zhongji', stockCode: '300308', stockName: '中际旭创', exchange: 'SZSE'},
    ],
} satisfies KgSeedBundle;
```

### 6.2 建模提醒

“算力”这类主题经常混入概念化表达，建议注意区分：

- `人工智能`：偏主题
- `算力`：可作为行业/主赛道节点
- `GPU / 服务器 / IDC / 光模块`：链条节点

---

## 7. 推荐的 seed 脚本流程

建议后续 `apps/faqs-web/scripts/seed-kg-pilot.ts` 走下面流程：

1. 合并所有 bundle 的 entities，按 `entity_type + canonical_name` 去重
2. 再 upsert `aliases`
3. 再 upsert `relations`
4. 最后 upsert `securities`

伪代码如下：

```typescript
const allBundles = [storageSeed, solarSeed, computeSeed];

// 第一步：合并并 upsert 所有实体（按 entity_type + canonical_name 去重）
const keyToEntityId = new Map<string, string>();
const canonicalRefToEntityId = new Map<string, string>();
for (const bundle of allBundles) {
    for (const entity of bundle.entities) {
        const result = await db
            .insert(kgEntities)
            .values({
                entityType: entity.entityType,
                name: entity.name,
                canonicalName: entity.canonicalName,
                description: entity.description,
                metadata: entity.metadata ?? {},
            })
            .onConflictDoUpdate({
                target: [kgEntities.entityType, kgEntities.canonicalName],
                set: {name: entity.name, updatedAt: new Date()},
            })
            .returning({id: kgEntities.id});
        keyToEntityId.set(entity.key, result[0].id);
        canonicalRefToEntityId.set(entity.canonicalRef, result[0].id);
    }
}

// 第二步：upsert 别名
for (const bundle of allBundles) {
    for (const alias of bundle.aliases) {
        const entityId = keyToEntityId.get(alias.entityKey);
        // upsert kg_entity_aliases
    }
}

// 第三步：upsert 关系
for (const bundle of allBundles) {
    for (const relation of bundle.relations) {
        const fromId = keyToEntityId.get(relation.fromKey);
        const toId = keyToEntityId.get(relation.toKey);
        // upsert kg_relations
    }
}

// 第四步：upsert 证券
for (const bundle of allBundles) {
    for (const security of bundle.securities) {
        const companyId = keyToEntityId.get(security.companyKey);
        // upsert securities
    }
}
```

> **关键**：由于阳光电源等实体可能出现在多个 bundle 中，`entity_type + canonical_name` 的唯一约束确保 upsert 不会重复创建。`keyToEntityId` map 用最新一次 upsert 的返回 ID 覆盖，保证后续关系写入指向正确实体。

更稳的做法是：后续关系、别名、证券写入时优先依赖 `canonicalRefToEntityId`，`keyToEntityId` 只作为 bundle 内部的人类可读辅助键。

---

## 8. 数据录入规范建议

### 8.1 命名规范

- `theme`：使用投资主线名称
- `industry`：优先使用标准行业名称
- `chain_node`：使用环节名称，不要混公司名
- `company`：使用证券简称对应公司名

### 8.2 别名规范

建议优先补这些别名：

- 市场俗称
- 英文简称
- 常见研报写法
- 新闻标题中的缩写

### 8.3 关系规范

- `contains`：行业包含链条环节
- `upstream_of`：环节之间上下游
- `participates_in`：公司参与某环节
- `belongs_to`：公司归属于行业
- `relates_to`：主题关联行业

**补充约束**：只维护 `upstream_of` 一个方向，反向“下游”关系通过查询层推导，不在 seed 中重复录入。

---

## 9. 第一阶段验收建议

试点 seed 的验收建议不要只看“是否写进数据库”，而要看：

- 别名是否能命中常见新闻表达
- 行业到链条的扩展是否符合分析直觉
- 公司召回是否能覆盖主要标的
- 推理路径是否容易解释给投研人员

---

## 10. 最终建议

第一阶段最实用的做法不是一次性录入海量数据，而是：

- 先做 `储能 / 光伏 / 算力` 三个行业的高质量 seed
- 先验证新闻到图谱扩展的效果
- 跑通后再按行业逐步扩容

这份样例可以直接作为后续 `seed script` 的输入模板，也可以给整理主数据的人作为填表参考。
