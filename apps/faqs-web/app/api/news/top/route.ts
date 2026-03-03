import {NextResponse, type NextRequest} from 'next/server';
import {queryTopNews} from '~/lib/news';

export async function GET(request: NextRequest) {
    try {
        const limit = Math.min(
            parseInt(request.nextUrl.searchParams.get('limit') ?? '5', 10),
            20
        );

        const items = await queryTopNews(Math.max(1, limit));

        return NextResponse.json({items});
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[api/news/top] query failed:', msg);

        if (msg.includes('does not exist') || msg.includes('relation')) {
            return NextResponse.json({items: []});
        }
        return NextResponse.json({error: 'Failed to fetch top news'}, {status: 500});
    }
}
