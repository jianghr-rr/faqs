import nextPlugin from '@next/eslint-plugin-next';
import type {Linter} from 'eslint';

export const next: Linter.Config[] = [
    {
        plugins: {
            '@next/next': nextPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
        },
    },
];
