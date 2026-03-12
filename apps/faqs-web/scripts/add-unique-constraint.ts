/**
 * Add unique constraint on (title, source) to the news table.
 * Run after dedup-news.ts has removed duplicates.
 *
 * Usage:
 *   npx tsx scripts/add-unique-constraint.ts
 */

import {existsSync} from 'node:fs';

if (existsSync('.env.local')) {
    (process as unknown as {loadEnvFile: (path: string) => void}).loadEnvFile('.env.local');
}

import postgres from 'postgres';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
    console.error('Missing DIRECT_URL or DATABASE_URL');
    process.exit(1);
}

const sql = postgres(url);

async function main() {
    const existing = await sql`
        SELECT 1 FROM pg_constraint WHERE conname = 'news_title_source_unique'
    `;

    if (existing.length > 0) {
        console.log('[constraint] news_title_source_unique already exists, skipping');
        await sql.end();
        return;
    }

    console.log('[constraint] adding unique constraint on (title, source)...');
    await sql`
        ALTER TABLE "news"
        ADD CONSTRAINT "news_title_source_unique" UNIQUE("title", "source")
    `;
    console.log('[constraint] done');

    await sql.end();
}

main().catch((err) => {
    console.error('[constraint] failed:', err);
    process.exit(1);
});
