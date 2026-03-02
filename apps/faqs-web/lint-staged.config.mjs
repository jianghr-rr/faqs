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
