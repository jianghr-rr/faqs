import {fixupPluginRules} from '@eslint/compat';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import type {Linter} from 'eslint';

export const react: Linter.Config[] = [
    {
        plugins: {
            react: fixupPluginRules(reactPlugin),
            'react-hooks': fixupPluginRules(reactHooksPlugin),
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
