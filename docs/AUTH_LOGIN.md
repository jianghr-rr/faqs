# 登录系统接入文档

认证层完全交给 **Supabase Auth**，支持 **Magic Link（邮箱验证码）**、**GitHub 登录** 和 **Google 登录**。

---

## 一、架构设计

### 1.1 为什么用 Supabase Auth

| 优势          | 说明                                                           |
| ------------- | -------------------------------------------------------------- |
| 零后端代码    | Magic Link 发送、OAuth 回调、token 管理全部由 Supabase 处理    |
| 内置 Provider | GitHub、Google 开箱即用，Dashboard 配置即可                    |
| 安全          | PKCE 流程、JWT 自动刷新、HttpOnly Cookie（通过 @supabase/ssr） |
| 与数据库打通  | auth.users 表和业务表在同一个 PostgreSQL 实例中                |

### 1.2 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                      faqs-web (Next.js)                   │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ 登录页面  │  │ Server       │  │ proxy.ts            │  │
│  │ (Client)  │  │ Components   │  │ session refresh     │  │
│  │           │  │ / Actions    │  │ + i18n + 路由保护    │  │
│  └─────┬────┘  └──────┬───────┘  └─────────┬──────────┘  │
│        │              │                    │              │
│   createBrowser   createServer        updateSession       │
│   Client()        Client()            (刷新 token)        │
│        │              │                    │              │
└────────┼──────────────┼────────────────────┼──────────────┘
         │              │                    │
         ▼              ▼                    ▼
┌──────────────────────────────────────────────────────────┐
│                    Supabase                               │
│                                                          │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Supabase Auth │  │ auth.users │  │ public.profiles  │  │
│  │ Magic Link    │  │ (内置)     │  │ (业务扩展)       │  │
│  │ GitHub OAuth  │  │            │  │ name, avatar,    │  │
│  │ Google OAuth  │  │            │  │ role             │  │
│  └──────────────┘  └────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 1.3 认证流程

**Magic Link（邮箱）：**

```
1. 用户输入邮箱 → 点击「发送验证链接」
2. Supabase 发送邮件（含 Magic Link）
3. 用户点击邮件中的链接 → 跳转到 /auth/callback
4. callback 路由用 code 换取 session → 设置 cookie
5. 重定向到首页
```

**OAuth（GitHub / Google）：**

```
1. 用户点击「GitHub 登录」按钮
2. 跳转到 GitHub/Google 授权页面
3. 授权后回调到 /auth/callback
4. callback 路由用 code 换取 session → 设置 cookie
5. 重定向到首页
```

---

## 二、外部准备

### 2.1 Supabase Dashboard 配置

#### Magic Link（默认已启用）

1. 进入 Supabase Dashboard → **Authentication → Providers**
2. 确认 **Email** Provider 已启用
3. **Enable Magic Link / OTP** 开关打开

#### GitHub OAuth

1. 先去 [GitHub Developer Settings](https://github.com/settings/developers) → **New OAuth App**
2. 填写：
    - Application name：`FAQs`
    - Homepage URL：`http://localhost:3000`
    - Authorization callback URL：`https://<your-project-ref>.supabase.co/auth/v1/callback`
3. 创建后拿到 **Client ID** 和 **Client Secret**
4. 回到 Supabase Dashboard → **Authentication → Providers → GitHub**
5. 开启并填入 Client ID 和 Client Secret

#### Google OAuth

1. 先去 [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. 创建 **OAuth client ID**（Web application）
3. Authorized redirect URIs：`https://<your-project-ref>.supabase.co/auth/v1/callback`
4. 拿到 **Client ID** 和 **Client Secret**
5. 回到 Supabase Dashboard → **Authentication → Providers → Google**
6. 开启并填入 Client ID 和 Client Secret

> **注意**：OAuth 的回调 URL 是 Supabase 的地址（不是你的应用地址），Supabase 处理完后会重定向回你的应用。

### 2.2 获取 Supabase 项目凭据

在 Supabase Dashboard → **Settings → API** 中获取：

- **Project URL**：`https://cnlvdjhjkpeujvcbibmq.supabase.co`
- **Publishable Key**（或 anon key）：`sb_publishable_xxx` 或 `eyJxxx`

### 2.3 环境变量

在 `.env.local` 中新增：

```env
# ─── Supabase ────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://cnlvdjhjkpeujvcbibmq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

GitHub / Google 的 Client ID / Secret **不需要**放在应用的环境变量中 — 它们配置在 Supabase Dashboard，由 Supabase 服务端处理。

---

## 三、数据库 Schema 调整

### 3.1 设计思路

Supabase Auth 自动管理 `auth.users` 表（UUID 主键、email、provider 信息等）。我们的业务表需要：

- 将 `users` 表改为 `profiles` 表，用 Supabase 的 UUID 作为主键
- 移除 email / passwordHash（由 Supabase Auth 管理）
- 其他业务表的外键（如 `faqs.authorId`）从 `integer` 改为 `uuid`

### 3.2 Schema 变更

```typescript
// 变更前
export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', {length: 255}).notNull().unique(),
    passwordHash: varchar('password_hash', {length: 255}).notNull(),
    name: varchar('name', {length: 100}).notNull(),
    avatar: varchar('avatar', {length: 500}),
    role: userRoleEnum('role').notNull().default('viewer'),
    ...
});

// 变更后
export const profiles = pgTable('profiles', {
    id: uuid('id').primaryKey(),   // = auth.users.id
    name: varchar('name', {length: 100}).notNull(),
    avatar: varchar('avatar', {length: 500}),
    role: userRoleEnum('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow().$onUpdate(() => new Date()),
});
```

`faqs` 表的 `authorId` 从 `integer` 改为 `uuid`：

```typescript
authorId: uuid('author_id').notNull(),  // references profiles.id
```

### 3.3 自动创建 Profile

在 Supabase SQL Editor 中创建触发器，新用户注册时自动在 `profiles` 表创建记录：

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

## 四、依赖变更

### 新增

| 包                      | 说明                    |
| ----------------------- | ----------------------- |
| `@supabase/supabase-js` | Supabase 客户端 SDK     |
| `@supabase/ssr`         | Next.js SSR cookie 管理 |

### 移除

| 包                               | 原因                                   |
| -------------------------------- | -------------------------------------- |
| `next-auth`                      | 未使用，Supabase Auth 替代             |
| `bcrypt` + `@types/bcrypt`       | 密码哈希不再需要（Supabase Auth 管理） |
| `crypto-js` + `@types/crypto-js` | 未使用                                 |
| `jose`                           | 被 Supabase Auth 的 JWT 管理替代       |

---

## 五、文件清单

### 5.1 新建文件

| #   | 文件路径                      | 说明                                                       |
| --- | ----------------------------- | ---------------------------------------------------------- |
| F1  | `lib/supabase/client.ts`      | 浏览器端 Supabase 客户端（Client Components 使用）         |
| F2  | `lib/supabase/server.ts`      | 服务端 Supabase 客户端（Server Components / Actions 使用） |
| F3  | `lib/supabase/proxy.ts`       | proxy 层的 session 刷新逻辑                                |
| F4  | `app/[locale]/login/page.tsx` | 登录页面（Magic Link 表单 + OAuth 按钮）                   |
| F5  | `app/auth/callback/route.ts`  | Auth 回调路由（处理 Magic Link / OAuth 的 code 交换）      |
| F6  | `actions/auth.ts`             | Server Actions（发送 Magic Link、OAuth 登录、登出）        |

### 5.2 修改文件

| #   | 文件路径       | 改动                                                                       |
| --- | -------------- | -------------------------------------------------------------------------- |
| M1  | `db/schema.ts` | `users` → `profiles`（UUID 主键），`faqs.authorId` 改为 uuid               |
| M2  | `proxy.ts`     | 集成 Supabase session 刷新 + 现有的 i18n 路由                              |
| M3  | `lib/env.ts`   | 新增 Supabase URL / Key 校验，移除 SESSION_SECRET                          |
| M4  | `.env.local`   | 新增 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY                                   |
| M5  | `package.json` | 新增 @supabase/supabase-js、@supabase/ssr；移除 next-auth、bcrypt、jose 等 |

### 5.3 删除文件

| #   | 文件路径              | 原因                                 |
| --- | --------------------- | ------------------------------------ |
| D1  | `lib/auth/session.ts` | Supabase Auth 替代自定义 JWT session |

---

## 六、核心模块设计

### 6.1 Supabase 客户端

**`lib/supabase/client.ts`**（浏览器端）：

```typescript
import {createBrowserClient} from '@supabase/ssr';

export function createClient() {
    return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
```

**`lib/supabase/server.ts`**（服务端）：

```typescript
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';

export async function createClient() {
    const cookieStore = await cookies();
    return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (cookiesToSet) => {
                cookiesToSet.forEach(({name, value, options}) => {
                    cookieStore.set(name, value, options);
                });
            },
        },
    });
}
```

### 6.2 proxy.ts 集成

```typescript
// proxy.ts — 合并 Supabase session 刷新 + i18n 路由 + 路由保护
export async function proxy(request: NextRequest) {
    // 1. Supabase session 刷新（updateSession）
    // 2. i18n 路由处理（i18nRouter）
    // 3. 受保护路由检查（getClaims 校验登录状态）
}
```

### 6.3 登录页面

```
┌─────────────────────────────────────┐
│           登录 FAQs                  │
│                                     │
│  邮箱   [________________]          │
│                                     │
│  [    发送验证链接    ]              │
│                                     │
│  ──────── 或 ────────               │
│                                     │
│  [ ◉ 使用 GitHub 登录  ]            │
│  [ ◉ 使用 Google 登录  ]            │
└─────────────────────────────────────┘
```

### 6.4 Server Actions

```typescript
// actions/auth.ts

// 发送 Magic Link
export async function signInWithMagicLink(email: string);

// OAuth 登录（触发重定向）
export async function signInWithOAuth(provider: 'github' | 'google');

// 登出
export async function signOut();

// 获取当前用户 Profile
export async function getCurrentProfile();
```

### 6.5 Auth Callback

```typescript
// app/auth/callback/route.ts
// 处理 Supabase Auth 回调（Magic Link 和 OAuth 共用）
// 1. 从 URL 获取 code
// 2. exchangeCodeForSession(code)
// 3. 重定向到首页
```

---

## 七、安全设计

| 措施            | 说明                                                                  |
| --------------- | --------------------------------------------------------------------- |
| PKCE 流程       | @supabase/ssr 默认使用 PKCE，比 implicit flow 更安全                  |
| getClaims()     | 服务端始终用 `getClaims()` 校验 JWT（验证签名），不用 `getSession()`  |
| HttpOnly Cookie | @supabase/ssr 管理的 cookie 默认 HttpOnly                             |
| Token 自动刷新  | proxy.ts 中的 updateSession 自动刷新过期 token                        |
| RLS（可选）     | 后续可在 Supabase 启用 Row Level Security，基于 auth.uid() 做行级权限 |

---

## 八、执行步骤

### 步骤 1：Supabase Dashboard 配置

- 确认 Email / Magic Link 已启用
- 配置 GitHub OAuth Provider
- 配置 Google OAuth Provider
- 获取 Project URL 和 Anon Key

### 步骤 2：依赖变更

新增 `@supabase/supabase-js`、`@supabase/ssr`；移除 `next-auth`、`bcrypt`、`jose`、`crypto-js` 及其类型包。

### 步骤 3：环境变量

更新 `.env.local` 和 `lib/env.ts`。

### 步骤 4：Schema 调整

`users` → `profiles`（UUID 主键），`faqs.authorId` 改 uuid。

执行 `pnpm run db:push` 同步到 Supabase。

在 Supabase SQL Editor 中创建触发器（自动创建 profile）。

### 步骤 5：Supabase 客户端

创建 `lib/supabase/client.ts`、`lib/supabase/server.ts`、`lib/supabase/proxy.ts`。

### 步骤 6：重写 proxy.ts

集成 Supabase session 刷新 + i18n + 路由保护。

### 步骤 7：Server Actions

创建 `actions/auth.ts`。

### 步骤 8：登录页面 + 回调路由

创建登录页面 UI 和 `/auth/callback` 路由。

### 步骤 9：清理

删除 `lib/auth/session.ts`，移除不再使用的代码。

### 步骤 10：验证

```bash
pnpm turbo run typecheck
pnpm turbo run lint
pnpm turbo run build --filter=faqs-web
```

---

## 九、后续扩展

| 扩展             | 说明                                                       |
| ---------------- | ---------------------------------------------------------- |
| **RLS 行级安全** | 在 Supabase 启用 RLS，确保用户只能操作自己的数据           |
| **微信登录**     | 获得企业资质后，通过 Supabase 自定义 Provider 或自行实现   |
| **账号绑定**     | 已登录用户关联更多登录方式（Supabase 支持 `linkIdentity`） |
| **头像上传**     | 配合 Supabase Storage                                      |
| **邮箱密码登录** | Supabase Auth 也支持传统邮箱密码，可随时启用               |
| **手机号登录**   | Supabase 支持 Phone Auth（需配置 SMS Provider）            |
