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
