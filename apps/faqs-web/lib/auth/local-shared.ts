import type {AppUser} from '~/lib/auth/types';

const LOCAL_AUTH_SESSION_COOKIE_NAME = 'faqs_local_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type LocalSessionPayload = Pick<AppUser, 'id' | 'email' | 'name' | 'avatar' | 'role' | 'phone'> & {
    iat: number;
};

function bytesToBase64(bytes: Uint8Array) {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function base64ToBytes(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function base64UrlEncode(bytes: Uint8Array) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string) {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return base64ToBytes(`${normalized}${padding}`);
}

function getLocalAuthSecret() {
    return process.env.LOCAL_AUTH_SESSION_SECRET?.trim() ?? '';
}

export function isLocalAuthEnabled() {
    return process.env.LOCAL_AUTH_ENABLED === 'true';
}

async function signRaw(value: string) {
    const secret = getLocalAuthSecret();
    if (!secret) {
        throw new Error('Missing LOCAL_AUTH_SESSION_SECRET');
    }

    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        {name: 'HMAC', hash: 'SHA-256'},
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
    return base64UrlEncode(new Uint8Array(signature));
}

async function verifyRaw(value: string, signature: string) {
    const expected = await signRaw(value);
    return expected === signature;
}

export async function createLocalSessionToken(user: AppUser) {
    const payload: LocalSessionPayload = {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        phone: user.phone,
        iat: Math.floor(Date.now() / 1000),
    };

    const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
    const signature = await signRaw(encodedPayload);
    return `${encodedPayload}.${signature}`;
}

export async function parseLocalSessionToken(token?: string | null): Promise<AppUser | null> {
    if (!token || !isLocalAuthEnabled()) {
        return null;
    }

    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
        return null;
    }

    try {
        const valid = await verifyRaw(encodedPayload, signature);
        if (!valid) {
            return null;
        }

        const payload = JSON.parse(decoder.decode(base64UrlDecode(encodedPayload))) as LocalSessionPayload;
        if (!payload.id || !payload.email || !payload.name || !payload.role || !payload.iat) {
            return null;
        }

        const age = Math.floor(Date.now() / 1000) - payload.iat;
        if (age > SESSION_MAX_AGE_SECONDS || age < 0) {
            return null;
        }

        return {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            avatar: payload.avatar,
            role: payload.role,
            phone: payload.phone,
            authSource: 'local',
        } satisfies AppUser;
    } catch {
        return null;
    }
}

export function getLocalSessionCookieName() {
    return LOCAL_AUTH_SESSION_COOKIE_NAME;
}

export function getLocalSessionMaxAgeSeconds() {
    return SESSION_MAX_AGE_SECONDS;
}
