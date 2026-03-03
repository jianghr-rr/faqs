import {NextResponse, type NextRequest} from 'next/server';
import {queryNews, type NewsCategory} from '~/lib/news';

const VALID_CATEGORIES: NewsCategory[] = ['要闻', '宏观', '研报', '策略', 'AI洞察', '数据'];

export async function GET(request: NextRequest) {
    try {
        const params = request.nextUrl.searchParams;
        const category = params.get('category') as NewsCategory | null;
        const importance = params.get('importance');
        const page = parseInt(params.get('page') ?? '1', 10);
        const pageSize = Math.min(parseInt(params.get('pageSize') ?? '20', 10), 50);

        if (category && !VALID_CATEGORIES.includes(category)) {
            return NextResponse.json(
                {error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`},
                {status: 400}
            );
        }

        const result = await queryNews({
            category: category ?? undefined,
            importance: importance ? parseInt(importance, 10) : undefined,
            page: Math.max(1, page),
            pageSize: Math.max(1, pageSize),
        });

        return NextResponse.json(result);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[api/news] query failed:', msg);

        if (msg.includes('does not exist') || msg.includes('relation')) {
            return NextResponse.json({items: [], total: 0, page: 1, pageSize: 20, totalPages: 0});
        }
        return NextResponse.json({error: 'Failed to fetch news'}, {status: 500});
    }
}
