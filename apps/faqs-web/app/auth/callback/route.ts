import {NextResponse} from 'next/server';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';

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

        const {error} = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }

        console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
        const errorUrl = new URL(`${origin}/login`);
        errorUrl.searchParams.set('error', error.message);
        return NextResponse.redirect(errorUrl.toString());
    }

    return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
