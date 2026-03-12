import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
    client: ReturnType<typeof postgres> | undefined;
};

const connectionUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionUrl) {
    throw new Error('Missing DIRECT_URL or DATABASE_URL');
}

const client =
    globalForDb.client ??
    postgres(connectionUrl, {
        prepare: false,
    });

if (process.env.NODE_ENV !== 'production') {
    globalForDb.client = client;
}

export const db = drizzle(client, {schema});
