import 'server-only';

import {jwtVerify} from 'jose';

const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

type SessionPayload = {
    userId: string;
    expiresAt: Date;
};

export async function decrypt(
    session: string | undefined
): Promise<SessionPayload | null> {
    if (!session) return null;

    try {
        const {payload} = await jwtVerify(session, encodedKey, {
            algorithms: ['HS256'],
        });
        return payload as unknown as SessionPayload;
    } catch {
        return null;
    }
}

export async function encrypt(payload: SessionPayload): Promise<string> {
    const {SignJWT} = await import('jose');
    return new SignJWT(payload as unknown as Record<string, unknown>)
        .setProtectedHeader({alg: 'HS256'})
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(encodedKey);
}
