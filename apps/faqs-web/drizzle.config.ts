import {defineConfig} from 'drizzle-kit';

if (
    !process.env.MYSQL_HOST ||
    !process.env.MYSQL_PORT ||
    !process.env.MYSQL_USER ||
    !process.env.MYSQL_PASSWORD ||
    !process.env.MYSQL_DATABASE
) {
    throw new Error('Missing MySQL configuration environment variables');
}

export default defineConfig({
    schema: './db/schema.ts',
    out: './db/migrations',
    dialect: 'mysql',
    dbCredentials: {
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
    },
});
