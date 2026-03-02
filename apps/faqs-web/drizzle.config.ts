import {existsSync} from 'node:fs';
import {defineConfig} from 'drizzle-kit';

if (existsSync('.env.local')) {
    // loadEnvFile is available in Node 20.12+
    (process as unknown as {loadEnvFile: (path: string) => void}).loadEnvFile('.env.local');
}

if (!process.env.DIRECT_URL) {
    throw new Error('Missing DIRECT_URL environment variable for database migrations');
}

export default defineConfig({
    schema: './db/schema.ts',
    out: './db/migrations',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DIRECT_URL,
    },
});
