# faqs-web 部署方案：与 sun 同域名部署

> 项目：pnpm monorepo + Next.js 16 (apps/faqs-web)  
> 目标服务器：腾讯云 81.70.148.10（与 sun 同机）  
> 镜像仓库：Docker Hub  
> 域名：www.curlyhair.cn

---

## 一、当前 sun 部署架构

```
git push → GitHub Actions
              ├─ docker build + push → Docker Hub
              └─ SSH 到服务器
                    ├─ docker pull
                    └─ docker run (sun 容器, 端口 3000)

www.curlyhair.cn → [SSL 终端/反向代理] → localhost:3000 (sun)
```

sun 应用以 Docker 容器运行在服务器 3000 端口，通过域名 `www.curlyhair.cn` 提供 HTTPS 访问。

---

## 二、部署方案对比

### 方案 A：子域名 — `faqs.curlyhair.cn`（推荐）

```
www.curlyhair.cn   → Nginx → localhost:3000 (sun 容器)
faqs.curlyhair.cn  → Nginx → localhost:3001 (faqs 容器)
```

| 优点                                      | 缺点                                               |
| ----------------------------------------- | -------------------------------------------------- |
| 两个应用完全独立，互不影响                | 需要新增 DNS A 记录                                |
| 不需要修改 Next.js 路由/basePath          | 需要额外 SSL 证书（或通配符证书 `*.curlyhair.cn`） |
| API 代理、i18n、Supabase 回调地址不受影响 | Nginx 需要新增 server block                        |
| 部署/回滚/调试各自独立                    |                                                    |

### 方案 B：子路径 — `www.curlyhair.cn/faqs`

```
www.curlyhair.cn/       → Nginx → localhost:3000 (sun 容器)
www.curlyhair.cn/faqs/  → Nginx → localhost:3001 (faqs 容器)
```

| 优点              | 缺点                                               |
| ----------------- | -------------------------------------------------- |
| 不需要新 DNS 记录 | 需要设置 Next.js `basePath: '/faqs'`               |
| 同一个 SSL 证书   | 所有内部路由、API 代理、i18n、静态资源路径都需适配 |
|                   | Supabase Auth 回调 URL 需要调整                    |
|                   | 维护复杂度高，两个应用耦合                         |

**结论**：考虑到 faqs-web 使用了 i18n 路由、API 代理（`/api/*` → 后端）、Supabase Auth 等功能，**方案 A（子域名）** 是更合理的选择，避免大量路由适配工作。

---

## 三、落地步骤总览

```
1. 在 faqs 仓库添加 Dockerfile
2. 在 faqs 仓库添加 GitHub Actions workflow
3. 配置 GitHub Secrets
4. 服务器安装 Nginx 并配置反向代理（sun + faqs 统一管理）
5. 配置 DNS：faqs.curlyhair.cn → 81.70.148.10
6. 配置 SSL 证书（Let's Encrypt / 腾讯云免费证书）
7. 推送代码触发自动部署
```

---

## 四、Dockerfile

在 faqs 仓库根目录创建 `Dockerfile`：

```dockerfile
# ---- builder stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* 变量必须在构建时注入，运行时设置无效
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# 先复制 package manifests 和 lockfile，充分利用 Docker 层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/faqs-web/package.json ./apps/faqs-web/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json

RUN pnpm install --frozen-lockfile

# 复制全部源码
COPY . .

RUN pnpm --filter faqs-web run build

# ---- runner stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# standalone 输出：自包含 server.js
COPY --from=builder /app/apps/faqs-web/.next/standalone ./
# 静态资源必须放在 standalone server 旁边
COPY --from=builder /app/apps/faqs-web/.next/static ./apps/faqs-web/.next/static
COPY --from=builder /app/apps/faqs-web/public       ./apps/faqs-web/public

EXPOSE 3000

CMD ["node", "apps/faqs-web/server.js"]
```

### 与 sun Dockerfile 的关键差异

| 项目           | sun                           | faqs                                                    |
| -------------- | ----------------------------- | ------------------------------------------------------- |
| pnpm 版本      | 9.6.0                         | 10.30.3（与 `packageManager` 字段一致）                 |
| 构建命令       | `pnpm --filter sun run build` | `pnpm --filter faqs-web run build`                      |
| 构建时环境变量 | TDT_KEY, AMAP_KEY, 百度统计   | SUPABASE_URL, SUPABASE_ANON_KEY, APP_URL                |
| 额外复制       | `apps/sun/scripts/`（cesium） | `packages/eslint-config/package.json`（workspace 依赖） |

---

## 五、GitHub Actions Workflow

在 faqs 仓库创建 `.github/workflows/deploy.yml`：

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

            - name: Compute image name
              id: img
              run: |
                  RAW='${{ secrets.DOCKER_USERNAME }}'
                  NAME=$(printf '%s' "${RAW%%@*}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
                  echo "value=${NAME}/faqs-web" >> $GITHUB_OUTPUT

            - name: Set up Docker Buildx
              uses: docker/setup-buildx-action@v3

            - name: Log in to Docker Hub
              uses: docker/login-action@v3
              with:
                  username: ${{ secrets.DOCKER_USERNAME }}
                  password: ${{ secrets.DOCKER_PASSWORD }}

            - name: Extract image metadata
              id: meta
              uses: docker/metadata-action@v5
              with:
                  images: ${{ steps.img.outputs.value }}
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
                  RAW='${{ secrets.DOCKER_USERNAME }}'
                  NAME=$(printf '%s' "${RAW%%@*}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
                  SHA_SHORT=$(echo "${{ github.sha }}" | cut -c1-7)
                  echo "value=${NAME}/faqs-web" >> $GITHUB_OUTPUT
                  echo "tag=sha-${SHA_SHORT}" >> $GITHUB_OUTPUT

            - name: Deploy via SSH
              uses: appleboy/ssh-action@v1
              with:
                  host: ${{ secrets.SERVER_HOST }}
                  username: root
                  key: ${{ secrets.SSH_PRIVATE_KEY }}
                  script: |
                      # 配置 Docker 镜像加速（仅首次）
                      if [ ! -f /etc/docker/daemon.json ] || ! grep -q "registry-mirrors" /etc/docker/daemon.json; then
                        mkdir -p /etc/docker
                        cat > /etc/docker/daemon.json <<'DAEMONEOF'
                      {
                        "registry-mirrors": [
                          "https://docker.m.daocloud.io",
                          "https://dockerproxy.com",
                          "https://docker.nju.edu.cn"
                        ]
                      }
                      DAEMONEOF
                        systemctl daemon-reload
                        systemctl restart docker
                        sleep 3
                      fi

                      docker pull ${{ steps.img.outputs.value }}:${{ steps.img.outputs.tag }}

                      docker stop faqs-web 2>/dev/null || true
                      docker rm   faqs-web 2>/dev/null || true

                      docker run -d \
                        --name faqs-web \
                        --restart unless-stopped \
                        -p 3001:3000 \
                        -e DATABASE_URL='${{ secrets.DATABASE_URL }}' \
                        -e DIRECT_URL='${{ secrets.DIRECT_URL }}' \
                        -e API_BASE_URL='${{ secrets.API_BASE_URL }}' \
                        ${{ steps.img.outputs.value }}:${{ steps.img.outputs.tag }}

                      docker image prune -f
```

### 关键区别（对比 sun 的 workflow）

| 差异点         | 说明                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| 镜像名         | `{username}/faqs-web`（sun 是 `{username}/sun`）                                   |
| 容器名         | `faqs-web`                                                                         |
| 宿主机端口     | `3001`（sun 占用了 `3000`）                                                        |
| 运行时环境变量 | 通过 `docker run -e` 注入 `DATABASE_URL`、`DIRECT_URL`、`API_BASE_URL`             |
| 构建时环境变量 | `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`NEXT_PUBLIC_APP_URL` |

---

## 六、GitHub Secrets 配置

在 faqs 仓库的 **Settings → Secrets and variables → Actions** 中添加：

| Secret 名称                     | 说明                                            | 阶段   |
| ------------------------------- | ----------------------------------------------- | ------ |
| `SSH_PRIVATE_KEY`               | 服务器 SSH 私钥（可复用 sun 的）                | 部署   |
| `SERVER_HOST`                   | 服务器 IP `81.70.148.10`（可复用）              | 部署   |
| `DOCKER_USERNAME`               | Docker Hub 用户名（不是邮箱！可复用）           | 构建   |
| `DOCKER_PASSWORD`               | Docker Hub 密码或 Access Token（可复用）        | 构建   |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 项目 URL                               | 构建时 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥                               | 构建时 |
| `NEXT_PUBLIC_APP_URL`           | 应用 URL，如 `https://faqs.curlyhair.cn`        | 构建时 |
| `DATABASE_URL`                  | PostgreSQL 连接串（Supabase Pooler，端口 6543） | 运行时 |
| `DIRECT_URL`                    | PostgreSQL 直连串（端口 5432，可选）            | 运行时 |
| `API_BASE_URL`                  | 后端 API 地址（如果有独立后端服务）             | 运行时 |

> **NEXT*PUBLIC*\* 变量**在 `next build` 时被硬编码进客户端 JS bundle，必须通过 Docker `ARG` 在构建阶段注入。  
> **DATABASE_URL 等服务端变量**在运行时通过 `docker run -e` 注入即可。

---

## 七、服务器 Nginx 配置

目前 sun 容器直接监听宿主机 3000 端口。加入 faqs 后需要 Nginx 统一管理反向代理和 SSL。

### 7.1 安装 Nginx + Certbot

```bash
ssh root@81.70.148.10

# 安装 Nginx
apt update && apt install -y nginx

# 安装 Certbot（Let's Encrypt SSL 证书）
apt install -y certbot python3-certbot-nginx
```

### 7.2 Nginx 配置

创建 `/etc/nginx/sites-available/curlyhair.conf`：

```nginx
# sun - 主站
server {
    listen 80;
    server_name www.curlyhair.cn curlyhair.cn;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# faqs - 子域名
server {
    listen 80;
    server_name faqs.curlyhair.cn;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# 启用配置
ln -sf /etc/nginx/sites-available/curlyhair.conf /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 检查语法并重载
nginx -t && systemctl reload nginx
```

### 7.3 SSL 证书

```bash
# 为两个域名同时申请证书
certbot --nginx -d www.curlyhair.cn -d curlyhair.cn -d faqs.curlyhair.cn

# Certbot 会自动修改 Nginx 配置，添加 443 监听和证书路径
# 自动续期已内置，可验证：
certbot renew --dry-run
```

> **如果已通过腾讯云 CDN/CLB 管理 SSL**：跳过 Certbot，在腾讯云控制台为 `faqs.curlyhair.cn` 添加相应配置即可。

---

## 八、DNS 配置

在域名 DNS 管理面板（腾讯云 DNSPod 或其他）添加 A 记录：

| 主机记录 | 记录类型 | 记录值         |
| -------- | -------- | -------------- |
| `faqs`   | A        | `81.70.148.10` |

> `www` 和根域名 `curlyhair.cn` 已存在，无需修改。

---

## 九、部署后的架构全景

```
                   ┌──────────────────┐
                   │   DNS 解析        │
                   │  *.curlyhair.cn   │
                   │  → 81.70.148.10   │
                   └────────┬─────────┘
                            │
                   ┌────────▼─────────┐
                   │  Nginx (端口 80/443) │
                   │  SSL 终端          │
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
                              │ Supabase    │
                              │ (PostgreSQL │
                              │  + Auth)    │
                              └─────────────┘
```

---

## 十、环境变量分类总结

### 构建时变量（Dockerfile ARG → build-args）

这些变量以 `NEXT_PUBLIC_` 开头，会被编译进客户端 JS bundle：

| 变量                            | 说明                                         |
| ------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 项目 URL                            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥                            |
| `NEXT_PUBLIC_APP_URL`           | 应用自身 URL，如 `https://faqs.curlyhair.cn` |

### 运行时变量（docker run -e）

这些变量只在 Node.js 服务端使用，运行时注入即可：

| 变量           | 说明                                              |
| -------------- | ------------------------------------------------- |
| `DATABASE_URL` | PostgreSQL 连接串（Supabase Pooler，端口 6543）   |
| `DIRECT_URL`   | PostgreSQL 直连串（端口 5432，迁移用，可选）      |
| `API_BASE_URL` | 后端 API 服务地址（next.config.ts rewrites 使用） |

---

## 十一、详细 TODO（按执行顺序）

### 阶段一：本地代码准备

- [ ] **1.1** 在 faqs 仓库根目录创建 `Dockerfile`（内容见第四节）
- [ ] **1.2** 在 faqs 仓库创建 `.github/workflows/deploy.yml`（内容见第五节）
- [ ] **1.3** 确认 `apps/faqs-web/next.config.ts` 中已有 `output: 'standalone'`
- [ ] **1.4** 本地构建测试：确保 `pnpm --filter faqs-web run build` 能成功
- [ ] **1.5** 确认 `pnpm-lock.yaml` 与所有 `package.json` 同步（运行 `pnpm install` 后提交 lockfile）
- [ ] **1.6** 在 `.gitignore` 中确认忽略了 `.env.local`、`.env`（防止泄露密钥）
- [ ] **1.7** 本地 Docker 构建测试（可选但推荐）：
    ```bash
    docker build \
      --build-arg NEXT_PUBLIC_SUPABASE_URL=你的值 \
      --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=你的值 \
      --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3001 \
      -t faqs-web:test .
    ```
- [ ] **1.8** 本地 Docker 运行测试（可选但推荐）：
    ```bash
    docker run --rm -p 3001:3000 \
      -e DATABASE_URL='你的连接串' \
      -e API_BASE_URL='http://host.docker.internal:8080' \
      faqs-web:test
    ```
    访问 `http://localhost:3001` 验证页面正常

### 阶段二：GitHub 仓库配置

- [ ] **2.1** 确认 faqs 仓库已推送到 GitHub（如果还没有远程仓库，先创建）
- [ ] **2.2** 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
- [ ] **2.3** 添加 Secret：`DOCKER_USERNAME`（Docker Hub 用户名，不是邮箱）
- [ ] **2.4** 添加 Secret：`DOCKER_PASSWORD`（Docker Hub 密码或 Access Token）
- [ ] **2.5** 添加 Secret：`SSH_PRIVATE_KEY`（服务器 SSH 私钥，完整内容包括 BEGIN/END 行）
- [ ] **2.6** 添加 Secret：`SERVER_HOST`（值：`81.70.148.10`）
- [ ] **2.7** 添加 Secret：`NEXT_PUBLIC_SUPABASE_URL`（从 Supabase Dashboard → Settings → API 获取）
- [ ] **2.8** 添加 Secret：`NEXT_PUBLIC_SUPABASE_ANON_KEY`（从 Supabase Dashboard → Settings → API 获取）
- [ ] **2.9** 添加 Secret：`NEXT_PUBLIC_APP_URL`（值：`https://faqs.curlyhair.cn`）
- [ ] **2.10** 添加 Secret：`DATABASE_URL`（格式：`postgresql://postgres.[项目ref]:[密码]@aws-0-[区域].pooler.supabase.com:6543/postgres`）
- [ ] **2.11** 添加 Secret：`DIRECT_URL`（格式：`postgresql://postgres.[项目ref]:[密码]@aws-0-[区域].pooler.supabase.com:5432/postgres`，可选）
- [ ] **2.12** 添加 Secret：`API_BASE_URL`（后端 API 地址，如果没有独立后端可暂时留空或填 `http://127.0.0.1:8080`）

### 阶段三：DNS 配置

- [ ] **3.1** 登录域名 DNS 管理面板（腾讯云 DNSPod / Cloudflare / 其他）
- [ ] **3.2** 添加 A 记录：主机记录 `faqs`，记录类型 `A`，记录值 `81.70.148.10`
- [ ] **3.3** 等待 DNS 生效（通常几分钟，最长 48 小时）
- [ ] **3.4** 验证 DNS 解析：`ping faqs.curlyhair.cn`，确认解析到 `81.70.148.10`

### 阶段四：服务器环境准备

- [ ] **4.1** SSH 登录服务器：`ssh root@81.70.148.10`
- [ ] **4.2** 确认 Docker 已安装且运行中：`docker --version && systemctl status docker`
- [ ] **4.3** 确认 sun 容器正常运行：`docker ps | grep sun`
- [ ] **4.4** 确认端口 3001 未被占用：`ss -tlnp | grep 3001`

#### 安装 Nginx（如果尚未安装）

- [ ] **4.5** 安装 Nginx：`apt update && apt install -y nginx`
- [ ] **4.6** 确认 Nginx 运行：`systemctl status nginx`
- [ ] **4.7** 安装 Certbot：`apt install -y certbot python3-certbot-nginx`

#### 配置 Nginx 反向代理

- [ ] **4.8** 创建 Nginx 配置文件：`vim /etc/nginx/sites-available/curlyhair.conf`（内容见第七节）
- [ ] **4.9** 启用配置：`ln -sf /etc/nginx/sites-available/curlyhair.conf /etc/nginx/sites-enabled/`
- [ ] **4.10** 删除默认配置：`rm -f /etc/nginx/sites-enabled/default`
- [ ] **4.11** 检查配置语法：`nginx -t`
- [ ] **4.12** 重载 Nginx：`systemctl reload nginx`
- [ ] **4.13** 验证 sun 仍可通过 `http://www.curlyhair.cn` 访问（此时 HTTP）

#### 配置 SSL 证书

- [ ] **4.14** 申请 SSL 证书（确保 DNS 已生效后再执行）：
    ```bash
    certbot --nginx -d www.curlyhair.cn -d curlyhair.cn -d faqs.curlyhair.cn
    ```
- [ ] **4.15** 根据 Certbot 提示完成验证（通常自动完成）
- [ ] **4.16** 验证 Certbot 已自动修改 Nginx 配置（添加了 443 监听和证书路径）
- [ ] **4.17** 验证 HTTPS 访问：`https://www.curlyhair.cn` 正常打开 sun 应用
- [ ] **4.18** 验证自动续期：`certbot renew --dry-run`

> **备选方案**：如果当前 sun 的 SSL 是通过腾讯云 CDN/CLB 管理的，跳过 4.14-4.18，改为在腾讯云控制台为 `faqs.curlyhair.cn` 添加 CDN 加速域名和证书。

### 阶段五：数据库准备

- [ ] **5.1** 确认 Supabase 数据库已创建且可连接
- [ ] **5.2** 在本地执行数据库迁移（确保 `.env.local` 中有正确的 `DATABASE_URL` 和 `DIRECT_URL`）：
    ```bash
    cd apps/faqs-web
    pnpm db:push
    ```
- [ ] **5.3** 通过 Supabase Dashboard → Table Editor 确认表结构已创建

### 阶段六：首次部署

- [ ] **6.1** 提交所有代码变更（Dockerfile、workflow 等）
- [ ] **6.2** 推送到 GitHub main 分支：`git push origin main`
- [ ] **6.3** 在 GitHub → Actions 页面观察 workflow 运行情况
- [ ] **6.4** 确认 "Build & Push Docker Image" job 成功（镜像推送到 Docker Hub）
- [ ] **6.5** 确认 "Deploy to Server" job 成功（SSH 部署完成）
- [ ] **6.6** 如果失败，查看 Actions 日志排查：
    - 构建失败 → 检查 Dockerfile、lockfile 是否同步
    - 推送失败 → 检查 `DOCKER_USERNAME`/`DOCKER_PASSWORD` 是否正确
    - SSH 失败 → 检查 `SSH_PRIVATE_KEY`/`SERVER_HOST` 是否正确
    - 容器启动失败 → SSH 到服务器运行 `docker logs faqs-web` 查看错误

### 阶段七：部署后验证

- [ ] **7.1** SSH 到服务器确认容器运行中：`docker ps | grep faqs-web`
- [ ] **7.2** 服务器上直接测试容器：`curl http://127.0.0.1:3001`
- [ ] **7.3** 测试 Nginx 反向代理：`curl http://faqs.curlyhair.cn`
- [ ] **7.4** 浏览器访问 `https://faqs.curlyhair.cn`，确认页面正常加载
- [ ] **7.5** 检查页面资源加载（F12 → Network），确认无 404 或 Mixed Content 错误
- [ ] **7.6** 测试 API 代理：访问应用中需要后端 API 的功能，确认请求正常
- [ ] **7.7** 测试 i18n 路由切换是否正常
- [ ] **7.8** 测试用户登录/注册（Supabase Auth）是否正常
- [ ] **7.9** 确认 `https://www.curlyhair.cn`（sun 应用）仍正常工作，未受影响

### 阶段八：Supabase 配置

- [ ] **8.1** 登录 Supabase Dashboard → Authentication → URL Configuration
- [ ] **8.2** 设置 Site URL 为 `https://faqs.curlyhair.cn`（如果这是主要域名）
- [ ] **8.3** 在 Redirect URLs 中添加 `https://faqs.curlyhair.cn/**`
- [ ] **8.4** 如果有第三方 OAuth 登录（GitHub/Google 等），在对应 OAuth 提供商的设置中也添加新的回调 URL
- [ ] **8.5** 测试完整登录流程：注册 → 邮箱验证 → 登录 → 退出

### 阶段九：监控与维护

- [ ] **9.1** 确认容器设置了 `--restart unless-stopped`，服务器重启后自动恢复
- [ ] **9.2** 设置 Docker 日志轮转（防止日志撑爆磁盘）：
    ```bash
    # 在 /etc/docker/daemon.json 中添加
    {
      "log-driver": "json-file",
      "log-opts": {
        "max-size": "10m",
        "max-file": "3"
      }
    }
    ```
- [ ] **9.3** 确认服务器磁盘空间充足：`df -h`
- [ ] **9.4** （可选）设置简单的健康检查 cron，如每 5 分钟 `curl -f https://faqs.curlyhair.cn || 报警`
- [ ] **9.5** （可选）设置 GitHub Actions 失败通知（邮件/Slack/钉钉）

---

## 十二、注意事项

### 1. Supabase Auth 回调地址

部署后需要在 Supabase Dashboard → Authentication → URL Configuration 中添加：

- Site URL: `https://faqs.curlyhair.cn`
- Redirect URLs: `https://faqs.curlyhair.cn/**`

### 2. 后端 API 服务

faqs-web 的 `next.config.ts` 将 `/api/*` 请求代理到 `API_BASE_URL`（默认 `http://localhost:8080`）。如果有独立的后端服务，需要在服务器上同步部署，并将 `API_BASE_URL` 设置为后端服务的内网地址。

### 3. 数据库迁移

首次部署前需执行数据库迁移（在本地或 CI 中运行）：

```bash
cd apps/faqs-web
pnpm db:push    # 推送 schema 到数据库
# 或
pnpm db:migrate # 执行迁移文件
```

### 4. pnpm 版本

faqs 项目的 `packageManager` 字段指定了 `pnpm@10.30.3`，Dockerfile 中需保持一致。如果后续升级了 pnpm 版本，记得同步更新 Dockerfile。

### 5. 与 sun 共用 Secrets

`SSH_PRIVATE_KEY`、`SERVER_HOST`、`DOCKER_USERNAME`、`DOCKER_PASSWORD` 这四个 Secrets 可以复用 sun 仓库的值，但需要在 faqs 仓库中单独配置（GitHub Secrets 不跨仓库共享）。
