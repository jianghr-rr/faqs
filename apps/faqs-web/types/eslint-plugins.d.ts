declare module '@next/eslint-plugin-next' {
    import type {ESLint} from 'eslint';
    interface NextPluginConfig {
        rules: Record<string, unknown>;
    }
    const plugin: ESLint.Plugin & {
        configs: {
            recommended: NextPluginConfig;
            'core-web-vitals': NextPluginConfig;
            [key: string]: NextPluginConfig;
        };
    };
    export default plugin;
}
