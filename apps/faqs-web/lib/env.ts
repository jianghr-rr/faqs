import {z} from 'zod';

const envSchema = z.object({
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
    DIRECT_URL: z.string().url('DIRECT_URL must be a valid PostgreSQL connection string').optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase project URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
    API_BASE_URL: z.string().url().optional().default('http://localhost:8080'),
    NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function getEnv(): Env {
    if (!_env) {
        const result = envSchema.safeParse(process.env);
        if (!result.success) {
            const formatted = result.error.issues
                .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
                .join('\n');
            throw new Error(`Missing or invalid environment variables:\n${formatted}`);
        }
        _env = result.data;
    }
    return _env;
}
