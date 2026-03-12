import {NextResponse, type NextRequest} from 'next/server';
import {handleRouteError, invalidInputResponse, notFoundResponse} from '~/lib/api/errors';
import {analyzeNewsById} from '~/lib/research/service';

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {newsId?: string; forceReanalyze?: boolean};
        if (!body.newsId) {
            return invalidInputResponse('newsId is required');
        }

        if (typeof body.forceReanalyze !== 'undefined' && typeof body.forceReanalyze !== 'boolean') {
            return invalidInputResponse('forceReanalyze must be a boolean');
        }

        const result = await analyzeNewsById(body.newsId, {forceReanalyze: body.forceReanalyze === true});
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof Error && error.message === 'NEWS_NOT_FOUND') {
            return notFoundResponse('News not found');
        }

        return handleRouteError(error);
    }
}
