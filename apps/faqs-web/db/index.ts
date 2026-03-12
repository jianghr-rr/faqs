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

    dbInstance = drizzle(client, {schema});
    return dbInstance;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get(_target, prop, receiver) {
        return Reflect.get(getDb(), prop, receiver);
    },
});
