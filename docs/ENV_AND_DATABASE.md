# 环境变量 & 数据库设计文档

本文档覆盖 faqs-web 应用的环境变量治理和数据库 Schema 设计。

数据库：**PostgreSQL**，托管于 [Supabase](https://supabase.com/)。

---

## 一、环境变量

### 1.1 完整清单

```env
# ─── Database (Supabase PostgreSQL) ──────────────────
# 应用运行时使用 Pooler 连接（端口 6543, Transaction mode）
# 从 Supabase Dashboard → Settings → Database → Connection string 获取
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
# 迁移时使用直连（端口 5432）
DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# ─── Auth ────────────────────────────────────────────
# JWT 签名密钥，至少 32 字符，通过 `openssl rand -base64 32` 生成
SESSION_SECRET=

# ─── API ─────────────────────────────────────────────
# 后端 API 地址（rewrites 代理目标）
API_BASE_URL=http://localhost:8080

# ─── App ─────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 1.2 Supabase 连接方式说明

| 连接方式                             | 端口 | 用途                                     | 环境变量       |
| ------------------------------------ | ---- | ---------------------------------------- | -------------- |
| Connection Pooler (Transaction mode) | 6543 | 应用运行时查询，需 `prepare: false`      | `DATABASE_URL` |
| Direct Connection                    | 5432 | drizzle-kit 迁移 (generate/push/migrate) | `DIRECT_URL`   |

### 1.3 环境变量校验

`lib/env.ts` 使用 zod 在运行时校验所有必需变量，缺失或格式错误会在启动时抛出明确的错误信息。

---

## 二、数据库设计

### 2.1 实体关系

```
User ──1:N──▸ FAQ
Category ──1:N──▸ FAQ
Tag ──M:N──▸ FAQ（通过 faq_tags 关联）
Category ──1:N──▸ Category（自引用，支持层级分类）
```

### 2.2 自定义枚举

| 枚举名       | 值                         | 用于        |
| ------------ | -------------------------- | ----------- |
| `user_role`  | admin, editor, viewer      | users.role  |
| `faq_status` | draft, published, archived | faqs.status |

### 2.3 表结构

#### users — 用户表

| 列名          | 类型         | 约束                       | 说明             |
| ------------- | ------------ | -------------------------- | ---------------- |
| id            | SERIAL       | PK                         | 自增主键         |
| email         | VARCHAR(255) | UNIQUE, NOT NULL           | 登录邮箱         |
| password_hash | VARCHAR(255) | NOT NULL                   | bcrypt 哈希      |
| name          | VARCHAR(100) | NOT NULL                   | 显示名称         |
| avatar        | VARCHAR(500) | NULL                       | 头像 URL         |
| role          | user_role    | NOT NULL, DEFAULT 'viewer' | 角色枚举         |
| created_at    | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW      |                  |
| updated_at    | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW      | 应用层 $onUpdate |

#### categories — 分类表

| 列名        | 类型         | 约束                  | 说明                       |
| ----------- | ------------ | --------------------- | -------------------------- |
| id          | SERIAL       | PK                    |                            |
| name        | VARCHAR(100) | NOT NULL              | 分类名                     |
| slug        | VARCHAR(100) | UNIQUE, NOT NULL      | URL 友好标识               |
| description | VARCHAR(500) | NULL                  | 分类描述                   |
| parent_id   | INTEGER      | NULL                  | 父分类（自引用，支持层级） |
| sort_order  | INTEGER      | NOT NULL, DEFAULT 0   | 排序权重                   |
| created_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW |                            |
| updated_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW | 应用层 $onUpdate           |

#### faqs — FAQ 主表

| 列名        | 类型         | 约束                      | 说明                           |
| ----------- | ------------ | ------------------------- | ------------------------------ |
| id          | SERIAL       | PK                        |                                |
| question    | VARCHAR(500) | NOT NULL                  | 问题标题                       |
| answer      | TEXT         | NOT NULL                  | 回答内容（支持 Markdown/HTML） |
| category_id | INTEGER      | NULL                      | 所属分类                       |
| author_id   | INTEGER      | NOT NULL                  | 创建者                         |
| status      | faq_status   | NOT NULL, DEFAULT 'draft' | 发布状态枚举                   |
| is_featured | BOOLEAN      | NOT NULL, DEFAULT false   | 是否精选/置顶                  |
| view_count  | INTEGER      | NOT NULL, DEFAULT 0       | 浏览次数                       |
| sort_order  | INTEGER      | NOT NULL, DEFAULT 0       | 排序权重                       |
| created_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW     |                                |
| updated_at  | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW     | 应用层 $onUpdate               |

#### tags — 标签表

| 列名       | 类型        | 约束                  | 说明         |
| ---------- | ----------- | --------------------- | ------------ |
| id         | SERIAL      | PK                    |              |
| name       | VARCHAR(50) | UNIQUE, NOT NULL      | 标签名       |
| slug       | VARCHAR(50) | UNIQUE, NOT NULL      | URL 友好标识 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW |              |

#### faq_tags — FAQ 与标签的多对多关联

| 列名   | 类型    | 约束               | 说明         |
| ------ | ------- | ------------------ | ------------ |
| faq_id | INTEGER | NOT NULL           | FK → faqs.id |
| tag_id | INTEGER | NOT NULL           | FK → tags.id |
|        |         | PK(faq_id, tag_id) | 联合主键     |

### 2.4 索引设计

| 表         | 索引                | 类型      | 用途                       |
| ---------- | ------------------- | --------- | -------------------------- |
| users      | email               | UNIQUE    | 登录查询                   |
| categories | slug                | UNIQUE    | URL 路由                   |
| categories | parent_id           | INDEX     | 子分类查询                 |
| faqs       | category_id         | INDEX     | 按分类筛选                 |
| faqs       | author_id           | INDEX     | 按作者筛选                 |
| faqs       | status              | INDEX     | 按状态筛选                 |
| faqs       | status + sort_order | COMPOSITE | 列表排序                   |
| tags       | name                | UNIQUE    | 标签去重                   |
| tags       | slug                | UNIQUE    | URL 路由                   |
| faq_tags   | tag_id              | INDEX     | 反向查询（根据标签查 FAQ） |

### 2.5 PostgreSQL vs MySQL 的关键差异

| 特性         | MySQL                                   | PostgreSQL (Supabase)                      |
| ------------ | --------------------------------------- | ------------------------------------------ |
| 自增主键     | `INT AUTO_INCREMENT`                    | `SERIAL`（基于 SEQUENCE）                  |
| 枚举         | 列级 `ENUM(...)`                        | 原生 `CREATE TYPE ... AS ENUM`（`pgEnum`） |
| 时间戳       | `TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` | `TIMESTAMPTZ` + 应用层 `$onUpdate`         |
| 布尔类型     | `TINYINT(1)` 模拟                       | 原生 `BOOLEAN`                             |
| 连接驱动     | `mysql2`                                | `postgres` (postgres.js)                   |
| Drizzle 导入 | `drizzle-orm/mysql-core`                | `drizzle-orm/pg-core`                      |

---

## 三、技术栈

| 层级   | 技术               | 说明                        |
| ------ | ------------------ | --------------------------- |
| 数据库 | PostgreSQL 15+     | Supabase 托管               |
| ORM    | Drizzle ORM        | 类型安全 SQL 查询构建器     |
| 驱动   | postgres.js        | 轻量 PostgreSQL 客户端      |
| 迁移   | drizzle-kit        | Schema 生成 & 推送          |
| 连接池 | Supabase Supavisor | Transaction mode，端口 6543 |

---

## 四、文件清单

### 新建文件

| 文件           | 说明                                        |
| -------------- | ------------------------------------------- |
| `db/schema.ts` | 5 张表 + 2 个枚举 + relations + 索引        |
| `db/index.ts`  | postgres.js 连接 + Drizzle 实例（单例模式） |
| `lib/env.ts`   | zod 环境变量校验                            |

### 修改文件

| 文件                  | 改动                                       |
| --------------------- | ------------------------------------------ |
| `package.json`        | `mysql2` → `postgres`                      |
| `.env.local`          | `MYSQL_*` → `DATABASE_URL` + `DIRECT_URL`  |
| `drizzle.config.ts`   | `dialect: 'postgresql'`，`url: DIRECT_URL` |
| `lib/auth/session.ts` | 通过 `getEnv()` 获取 `SESSION_SECRET`      |
| `next.config.ts`      | rewrites 使用 `process.env.API_BASE_URL`   |

---

## 五、常用命令

```bash
# 根据 schema 生成 SQL 迁移文件
cd apps/faqs-web && pnpm run db:generate

# 直接将 schema 推送到数据库（开发环境推荐）
pnpm run db:push

# 执行迁移文件
pnpm run db:migrate

# 打开 Drizzle Studio 可视化查看/编辑数据
pnpm run db:studio
```

---

## 六、后续扩展点

| 扩展          | 说明                                                 |
| ------------- | ---------------------------------------------------- |
| **软删除**    | 在 faqs/categories/users 表添加 `deleted_at` 列      |
| **全文搜索**  | 利用 PostgreSQL 的 `tsvector` + `GIN` 索引           |
| **操作日志**  | 新建 `audit_logs` 表记录 FAQ 的创建/编辑/发布操作    |
| **附件/存储** | 配合 Supabase Storage 管理 FAQ 中的图片/文件         |
| **评价/反馈** | 新建 `faq_feedback` 表记录"有帮助/没帮助"的用户反馈  |
| **RLS**       | 利用 Supabase 的 Row Level Security 做细粒度权限控制 |
