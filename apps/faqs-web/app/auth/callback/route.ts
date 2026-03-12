import {NextResponse} from 'next/server';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';

const AUTH_EXCHANGE_TIMEOUT_MS = 5000;

export async function GET(request: Request) {
    const url = new URL(request.url);
    const searchParams = url.searchParams;
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    const origin =
        process.env.APP_ORIGIN ??
        process.env.NEXT_PUBLIC_APP_URL ??
        `${url.protocol}//${request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host}`;

    if (code) {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll: () => cookieStore.getAll(),
                    setAll: (cookiesToSet) => {
                        try {
                            cookiesToSet.forEach(({name, value, options}) => {
                                cookieStore.set(name, value, options);
                            });
                        } catch {
                            // Called from Server Component — safe to ignore
                        }
                    },
                },
            }
        );

        try {
            const exchangeRequest = supabase.auth.exchangeCodeForSession(code);
            const exchangeResult = await Promise.race([
                exchangeRequest,
                new Promise<null>((resolve) => {
                    setTimeout(() => resolve(null), AUTH_EXCHANGE_TIMEOUT_MS);
                }),
            ]);

            if (exchangeResult === null) {
                console.warn(
                    `[auth/callback] exchangeCodeForSession timed out after ${AUTH_EXCHANGE_TIMEOUT_MS}ms`
                );
                const timeoutUrl = new URL(`${origin}/login`);
                timeoutUrl.searchParams.set('error', 'auth_exchange_timeout');
                return NextResponse.redirect(timeoutUrl.toString());
            }

            const {error} = exchangeResult;
            if (!error) {
                return NextResponse.redirect(`${origin}${next}`);
            }

            console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
            const errorUrl = new URL(`${origin}/login`);
            errorUrl.searchParams.set('error', error.message);
            return NextResponse.redirect(errorUrl.toString());
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[auth/callback] exchangeCodeForSession crashed:', message);
            const errorUrl = new URL(`${origin}/login`);
            errorUrl.searchParams.set('error', 'auth_exchange_failed');
            return NextResponse.redirect(errorUrl.toString());
        }
    }

    return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
