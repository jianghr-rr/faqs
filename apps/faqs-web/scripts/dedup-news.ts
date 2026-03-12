/**
 * One-time script to remove duplicate news rows before adding the unique constraint.
 *
 * Usage:
 *   npx tsx scripts/dedup-news.ts
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
    const before = await sql`SELECT count(*) AS cnt FROM news`;
    console.log(`[dedup] news rows before: ${before[0]?.cnt}`);

    await sql`
        DELETE FROM news
        WHERE id NOT IN (
            SELECT DISTINCT ON (title, source) id
            FROM news
            ORDER BY title, source, created_at ASC
        )
    `;

    const after = await sql`SELECT count(*) AS cnt FROM news`;
    const removed = Number(before[0]?.cnt) - Number(after[0]?.cnt);
    console.log(`[dedup] removed ${removed} duplicate rows`);
    console.log(`[dedup] news rows after: ${after[0]?.cnt}`);

    await sql.end();
}

main().catch((err) => {
    console.error('[dedup] failed:', err);
    process.exit(1);
});
