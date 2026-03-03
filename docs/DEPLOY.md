# faqs-web 部署记录

> 项目：pnpm monorepo + Next.js 16 (apps/faqs-web)  
> 服务器：腾讯云 81.70.148.10（OpenCloudOS，与 sun 同机）  
> 镜像仓库：腾讯云 TCR (`ccr.ccs.tencentyun.com/jianghr/faqs-web`)  
> 反向代理：宝塔面板 + Nginx  
> 域名：`faqs.curlyhair.cn`  
> 时间：2026-03

---

## 一、部署架构

```
git push → GitHub Actions (ubuntu-latest, 境外)
              ├─ docker build（注入 NEXT_PUBLIC_* 构建时变量）
              ├─ docker push → 腾讯云 TCR
              └─ SSH 到服务器
                    ├─ docker login TCR
                    ├─ docker pull（内网拉取，秒级）
                    ├─ docker stop/rm 旧容器
                    └─ docker run 新容器（注入运行时变量，端口 3001）

                   ┌──────────────────┐
                   │   DNS 解析        │
                   │  *.curlyhair.cn   │
                   │  → 81.70.148.10   │
                   └────────┬─────────┘
                            │
                   ┌────────▼─────────┐
                   │ 宝塔 Nginx        │
                   │ (端口 80/443 SSL) │
                   └────┬────────┬────┘
                        │        │
        www.curlyhair.cn│        │faqs.curlyhair.cn
                        │        │
              ┌─────────▼──┐  ┌──▼──────────┐
              │ sun 容器    │  │ faqs-web 容器│
              │ 端口 3000   │  │ 端口 3001    │
              └────────────┘  └──────────────┘
                                     │
                              ┌──────▼──────┐
                              │  Supabase   │
                              │ (PostgreSQL │
                              │  + Auth)    │
                              └─────────────┘
```

---

## 二、新增/修改的文件清单

| 文件                                       | 操作 | 说明                                          |
| ------------------------------------------ | ---- | --------------------------------------------- |
| `Dockerfile`                               | 新增 | 多阶段构建，standalone 输出                   |
| `.github/workflows/deploy.yml`             | 新增 | CI/CD 流水线，推送到 TCR                      |
| `apps/faqs-web/public/.gitkeep`            | 新增 | 让 Git 跟踪空 public 目录                     |
| `apps/faqs-web/actions/auth.ts`            | 修改 | 使用 `APP_ORIGIN` 环境变量获取应用 origin     |
| `apps/faqs-web/app/auth/callback/route.ts` | 修改 | 同上，修复 OAuth 回调跳转地址                 |
| `apps/faqs-web/app/[locale]/page.tsx`      | 修改 | 移除 Server Component 中的 onClick 事件处理器 |
| `docs/DEPLOY.md`                           | 新增 | 本文档                                        |

---

## 三、Dockerfile

```dockerfile
# ---- builder stage ----
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/faqs-web/package.json ./apps/faqs-web/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter faqs-web run build

# ---- runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/apps/faqs-web/.next/standalone ./
COPY --from=builder /app/apps/faqs-web/.next/static ./apps/faqs-web/.next/static
RUN mkdir -p ./apps/faqs-web/public
COPY --from=builder /app/apps/faqs-web/public/. ./apps/faqs-web/public/

EXPOSE 3000

CMD ["node", "apps/faqs-web/server.js"]
```

与 sun 的关键差异：pnpm 版本 10.30.3（sun 用 9.6.0），无 postinstall 脚本，需要复制 `packages/eslint-config/package.json`。

---

## 四、GitHub Actions Workflow

```yaml
name: Deploy FAQs Web

on:
    push:
        branches:
            - main

jobs:
    build-and-push:
        name: Build & Push Docker Image
        runs-on: ubuntu-latest
        steps:
            - name: Checkout code
              uses: actions/checkout@v4

            - name: Set up Docker Buildx
              uses: docker/setup-buildx-action@v3

            - name: Log in to Tencent Cloud TCR
              uses: docker/login-action@v3
              with:
                  registry: ccr.ccs.tencentyun.com
                  username: ${{ secrets.TCR_USERNAME }}
                  password: ${{ secrets.TCR_PASSWORD }}

            - name: Extract image metadata
              id: meta
              uses: docker/metadata-action@v5
              with:
                  images: ccr.ccs.tencentyun.com/jianghr/faqs-web
                  tags: |
                      type=sha,prefix=sha-,format=short
                      type=raw,value=latest,enable={{is_default_branch}}

            - name: Build and push
              uses: docker/build-push-action@v6
              with:
                  context: .
                  push: true
                  tags: ${{ steps.meta.outputs.tags }}
                  labels: ${{ steps.meta.outputs.labels }}
                  build-args: |
                      NEXT_PUBLIC_SUPABASE_URL=${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
                      NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
                      NEXT_PUBLIC_APP_URL=${{ secrets.NEXT_PUBLIC_APP_URL }}
                  cache-from: type=gha
                  cache-to: type=gha,mode=max

    deploy:
        name: Deploy to Server
        runs-on: ubuntu-latest
        needs: build-and-push
        steps:
            - name: Compute image tag
              id: img
              run: |
                  SHA_SHORT=$(echo "${{ github.sha }}" | cut -c1-7)
                  echo "tag=sha-${SHA_SHORT}" >> $GITHUB_OUTPUT

            - name: Deploy via SSH
              uses: appleboy/ssh-action@v1
              with:
                  host: ${{ secrets.SERVER_HOST }}
                  username: root
                  key: ${{ secrets.SSH_PRIVATE_KEY }}
                  script: |
                      docker login ccr.ccs.tencentyun.com \
                        --username=${{ secrets.TCR_USERNAME }} \
                        --password='${{ secrets.TCR_PASSWORD }}'

                      docker pull ccr.ccs.tencentyun.com/jianghr/faqs-web:${{ steps.img.outputs.tag }}

                      docker stop faqs-web 2>/dev/null || true
                      docker rm   faqs-web 2>/dev/null || true

                      docker run -d \
                        --name faqs-web \
                        --restart unless-stopped \
                        -p 3001:3000 \
                        -e DATABASE_URL='${{ secrets.DATABASE_URL }}' \
                        -e DIRECT_URL='${{ secrets.DIRECT_URL }}' \
                        -e API_BASE_URL='${{ secrets.API_BASE_URL }}' \
                        -e NEXT_PUBLIC_APP_URL='${{ secrets.NEXT_PUBLIC_APP_URL }}' \
                        -e APP_ORIGIN='${{ secrets.NEXT_PUBLIC_APP_URL }}' \
                        ccr.ccs.tencentyun.com/jianghr/faqs-web:${{ steps.img.outputs.tag }}

                      docker image prune -f
```

与 sun 的关键差异：使用腾讯云 TCR 而非 Docker Hub，容器映射到宿主机 3001 端口，额外注入 `APP_ORIGIN` 运行时变量。

---

## 五、GitHub Secrets

| Secret                          | 说明                                   | 来源                                     |
| ------------------------------- | -------------------------------------- | ---------------------------------------- |
| `TCR_USERNAME`                  | 腾讯云 TCR 用户名                      | 腾讯云容器镜像服务控制台                 |
| `TCR_PASSWORD`                  | 腾讯云 TCR 密码                        | 同上                                     |
| `SSH_PRIVATE_KEY`               | 服务器 SSH 私钥                        | `~/.ssh/github_actions`                  |
| `SERVER_HOST`                   | `81.70.148.10`                         | 腾讯云控制台                             |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 项目 URL                      | Supabase Dashboard → Settings → API      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥                      | 同上                                     |
| `NEXT_PUBLIC_APP_URL`           | `https://faqs.curlyhair.cn`            | —                                        |
| `DATABASE_URL`                  | PostgreSQL 连接串（Pooler, 端口 6543） | Supabase Dashboard → Settings → Database |
| `DIRECT_URL`                    | PostgreSQL 直连串（端口 5432，可选）   | 同上                                     |
| `API_BASE_URL`                  | 后端 API 地址                          | 自定义                                   |

---

## 六、环境变量分类

### 构建时变量（Dockerfile ARG，编译进客户端 JS bundle）

| 变量                            | 说明                                 |
| ------------------------------- | ------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 项目 URL                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥                    |
| `NEXT_PUBLIC_APP_URL`           | 应用 URL `https://faqs.curlyhair.cn` |

### 运行时变量（docker run -e，服务端代码使用）

| 变量                  | 说明                                     |
| --------------------- | ---------------------------------------- |
| `DATABASE_URL`        | PostgreSQL 连接串                        |
| `DIRECT_URL`          | PostgreSQL 直连串（迁移用，可选）        |
| `API_BASE_URL`        | 后端 API 地址（next.config.ts rewrites） |
| `NEXT_PUBLIC_APP_URL` | 同构建时值，供服务端代码读取             |
| `APP_ORIGIN`          | 应用外部 origin，供 auth callback 使用   |

> `APP_ORIGIN` 是关键变量。在 Docker 容器内，`request.url` 的 origin 是 `http://0.0.0.0:3000`，必须通过此变量覆盖为真实域名。

---

## 七、服务器配置（宝塔面板）

### 反向代理

在宝塔面板 → 网站 → 反向代理 中添加：

| 域名                | 代理地址                | 备注 |
| ------------------- | ----------------------- | ---- |
| `curlyhair.cn`      | `http://127.0.0.1:3000` | sun  |
| `faqs.curlyhair.cn` | `http://127.0.0.1:3001` | faqs |

### SSL 证书

通过宝塔面板 → SSL 为两个站点分别申请/配置证书。

### DNS

在 DNS 管理面板添加 A 记录：`faqs` → `81.70.148.10`。

---

## 八、Auth 相关配置

### Supabase Dashboard

- **Authentication → URL Configuration → Site URL**：`https://faqs.curlyhair.cn`
- **Redirect URLs**：
    - `https://faqs.curlyhair.cn/**`（生产环境）
    - `http://localhost:3000/**`（本地开发，不加则 OAuth 回调会跳转到生产域名）

### GitHub OAuth App

- **Homepage URL**：`https://faqs.curlyhair.cn`
- **Authorization callback URL**：`https://cnlvdjhjkpeujvcbibmq.supabase.co/auth/v1/callback`（指向 Supabase）

### Google OAuth

- **已获授权的 JavaScript 来源**：添加 `https://faqs.curlyhair.cn`
- **已获授权的重定向 URI**：`https://cnlvdjhjkpeujvcbibmq.supabase.co/auth/v1/callback`

---

## 九、代码改动详解

### 1. `actions/auth.ts` — Server Action origin 获取

**问题**：原代码用 `headersList.get('origin')` 获取 origin，反向代理后该 header 可能为空，fallback 到 `localhost:3000`。

**修复**：新增 `getOrigin` 函数，优先读 `APP_ORIGIN` 环境变量：

```typescript
function getOrigin(headersList: Awaited<ReturnType<typeof headers>>): string {
    const appUrl = process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) return appUrl;
    const origin = headersList.get('origin');
    if (origin) return origin;
    const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost:3000';
    const proto = headersList.get('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
}
```

### 2. `app/auth/callback/route.ts` — OAuth 回调跳转

**问题**：`new URL(request.url).origin` 在 Docker 容器内返回 `http://0.0.0.0:3000`。

**修复**：用 `APP_ORIGIN` 环境变量替代：

```typescript
const origin =
    process.env.APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL ??
    `${url.protocol}//${request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host}`;
```

### 3. `app/[locale]/page.tsx` — Server Component onClick

**问题**：`async function HomePage()` 是 Server Component，内部使用了 `<button onClick={...}>`，开发模式只警告，生产模式直接报错白屏。

**修复**：将 `<button onClick={...}>` 改为 `<span>`，移除所有事件处理器。

---

## 十、踩坑记录

### 坑 1：Docker Hub 在大陆服务器无法拉取

**现象**：`docker pull` 超时，配置各种国内镜像源仍不行。

**原因**：腾讯云大陆服务器直连 `registry-1.docker.io` 被墙。

**修复**：改用腾讯云 TCR（`ccr.ccs.tencentyun.com`）。GitHub Actions 在境外构建推送，服务器从内网拉取。

### 坑 2：public 目录为空导致 COPY 失败

**现象**：`COPY --from=builder .../public ./public` 报 `not found`。

**原因**：空目录不被 Git 跟踪。

**修复**：添加 `public/.gitkeep`，Dockerfile 用 `mkdir -p` + `COPY .../public/.` 方式。

### 坑 3：Server Component onClick 生产环境白屏

**现象**：`Event handlers cannot be passed to Client Component props`。

**原因**：Next.js 生产模式严格禁止 Server Component 中的事件处理器。

**修复**：移除事件处理器，交互功能抽成 Client Component。

### 坑 4：Auth 回调跳转到 `0.0.0.0:3000`

**现象**：OAuth 登录成功后浏览器跳到 `https://0.0.0.0:3000/`。

**原因**：`auth/callback/route.ts` 用 `new URL(request.url).origin` 获取跳转地址，容器内 `request.url` 的 origin 是 `http://0.0.0.0:3000`（Dockerfile 的 `HOSTNAME` 环境变量）。

**修复**：通过 `APP_ORIGIN` 环境变量注入真实域名，代替 `request.url.origin`。

### 坑 5：NEXT*PUBLIC*\* 在服务端代码的行为不可靠

**现象**：`process.env.NEXT_PUBLIC_APP_URL` 在 Server Action 中可能被 Next.js 编译时内联为构建时值，运行时 `docker run -e` 无法覆盖。

**原因**：Next.js 对 `NEXT_PUBLIC_*` 的处理取决于编译器版本（Turbopack/Webpack）和代码位置。

**修复**：服务端运行时变量统一使用非 `NEXT_PUBLIC_` 前缀（如 `APP_ORIGIN`），确保是真正的运行时读取。

### 坑 6：YAML 缩进不一致导致 Prettier 拒绝提交

**现象**：`prettier --write` 报 `SyntaxError: All collection items must start at the same column`。

**原因**：GitHub Actions workflow YAML 文件缩进混乱（4 空格和 8 空格混用）。

**修复**：统一使用 2 空格缩进。

---

## 十一、日常维护

### 查看容器日志

```bash
docker logs faqs-web --tail 50
docker logs faqs-web -f  # 实时跟踪
```

### 手动重启容器

```bash
docker restart faqs-web
```

### 手动拉取最新镜像并重部署

```bash
docker login ccr.ccs.tencentyun.com --username=100007927573
docker pull ccr.ccs.tencentyun.com/jianghr/faqs-web:latest
docker stop faqs-web && docker rm faqs-web
docker run -d \
  --name faqs-web \
  --restart unless-stopped \
  -p 3001:3000 \
  -e DATABASE_URL='...' \
  -e DIRECT_URL='...' \
  -e API_BASE_URL='...' \
  -e NEXT_PUBLIC_APP_URL='https://faqs.curlyhair.cn' \
  -e APP_ORIGIN='https://faqs.curlyhair.cn' \
  ccr.ccs.tencentyun.com/jianghr/faqs-web:latest
```

### 磁盘清理

```bash
docker image prune -f   # 清理无用镜像
docker system prune -f   # 清理所有无用资源
df -h                    # 检查磁盘空间
```
