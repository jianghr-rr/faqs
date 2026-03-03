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

COPY --from=builder /app/apps/faqs-web/.next/standalone ./
COPY --from=builder /app/apps/faqs-web/.next/static ./apps/faqs-web/.next/static
COPY --from=builder /app/apps/faqs-web/public       ./apps/faqs-web/public

EXPOSE 3000

CMD ["node", "apps/faqs-web/server.js"]
