import {type NextRequest, NextResponse} from 'next/server';
import {invalidInputResponse, handleRouteError} from '~/lib/api/errors';
import {searchKgEntities} from '~/lib/kg/service';

export async function GET(request: NextRequest) {
    try {
        const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
        if (!query) {
            return invalidInputResponse('q is required');
        }

        const result = await searchKgEntities(query);
        return NextResponse.json(result);
    } catch (error) {
        return handleRouteError(error);
    }
}
