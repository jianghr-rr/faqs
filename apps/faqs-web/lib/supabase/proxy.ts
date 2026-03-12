import {type NextRequest, NextResponse} from 'next/server';
import {createServerClient} from '@supabase/ssr';

const AUTH_LOOKUP_TIMEOUT_MS = 1500;

function isExpectedAnonymousAuthError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    const maybeAuthError = error as {name?: string; code?: string; cause?: {code?: string}};
    return (
        maybeAuthError.name === 'AuthSessionMissingError' ||
        maybeAuthError.code === 'AuthSessionMissingError' ||
        maybeAuthError.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'
    );
}

export async function updateSession(request: NextRequest, response: NextResponse) {
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({name, value, options}) => {
                        request.cookies.set(name, value);
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    const authRequest = supabase.auth.getUser().catch((error) => ({
        data: {user: null},
        error,
    }));

    const authResult = await Promise.race([
        authRequest,
        new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), AUTH_LOOKUP_TIMEOUT_MS);
        }),
    ]);

    if (authResult === null) {
        console.warn(
            `[proxy] auth lookup timed out after ${AUTH_LOOKUP_TIMEOUT_MS}ms; continuing without blocking`
        );
        return {supabase, user: null, response, authError: true};
    }

    const {
        data: {user},
        error,
    } = authResult;

    if (error) {
        if (isExpectedAnonymousAuthError(error)) {
            return {supabase, user: null, response, authError: true};
        }
        console.error('[proxy] auth lookup failed:', error);
        return {supabase, user: null, response, authError: true};
    }

    return {supabase, user, response, authError: false};
}
