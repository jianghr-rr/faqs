import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
    client: ReturnType<typeof postgres> | undefined;
};

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getDb() {
    if (dbInstance) {
        return dbInstance;
    }

    const connectionUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
    if (!connectionUrl) {
        throw new Error('Missing DATABASE_URL or DIRECT_URL');
    }

    const client =
        globalForDb.client ??
        postgres(connectionUrl, {
            prepare: false,
            // Keep runtime DB usage conservative to avoid exhausting
            // Supabase/Postgres connection limits under burst traffic.
            max: 5,
        });

    if (process.env.NODE_ENV !== 'production') {
        globalForDb.client = client;
    }

    dbInstance = drizzle(client, {schema});
    return dbInstance;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get(_target, prop, receiver) {
        return Reflect.get(getDb(), prop, receiver);
    },
});
