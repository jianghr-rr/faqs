'use server';

import {redirect} from 'next/navigation';
import {headers} from 'next/headers';
import {createClient} from '~/lib/supabase/server';

const EXTERNAL_TIMEOUT_MESSAGE = '链接外网容易超时，请重试';

function getOrigin(headersList: Awaited<ReturnType<typeof headers>>): string {
    const appUrl = process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) return appUrl;
    const origin = headersList.get('origin');
    if (origin) return origin;
    const host = headersList.get('x-forwarded-host') ?? headersList.get('host') ?? 'localhost:3000';
    const proto = headersList.get('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
}

function normalizeAuthError(error: unknown): string {
    if (error instanceof Error) {
        const message = `${error.name} ${error.message}`.toLowerCase();
        const cause =
            typeof error.cause === 'object' && error.cause !== null ? JSON.stringify(error.cause) : '';
        const combined = `${message} ${cause}`.toLowerCase();

        if (
            combined.includes('fetch failed') ||
            combined.includes('connecttimeouterror') ||
            combined.includes('und_err_connect_timeout') ||
            combined.includes('etimedout') ||
            combined.includes('enotfound')
        ) {
            return EXTERNAL_TIMEOUT_MESSAGE;
        }

        return error.message;
    }

    return '登录失败，请重试';
}

export async function signInWithMagicLink(email: string) {
    try {
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
    } catch (error) {
        return {error: normalizeAuthError(error)};
    }
}

export async function signInWithOAuth(provider: 'github' | 'google') {
    try {
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
    } catch (error) {
        return {error: normalizeAuthError(error)};
    }
}

export async function sendPhoneOtp(phone: string) {
    const supabase = await createClient();

    const {error} = await supabase.auth.signInWithOtp({
        phone,
        options: {shouldCreateUser: true},
    });

    if (error) {
        return {error: error.message};
    }

    return {success: true};
}

export async function verifyPhoneOtp(phone: string, token: string, next?: string) {
    const supabase = await createClient();

    const {error} = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
    });

    if (error) {
        return {error: error.message};
    }

    redirect(next && next.startsWith('/') ? next : '/');
}

export async function signInWithPassword(email: string, password: string, next?: string) {
    try {
        const supabase = await createClient();

        const {error} = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return {error: error.message};
        }

        redirect(next && next.startsWith('/') ? next : '/');
    } catch (error) {
        return {error: normalizeAuthError(error)};
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

    const name =
        user.user_metadata?.name ??
        user.user_metadata?.full_name ??
        user.email?.split('@')[0] ??
        (user.phone ? `****${user.phone.replace(/\D/g, '').slice(-4)}` : '用户');

    return {
        id: user.id,
        email: user.email,
        phone: user.phone ?? undefined,
        name,
        avatar: user.user_metadata?.avatar_url,
    };
}
