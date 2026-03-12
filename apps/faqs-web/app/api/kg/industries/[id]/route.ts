import {type NextRequest, NextResponse} from 'next/server';
import {handleRouteError, notFoundResponse} from '~/lib/api/errors';
import {getIndustryOverview} from '~/lib/kg/service';

export async function GET(_request: NextRequest, {params}: {params: Promise<{id: string}>}) {
    try {
        const {id} = await params;
        const result = await getIndustryOverview(id);

        if (!result) {
            return notFoundResponse('Industry not found');
        }

        return NextResponse.json(result);
    } catch (error) {
        return handleRouteError(error);
    }
}
