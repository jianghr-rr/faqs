# 用户收藏功能设计文档

> **项目**：FinAgents OS  
> **创建日期**：2026-03-03  
> **状态**：设计阶段，待评审后实施

---

## 1. 需求概述

### 1.1 业务目标

为已登录用户提供「收藏」能力，使用户可以：

- 收藏感兴趣的内容（FAQ 知识条目、新闻等），便于后续快速访问
- 在个人中心集中查看、管理收藏列表
- 在内容详情页或列表页快速执行收藏/取消收藏操作

### 1.2 用户场景

| 场景          | 用户行为           | 预期结果                               |
| ------------- | ------------------ | -------------------------------------- |
| 浏览 FAQ 详情 | 点击「收藏」按钮   | 该 FAQ 加入收藏，按钮变为已收藏态      |
| 浏览新闻卡片  | 点击收藏图标       | 该新闻加入收藏（若支持新闻收藏）       |
| 进入个人中心  | 点击「我的收藏」   | 跳转到收藏列表页，展示所有收藏内容     |
| 管理收藏      | 在收藏列表取消收藏 | 从列表中移除，可再次从详情页收藏       |
| 未登录用户    | 访问 FAQ 详情      | 不显示收藏按钮，或显示时点击后引导登录 |

### 1.3 与现有设计的关系

- 参考 [PAGE_AUTH_DESIGN.md](./PAGE_AUTH_DESIGN.md) 中的混合页面设计：FAQ 详情页「登录后增强」包含收藏
- 个人中心「我的收藏」菜单项已存在，当前指向 `/my-faqs`，需改为独立收藏页 `/favorites`
- 收藏为**仅登录用户**可用功能，未登录时隐藏或引导登录

---

## 2. 功能范围与分期

### 2.1 可收藏内容类型

| 类型 | 数据表 | ID 类型   | 一期支持 | 说明                            |
| ---- | ------ | --------- | -------- | ------------------------------- |
| FAQ  | `faqs` | `integer` | ✅       | 知识库条目，详情页 `/faqs/[id]` |
| 新闻 | `news` | `uuid`    | 可选     | 首页新闻流中的新闻卡片          |

**建议分期：**

- **一期（MVP）**：仅支持 FAQ 收藏，覆盖核心场景
- **二期**：扩展支持新闻收藏，复用同一套收藏表与 API 设计

### 2.2 功能清单

| 功能点                | 一期 | 二期 | 说明                     |
| --------------------- | ---- | ---- | ------------------------ |
| 收藏数量上限 100 条   | ✅   | ✅   | 添加时校验，超限返回 429 |
| FAQ 详情页收藏按钮    | ✅   | ✅   | 点击切换收藏状态         |
| FAQ 列表页收藏入口    | 可选 | ✅   | 列表卡片上的收藏图标     |
| 新闻卡片收藏入口      | -    | ✅   | 新闻卡片上的收藏图标     |
| 我的收藏列表页        | ✅   | ✅   | 独立路由 `/favorites`    |
| 收藏列表分页/无限滚动 | ✅   | ✅   | 支持大量收藏             |
| 收藏列表取消收藏      | ✅   | ✅   | 行内操作                 |
| 收藏列表按类型筛选    | -    | ✅   | FAQ / 新闻 Tab           |
| 未登录引导            | ✅   | ✅   | 点击收藏时弹登录或跳转   |

---

## 3. 数据模型设计

### 3.1 收藏表 `user_favorites`

采用**多态关联**设计，便于后续扩展新闻等类型，一期仅使用 `faq` 类型。

```sql
-- 收藏类型枚举
CREATE TYPE favorite_item_type AS ENUM ('faq', 'news');

-- 收藏表
CREATE TABLE user_favorites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_type favorite_item_type NOT NULL,
    item_id text NOT NULL,  -- faq: 数字字符串, news: uuid 字符串
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, item_type, item_id)
);

-- 索引
CREATE INDEX user_favorites_user_id_idx ON user_favorites(user_id);
CREATE INDEX user_favorites_user_item_idx ON user_favorites(user_id, item_type, item_id);
CREATE INDEX user_favorites_created_at_idx ON user_favorites(created_at DESC);
```

**设计说明：**

- `item_id` 使用 `text`：FAQ 为 `integer` 转字符串，新闻为 `uuid` 字符串，统一存储
- `(user_id, item_type, item_id)` 唯一约束：同一用户对同一内容只能收藏一次
- `ON DELETE CASCADE`：用户注销时自动清理收藏
- **数量上限**：单用户最多 100 条收藏，添加时校验
- **排序**：收藏列表按 `created_at` 倒序（最新在前）
- 索引支持：按用户查收藏列表、按用户+内容查是否已收藏、按时间排序

### 3.2 Drizzle Schema 定义（参考）

```typescript
// db/schema.ts 新增

export const favoriteItemTypeEnum = pgEnum('favorite_item_type', ['faq', 'news']);

export const userFavorites = pgTable(
    'user_favorites',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').notNull(),
        itemType: favoriteItemTypeEnum('item_type').notNull(),
        itemId: text('item_id').notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (t) => [
        unique().on(t.userId, t.itemType, t.itemId),
        index('user_favorites_user_id_idx').on(t.userId),
        index('user_favorites_user_item_idx').on(t.userId, t.itemType, t.itemId),
        index('user_favorites_created_at_idx').on(t.createdAt),
    ],
);

export const userFavoritesRelations = relations(userFavorites, ({one}) => ({
    // 可选：与 profiles 关联，便于 join
}));
```

**注意**：`user_id` 引用 `auth.users`，Supabase 管理该表，Drizzle 中可不建 FK，仅做逻辑关联。

---

## 4. API 设计

### 4.1 接口一览

| 方法   | 路径                   | 说明                 | 鉴权     |
| ------ | ---------------------- | -------------------- | -------- |
| POST   | `/api/favorites`       | 添加收藏             | 必须登录 |
| DELETE | `/api/favorites`       | 取消收藏             | 必须登录 |
| GET    | `/api/favorites`       | 获取收藏列表（分页） | 必须登录 |
| GET    | `/api/favorites/check` | 批量检查是否已收藏   | 必须登录 |

### 4.2 添加收藏

**请求：**

```
POST /api/favorites
Content-Type: application/json

{
  "itemType": "faq",
  "itemId": "123"
}
```

**响应：**

```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "userId": "uuid",
        "itemType": "faq",
        "itemId": "123",
        "createdAt": "2026-03-03T10:00:00.000Z"
    }
}
```

**错误：**

- `401`：未登录
- `400`：`itemType` 或 `itemId` 无效
- `409`：已收藏（幂等处理，可返回已有记录）
- `429`：收藏数量已达上限（100 条），需先取消部分收藏

### 4.3 取消收藏

**请求：**

```
DELETE /api/favorites?itemType=faq&itemId=123
```

**响应：**

```json
{
    "success": true,
    "data": {"deleted": true}
}
```

**错误：**

- `401`：未登录
- `404`：收藏不存在（幂等，可返回成功）

### 4.4 获取收藏列表

**请求：**

```
GET /api/favorites?page=1&pageSize=20&itemType=faq
```

| 参数     | 类型            | 必填 | 说明                       |
| -------- | --------------- | ---- | -------------------------- |
| page     | number          | 否   | 页码，默认 1               |
| pageSize | number          | 否   | 每页条数，默认 20，最大 50 |
| itemType | 'faq' \| 'news' | 否   | 筛选类型，不传则返回全部   |

**排序**：按 `created_at` 倒序（最新收藏在前）

**响应：**

```json
{
    "success": true,
    "data": {
        "items": [
            {
                "id": "uuid",
                "itemType": "faq",
                "itemId": "123",
                "createdAt": "2026-03-03T10:00:00.000Z",
                "item": {
                    "id": 123,
                    "question": "如何配置 React 项目？",
                    "answer": "...",
                    "category": {"name": "开发", "slug": "dev"},
                    "author": {"name": "张三"},
                    "updatedAt": "2026-03-03T09:00:00.000Z"
                }
            }
        ],
        "total": 42,
        "page": 1,
        "pageSize": 20,
        "totalPages": 3
    }
}
```

`item` 为关联查询的 FAQ 或新闻详情，用于列表展示。若原内容已删除，可返回 `item: null` 并标记 `deleted: true`。

### 4.5 批量检查是否已收藏

**请求：**

```
GET /api/favorites/check?itemType=faq&itemIds=1,2,3
```

**响应：**

```json
{
    "success": true,
    "data": {
        "faq": {"1": true, "2": false, "3": true}
    }
}
```

用于详情页、列表页预加载收藏状态，减少请求次数。

### 4.6 Server Actions 备选方案

若希望减少 Route Handler，可全部使用 Server Actions：

```typescript
// actions/favorites.ts
'use server';

export async function addFavorite(itemType: 'faq' | 'news', itemId: string): Promise<Result>;
export async function removeFavorite(itemType: 'faq' | 'news', itemId: string): Promise<Result>;
export async function getFavorites(options: {
    page?: number;
    pageSize?: number;
    itemType?: string;
}): Promise<PaginatedFavorites>;
export async function checkFavorites(itemType: 'faq' | 'news', itemIds: string[]): Promise<Record<string, boolean>>;
```

**建议**：API 与 Server Actions 二选一，保持一致性。Next.js App Router 下 Server Actions 更简洁，推荐优先使用。

---

## 5. 路由与页面设计

### 5.1 路由变更

| 当前                             | 变更后            | 说明                   |
| -------------------------------- | ----------------- | ---------------------- |
| 个人中心「我的收藏」→ `/my-faqs` | → `/favorites`    | 独立收藏列表页         |
| -                                | 新增 `/favorites` | 收藏列表页，受保护路由 |
| `/faqs/[id]`                     | 无变更            | 详情页增加收藏按钮交互 |

### 5.2 受保护路由扩展

在 `proxy.ts` 的 `protectedRoutes` 中新增：

```typescript
const protectedRoutes = ['/analysis', '/my-faqs', '/settings', '/favorites'];
```

### 5.3 收藏列表页 `/favorites`

**布局（参考「我的 FAQ」）：**

```
┌────────────────────────────────────┐
│  我的收藏                    [筛选] │  ← 标题 + 类型筛选（二期）
├────────────────────────────────────┤
│  ┌────────────────────────────────┐│
│  │ 如何配置 React 项目             ││  ← FAQ 卡片
│  │ 开发 · React · Next.js         ││
│  │ 收藏于 2h ago          [取消]  ││
│  └────────────────────────────────┘│
│  ┌────────────────────────────────┐│
│  │ 数据库连接问题                  ││
│  │ 运维 · PostgreSQL              ││
│  │ 收藏于 1d ago          [取消]  ││
│  └────────────────────────────────┘│
│  ...                               │
│  ─── 上拉加载更多 ───              │
└────────────────────────────────────┘
```

**空状态：**

```
┌────────────────────────────────────┐
│            ★                       │
│      还没有收藏任何内容              │
│  去浏览 FAQ 或新闻，收藏感兴趣的内容  │
│  [      去首页看看      ]           │
└────────────────────────────────────┘
```

### 5.4 FAQ 详情页收藏按钮

**当前状态**：已有静态「收藏」按钮，仅登录时显示。

**交互设计：**

| 状态   | 图标            | 文案   | 点击行为                       |
| ------ | --------------- | ------ | ------------------------------ |
| 未收藏 | `Star` 空心     | 收藏   | 调用添加收藏，成功后变为已收藏 |
| 已收藏 | `Star` 实心填充 | 已收藏 | 调用取消收藏，成功后变为未收藏 |
| 加载中 | `Loader2` 旋转  | -      | 禁用点击                       |
| 失败   | `Star` + Toast  | -      | 提示重试                       |

**视觉：** 已收藏时图标与文字使用 `text-warning`（金色），与「收藏」语义一致。

---

## 6. 组件设计

### 6.1 收藏按钮组件 `FavoriteButton`

**职责**：展示收藏状态，处理点击切换。

**Props：**

```typescript
interface FavoriteButtonProps {
    itemType: 'faq' | 'news';
    itemId: string;
    initialFavorited?: boolean;
    variant?: 'icon' | 'button'; // 仅图标 / 图标+文字
    className?: string;
}
```

**实现要点：**

- 使用 `useOptimistic` 或 `useState` 做乐观更新，点击后立即切换 UI，请求失败时回滚
- 未登录时渲染为 `null` 或禁用态，点击可触发登录引导（如 `router.push('/login?next=...')`）
- 可接收 `initialFavorited` 由服务端传入，避免首屏闪烁

### 6.2 收藏列表项组件 `FavoriteListItem`

**职责**：单条收藏的展示与取消操作。

**Props：**

```typescript
interface FavoriteListItemProps {
    id: string;
    itemType: 'faq' | 'news';
    itemId: string;
    item: FaqSummary | NewsSummary | null; // 关联内容，可能已删除
    createdAt: string;
    onRemove?: () => void;
}
```

**展示逻辑：**

- `item` 存在：展示标题、分类、链接等，点击跳转详情
- `item` 为 `null`（已删除）：展示「内容已删除」，保留取消收藏入口

---

## 7. 安全与权限

### 7.1 鉴权

- 所有收藏相关 API / Server Actions 必须在服务端校验 `supabase.auth.getUser()`
- 未登录返回 `401` 或抛出 `Unauthorized` 错误

### 7.2 数据隔离

- 仅能操作当前用户的收藏：`WHERE user_id = :current_user_id`
- 添加收藏时校验 `itemId` 对应内容存在且可访问（如 FAQ 为 `published`）

### 7.3 RLS（可选）

若使用 Supabase 直接从前端访问 `user_favorites`，需配置 RLS：

```sql
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites"
ON user_favorites
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

当前设计以服务端 API / Server Actions 为主，可不启用 RLS，由应用层保证隔离。

---

## 8. 实施计划

### 8.1 一期（MVP）任务拆解

| 序号 | 任务                                                     | 预估 | 依赖 |
| ---- | -------------------------------------------------------- | ---- | ---- |
| 1    | 新增 `favorite_item_type` 枚举与 `user_favorites` 表迁移 | 0.5d | -    |
| 2    | Drizzle schema 更新                                      | 0.5d | 1    |
| 3    | Server Actions：add / remove / get / check               | 1d   | 2    |
| 4    | 收藏列表页 `/favorites`（含空状态、分页）                | 1d   | 3    |
| 5    | `FavoriteButton` 组件 + FAQ 详情页集成                   | 0.5d | 3    |
| 6    | 个人中心「我的收藏」链接改为 `/favorites`                | 0.5d | 4    |
| 7    | `proxy.ts` 增加 `/favorites` 受保护路由                  | 0.5d | -    |
| 8    | 联调与测试                                               | 1d   | 1-7  |

**合计**：约 5.5 人天

### 8.2 二期（新闻收藏）任务

- 新闻卡片增加 `FavoriteButton`
- 收藏列表支持 `itemType=news` 筛选与展示
- 新闻详情页（若有）增加收藏按钮

---

## 9. 附录

### 9.1 相关文档

- [PAGE_AUTH_DESIGN.md](./PAGE_AUTH_DESIGN.md) - 页面权限与登录状态
- [ENV_AND_DATABASE.md](./ENV_AND_DATABASE.md) - 数据库与环境配置

### 9.2 数据库迁移示例

```sql
-- migrations/xxxx_add_user_favorites.sql

CREATE TYPE favorite_item_type AS ENUM ('faq', 'news');

CREATE TABLE user_favorites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    item_type favorite_item_type NOT NULL,
    item_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, item_type, item_id)
);

CREATE INDEX user_favorites_user_id_idx ON user_favorites(user_id);
CREATE INDEX user_favorites_user_item_idx ON user_favorites(user_id, item_type, item_id);
CREATE INDEX user_favorites_created_at_idx ON user_favorites(created_at DESC);

COMMENT ON TABLE user_favorites IS '用户收藏表，支持多类型内容（FAQ、新闻等）';
```

### 9.3 已确认事项

- [x] 收藏列表排序：按收藏时间倒序（最新在前）
- [x] 单用户收藏数量上限：100 条
- [ ] 新闻收藏是否纳入一期（当前建议二期）
