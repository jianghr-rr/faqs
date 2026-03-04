import Link from 'next/link';
import {createClient} from '~/lib/supabase/server';
import {Search, Plus} from 'lucide-react';
import {queryNews, queryTopNews} from '~/lib/news';
import {NewsTicker, NewsFeed} from './components/news';

export const revalidate = 60;

export default async function HomePage() {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();

    const [topNews, newsData] = await Promise.all([
        queryTopNews(10).catch(() => []),
        queryNews({page: 1, pageSize: 20}).catch(() => ({
            items: [],
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
        })),
    ]);

    const tickerItems = topNews.map((n) => ({
        id: n.id,
        title: n.title,
        importance: n.importance,
    }));

    const serializedNewsData = {
        ...newsData,
        items: newsData.items.map((item) => ({
            ...item,
            publishedAt: item.publishedAt.toISOString(),
            fetchedAt: item.fetchedAt?.toISOString() ?? null,
            createdAt: item.createdAt.toISOString(),
            updatedAt: item.updatedAt.toISOString(),
        })),
    };

    return (
        <div className="mx-auto max-w-6xl px-4 py-4 lg:py-6">
            {/* 搜索栏 */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-disabled" />
                <input
                    type="text"
                    placeholder="搜索新闻、策略、数据源..."
                    className="h-10 w-full rounded-lg border border-border bg-bg-card pl-10 pr-4 text-sm text-text-primary placeholder:text-text-disabled transition-colors focus:border-accent focus:outline-none"
                />
            </div>

            {/* 市场快讯滚动条 */}
            {tickerItems.length > 0 && (
                <div className="mb-4">
                    <NewsTicker items={tickerItems} />
                </div>
            )}

            {/* 分类 Tab + 新闻信息流 */}
            <NewsFeed initialData={serializedNewsData} isLoggedIn={!!user} />

            {/* 浮动添加按钮（移动端，仅登录用户） */}
            {user && (
                <Link
                    href="/my-faqs"
                    className="fixed bottom-20 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform active:scale-95 lg:hidden"
                >
                    <Plus className="h-6 w-6" />
                </Link>
            )}
        </div>
    );
}
