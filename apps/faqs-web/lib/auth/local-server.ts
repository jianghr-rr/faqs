import 'server-only';

import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cookies} from 'next/headers';
import {scrypt as nodeScrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import type {AppUser} from '~/lib/auth/types';
import {
    createLocalSessionToken,
    getLocalSessionCookieName,
    getLocalSessionMaxAgeSeconds,
    isLocalAuthEnabled,
    parseLocalSessionToken,
} from './local-shared';

const scrypt = promisify(nodeScrypt);

type LocalAuthAccount = {
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    role: 'admin' | 'viewer';
    avatar?: string;
};

let cachedAccounts: LocalAuthAccount[] | null = null;

function getLocalAccountsFilePath() {
    const candidates = [
        resolve(process.cwd(), 'scripts/local-auth-users.json'),
        resolve(process.cwd(), 'apps/faqs-web/scripts/local-auth-users.json'),
    ];

    return candidates.find((path) => existsSync(path)) ?? null;
}

function loadLocalAuthAccounts(): LocalAuthAccount[] {
    if (cachedAccounts !== null) {
        return cachedAccounts;
    }

    const filePath = getLocalAccountsFilePath();
    if (!filePath) {
        cachedAccounts = [];
        return cachedAccounts;
    }

    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
        if (!Array.isArray(parsed)) {
            cachedAccounts = [];
            return cachedAccounts;
        }

        const accounts: LocalAuthAccount[] = [];
        for (const item of parsed) {
            const account = item as Partial<LocalAuthAccount>;
            if (!account.id || !account.email || !account.name || !account.passwordHash) {
                continue;
            }

            accounts.push({
                id: account.id,
                email: account.email.trim().toLowerCase(),
                name: account.name,
                passwordHash: account.passwordHash,
                role: account.role === 'viewer' ? 'viewer' : 'admin',
                avatar: account.avatar,
            });
        }

        cachedAccounts = accounts;
        return cachedAccounts;
    } catch (error) {
        console.error('[auth/local] failed to parse local-auth-users.json:', error);
        cachedAccounts = [];
        return cachedAccounts;
    }
}

export function findLocalAuthAccount(email: string) {
    if (!isLocalAuthEnabled()) {
        return null;
    }

    const normalized = email.trim().toLowerCase();
    const account = loadLocalAuthAccounts().find((item) => item.email === normalized);
    if (!account) {
        return null;
    }

    return {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        avatar: account.avatar,
    } satisfies Omit<LocalAuthAccount, 'passwordHash'>;
}

export async function verifyLocalAuthPassword(email: string, password: string): Promise<AppUser | null> {
    if (!isLocalAuthEnabled()) {
        return null;
    }

    const normalized = email.trim().toLowerCase();
    const account = loadLocalAuthAccounts().find((item) => item.email === normalized);
    if (!account) {
        return null;
    }

    const [salt, expectedHex] = account.passwordHash.split(':');
    if (!salt || !expectedHex) {
        console.error('[auth/local] invalid passwordHash format for account:', account.email);
        return null;
    }

    const expected = Buffer.from(expectedHex, 'hex');
    const derived = (await scrypt(password, salt, expected.length)) as Buffer;
    if (!timingSafeEqual(expected, derived)) {
        return null;
    }

    return {
        id: account.id,
        email: account.email,
        name: account.name,
        avatar: account.avatar,
        role: account.role,
        authSource: 'local',
    };
}

export async function setLocalSession(user: AppUser) {
    const cookieStore = await cookies();
    const token = await createLocalSessionToken(user);
    cookieStore.set(getLocalSessionCookieName(), token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: getLocalSessionMaxAgeSeconds(),
    });
}

export async function clearLocalSession() {
    const cookieStore = await cookies();
    cookieStore.set(getLocalSessionCookieName(), '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    });
}

export async function getLocalSessionUser(): Promise<AppUser | null> {
    if (!isLocalAuthEnabled()) {
        return null;
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(getLocalSessionCookieName())?.value;
    return parseLocalSessionToken(token);
}
