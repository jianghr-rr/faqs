import {NextResponse, type NextRequest} from 'next/server';
import {ingestFromAdapters, ClsAdapter, FinnhubAdapter} from '~/lib/news';

function buildAdapters() {
    const adapters = [new ClsAdapter()];

    if (process.env.FINNHUB_API_KEY) {
        adapters.push(new FinnhubAdapter() as never);
    }

    return adapters;
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({error: 'Unauthorized'}, {status: 401});
        }

        const adapters = buildAdapters();
        const result = await ingestFromAdapters(adapters);

        return NextResponse.json({
            success: true,
            ...result,
            sources: adapters.map((a) => a.name),
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[api/news/ingest] failed:', error);
        return NextResponse.json({error: 'Ingest failed'}, {status: 500});
    }
}
