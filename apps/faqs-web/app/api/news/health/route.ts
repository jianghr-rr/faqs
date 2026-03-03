import {NextResponse, type NextRequest} from 'next/server';
import {getHealthStatus} from '~/lib/news';
import {computeSloMetrics} from '~/lib/news/metrics';
import {getScheduleInfo} from '~/lib/news/scheduler';

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const auth = request.headers.get('authorization');
        if (auth !== `Bearer ${cronSecret}`) {
            return NextResponse.json({error: 'Unauthorized'}, {status: 401});
        }
    }

    try {
        const [slo, adapterHealth, schedule] = await Promise.all([
            computeSloMetrics(),
            Promise.resolve(getHealthStatus()),
            Promise.resolve(getScheduleInfo()),
        ]);

        const overallStatus =
            slo.ingestLatency.status === 'critical' || slo.freshness.status === 'critical'
                ? 'critical'
                : slo.ingestLatency.status === 'warn' || slo.freshness.status === 'warn'
                  ? 'warn'
                  : 'ok';

        return NextResponse.json({
            status: overallStatus,
            slo,
            adapters: adapterHealth,
            schedule,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[api/news/health]', msg);

        if (msg.includes('does not exist') || msg.includes('relation')) {
            return NextResponse.json({status: 'not_initialized', message: 'news table not yet created'});
        }
        return NextResponse.json({error: 'Health check failed'}, {status: 500});
    }
}
