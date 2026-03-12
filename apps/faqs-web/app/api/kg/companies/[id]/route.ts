import {type NextRequest, NextResponse} from 'next/server';
import {handleRouteError, notFoundResponse} from '~/lib/api/errors';
import {getCompanyOverview} from '~/lib/kg/service';

export async function GET(_request: NextRequest, {params}: {params: Promise<{id: string}>}) {
    try {
        const {id} = await params;
        const result = await getCompanyOverview(id);

        if (!result) {
            return notFoundResponse('Company not found');
        }

        return NextResponse.json(result);
    } catch (error) {
        return handleRouteError(error);
    }
}
