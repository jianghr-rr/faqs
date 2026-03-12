import 'server-only';

import {getCurrentUser} from '~/lib/supabase/server';

export class UnauthorizedError extends Error {
    constructor(message = 'Login required') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export async function requireUser() {
    const user = await getCurrentUser();

    if (!user) {
        throw new UnauthorizedError();
    }

    return user;
}
