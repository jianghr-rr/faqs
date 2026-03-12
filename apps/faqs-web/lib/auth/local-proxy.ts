import type {NextRequest} from 'next/server';
import type {AppUser} from '~/lib/auth/types';
import {getLocalSessionCookieName, parseLocalSessionToken} from './local-shared';

export async function getLocalSessionUserFromRequest(request: NextRequest): Promise<AppUser | null> {
    const token = request.cookies.get(getLocalSessionCookieName())?.value;
    return parseLocalSessionToken(token);
}
