# Monorepo 项目初始化指南

本文档描述如何按照现有 monorepo 架构初始化 `faqs` 项目。参考项目：`/Users/jianghaoran/self/monorepo` 和 `/Users/jianghaoran/self/sun`。

> **最后更新：2026-02-28**

## 修订记录（2026-02-28）

- 修正 Turbo 示例任务：`start-<app-name>` 的 `dependsOn` 从 `<app-name>#dev` 调整为 `<app-name>#start`，避免与生产启动语义冲突。
- 保持与执行清单一致：应用专属任务命名仍沿用 `build-<app-name>` / `start-<app-name>`，仅修复依赖链配置。

---

## 0. 相对原始 monorepo 的重大架构变更

以下是相比原始 `monorepo`/`sun` 项目的关键升级点，初始化时必须注意：

| 变更项                | 旧版                  | 新版                                        | 影响                                                        |
| --------------------- | --------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| **ESLint**            | 8.x + `.eslintrc.cjs` | **10.x + `eslint.config.ts` (flat config)** | 配置格式完全重写，eslintrc 已被移除                         |
| **pnpm**              | 9.x                   | **10.x**                                    | 生命周期脚本默认阻止，哈希算法改为 SHA256                   |
| **Node.js**           | >=18.0.0              | **>=20.19.0**                               | ESLint 10 要求 Node.js >=20.19.0                            |
| **Tailwind CSS**      | 3.x                   | **4.x**                                     | 配置方式变化，CSS-first 配置，不再需要 `tailwind.config.ts` |
| **lint-staged**       | 15.x                  | **16.x**                                    | 主版本升级                                                  |
| **TypeScript**        | 5.4.x                 | **5.8.x** (稳定) / 6.0 (beta)               | 新特性，6.0 是最后一个 JS 编译器版本                        |
| **tsup**              | 8.x                   | 已停止维护，迁移到 **tsdown**               | 构建工具替换                                                |
| **typescript-eslint** | 7.x                   | **8.x**                                     | 支持 ESLint 10 flat config                                  |

---

## 1. 技术栈概览

| 工具              | 版本                 | 用途                                              |
| ----------------- | -------------------- | ------------------------------------------------- |
| Node.js           | >=20.19.0 (LTS 24.x) | 运行时                                            |
| pnpm              | 10.30.x              | 包管理器（workspace 支持）                        |
| Turborepo         | 2.8.x                | 构建编排、任务缓存                                |
| TypeScript        | 5.8.x                | 类型系统                                          |
| ESLint            | 10.x                 | 代码规范检查（flat config）                       |
| typescript-eslint | 8.x                  | TypeScript ESLint 解析器与规则                    |
| Prettier          | 3.8.x                | 代码格式化                                        |
| Husky             | 9.1.x                | Git Hooks                                         |
| lint-staged       | 16.x                 | 仅对暂存文件执行 lint                             |
| Changesets        | 2.27.x               | 版本管理与发布                                    |
| Next.js           | 16.1.x               | React 框架（Turbopack 默认、proxy.ts、use cache） |
| React             | 19.2.x               | UI 库                                             |
| Tailwind CSS      | 4.2.x                | CSS 框架                                          |
| Vitest            | 3.1.x                | 测试框架                                          |
| tsdown            | latest               | TypeScript 库构建工具（替代 tsup）                |

---

## 2. 初始化步骤

### 2.1 创建根目录结构

```
faqs/
├── apps/                    # 应用目录
├── packages/                # 共享包目录
├── package.json             # 根 package.json
├── pnpm-workspace.yaml      # pnpm workspace 配置
├── turbo.json               # Turborepo 配置
├── tsconfig.base.json       # 共享 TypeScript 基础配置
├── .npmrc                   # pnpm 配置
├── .prettierrc.js           # Prettier 配置
├── .prettierignore          # Prettier 忽略文件
├── .gitignore               # Git 忽略文件
├── lint-staged.config.js    # lint-staged 根配置
├── lint-staged.common.js    # lint-staged 公共工具函数
├── eslint.config.ts         # ESLint flat config（根级）
└── .editorconfig            # 编辑器配置
```

> **注意**：不再有 `.eslintrc.cjs`，ESLint 10 只支持 `eslint.config.ts` / `eslint.config.js`。

### 2.2 根 `package.json`

```json
{
    "name": "faqs",
    "version": "1.0.0",
    "private": true,
    "type": "module",
    "packageManager": "pnpm@10.30.3",
    "scripts": {
        "deps:check": "npx npm-check-updates@latest --configFileName ncurc.yml --workspaces --root --mergeConfig",
        "deps:update": "npx npm-check-updates@latest --configFileName ncurc.yml -u --workspaces --root --mergeConfig",
        "g:lint": "TIMING=1 turbo run lint --cache-dir=.cache/turbo --color",
        "g:lint-staged-files": "lint-staged --allow-empty"
    },
    "devDependencies": {
        "@changesets/changelog-github": "0.5.0",
        "@changesets/cli": "2.27.1",
        "@commitlint/cli": "19.2.1",
        "@commitlint/config-conventional": "19.1.0",
        "@types/shell-quote": "1.7.5",
        "@types/node": "20.11.30",
        "cross-env": "7.0.3",
        "eslint": "10.0.1",
        "husky": "9.1.7",
        "lint-staged": "16.2.7",
        "npm-run-all2": "6.1.2",
        "prettier": "3.8.1",
        "rimraf": "5.0.5",
        "shell-quote": "1.8.1",
        "syncpack": "12.3.0",
        "turbo": "2.8.11",
        "typescript": "5.8.2",
        "typescript-eslint": "8.56.1"
    },
    "engines": {
        "node": ">=20.19.0",
        "npm": "please-use-pnpm"
    },
    "workspaces": ["apps/*", "packages/*"]
}
```

> **注意**：
>
> - `"npm": "please-use-pnpm"` 是一个约定性字段，用于阻止开发者使用 npm 安装依赖。
> - `"type": "module"` 启用 ESM，与 ESLint flat config (`eslint.config.ts`) 配合使用。
> - pnpm 10.x 默认阻止 lifecycle scripts，如需允许特定包运行脚本，在 `.npmrc` 中配置 `onlyBuiltDependencies`。

### 2.3 `pnpm-workspace.yaml`

```yaml
packages:
    - 'apps/*'
    - 'packages/*'
```

### 2.4 `.npmrc`

```
auto-install-peers=true
strict-peer-dependencies=false
```

> **pnpm 10 注意**：pnpm 10 默认禁止依赖的生命周期脚本（`postinstall` 等）。如果某些包需要运行 postinstall（如 `husky`、`esbuild`、`sharp` 等），需要在 `package.json` 中添加：
>
> ```json
> {
>     "pnpm": {
>         "onlyBuiltDependencies": ["husky", "esbuild", "sharp"]
>     }
> }
> ```

### 2.5 `turbo.json`

```json
{
    "$schema": "https://turbo.build/schema.json",
    "tasks": {
        "test": {},
        "test-unit": {},
        "dev": {
            "cache": false
        },
        "start": {
            "cache": false,
            "persistent": true
        },
        "build": {
            "dependsOn": ["^build"],
            "inputs": ["$TURBO_DEFAULT$", ".env*"],
            "outputs": ["dist", ".next/**", "!.next/cache/**"]
        },
        "lint": {
            "env": ["TIMING"]
        },
        "typecheck": {},
        "clean": {
            "cache": false
        }
    }
}
```

当需要为特定应用添加构建/启动任务时，追加如下模式：

```json
{
    "build-<app-name>": {
        "dependsOn": ["<app-name>#build"],
        "cache": false
    },
    "start-<app-name>": {
        "dependsOn": ["<app-name>#start"],
        "cache": false,
        "persistent": true
    }
}
```

同时在根 `package.json` 的 `scripts` 中对应添加：

```json
{
    "build-<app-name>": "turbo run build-<app-name>",
    "start-<app-name>": "turbo run start-<app-name>"
}
```

### 2.6 `tsconfig.base.json`

所有子包和应用都继承此配置。

```json
{
    "$schema": "https://json.schemastore.org/tsconfig",
    "compilerOptions": {
        "moduleResolution": "bundler",
        "verbatimModuleSyntax": true,
        "strict": true,
        "useUnknownInCatchVariables": true,
        "noImplicitOverride": true,
        "noUncheckedIndexedAccess": true,
        "allowUnreachableCode": false,
        "noFallthroughCasesInSwitch": true,
        "forceConsistentCasingInFileNames": true,
        "allowJs": true,
        "resolveJsonModule": true,
        "skipLibCheck": true,
        "noEmit": true,
        "esModuleInterop": true,
        "incremental": true,
        "newLine": "lf",
        "target": "ES2022",
        "lib": ["ES2022"]
    },
    "exclude": ["**/node_modules", "**/.*/"]
}
```

> **变更说明**：
>
> - `moduleResolution` 从 `"node"` 改为 `"bundler"`，与现代打包工具更好配合。
> - 新增 `target` 和 `lib` 为 `ES2022`，匹配 Node.js 20+ 支持的特性。

### 2.7 `.prettierrc.js`

独立配置（推荐新项目使用）：

```javascript
/** @type {import('prettier').Config} */
export default {
    singleQuote: true,
    tabWidth: 4,
    printWidth: 120,
    bracketSpacing: false,
    overrides: [
        {
            files: '*.md',
            options: {
                quoteProps: 'preserve',
            },
        },
    ],
};
```

> 如果复用了 `@bid-np/eslint-config-bases` 包，也可以使用其提供的 `getPrettierConfig()` 方法。

### 2.8 `.prettierignore`

```
**/.yarn
**/.next
**/.out
**/dist
**/build
**/.tmp
**/.cache
**/.turbo
```

### 2.9 `lint-staged.config.js`

```javascript
// @ts-check
import {concatFilesForPrettier} from './lint-staged.common.js';

/** @type {Record<string, (filenames: string[]) => string | string[] | Promise<string | string[]>>} */
const rules = {
    '**/*.{json,md,mdx,css,html,yml,yaml,scss,ts,js,tsx,jsx,mjs}': (filenames) => {
        return [`prettier --write ${concatFilesForPrettier(filenames)}`];
    },
};

export default rules;
```

### 2.10 `lint-staged.common.js`

```javascript
// @ts-check
import path from 'node:path';
import {quote as escape} from 'shell-quote';

const isWin = process.platform === 'win32';

const eslintGlobalRulesForFix = ['react-hooks/exhaustive-deps: off'];

/**
 * @param {{cwd: string, files: string[], fix: boolean, fixType?: ('problem'|'suggestion'|'layout'|'directive')[], cache: boolean, rules?: string[], maxWarnings?: number}} params
 */
export const getEslintFixCmd = ({cwd, files, rules, fix, fixType, cache, maxWarnings}) => {
    const cliRules = [...(rules ?? []), ...eslintGlobalRulesForFix]
        .filter((rule) => rule.trim().length > 0)
        .map((r) => `"${r.trim()}"`);

    const cliFixType = [...(fixType ?? ['layout'])].filter((type) => type.trim().length > 0);

    const args = [
        cache ? '--cache' : '',
        fix ? '--fix' : '',
        cliFixType.length > 0 ? `--fix-type ${cliFixType.join(',')}` : '',
        maxWarnings !== undefined ? `--max-warnings=${maxWarnings}` : '',
        cliRules.length > 0 ? `--rule ${cliRules.join('--rule ')}` : '',
        files.map((f) => `"./${path.relative(cwd, f)}"`).join(' '),
    ].join(' ');
    return `eslint ${args}`;
};

export const concatFilesForPrettier = (filenames) =>
    filenames.map((filename) => `"${isWin ? filename : escape([filename])}"`).join(' ');

export const concatFilesForStylelint = concatFilesForPrettier;
```

### 2.11 `eslint.config.ts`（根级 ESLint flat config）

ESLint 10 强制使用 flat config 格式，不再支持 `.eslintrc.*`。

```typescript
import {defineConfig, globalIgnores} from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default defineConfig([
    globalIgnores(['**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**', '**/.cache/**', '**/.turbo/**']),
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
        },
    },
]);
```

> **架构说明**：
>
> - ESLint 10 从被 lint 文件所在目录开始向上查找 `eslint.config.ts`，这在 monorepo 中非常有用：每个应用可以有自己的 `eslint.config.ts`，也可以继承根配置。
> - 使用 `defineConfig()` 获得类型安全，支持自动展平嵌套配置和 `extends` 特性。
> - `projectService: true` 是 typescript-eslint 8.x 推荐的新方式，替代手动指定 `project` 路径。

### 2.12 `.gitignore`

```
node_modules
.next
.out
dist
build
.tmp
.cache
.turbo
*.tsbuildinfo
.env*.local
.pnpm-store
```

### 2.13 `.editorconfig`

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

---

## 3. 创建共享包 (packages/)

### 3.1 ESLint 共享配置包（flat config 版）

ESLint 10 下共享配置包的结构发生了根本性变化。不再使用 `extends` 字符串数组，而是导出配置对象数组。

创建 `packages/eslint-config/`：

```
packages/eslint-config/
├── package.json
├── src/
│   ├── index.ts          # 主入口，导出所有可组合配置
│   ├── base.ts           # 基础 TypeScript 规则
│   ├── react.ts          # React 规则
│   ├── next.ts           # Next.js 规则
│   └── prettier.ts       # Prettier 集成
└── tsconfig.json
```

**`package.json`**：

```json
{
    "name": "@faqs/eslint-config",
    "version": "1.0.0",
    "private": true,
    "type": "module",
    "exports": {
        ".": "./src/index.ts",
        "./base": "./src/base.ts",
        "./react": "./src/react.ts",
        "./next": "./src/next.ts",
        "./prettier": "./src/prettier.ts"
    },
    "dependencies": {
        "@eslint/js": "^10.0.0",
        "typescript-eslint": "^8.56.0",
        "eslint-plugin-react": "^7.37.0",
        "eslint-plugin-react-hooks": "^5.0.0",
        "eslint-config-prettier": "^10.0.0",
        "eslint-plugin-prettier": "^5.2.0",
        "@next/eslint-plugin-next": "^15.5.0"
    },
    "peerDependencies": {
        "eslint": "^10.0.0",
        "prettier": "^3.8.0",
        "typescript": "^5.8.0"
    },
    "devDependencies": {
        "eslint": "10.0.1",
        "prettier": "3.8.1",
        "typescript": "5.8.2"
    }
}
```

**`src/base.ts` 示例**：

```typescript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import type {Linter} from 'eslint';

export const base: Linter.Config[] = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    },
];
```

**`src/react.ts` 示例**：

```typescript
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import type {Linter} from 'eslint';

export const react: Linter.Config[] = [
    {
        plugins: {
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
        },
        rules: {
            ...reactPlugin.configs.recommended.rules,
            ...reactHooksPlugin.configs.recommended.rules,
            'react/react-in-jsx-scope': 'off',
            'react/prop-types': 'off',
        },
        settings: {
            react: {version: 'detect'},
        },
    },
];
```

### 3.2 工具函数共享包

创建 `packages/ts-utils/`：

```
packages/ts-utils/
├── package.json
├── tsconfig.json
├── eslint.config.ts
├── src/
│   └── index.ts
```

**`package.json` 模板**：

```json
{
    "name": "@faqs/ts-utils",
    "version": "1.0.0",
    "private": true,
    "sideEffects": false,
    "type": "module",
    "exports": {
        ".": {
            "types": "./dist/index.d.ts",
            "default": "./dist/index.js"
        },
        "./package.json": "./package.json"
    },
    "scripts": {
        "build": "tsdown",
        "dev": "tsdown --watch",
        "clean": "rimraf ./dist ./coverage ./tsconfig.tsbuildinfo",
        "lint": "eslint --cache --cache-location ../../.cache/eslint/ts-utils.eslintcache",
        "test": "vitest run",
        "typecheck": "tsc --project ./tsconfig.json --noEmit"
    },
    "devDependencies": {
        "@faqs/eslint-config": "workspace:*",
        "eslint": "10.0.1",
        "rimraf": "5.0.5",
        "tsdown": "latest",
        "typescript": "5.8.2",
        "vitest": "3.1.2"
    },
    "engines": {
        "node": ">=20.19.0"
    }
}
```

> **变更说明**：
>
> - 构建工具从 `tsup` 更换为 `tsdown`（tsup 已停止维护，推荐迁移到 tsdown）。
> - ESLint 10 不再需要 `--ext` 参数，自动识别文件类型。
> - Vitest 升级到 3.x。

**`tsconfig.json`**（继承根配置）：

```json
{
    "$schema": "https://json.schemastore.org/tsconfig",
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
        "baseUrl": ".",
        "target": "ES2022",
        "module": "ES2022"
    },
    "include": ["src/**/*.ts"],
    "exclude": ["**/node_modules", "**/.*/"]
}
```

**`eslint.config.ts`**（包级别）：

```typescript
import {defineConfig} from 'eslint/config';
import {base} from '@faqs/eslint-config/base';

export default defineConfig([
    ...base,
    {
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
]);
```

---

## 4. 创建应用 (apps/)

### 4.1 Next.js 应用模板

以创建一个名为 `faqs-web` 的 Next.js 应用为例：

```
apps/faqs-web/
├── package.json
├── tsconfig.json
├── eslint.config.ts         # flat config（替代 .eslintrc.cjs）
├── next.config.ts
├── postcss.config.mjs
├── app/                     # App Router 目录
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css          # Tailwind 4 使用 @import "tailwindcss"
├── components/
├── lib/
├── public/
└── types/
```

> **Tailwind 4 变更**：不再需要 `tailwind.config.ts`，改为 CSS-first 配置，直接在 `globals.css` 中使用 `@import "tailwindcss"` 即可。

**`package.json`**：

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
        "typecheck": "tsc --project tsconfig.json --noEmit"
    },
    "dependencies": {
        "next": "16.1.6",
        "react": "19.2.4",
        "react-dom": "19.2.4"
    },
    "devDependencies": {
        "@faqs/eslint-config": "workspace:*",
        "@types/node": "20.11.30",
        "@types/react": "19.0.0",
        "@types/react-dom": "19.0.0",
        "@tailwindcss/postcss": "4.2.1",
        "eslint": "10.0.1",
        "postcss": "8.4.38",
        "tailwindcss": "4.2.1",
        "typescript": "5.8.2"
    }
}
```

> **变更说明**：
>
> - `@types/react` 升级到 19.x（匹配 React 19）。
> - `tailwindcss` 升级到 4.x，配合 `@tailwindcss/postcss` 使用。
> - 移除了 `eslint-config-next`，改用 `@next/eslint-plugin-next` 在 flat config 中配置。
> - ESLint `lint` 脚本不再需要 `--ext` 参数。

**`tsconfig.json`**（继承根配置，配置路径别名）：

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
            "~components/*": ["./components/*"],
            "~lib/*": ["./lib/*"],
            "~types/*": ["./types/*"]
        },
        "plugins": [{"name": "next"}]
    },
    "exclude": ["**/node_modules", "**/.*/*"],
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

**`eslint.config.ts`**（应用级 flat config）：

```typescript
import {defineConfig, globalIgnores} from 'eslint/config';
import {base} from '@faqs/eslint-config/base';
import {react} from '@faqs/eslint-config/react';
import nextPlugin from '@next/eslint-plugin-next';

export default defineConfig([
    globalIgnores(['.next/**', '.out/**']),
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

**`postcss.config.mjs`**（Tailwind 4）：

```javascript
export default {
    plugins: {
        '@tailwindcss/postcss': {},
    },
};
```

**`app/globals.css`**（Tailwind 4 CSS-first 配置）：

```css
@import 'tailwindcss';
```

> 如需自定义主题、添加自定义颜色等，直接在 CSS 中使用 `@theme` 指令：
>
> ```css
> @import 'tailwindcss';
>
> @theme {
>     --color-primary: #3b82f6;
>     --color-secondary: #10b981;
> }
> ```

---

## 5. 关键约定与模式

### 5.1 命名约定

| 类型           | 约定                         | 示例                                    |
| -------------- | ---------------------------- | --------------------------------------- |
| 应用名         | `<name>-app` 或 `<name>-web` | `faqs-web`, `admin-web`                 |
| 共享包名       | `@<org>/<name>`              | `@faqs/ts-utils`, `@faqs/eslint-config` |
| workspace 引用 | `workspace:*`                | `"@faqs/ts-utils": "workspace:*"`       |

### 5.2 端口分配

每个应用应分配独立的开发端口，避免冲突：

```
faqs-web:  3000
admin-app: 3001
...
```

### 5.3 缓存目录

统一使用 `.cache/` 存放各类缓存：

- Turbo 缓存：`.cache/turbo/`
- ESLint 缓存：`.cache/eslint/<app-name>.eslintcache`

### 5.4 跨包引用

应用引用共享包时，通过 `workspace:*` 协议：

```json
{
    "dependencies": {
        "@faqs/ts-utils": "workspace:*"
    }
}
```

TypeScript 路径映射也可指向包的源码（开发时无需构建）：

```json
{
    "paths": {
        "@faqs/ts-utils": ["../../packages/ts-utils/src/index"]
    }
}
```

---

## 6. 初始化命令序列

```bash
# 1. 进入项目目录
cd /Users/jianghaoran/self/faqs

# 2. 创建目录结构
mkdir -p apps packages

# 3. 创建根配置文件（参照上方各节内容创建）
#    - package.json
#    - pnpm-workspace.yaml
#    - turbo.json
#    - tsconfig.base.json
#    - .npmrc
#    - .prettierrc.js
#    - .prettierignore
#    - .gitignore
#    - .editorconfig
#    - lint-staged.config.js
#    - lint-staged.common.js
#    - eslint.config.ts

# 4. 安装依赖
pnpm install

# 5. 初始化 Husky（Git Hooks）
pnpm exec husky init

# 6. 配置 commit-msg hook（commitlint）
echo 'pnpm exec commitlint --edit "$1"' > .husky/commit-msg

# 7. 配置 pre-commit hook（lint-staged）
echo 'pnpm run g:lint-staged-files' > .husky/pre-commit

# 8. 验证安装
pnpm turbo run build
pnpm turbo run lint
pnpm turbo run typecheck
```

---

## 7. 添加新应用的流程

```bash
# 1. 在 apps/ 下创建应用目录
mkdir apps/<app-name>
cd apps/<app-name>

# 2. 初始化 Next.js（或其他框架）
pnpm create next-app . --typescript --tailwind --eslint --app --src-dir=false

# 3. 修改 package.json
#    - 设置 name 为 "<app-name>"
#    - 添加 "type": "module"
#    - 添加 workspace 引用的共享包依赖
#    - 设置开发端口避免冲突

# 4. 修改 tsconfig.json
#    - 继承 ../../tsconfig.base.json
#    - 配置路径别名

# 5. 创建 eslint.config.ts（flat config）
#    - 使用共享 ESLint 配置包导出的可组合配置数组
#    - 不再使用 .eslintrc.cjs

# 6. 配置 Tailwind 4
#    - 移除 tailwind.config.ts（不再需要）
#    - postcss.config.mjs 使用 @tailwindcss/postcss
#    - globals.css 使用 @import "tailwindcss"

# 7. 回到根目录，在 turbo.json 和 根 package.json 中添加对应的构建/启动任务

# 8. 重新安装依赖
cd ../..
pnpm install
```

---

## 8. 添加新共享包的流程

```bash
# 1. 创建包目录
mkdir -p packages/<package-name>/src

# 2. 创建 package.json
#    - name: "@faqs/<package-name>"
#    - private: true
#    - "type": "module"
#    - 配置 exports 字段
#    - 添加 build/dev/lint/typecheck 脚本
#    - 构建工具使用 tsdown（替代 tsup）

# 3. 创建 tsconfig.json（继承根配置）

# 4. 创建 eslint.config.ts（flat config，引用共享配置）

# 5. 在需要使用该包的应用中添加 workspace:* 依赖

# 6. 重新安装依赖
pnpm install
```

---

## 9. 常用命令速查

| 命令                                       | 说明                         |
| ------------------------------------------ | ---------------------------- |
| `pnpm install`                             | 安装所有 workspace 依赖      |
| `pnpm turbo run dev`                       | 启动所有应用的开发服务器     |
| `pnpm turbo run build`                     | 构建所有应用和包             |
| `pnpm turbo run lint`                      | 执行所有应用和包的 lint 检查 |
| `pnpm turbo run typecheck`                 | 执行所有应用和包的类型检查   |
| `pnpm turbo run dev --filter=<app-name>`   | 仅启动指定应用               |
| `pnpm turbo run build --filter=<app-name>` | 仅构建指定应用               |
| `pnpm add <pkg> --filter=<app-name>`       | 为指定应用添加依赖           |
| `pnpm add -D <pkg> -w`                     | 为根工作区添加开发依赖       |
| `pnpm run deps:check`                      | 检查所有依赖是否有更新       |
| `pnpm run deps:update`                     | 更新所有依赖版本             |
