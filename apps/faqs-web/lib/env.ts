import {z} from 'zod';

const envSchema = z.object({
    DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
    DIRECT_URL: z.string().url('DIRECT_URL must be a valid PostgreSQL connection string').optional(),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase project URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
    API_BASE_URL: z.string().url().optional().default('http://localhost:8080'),
    NEXT_PUBLIC_APP_URL: z.string().url().optional().default('http://localhost:3000'),

    // News
    FINNHUB_API_KEY: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    NEWS_FETCH_INTERVAL_MS: z.coerce.number().positive().optional().default(300_000),
    NEWS_MAX_AGE_DAYS: z.coerce.number().positive().optional().default(30),
    NEWS_AI_SUMMARY_ENABLED: z
        .enum(['true', 'false'])
        .optional()
        .default('false')
        .transform((v) => v === 'true'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().url().optional(),
    OPENAI_MODEL: z.string().optional().default('gpt-4o-mini'),
    RESEARCH_REPORT_PROMPT_VERSION: z.enum(['v1', 'v2']).optional().default('v2'),
    RESEARCH_REPORT_AB_COMPARE_ENABLED: z
        .enum(['true', 'false'])
        .optional()
        .default('false')
        .transform((v) => v === 'true'),
    OPENAI_HINTS_TIMEOUT_MS: z.coerce.number().positive().optional().default(8000),
    OPENAI_MENTION_TIMEOUT_MS: z.coerce.number().positive().optional().default(8000),
    OPENAI_REPORT_TIMEOUT_MS: z.coerce.number().positive().optional().default(10000),
    OPENAI_REPORT_SELF_CHECK_TIMEOUT_MS: z.coerce.number().positive().optional().default(5000),
    TAVILY_API_KEY: z.string().optional(),
    TAVILY_ALLOWED_DOMAINS: z.string().optional(),
    TAVILY_CACHE_TTL_SECONDS: z.coerce.number().positive().optional().default(1800),
    TAVILY_MAX_RESULTS: z.coerce.number().positive().optional().default(5),
    TAVILY_TIMEOUT_MS: z.coerce.number().positive().optional().default(2500),
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
