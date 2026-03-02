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
