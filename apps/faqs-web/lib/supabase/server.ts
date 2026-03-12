import 'server-only';

import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {cache} from 'react';

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

export const getCurrentUser = cache(async () => {
    try {
        const supabase = await createClient();
        const {
            data: {user},
            error,
        } = await supabase.auth.getUser();

        if (error) {
            console.error('[auth] getCurrentUser failed:', error);
            return null;
        }

        return user;
    } catch (error) {
        console.error('[auth] getCurrentUser crashed:', error);
        return null;
    }
});
