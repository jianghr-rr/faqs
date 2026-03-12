import {NextResponse, type NextRequest} from 'next/server';
import {handleRouteError, invalidInputResponse} from '~/lib/api/errors';
import {chatResearch} from '~/lib/research/service';
import {getCurrentUser} from '~/lib/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {sessionId?: string; message?: string};
        if (!body.message?.trim()) {
            return invalidInputResponse('message is required');
        }

        const user = await getCurrentUser();
        const result = await chatResearch({
            sessionId: body.sessionId,
            message: body.message,
            userId: user?.id ?? null,
        });
        return NextResponse.json(result);
    } catch (error) {
        return handleRouteError(error);
    }
}
