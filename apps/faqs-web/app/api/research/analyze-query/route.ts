import {NextResponse, type NextRequest} from 'next/server';
import {handleRouteError, invalidInputResponse} from '~/lib/api/errors';
import {analyzeQuery} from '~/lib/research/service';

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {query?: string};
        if (!body.query?.trim()) {
            return invalidInputResponse('query is required');
        }

        const result = await analyzeQuery(body.query);
        return NextResponse.json(result);
    } catch (error) {
        return handleRouteError(error);
    }
}
