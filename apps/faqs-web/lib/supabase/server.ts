import 'server-only';

import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {cache} from 'react';
import type {AppUser} from '~/lib/auth/types';
import {getLocalSessionUser} from '~/lib/auth/local-server';

const AUTH_LOOKUP_TIMEOUT_MS = 1500;

function isAuthConnectTimeout(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    const cause = error.cause as {code?: string} | undefined;
    return cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed');
}

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
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
                        // setAll is called from a Server Component where cookies
                        // cannot be modified — safe to ignore.
                    }
                },
            },
        }
    );
}

export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
    try {
        const localUser = await getLocalSessionUser();
        if (localUser) {
            return localUser;
        }

        const supabase = await createClient();
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
                `[auth] getCurrentUser timed out after ${AUTH_LOOKUP_TIMEOUT_MS}ms; continuing as logged-out`
            );
            return null;
        }

        const {
            data: {user},
            error,
        } = authResult;

        if (error) {
            if (isAuthConnectTimeout(error)) {
                console.warn('[auth] getCurrentUser network timeout; continuing as logged-out');
                return null;
            }
            console.error('[auth] getCurrentUser failed:', error);
            return null;
        }

        if (!user?.id || !user.email) {
            return null;
        }

        return {
            id: user.id,
            email: user.email,
            name:
                user.user_metadata?.name ??
                user.user_metadata?.full_name ??
                user.email.split('@')[0] ??
                (user.phone ? `****${user.phone.replace(/\D/g, '').slice(-4)}` : '用户'),
            avatar: user.user_metadata?.avatar_url,
            phone: user.phone ?? undefined,
            role: 'viewer',
            authSource: 'supabase',
        } satisfies AppUser;
    } catch (error) {
        console.error('[auth] getCurrentUser crashed:', error);
        return null;
    }
});
