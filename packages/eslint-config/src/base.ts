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
