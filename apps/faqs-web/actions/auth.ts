'use server';

import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {createClient} from '~/lib/supabase/server';

function getOrigin(headersList: Awaited<ReturnType<typeof headers>>): string {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    const origin = headersList.get('origin');
    if (origin) return origin;
    const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost:3000';
    const proto = headersList.get('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
}

export async function signInWithMagicLink(email: string) {
    const supabase = await createClient();
    const headersList = await headers();
    const origin = getOrigin(headersList);

    const {error} = await supabase.auth.signInWithOtp({
        email,
        options: {
            shouldCreateUser: true,
            emailRedirectTo: `${origin}/auth/callback`,
        },
    });

    if (error) {
        return {error: error.message};
    }

    return {success: true};
}

export async function signInWithOAuth(provider: 'github' | 'google') {
    const supabase = await createClient();
    const headersList = await headers();
    const origin = getOrigin(headersList);

    const {data, error} = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: `${origin}/auth/callback`,
        },
    });

    if (error) {
        return {error: error.message};
    }

    if (data.url) {
        redirect(data.url);
    }
}

export async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/');
}

export async function getCurrentProfile() {
    const supabase = await createClient();

    const {
        data: {user},
    } = await supabase.auth.getUser();

    if (!user) return null;

    return {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? user.email?.split('@')[0],
        avatar: user.user_metadata?.avatar_url,
    };
}
