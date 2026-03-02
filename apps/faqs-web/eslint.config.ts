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
