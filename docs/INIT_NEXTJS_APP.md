# Next.js 应用初始化指南

本文档描述如何在 monorepo 中初始化一个 Next.js 应用，参考 `monorepo/apps/mall-web` 项目。

> **最后更新：2026-02-28**
> **前置条件**：已按照 `INIT_MONOREPO.md` 完成 monorepo 根目录初始化。

## 修订记录（2026-02-28）

- 修正 `proxy.ts` 示例：Cookie 读取改为 `request.cookies.get(...)`，避免在代理上下文依赖 `next/headers` 的 `cookies()`。
- 修正 i18n 场景下的路由保护示例：受保护路由匹配基于去除 locale 前缀后的路径，避免 `/zh/...`、`/en/...` 下匹配失效。
- 修正未登录重定向示例：保留当前 locale 前缀，保证国际化路径一致性。
- 修正章节引用：`"use cache"` 的引用从 2.14 更正为 2.13。

---

## 0. mall-web 依赖版本对照表

以下是 mall-web 中所有三方依赖的版本对照（旧版 → 最新版），初始化新项目时应使用最新版：

### 核心框架

| 依赖      | mall-web 版本 | 最新版     | 备注                                                                         |
| --------- | ------------- | ---------- | ---------------------------------------------------------------------------- |
| next      | 15.1.0        | **16.1.6** | **主版本升级**，Turbopack 默认、`use cache`、`proxy.ts` 替代 `middleware.ts` |
| react     | 19.0.0        | **19.2.4** | View Transitions、React Compiler 稳定                                        |
| react-dom | 19.0.0        | **19.2.4** |                                                                              |

### 状态管理 & 数据获取

| 依赖    | mall-web 版本 | 最新版     | 备注 |
| ------- | ------------- | ---------- | ---- |
| zustand | 5.0.2         | **5.0.11** |      |
| swr     | 2.2.5         | **2.4.0**  |      |
| axios   | 1.7.8         | **1.13.6** |      |

### 表单 & 校验

| 依赖                | mall-web 版本 | 最新版     | 备注                       |
| ------------------- | ------------- | ---------- | -------------------------- |
| react-hook-form     | 7.54.0        | **7.54.0** | 保持不变                   |
| @hookform/resolvers | 3.9.1         | **5.2.2**  | 主版本升级，支持 Zod 4     |
| zod                 | 3.22.4        | **4.0.5**  | **主版本升级**，API 有变化 |

### 数据库 & ORM

| 依赖        | mall-web 版本 | 最新版     | 备注                  |
| ----------- | ------------- | ---------- | --------------------- |
| drizzle-orm | 0.30.10       | **0.43.1** | 重大升级，1.0 beta 中 |
| drizzle-kit | 0.20.17       | **0.30.4** | 配置方式有变化        |
| mysql2      | 3.11.4        | **3.11.4** | 保持不变              |

### UI 框架 & 样式

| 依赖                     | mall-web 版本 | 最新版      | 备注                                                                              |
| ------------------------ | ------------- | ----------- | --------------------------------------------------------------------------------- |
| tailwindcss              | 3.4.3         | **4.2.1**   | **主版本升级**，CSS-first 配置                                                    |
| @tailwindcss/typography  | 0.5.13        | —           | Tailwind 4 内置，不再需要单独安装                                                 |
| tailwindcss-animate      | 1.0.7         | —           | 需确认 Tailwind 4 兼容性                                                          |
| flowbite-react           | 0.10.2        | **0.12.17** |                                                                                   |
| class-variance-authority | 0.7.0         | **0.7.1**   | 1.0 beta 中                                                                       |
| clsx                     | 2.1.1         | **2.1.1**   | 保持不变                                                                          |
| tailwind-merge           | 2.3.0         | **2.3.0**   | 保持不变（注：mall-web 中包名写作 `tailwind-merge`，正确包名为 `tailwind-merge`） |
| lucide-react             | 0.465.0       | **0.575.0** |                                                                                   |

### 认证 & 安全

| 依赖      | mall-web 版本 | 最新版            | 备注                                   |
| --------- | ------------- | ----------------- | -------------------------------------- |
| next-auth | 4.24.11       | **5.0.0-beta.27** | v5 仍在 beta；或考虑迁移到 Better Auth |
| jose      | 5.9.6         | **6.1.3**         | **主版本升级**                         |
| bcrypt    | 5.1.1         | **5.1.1**         | 保持不变                               |
| crypto-js | 4.2.0         | **4.2.0**         | 保持不变                               |

### 国际化

| 依赖                             | mall-web 版本 | 最新版      | 备注                 |
| -------------------------------- | ------------- | ----------- | -------------------- |
| i18next                          | 23.11.5       | **23.11.5** | 保持不变             |
| react-i18next                    | 15.1.3        | **15.1.3**  | 保持不变             |
| next-i18n-router                 | 5.5.1         | **5.5.1**   | 保持不变             |
| i18next-browser-languagedetector | 8.0.0         | **8.0.0**   | 保持不变             |
| i18next-resources-to-backend     | 1.2.1         | **1.2.1**   | 保持不变             |
| next-i18next                     | 15.3.0        | **15.4.2**  | 仅 Pages Router 需要 |

### 主题 & 加载

| 依赖             | mall-web 版本 | 最新版     | 备注 |
| ---------------- | ------------- | ---------- | ---- |
| next-themes      | 0.4.3         | **0.4.4**  |      |
| nextjs-toploader | 3.7.15        | **3.8.16** |      |

### 日志

| 依赖                      | mall-web 版本 | 最新版     | 备注     |
| ------------------------- | ------------- | ---------- | -------- |
| winston                   | 3.17.0        | **3.19.0** |          |
| winston-daily-rotate-file | 5.0.0         | **5.0.0**  | 保持不变 |

### 动画

| 依赖              | mall-web 版本 | 最新版    | 备注     |
| ----------------- | ------------- | --------- | -------- |
| @react-spring/web | 9.7.5         | **9.7.5** | 保持不变 |

### 其他

| 依赖        | mall-web 版本 | 最新版      | 备注     |
| ----------- | ------------- | ----------- | -------- |
| server-only | 0.0.1         | **0.0.1**   | 保持不变 |
| node-cache  | 5.1.2         | **5.1.2**   | 保持不变 |
| cookie      | 1.0.2         | **1.0.2**   | 保持不变 |
| lodash      | 4.17.21       | **4.17.21** | 保持不变 |

### DevDependencies

| 依赖               | mall-web 版本 | 最新版       | 备注                                            |
| ------------------ | ------------- | ------------ | ----------------------------------------------- |
| typescript         | 5.4.3         | **5.8.2**    |                                                 |
| eslint             | 8.57.0        | **10.0.1**   | **主版本升级**，flat config                     |
| eslint-config-next | 15.0.3        | **16.1.6**   | ESLint 10 下也可改用 `@next/eslint-plugin-next` |
| postcss            | 8.4.38        | **8.4.38**   | 保持不变                                        |
| @types/node        | 20.11.30      | **20.11.30** | 保持不变                                        |
| @types/react       | 18.2.73       | **19.0.0**   | **升级到 React 19 类型**                        |
| @types/react-dom   | 18.2.22       | **19.0.0**   | **升级到 React 19 类型**                        |

---

## 1. 项目目录结构

```
apps/faqs-web/
├── package.json
├── tsconfig.json
├── eslint.config.ts          # ESLint 10 flat config
├── next.config.ts            # Next.js 配置（改用 .ts）
├── postcss.config.mjs        # PostCSS 配置（Tailwind 4）
├── drizzle.config.ts         # Drizzle ORM 配置
├── i18nConfig.ts             # i18n 路由配置
├── proxy.ts                   # Next.js 16 Proxy（替代 middleware.ts，认证 + i18n）
├── components.json            # shadcn/ui 配置
├── app/
│   └── [locale]/              # i18n 动态路由
│       ├── layout.tsx
│       ├── page.tsx
│       ├── globals.css        # Tailwind 4 入口
│       └── fonts/             # 本地字体
├── actions/                   # Server Actions
├── apis/                      # API 调用封装
├── components/                # 通用组件
│   └── ui/                    # shadcn/ui 组件
├── dal/                       # Data Access Layer
├── db/                        # 数据库（Drizzle schema + migrations）
│   ├── index.ts
│   └── migrations/
├── dto/                       # Data Transfer Objects
├── lib/                       # 工具库
│   ├── auth/                  # 认证相关
│   ├── i18n.ts
│   ├── utils.ts               # cn() 等工具函数
│   └── custom-error.ts
├── locales/                   # 翻译文件（JSON）
├── providers/                 # React Context Providers
├── public/                    # 静态资源
├── store/                     # Zustand 状态管理
├── types/                     # TypeScript 类型定义
└── utils/                     # 工具函数
```

---

## 2. 初始化步骤

### 2.1 创建应用目录

```bash
cd /Users/jianghaoran/self/faqs
mkdir -p apps/faqs-web
cd apps/faqs-web
```

### 2.2 创建 `package.json`

```json
{
    "name": "faqs-web",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "next dev -p 3000",
        "build": "next build",
        "start": "next start -p 3000",
        "lint": "eslint --cache --cache-location ../../.cache/eslint/faqs-web.eslintcache",
        "typecheck": "tsc --project tsconfig.json --noEmit",
        "db:generate": "drizzle-kit generate",
        "db:migrate": "drizzle-kit migrate",
        "db:push": "drizzle-kit push",
        "db:studio": "drizzle-kit studio"
    },
    "dependencies": {
        "next": "16.1.6",
        "react": "19.2.4",
        "react-dom": "19.2.4",

        "zustand": "5.0.11",
        "swr": "2.4.0",
        "axios": "1.13.6",

        "react-hook-form": "7.54.0",
        "@hookform/resolvers": "5.2.2",
        "zod": "4.0.5",

        "drizzle-orm": "0.43.1",
        "drizzle-kit": "0.30.4",
        "mysql2": "3.11.4",

        "flowbite-react": "0.12.17",
        "class-variance-authority": "0.7.1",
        "clsx": "2.1.1",
        "tailwind-merge": "2.3.0",
        "lucide-react": "0.575.0",
        "@react-spring/web": "9.7.5",

        "next-auth": "4.24.11",
        "jose": "6.1.3",
        "bcrypt": "5.1.1",
        "crypto-js": "4.2.0",

        "i18next": "23.11.5",
        "react-i18next": "15.1.3",
        "next-i18n-router": "5.5.1",
        "i18next-browser-languagedetector": "8.0.0",
        "i18next-resources-to-backend": "1.2.1",

        "next-themes": "0.4.4",
        "nextjs-toploader": "3.8.16",

        "winston": "3.19.0",
        "winston-daily-rotate-file": "5.0.0",

        "server-only": "0.0.1",
        "node-cache": "5.1.2",
        "cookie": "1.0.2",
        "lodash": "4.17.21"
    },
    "devDependencies": {
        "@faqs/eslint-config": "workspace:*",
        "@types/node": "20.11.30",
        "@types/react": "19.0.0",
        "@types/react-dom": "19.0.0",
        "@types/bcrypt": "5.0.2",
        "@types/crypto-js": "4.2.2",
        "@types/lodash": "4.17.13",
        "@tailwindcss/postcss": "4.2.1",
        "eslint": "10.0.1",
        "postcss": "8.4.38",
        "tailwindcss": "4.2.1",
        "typescript": "5.8.2"
    }
}
```

> **相比 mall-web 的关键变化**：
>
> - **`next` 升级到 `16.1.6`**：Turbopack 默认、`proxy.ts` 替代 `middleware.ts`、`"use cache"` 指令
> - `@types/react` 和 `@types/react-dom` 升级到 `19.0.0`（匹配 React 19）
> - `eslint` 升级到 `10.0.1`，移除 `eslint-config-next`
> - `tailwindcss` 升级到 `4.2.1`，新增 `@tailwindcss/postcss`，移除 `tailwindcss-animate`、`@tailwindcss/typography`、`tailwind-highlightjs`
> - `zod` 升级到 `4.0.5`，`@hookform/resolvers` 升级到 `5.2.2`
> - `drizzle-orm` 升级到 `0.43.1`，`drizzle-kit` 升级到 `0.30.4`（命令方式有变化）
> - `jose` 升级到 `6.1.3`
> - 移除了 `net` 包（Node.js 内置模块，无需安装）
> - 移除了自定义 `webpack` 配置（Turbopack 不兼容旧版 webpack 配置）

### 2.3 创建 `tsconfig.json`

```json
{
    "$schema": "https://json.schemastore.org/tsconfig",
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "baseUrl": ".",
        "target": "ES2022",
        "module": "ES2022",
        "moduleResolution": "bundler",
        "strict": true,
        "strictNullChecks": true,
        "incremental": true,
        "lib": ["dom", "dom.iterable", "ES2022"],
        "jsx": "preserve",
        "paths": {
            "~/*": ["./*"],
            "~app/*": ["./app/*"],
            "~lib/*": ["./lib/*"],
            "~utils/*": ["./utils/*"],
            "~components/*": ["./components/*"],
            "~ui/*": ["./components/ui/*"],
            "~types/*": ["./types/*"],
            "~store/*": ["./store/*"],
            "~dal/*": ["./dal/*"],
            "~dto/*": ["./dto/*"]
        },
        "plugins": [{"name": "next"}]
    },
    "exclude": ["**/node_modules", "**/.*/*", "./components/ui"],
    "include": [
        "next-env.d.ts",
        "**/*.ts",
        "**/*.tsx",
        "**/*.mts",
        "**/*.js",
        "**/*.mjs",
        "**/*.jsx",
        "**/*.json",
        ".next/types/**/*.ts"
    ]
}
```

### 2.4 创建 `eslint.config.ts`（ESLint 10 flat config）

替代原来的 `.eslintrc.cjs`：

```typescript
import {defineConfig, globalIgnores} from 'eslint/config';
import {base} from '@faqs/eslint-config/base';
import {react} from '@faqs/eslint-config/react';
import nextPlugin from '@next/eslint-plugin-next';

export default defineConfig([
    globalIgnores(['.next/**', '.out/**', 'components/ui/**']),
    ...base,
    ...react,
    {
        plugins: {
            '@next/next': nextPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            '@next/next/no-img-element': 'off',
            'jsx-a11y/anchor-is-valid': 'off',
            'jsx-a11y/label-has-associated-control': 'off',
        },
    },
    {
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
]);
```

> **对比原 `.eslintrc.cjs`**：
>
> - 不再需要 `require('@bid-np/eslint-config-bases/patch/modern-module-resolution')`
> - 不再使用 `extends` 字符串数组，改为扩展配置对象数组
> - `parser` 和 `parserOptions` 移入 `languageOptions`
> - `ignorePatterns` 改为 `globalIgnores()`
> - `overrides` 改为文件级配置对象（直接在数组中添加 `{ files: [...], rules: {...} }`）

### 2.5 创建 `next.config.ts`

Next.js 16 原生使用 `.ts` 配置文件：

```typescript
import type {NextConfig} from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
    output: 'standalone',
    pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'avatars.githubusercontent.com',
                pathname: '/**',
            },
        ],
    },
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: isProd ? 'http://your-production-api:8080/:path*' : 'http://localhost:8080/:path*',
            },
        ];
    },
};

export default nextConfig;
```

> **Next.js 16 重大变化**：
>
> - **Turbopack 成为默认打包器**：`next dev` 和 `next build` 自动使用 Turbopack，速度提升 2-10x。如果有自定义 webpack 配置，需要迁移到 Turbopack 兼容方式或使用 `--webpack` 回退。
> - **`proxy.ts` 替代 `middleware.ts`**：见 2.10 节。
> - **`"use cache"` 指令**：新的显式缓存机制（实验性），见 2.13 节。
> - **React Compiler 稳定**：自动 memoization，无需手动 `useMemo`/`useCallback`。
> - **Node.js >=20.9 要求**：不再支持 Node.js 18。
> - 移除了旧版 `webpack` 配置中 `externals` 的 hack，Turbopack 不再需要。

### 2.6 创建 `postcss.config.mjs`（Tailwind 4）

```javascript
export default {
    plugins: {
        '@tailwindcss/postcss': {},
    },
};
```

> **变化**：从 `tailwindcss: {}` 改为 `'@tailwindcss/postcss': {}`。

### 2.7 创建 `app/[locale]/globals.css`（Tailwind 4 CSS-first）

替代原来 Tailwind 3 的 `@tailwind base/components/utilities` 指令：

```css
@import 'tailwindcss';

@theme {
    --font-inter: 'Inter', sans-serif;
    --font-lexend: 'Lexend', sans-serif;
}
```

> **变化**：
>
> - 不再需要 `tailwind.config.ts` 文件
> - `@tailwind base; @tailwind components; @tailwind utilities;` 被 `@import "tailwindcss"` 替代
> - 主题扩展使用 `@theme {}` 指令，在 CSS 中完成
> - `darkMode: 'class'` 在 Tailwind 4 中默认支持，通过 `@variant dark { &:where(.dark, .dark *) }` 配置
> - `content` 路径自动检测，不再需要手动配置
> - `@tailwindcss/typography` 已内置，不再需要单独安装
> - `flowbite-react` 的 Tailwind 插件集成方式可能需要参考其 v0.12+ 文档

### 2.8 创建 `drizzle.config.ts`（Drizzle 0.43+）

```typescript
import {defineConfig} from 'drizzle-kit';

if (
    !process.env.MYSQL_HOST ||
    !process.env.MYSQL_PORT ||
    !process.env.MYSQL_USER ||
    !process.env.MYSQL_PASSWORD ||
    !process.env.MYSQL_DATABASE
) {
    throw new Error('Missing MySQL configuration environment variables');
}

export default defineConfig({
    schema: './db/schema.ts',
    out: './db/migrations',
    dialect: 'mysql',
    dbCredentials: {
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
    },
});
```

> **变化**：
>
> - 使用 `defineConfig()` 替代 `satisfies Config`
> - `driver: 'mysql2'` 改为 `dialect: 'mysql'`
> - drizzle-kit 命令变化：`generate:mysql` → `generate`，`push:mysql` → `push`，`introspect:mysql` → `introspect`

### 2.9 创建 `i18nConfig.ts`

```typescript
import type {Config} from 'next-i18n-router/dist/types';

const i18nConfig: Config = {
    locales: ['zh', 'en'],
    defaultLocale: 'zh',
};

export default i18nConfig;
```

### 2.10 创建 `proxy.ts`（Next.js 16 替代 middleware.ts）

Next.js 16 将 `middleware.ts` 重命名为 `proxy.ts`，导出函数也从 `middleware` 改为 `proxy`。`proxy.ts` 默认运行在 Node.js runtime（而非 Edge），可以使用完整的 Node.js API。

```typescript
import {type NextRequest, NextResponse} from 'next/server';
import {i18nRouter} from 'next-i18n-router';
import {decrypt} from '~/lib/auth/session';
import i18nConfig from './i18nConfig';

const protectedRoutes = ['/personal-center'];

export async function proxy(request: NextRequest) {
    const response = i18nRouter(request, i18nConfig);
    const {pathname} = request.nextUrl;

    const pathnameWithoutLocale = pathname.replace(/^\/(zh|en)(?=\/|$)/, '') || '/';
    const isProtectedRoute = protectedRoutes.some((route) => pathnameWithoutLocale.startsWith(route));

    const cookie = request.cookies.get('Authentication')?.value;
    const session = await decrypt(cookie);

    if (isProtectedRoute && !session?.userId) {
        const locale = pathname.match(/^\/(zh|en)(?=\/|$)/)?.[1] ?? 'zh';
        return NextResponse.redirect(new URL(`/${locale}`, request.url));
    }

    return response;
}

export const config = {
    matcher: '/((?!api|static|.*\\..*|_next).*)',
};
```

> **从 middleware.ts 迁移到 proxy.ts 的步骤**：
>
> 1. 将 `middleware.ts` 重命名为 `proxy.ts`
> 2. 将导出的 `middleware()` 函数改名为 `proxy()`
> 3. 移除 `export const runtime = 'edge'`（如果有的话），因为 proxy 默认运行在 Node.js runtime
> 4. 读取 Cookie 时优先使用 `request.cookies.get(...)`，避免在 `proxy.ts` 中依赖 `next/headers` 的 `cookies()`

### 2.11 创建 `components.json`（shadcn/ui 配置）

```json
{
    "$schema": "https://ui.shadcn.com/schema.json",
    "style": "new-york",
    "rsc": true,
    "tsx": true,
    "tailwind": {
        "config": "",
        "css": "app/[locale]/globals.css",
        "baseColor": "neutral",
        "cssVariables": true,
        "prefix": ""
    },
    "aliases": {
        "components": "~/components",
        "utils": "~/lib/utils",
        "ui": "~/components/ui",
        "lib": "~/lib",
        "hooks": "~/hooks"
    },
    "iconLibrary": "lucide"
}
```

> **变化**：Tailwind 4 下 `tailwind.config` 可以留空，shadcn/ui 会适配 CSS-first 方式。

### 2.12 创建 `lib/utils.ts`（shadcn/ui 工具函数）

```typescript
import {type ClassValue, clsx} from 'clsx';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
```

### 2.13 `"use cache"` 指令（Next.js 16 新特性，实验性）

Next.js 16 引入了 `"use cache"` 指令，提供显式的、可选的缓存机制（替代 Next.js 15 之前隐式的缓存行为）。

启用方式 —— 在 `next.config.ts` 中添加：

```typescript
const nextConfig: NextConfig = {
    experimental: {
        useCache: true,
    },
};
```

使用示例：

```typescript
// 页面级缓存
'use cache'
export default async function Page() {
    const data = await fetchData();
    return <div>{data}</div>;
}

// 函数级缓存
export async function getData() {
    'use cache'
    const res = await fetch('/api/data');
    return res.json();
}

// 组件级缓存
export async function CachedComponent() {
    'use cache'
    return <div>This component output is cached</div>;
}
```

> **注意**：`"use cache"` 要求参数和返回值必须可序列化，函数内部不能有副作用。

### 2.14 创建环境变量文件 `.env.local`

```env
# Database
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=your_database

# Auth
AUTH_SECRET=your-secret-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 3. 创建子目录

```bash
mkdir -p app/\[locale\]
mkdir -p actions apis components/ui dal db/migrations dto lib/auth locales providers public store types utils
```

---

## 4. Zod 4 迁移注意事项

Zod 从 3.x 升级到 4.x 有以下关键变化：

```typescript
// Zod 3（旧）
import {z} from 'zod';

// Zod 4（新）- 同样的导入方式，但包的内部有变化
import {z} from 'zod';

// 如果需要同时使用 Zod 3 和 Zod 4（过渡期）：
import {z} from 'zod/v3'; // Zod 3
import {z} from 'zod'; // Zod 4
```

与 `@hookform/resolvers` 5.x 配合使用时，resolver 的导入路径可能有变化，请参考其最新文档。

---

## 5. jose 6.x 迁移注意事项

jose 从 5.x 升级到 6.x，主要变化：

- 部分 API 的参数签名可能有调整
- 如当前项目仅使用 `jose` 进行 JWT 签名/验证，影响较小
- 建议查看 [jose 6.x CHANGELOG](https://github.com/panva/jose/blob/main/CHANGELOG.md) 确认 breaking changes

---

## 6. 安装与启动

```bash
# 回到 monorepo 根目录
cd /Users/jianghaoran/self/faqs

# 安装所有依赖
pnpm install

# 在 turbo.json 中注册应用任务
# 在根 package.json scripts 中添加:
#   "build-faqs-web": "turbo run build-faqs-web"
#   "start-faqs-web": "turbo run start-faqs-web"

# 启动开发服务器
pnpm turbo run dev --filter=faqs-web

# 或直接进入应用目录
cd apps/faqs-web
pnpm dev
```

---

## 7. 数据库初始化

```bash
cd apps/faqs-web

# 从现有数据库生成 schema（反向工程）
pnpm drizzle-kit introspect

# 生成迁移文件
pnpm drizzle-kit generate

# 推送 schema 到数据库
pnpm drizzle-kit push

# 打开 Drizzle Studio（可视化数据库管理）
pnpm drizzle-kit studio
```

---

## 8. 添加 shadcn/ui 组件

```bash
cd apps/faqs-web

# 初始化 shadcn/ui（如果还没有 components.json）
pnpm dlx shadcn@latest init

# 添加组件
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add input
pnpm dlx shadcn@latest add dialog
# ... 按需添加
```

---

## 9. lint-staged 应用级配置（可选）

如果需要在应用级别覆盖根 lint-staged 配置，创建 `lint-staged.config.mjs`：

```javascript
import {concatFilesForPrettier, getEslintFixCmd} from '../../lint-staged.common.js';

/** @type {Record<string, (filenames: string[]) => string | string[] | Promise<string | string[]>>} */
const rules = {
    '**/*.{js,jsx,ts,tsx,mjs,cjs}': (filenames) => {
        return getEslintFixCmd({
            cwd: import.meta.dirname,
            fix: true,
            cache: true,
            rules: ['react-hooks/exhaustive-deps: off'],
            maxWarnings: 25,
            files: filenames,
        });
    },
    '**/*.{json,md,mdx,css,html,yml,yaml,scss}': (filenames) => {
        return [`prettier --write ${concatFilesForPrettier(filenames)}`];
    },
};

export default rules;
```

> **变化**：`__dirname` 在 ESM 中不可用，改用 `import.meta.dirname`。

---

## 10. 关键架构决策备注

| 决策点       | mall-web 的选择                       | 建议                                                                           |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| Next.js 版本 | 15.1.0                                | **升级到 16.1.6**，享受 Turbopack 默认加速、`"use cache"`、`proxy.ts` 等新特性 |
| 打包器       | Webpack（隐式）                       | **Turbopack**（Next.js 16 默认），移除自定义 webpack 配置                      |
| 请求拦截     | middleware.ts（Edge Runtime）         | **proxy.ts**（Node.js Runtime），可使用完整 Node.js API                        |
| 认证方案     | next-auth v4 + jose（自定义 session） | v5 仍在 beta，新项目可考虑 Better Auth 或继续使用 v4                           |
| ORM          | Drizzle ORM                           | 继续使用 Drizzle，版本升至 0.43+                                               |
| 状态管理     | Zustand                               | 保持，轻量且稳定                                                               |
| 数据获取     | SWR + Axios                           | 保持；或考虑 TanStack Query 替代 SWR                                           |
| 表单         | react-hook-form + zod                 | 升级到 Zod 4 + resolvers 5.x                                                   |
| UI 组件库    | shadcn/ui + Flowbite React            | 保持                                                                           |
| 国际化       | i18next + next-i18n-router            | App Router 方案，保持不变                                                      |
| CSS 框架     | Tailwind CSS 3                        | **升级到 v4**，CSS-first 配置，移除 `tailwind.config.ts`                       |
| 日志         | Winston                               | 保持                                                                           |
| 缓存策略     | Next.js 15 隐式缓存                   | Next.js 16 的 `"use cache"` 显式缓存（实验性）                                 |
