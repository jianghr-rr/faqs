import {NextResponse, type NextRequest} from 'next/server';
import {revalidateTag} from 'next/cache';
import {purgeOldNews} from '~/lib/news';

const RETENTION_DAYS = 7;

export async function GET(request: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const auth = request.headers.get('authorization');
        if (auth !== `Bearer ${cronSecret}`) {
            return NextResponse.json({error: 'Unauthorized'}, {status: 401});
        }
    }

    try {
        const result = await purgeOldNews(RETENTION_DAYS);
        revalidateTag('news', 'max');

        console.log(
            `[api/news/cleanup] purged ${result.deletedNews} news, ${result.deletedFavorites} favorites (cutoff: ${result.cutoffDate})`
        );

        return NextResponse.json({
            success: true,
            ...result,
            retentionDays: RETENTION_DAYS,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[api/news/cleanup] purge failed:', error);
        return NextResponse.json({error: 'Cleanup failed'}, {status: 500});
    }
}
