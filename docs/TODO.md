# faqs Monorepo 初始化工作清单

基于 `INIT_MONOREPO.md` 和 `INIT_NEXTJS_APP.md` 两份文档，将 faqs 项目从零初始化为完整的 monorepo + Next.js 16 应用。

> **工作目录**：`/Users/jianghaoran/self/faqs`（已有 `.git`，其余为空）

## 修订记录（2026-02-28）

- 统一 Turbo 应用任务语义：`start-faqs-web` 的 `dependsOn` 调整为 `faqs-web#start`。
- 对齐 ESLint 共享包结构：补充 `./next` 导出与 `src/next.ts` 任务，并在入口中统一 re-export。
- 统一 UI 依赖命名：将 `cva` 明确为 npm 包名 `class-variance-authority`。

---

## 阶段 A：Monorepo 根基础设施

在 `faqs/` 根目录创建所有基础设施配置文件（共 12 个文件 + 2 个目录）。

- [ ] **A1** 创建 `apps/` 和 `packages/` 目录
- [ ] **A2** 创建根 `package.json`
    - `"packageManager": "pnpm@10.30.3"`
    - `"type": "module"`
    - devDependencies: turbo 2.8.11, eslint 10.0.1, typescript 5.8.2, prettier 3.8.1, husky 9.1.7, lint-staged 16.2.7, typescript-eslint 8.56.1, @changesets/cli, @commitlint/cli, @commitlint/config-conventional, cross-env, npm-run-all2, rimraf, shell-quote, syncpack
    - engines: `"node": ">=20.19.0"`, `"npm": "please-use-pnpm"`
    - scripts: deps:check, deps:update, g:lint, g:lint-staged-files
- [ ] **A3** 创建 `pnpm-workspace.yaml`
    - packages: `apps/*`, `packages/*`
- [ ] **A4** 创建 `.npmrc`
    - `auto-install-peers=true`
    - `strict-peer-dependencies=false`
- [ ] **A5** 创建 `turbo.json`
    - tasks: test, test-unit, dev (cache:false), start (cache:false, persistent:true), build (dependsOn:^build, inputs/outputs), lint (env:TIMING), typecheck, clean (cache:false)
- [ ] **A6** 创建 `tsconfig.base.json`
    - moduleResolution: `"bundler"`
    - target/lib: `"ES2022"`
    - strict 系列全开: strict, useUnknownInCatchVariables, noImplicitOverride, noUncheckedIndexedAccess, allowUnreachableCode:false, noFallthroughCasesInSwitch
    - verbatimModuleSyntax, allowJs, resolveJsonModule, skipLibCheck, noEmit, esModuleInterop, incremental, newLine:lf
- [ ] **A7** 创建根 `eslint.config.ts`（ESLint 10 flat config）
    - `defineConfig` + `globalIgnores`（node_modules, .next, dist, build, .cache, .turbo）
    - `@eslint/js` recommended + `typescript-eslint` recommended
    - `languageOptions.parserOptions`: projectService:true, tsconfigRootDir: import.meta.dirname
    - 规则: @typescript-eslint/no-unused-vars warn（argsIgnorePattern: ^\_）
- [ ] **A8** 创建 `.prettierrc.js` 和 `.prettierignore`
    - 配置: singleQuote:true, tabWidth:4, printWidth:120, bracketSpacing:false
    - md 文件 override: quoteProps: preserve
    - ignore: .yarn, .next, .out, dist, build, .tmp, .cache, .turbo
- [ ] **A9** 创建 `lint-staged.config.js` 和 `lint-staged.common.js`
    - ESM 格式（import/export）
    - config.js: 对 json/md/css/ts/js 等执行 prettier --write
    - common.js: 导出 getEslintFixCmd、concatFilesForPrettier、concatFilesForStylelint
- [ ] **A10** 创建 `.gitignore`
    - node*modules, .next, .out, dist, build, .tmp, .cache, .turbo, *.tsbuildinfo, .env\_.local, .pnpm-store
- [ ] **A11** 创建 `.editorconfig`
    - indent_style: space, indent_size: 2, end_of_line: lf, charset: utf-8, trim_trailing_whitespace: true, insert_final_newline: true

---

## 阶段 B：共享包

### B1: ESLint 共享配置包 `packages/eslint-config/`

创建 flat config 格式的可组合 ESLint 配置包 `@faqs/eslint-config`。

- [ ] **B1** 创建 `packages/eslint-config/package.json`
    - name: `@faqs/eslint-config`, type: module, private: true
    - exports: `.` → src/index.ts, `./base` → src/base.ts, `./react` → src/react.ts, `./next` → src/next.ts, `./prettier` → src/prettier.ts
    - dependencies: @eslint/js ^10.0.0, typescript-eslint ^8.56.0, eslint-plugin-react ^7.37.0, eslint-plugin-react-hooks ^5.0.0, eslint-config-prettier ^10.0.0, eslint-plugin-prettier ^5.2.0, @next/eslint-plugin-next ^15.5.0
    - peerDependencies: eslint ^10, prettier ^3.8, typescript ^5.8
- [ ] **B2** 创建 `packages/eslint-config/src/base.ts`
    - @eslint/js recommended + tseslint recommended
    - parserOptions: projectService:true
    - 规则: no-unused-vars warn (argsIgnorePattern: ^\_), no-explicit-any warn
- [ ] **B3** 创建 `packages/eslint-config/src/react.ts`
    - plugins: eslint-plugin-react + eslint-plugin-react-hooks
    - 展开 recommended rules
    - 关闭: react/react-in-jsx-scope, react/prop-types
    - settings: react version detect
- [ ] **B4** 创建 `packages/eslint-config/src/prettier.ts`
    - eslint-config-prettier + eslint-plugin-prettier 集成
- [ ] **B5** 创建 `packages/eslint-config/src/index.ts`
    - re-export: base, react, next, prettier
- [ ] **B6** 创建 `packages/eslint-config/src/next.ts`
    - 插件: `@next/eslint-plugin-next`
    - 导出 recommended + core-web-vitals 规则（供应用按需组合）

---

## 阶段 C：Next.js 16 应用

在 `apps/faqs-web/` 下创建完整的 Next.js 16 应用（需确定应用名称，例如 `faq-app`）。

### C-1: 目录结构

- [ ] **C1** 创建 `apps/faqs-web/` 及全部子目录
    - `app/[locale]/` — i18n 动态路由
    - `actions/` — Server Actions
    - `apis/` — API 调用封装
    - `components/ui/` — shadcn/ui 组件
    - `dal/` — Data Access Layer
    - `db/migrations/` — Drizzle 迁移文件
    - `dto/` — Data Transfer Objects
    - `lib/auth/` — 认证相关
    - `locales/` — 翻译 JSON 文件
    - `providers/` — React Context Providers
    - `public/` — 静态资源
    - `store/` — Zustand 状态管理
    - `types/` — TypeScript 类型定义
    - `utils/` — 工具函数

### C-2: 配置文件

- [ ] **C2** 创建 `apps/faqs-web/package.json`
    - name: `faqs-web`, type: module
    - scripts: dev (next dev -p 3000), build, start, lint (eslint --cache), typecheck, db:generate/migrate/push/studio
    - dependencies（全部使用最新版）:
        - 核心: next 16.1.6, react 19.2.4, react-dom 19.2.4
        - 状态/数据: zustand 5.0.11, swr 2.4.0, axios 1.13.6
        - 表单: react-hook-form 7.54.0, @hookform/resolvers 5.2.2, zod 4.0.5
        - 数据库: drizzle-orm 0.43.1, drizzle-kit 0.30.4, mysql2 3.11.4
        - UI: flowbite-react 0.12.17, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 2.3.0, lucide-react 0.575.0, @react-spring/web 9.7.5
        - 认证: next-auth 4.24.11, jose 6.1.3, bcrypt 5.1.1, crypto-js 4.2.0
        - 国际化: i18next 23.11.5, react-i18next 15.1.3, next-i18n-router 5.5.1, i18next-browser-languagedetector 8.0.0, i18next-resources-to-backend 1.2.1
        - 主题/加载: next-themes 0.4.4, nextjs-toploader 3.8.16
        - 日志: winston 3.19.0, winston-daily-rotate-file 5.0.0
        - 其他: server-only, node-cache, cookie, lodash
    - devDependencies: @faqs/eslint-config workspace:\*, @types/node, @types/react 19.0.0, @types/react-dom 19.0.0, @types/bcrypt, @types/crypto-js, @types/lodash, @tailwindcss/postcss 4.2.1, eslint 10.0.1, postcss 8.4.38, tailwindcss 4.2.1, typescript 5.8.2
- [ ] **C3** 创建 `apps/faqs-web/tsconfig.json`
    - extends: ../../tsconfig.base.json
    - target/module: ES2022, moduleResolution: bundler, jsx: preserve
    - 路径别名: ~/_ → ./, ~app/_ → ./app/_, ~components/_ → ./components/_, ~lib/_ → ./lib/_, ~utils/_ → ./utils/_, ~ui/_ → ./components/ui/_, ~types/_ → ./types/_, ~store/_ → ./store/_, ~dal/_ → ./dal/_, ~dto/_ → ./dto/\*
    - plugins: [{ "name": "next" }]
    - exclude: node*modules, .*/\_, components/ui
    - include: next-env.d.ts, **/\*.ts, **/\*.tsx 等
- [ ] **C4** 创建 `apps/faqs-web/eslint.config.ts`
    - globalIgnores: .next, .out, components/ui
    - 引入 @faqs/eslint-config 的 base + react 配置
    - @next/eslint-plugin-next: recommended + core-web-vitals 规则
    - 关闭: @next/next/no-img-element, jsx-a11y/anchor-is-valid, jsx-a11y/label-has-associated-control
    - languageOptions.parserOptions.tsconfigRootDir: import.meta.dirname
- [ ] **C5** 创建 `apps/faqs-web/next.config.ts`
    - output: standalone
    - pageExtensions: js/jsx/mdx/ts/tsx
    - eslint.ignoreDuringBuilds: true, typescript.ignoreBuildErrors: true
    - images.remotePatterns 配置
    - rewrites: /api/\* 代理到后端
    - 不再包含 webpack 自定义配置（Turbopack 默认）
- [ ] **C6** 创建 `apps/faqs-web/postcss.config.mjs`
    - 插件: `@tailwindcss/postcss`（替代 tailwindcss）
- [ ] **C7** 创建 `apps/faqs-web/drizzle.config.ts`
    - 使用 `defineConfig()`（非 satisfies Config）
    - dialect: `'mysql'`（非 driver: 'mysql2'）
    - 环境变量: MYSQL_HOST/PORT/USER/PASSWORD/DATABASE
    - schema: ./db/schema.ts, out: ./db/migrations
- [ ] **C8** 创建 `apps/faqs-web/i18nConfig.ts`
    - locales: ['zh', 'en'], defaultLocale: 'zh'
- [ ] **C9** 创建 `apps/faqs-web/proxy.ts`（Next.js 16 替代 middleware.ts）
    - 导出 `proxy()` 函数（非 `middleware()`）
    - i18nRouter 路由国际化
    - 认证拦截: 读取 cookie → decrypt session → 未登录重定向
    - config.matcher: `/((?!api|static|.*\\..*|_next).*)`
    - 默认运行在 Node.js runtime（非 Edge）
- [ ] **C10** 创建 `apps/faqs-web/components.json`（shadcn/ui）
    - style: new-york, rsc: true, tsx: true
    - tailwind.config 留空（Tailwind 4 CSS-first）
    - tailwind.css: app/[locale]/globals.css
    - aliases: components→~/components, utils→~/lib/utils, ui→~/components/ui, lib→~/lib, hooks→~/hooks
    - iconLibrary: lucide

### C-3: 源码文件

- [ ] **C11** 创建 `apps/faqs-web/app/[locale]/globals.css`
    - `@import "tailwindcss";`
    - `@theme {}` 自定义字体变量（--font-inter, --font-lexend）
- [ ] **C12** 创建 `apps/faqs-web/app/[locale]/layout.tsx`
    - 根布局组件
    - 引入 globals.css
    - 字体加载（Inter / Lexend）
    - 包裹: ThemeProvider (next-themes)、TopLoader (nextjs-toploader)
    - html lang 从 params.locale 获取
- [ ] **C13** 创建 `apps/faqs-web/app/[locale]/page.tsx`
    - 首页占位内容
- [ ] **C14** 创建 `apps/faqs-web/lib/utils.ts`
    - `cn()` 函数: clsx + tailwind-merge
- [ ] **C15** 创建 `apps/faqs-web/.env.local` 模板
    - MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
    - AUTH_SECRET
    - NEXT_PUBLIC_APP_URL
- [ ] **C16** 创建 `apps/faqs-web/lint-staged.config.mjs`（应用级覆盖）
    - ESM 格式
    - `import.meta.dirname` 替代 `__dirname`
    - js/jsx/ts/tsx 执行 getEslintFixCmd（fix, cache, maxWarnings:25）
    - json/md/css 等执行 prettier --write

---

## 阶段 D：集成 & 验证

### D-1: Turbo 任务注册

- [ ] **D1** 在 `turbo.json` 中添加应用专属任务
    - `build-faqs-web`: dependsOn `faqs-web#build`, cache:false
    - `start-faqs-web`: dependsOn `faqs-web#start`, cache:false, persistent:true
    - 在根 `package.json` scripts 中添加:
        - `"build-faqs-web": "turbo run build-faqs-web"`
        - `"start-faqs-web": "turbo run start-faqs-web"`

### D-2: pnpm 10 特殊处理

- [ ] **D2** 在根 `package.json` 中添加 `pnpm.onlyBuiltDependencies` 白名单
    - 需要 postinstall 的包: husky, bcrypt, esbuild, sharp 等（根据实际安装报错调整）

### D-3: 依赖安装

- [ ] **D3** 运行 `pnpm install` 安装全部 workspace 依赖
    - 确认无依赖解析错误
    - 确认 pnpm 10 的 lifecycle scripts 阻止提示已正确处理

### D-4: Git Hooks 配置

- [ ] **D4** 初始化 Husky 并配置 hooks
    - 运行 `pnpm exec husky init`
    - 创建 `.husky/commit-msg`: `pnpm exec commitlint --edit "$1"`
    - 创建 `.husky/pre-commit`: `pnpm run g:lint-staged-files`

### D-5: 验证

- [ ] **D5** 运行 `pnpm turbo run lint` — 验证 ESLint 10 flat config 无报错
- [ ] **D6** 运行 `pnpm turbo run typecheck` — 验证 TypeScript 编译无报错
- [ ] **D7** 运行 `pnpm turbo run dev --filter=faqs-web` — 验证开发服务器启动
    - 浏览器访问 `http://localhost:3000` 页面正常渲染
- [ ] **D8** 运行 `pnpm turbo run build --filter=faqs-web` — 验证生产构建成功

---

## 排期计划

按任务依赖关系和工作量，将全部初始化工作分为 4 个批次，线性依赖、顺序执行。

### 批次 1：Monorepo 根基础设施（阶段 A）

| 项目     | 说明                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 任务范围 | A1 ~ A11（2 个目录 + 12 个配置文件）                                                                                                                |
| 预估工时 | ~1 小时                                                                                                                                             |
| 前置依赖 | 无，可立即开始                                                                                                                                      |
| 产出     | 根目录全部基础设施配置就绪（package.json、turbo.json、tsconfig.base.json、ESLint flat config、Prettier、lint-staged、.gitignore、.editorconfig 等） |

### 批次 2：共享包（阶段 B）

| 项目     | 说明                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 任务范围 | B1 ~ B6（`packages/eslint-config/` 完整包）                                               |
| 预估工时 | ~30 分钟                                                                                  |
| 前置依赖 | 批次 1 完成                                                                               |
| 产出     | `@faqs/eslint-config` 包可供应用引用（含 base、react、next、prettier 四个可组合配置导出） |

### 批次 3：Next.js 16 应用（阶段 C）

| 项目     | 说明                                                                                                                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 任务范围 | C1 ~ C16（目录结构 + 配置文件 + 源码文件）                                                                                                |
| 预估工时 | ~1.5 小时                                                                                                                                 |
| 前置依赖 | 批次 2 完成（ESLint 配置依赖共享包）                                                                                                      |
| 产出     | `apps/faqs-web/` 完整应用骨架（package.json、tsconfig、eslint.config.ts、next.config.ts、proxy.ts、globals.css、layout.tsx、page.tsx 等） |

### 批次 4：集成与验证（阶段 D）

| 项目     | 说明                                                    |
| -------- | ------------------------------------------------------- |
| 任务范围 | D1 ~ D8（Turbo 任务注册 + pnpm install + Husky + 验证） |
| 预估工时 | ~30 分钟                                                |
| 前置依赖 | 批次 3 完成                                             |
| 产出     | 项目可运行、可构建、lint 和 typecheck 通过              |

### 总计

|            |                                                        |
| ---------- | ------------------------------------------------------ |
| 总任务数   | 39 项（A11 + B6 + C16 + D8，含 2 项目录创建 - 去重后） |
| 总预估工时 | ~3.5 小时                                              |
| 执行方式   | 批次 1 → 2 → 3 → 4 线性顺序                            |
