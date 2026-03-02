// @ts-check
import {concatFilesForPrettier} from './lint-staged.common.js';

/** @type {Record<string, (filenames: string[]) => string | string[] | Promise<string | string[]>>} */
const rules = {
    '**/*.{json,md,mdx,css,html,yml,yaml,scss,ts,js,tsx,jsx,mjs}': (filenames) => {
        return [`prettier --write ${concatFilesForPrettier(filenames)}`];
    },
};

export default rules;
