import {NextResponse, type NextRequest} from 'next/server';
import {revalidateTag} from 'next/cache';
import {ingestFromAdapters, ClsAdapter, FinnhubAdapter, getHealthStatus} from '~/lib/news';
import {shouldFetchNow, markFetched, getScheduleInfo} from '~/lib/news/scheduler';

function buildAdapters() {
    const adapters = [new ClsAdapter()];

    if (process.env.FINNHUB_API_KEY) {
        adapters.push(new FinnhubAdapter() as never);
    }

    return adapters;
}

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const auth = request.headers.get('authorization');
        if (auth !== `Bearer ${cronSecret}`) {
            return NextResponse.json({error: 'Unauthorized'}, {status: 401});
        }
    }

    const schedule = shouldFetchNow();

    if (!schedule.shouldFetch) {
        return NextResponse.json({
            skipped: true,
            ...schedule,
            info: getScheduleInfo(),
        });
    }

    try {
        const adapters = buildAdapters();
        const result = await ingestFromAdapters(adapters);
        markFetched();
        revalidateTag('news', 'max');

        return NextResponse.json({
            success: true,
            ...result,
            sources: adapters.map((a) => a.name),
            schedule: getScheduleInfo(),
            health: getHealthStatus(),
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[api/news/cron] ingest failed:', error);
        return NextResponse.json({error: 'Ingest failed'}, {status: 500});
    }
}
