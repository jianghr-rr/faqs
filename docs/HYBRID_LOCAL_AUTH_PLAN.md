# FAQs 混合认证方案（内置用户 + Supabase）

## 背景与问题

当前 `faqs-web` 的认证强依赖 Supabase Auth：

- 登录入口 `actions/auth.ts` 的 `signInWithPassword()` 直接调用 `supabase.auth.signInWithPassword`
- 页面登录态读取 `lib/supabase/server.ts` 的 `getCurrentUser()` 直接调用 `supabase.auth.getUser()`
- 受保护路由在 `proxy.ts` 中也依赖 Supabase 会话查询

当部署环境访问 `*.supabase.co` 网络不稳定时，会出现：

- `UND_ERR_CONNECT_TIMEOUT`
- `TypeError: fetch failed`
- 登录按钮或页面状态长时间 pending

但业务数据库读写（新闻、FAQ 等）可以正常，说明问题集中在 Auth 外网链路。

---

## 目标

实现双通道认证：

1. **内置管理员账号**：走本地认证（不依赖 Supabase Auth 网络）
2. **普通账号/OAuth**：继续走 Supabase Auth
3. **统一登录态读取**：业务层只关心"当前用户是谁"，不关心来源

---

## 设计原则

- 本地认证只覆盖固定内置账号，范围可控
- 不改动现有数据库业务模型（仍以 `profiles.id` 作为用户主键）
- 保持现有 Supabase 能力（OAuth、Magic Link、Phone）可用
- 本地认证失败不影响 Supabase 流程，反之亦然
- 在网络不通时，管理员仍可登录并访问受保护页面

---

## 总体架构

```text
登录请求
  -> 判断是否命中内置账号邮箱
      -> 是: 本地验密 + 签发本地 session cookie
      -> 否: 走 Supabase Auth 登录

请求鉴权
  -> 先读本地 session
      -> 有: 直接视为已登录
      -> 无: 回退 Supabase getUser()
```

---

## 统一用户类型

当前 `TopNavbar`、`BottomTabs` 等组件直接依赖 Supabase 的 `User` 类型，读取了 `user.email`、`user.user_metadata?.name`、`user.user_metadata?.avatar_url` 等字段。本地认证用户必须与之兼容。

新增统一类型 `AppUser`（建议放在 `lib/auth/types.ts`）：

```ts
type AppUser = {
    id: string; // UUID, 与 profiles.id 一致
    email: string;
    name: string;
    avatar?: string;
    role: 'admin' | 'viewer';
    authSource: 'local' | 'supabase';
};
```

`getCurrentUser()` 的返回值改为 `AppUser | null`：

- 本地用户：从 session cookie 直接构造 `AppUser`
- Supabase 用户：从 `User` 提取字段映射为 `AppUser`

上层组件（`TopNavbar`、`BottomTabs`、`layout.tsx` 等）的 prop 类型统一改为 `AppUser | null`。

---

## 改造清单

### 1) 新增本地认证模块

新增文件：`apps/faqs-web/lib/auth/local.ts`

职责：

- 读取内置账号配置（本地 JSON 文件）
- 校验账号密码（scrypt 哈希校验）
- 签发/读取/清除本地会话 cookie
- 输出 `AppUser` 对象

建议接口：

```ts
// ─── 账号查询与校验 ─────────────────────────────
export function findLocalAuthAccount(email: string): LocalAuthAccount | null;
export async function verifyLocalAuthPassword(email: string, password: string): Promise<AppUser | null>;

// ─── Session（Server Component 上下文，使用 cookies()） ─────
export async function setLocalSession(user: AppUser): Promise<void>;
export async function getLocalSessionUser(): Promise<AppUser | null>;
export async function clearLocalSession(): Promise<void>;

// ─── Session（Middleware/proxy 上下文，使用 request.cookies） ─
export function getLocalSessionUserFromRequest(request: NextRequest): AppUser | null;
```

> **两套读取方法的原因**：`proxy.ts` 运行在 middleware 上下文，只能通过 `request.cookies` 读 cookie；`getCurrentUser()` 运行在 Server Component 上下文，使用 `cookies()` from `next/headers`。必须同时提供。

---

### 2) 修改密码登录分流

修改文件：`apps/faqs-web/actions/auth.ts`

目标逻辑：

1. `signInWithPassword(email, password, next)` 先查是否为内置账号
2. 是内置账号：走本地验密与写 cookie
3. 非内置账号：保持原 Supabase 密码登录

伪代码：

```ts
const localUser = await verifyLocalAuthPassword(email, password);
if (localUser) {
    await setLocalSession(localUser);
    redirect(next ?? '/');
}
// fallback: supabase.auth.signInWithPassword(...)
```

---

### 3) 统一当前用户读取

修改文件：`apps/faqs-web/lib/supabase/server.ts`

目标逻辑：

1. `getCurrentUser()` 先读本地 session（`getLocalSessionUser()`）
2. 本地 session 命中则直接返回 `AppUser`（无需调用 Supabase）
3. 未命中才调用 `supabase.auth.getUser()`（保留现有 timeout 兜底），成功后映射为 `AppUser`

这样可以显著减少网络不通场景下的报错频率。

---

### 4) proxy 鉴权优化

修改文件：`apps/faqs-web/proxy.ts`

目标逻辑：

1. 受保护路由先通过 `getLocalSessionUserFromRequest(request)` 检查本地 session
2. 本地已登录则直接放行（跳过 Supabase `updateSession`）
3. 本地未登录再执行 Supabase `updateSession`
4. Supabase 不可达时按匿名处理，不阻塞请求

---

### 5) 退出登录兼容

修改文件：`apps/faqs-web/actions/auth.ts` 的 `signOut()`

逻辑：

- **始终**清理本地 session cookie（`clearLocalSession()`）
- Supabase `signOut()` 使用 `try/catch` best-effort（不阻塞）
- 无论 Supabase 是否可达，最终都 `redirect('/')`

---

### 6) 双会话互斥

登录时需要清理对方的会话，避免冲突：

- 本地账号登录成功时：best-effort 清理 Supabase cookie
- Supabase 登录成功时：清理本地 session cookie

`getCurrentUser()` 本地优先的前提是不会同时存在两个有效会话。

---

### 7) 上层组件类型改造

涉及文件：

- `app/[locale]/layout.tsx`
- `app/[locale]/components/top-navbar.tsx`
- `app/[locale]/components/bottom-tabs.tsx`
- `app/[locale]/chat/page.tsx`
- `app/[locale]/profile/page.tsx`
- 其他读取 `user` prop 的组件

改动：

- 将 `User`（`@supabase/supabase-js`）替换为 `AppUser`
- `user.user_metadata?.name` → `user.name`
- `user.user_metadata?.avatar_url` → `user.avatar`
- `user.email` 不变
- `user.phone` 等 Supabase 专有字段按需保留在 `AppUser` 中或降级处理

---

### 8) 登录页文案与账号选择

修改文件：

- `apps/faqs-web/app/[locale]/login/page.tsx`
- `apps/faqs-web/app/[locale]/login/login-form.tsx`

改动：

- `selectableAccounts` 的 `id` 改为真实 UUID（与 profiles.id 一致）
- 对内置账号增加标注（例如"内置管理员账号"）
- 手动输入邮箱仍支持 Supabase 登录
- 错误提示区分：
    - 本地账号密码错误 → "账号或密码错误"
    - Supabase 网络超时 → "链接外网容易超时，请重试"

---

## 配置设计

### 环境变量

```env
LOCAL_AUTH_ENABLED=true
LOCAL_AUTH_SESSION_SECRET=replace-with-strong-random-secret
```

仅需两个环境变量。账号数据不放 env（JSON 放环境变量容易引号转义出错）。

### 账号配置文件

复用现有 `scripts/` 模式，新增本地文件（已 gitignore）：

```
apps/faqs-web/scripts/local-auth-users.json
```

示例文件（提交到仓库）：

```
apps/faqs-web/scripts/local-auth-users.example.json
```

格式：

```json
[
    {
        "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "email": "admin1@finagents.app",
        "name": "管理员 1",
        "passwordHash": "<scrypt-hash>",
        "role": "admin"
    }
]
```

说明：

- `id` 必须为 UUID，且与 `profiles.id` 一致
- `passwordHash` 使用 `node:crypto` 的 `scrypt` 生成（见下方工具脚本）
- 不要在仓库提交含真实密码的文件

---

## 密码哈希方案

使用 **`node:crypto` 内置 `scrypt`**，理由：

- 零外部依赖（不需要 `argon2` 的 native addon，避免 Docker 编译问题）
- Node.js 20+ 内置，安全性满足需求

新增工具脚本 `scripts/hash-password.mjs`，用于生成哈希：

```bash
node scripts/hash-password.mjs "my-strong-password"
# 输出: salt:derivedKey（hex 编码）
```

运维流程：

1. 用脚本生成 hash
2. 填入 `local-auth-users.json` 的 `passwordHash` 字段
3. 重启服务生效

---

## Session 设计

### Cookie

| 属性     | 值                            |
| -------- | ----------------------------- |
| 名称     | `faqs_local_session`          |
| HttpOnly | `true`                        |
| Secure   | 生产 `true`，本地开发 `false` |
| SameSite | `Lax`                         |
| Path     | `/`                           |
| Max-Age  | `604800`（7 天）              |

### Payload 结构

```json
{
    "id": "uuid",
    "email": "admin1@finagents.app",
    "name": "管理员 1",
    "role": "admin",
    "iat": 1710000000
}
```

### 签名

使用 HMAC-SHA256 签名（密钥为 `LOCAL_AUTH_SESSION_SECRET`）：

```
cookie_value = base64url(payload) + "." + base64url(hmac_sha256(payload, secret))
```

### 过期校验

服务端读取 session 时检查 `iat`：

- `Date.now() / 1000 - iat > SESSION_MAX_AGE_SECONDS` → 视为过期，返回 `null`
- 默认 `SESSION_MAX_AGE_SECONDS = 604800`（7 天，与 cookie Max-Age 一致）

---

## 数据一致性要求

本地账号的 `id` 需要在 `public.profiles` 中存在：

- 可在部署初始化脚本中执行 `upsert profiles`（扩展现有 `seed-admin-accounts.ts`）
- `role` 写入 `admin`

这样收藏、设置、聊天历史等依赖 `user_id` 的业务表都能直接复用，无需额外适配。

### 关于现有内置账号 ID

当前 `login/page.tsx` 中的 `selectableAccounts` 使用的 ID 是 `admin-1`、`admin-2` 等字符串，**不是 UUID**。需要替换为真实 UUID：

- 如果已通过 `seed-admin-accounts` 在 Supabase 创建过用户，可查询 `auth.users` 获取对应 UUID
- 如果从头开始，可用 `crypto.randomUUID()` 生成，然后同步写入 `profiles`

---

## 安全要求

- 本地 session cookie 必须 `HttpOnly`、`Secure`（生产）、`SameSite=Lax`
- session payload 必须 HMAC 签名，防篡改
- 配置项中的密码仅存 scrypt hash，不存明文
- 限制本地账号数量与来源，默认仅管理员账号启用
- 本地 session 必须有过期时间（7 天）

---

## 上线步骤

1. 新增 `lib/auth/types.ts`（`AppUser` 统一类型）
2. 新增 `lib/auth/local.ts`（本地认证模块 + session 管理）
3. 新增 `scripts/hash-password.mjs`（密码哈希工具）
4. 新增 `scripts/local-auth-users.example.json`（示例配置）
5. 修改 `actions/auth.ts`：`signInWithPassword` 分流 + `signOut` 双清理
6. 修改 `lib/supabase/server.ts`：`getCurrentUser` 本地优先，返回 `AppUser`
7. 修改 `proxy.ts`：受保护路由本地优先鉴权
8. 修改上层组件：`TopNavbar`、`BottomTabs`、`layout.tsx` 等接受 `AppUser`
9. 修改 `login/page.tsx`：`selectableAccounts` 使用真实 UUID
10. 配置 `.env.local`：`LOCAL_AUTH_ENABLED`、`LOCAL_AUTH_SESSION_SECRET`
11. 创建 `scripts/local-auth-users.json`（包含真实账号和 hash）
12. 执行 profiles upsert（确保 UUID 用户存在）
13. 回归测试

---

## 回归测试清单

- [ ] 内置账号密码正确可登录（断网 Supabase Auth 场景也可）
- [ ] 内置账号密码错误提示正确
- [ ] 本地 session 7 天后过期，需重新登录
- [ ] 普通账号仍可通过 Supabase 密码登录
- [ ] OAuth（GitHub/Google）登录流程不受影响
- [ ] 访问 `/analysis`、`/my-faqs`、`/settings` 等受保护页面，内置账号可通过
- [ ] 退出登录后本地会话失效，重新访问受保护页面需要登录
- [ ] 本地登录后 Supabase cookie 不残留（双会话互斥）
- [ ] `TopNavbar`、`BottomTabs` 正确显示用户名和头像

---

## 风险与边界

- 本地认证只解决"管理员可登录"问题，不替代 Supabase OAuth/Magic Link
- 若后续完全去 Supabase Auth，需要重做 OAuth、账号找回、风控能力
- 内置账号扩容前建议先补充审计日志与登录限速

---

## 建议实施顺序

先做最小闭环（1 天内可落地）：

1. `AppUser` 统一类型
2. 本地账号密码校验 + session 签发/读取
3. `signInWithPassword` 分流
4. `getCurrentUser` 本地优先
5. `signOut` 双清理

然后做增强：

6. `proxy.ts` 本地优先鉴权
7. 上层组件 `AppUser` 类型适配
8. 登录页提示优化
9. 密码哈希工具脚本
10. Auth 健康检查接口（`/api/health/auth`）
