'use client';

import {useState, useCallback, useEffect, useRef} from 'react';
import {ChevronLeft, ChevronRight, RefreshCw} from 'lucide-react';
import {NewsCard} from './news-card';
import {NewsFeedSkeleton} from './news-feed-skeleton';

type NewsCategory = '要闻' | '宏观' | '研报' | '策略' | 'AI洞察' | '数据';

interface NewsItem {
    id: string;
    title: string;
    summary: string | null;
    category: string;
    source: string;
    sourceUrl: string | null;
    publishedAt: string;
    sentiment: string | null;
    sentimentScore: string | null;
    tickers: string[] | null;
    tags: string[] | null;
    importance: number;
    isAiGenerated: boolean;
    imageUrl: string | null;
    relatedCount?: number;
}

interface NewsResponse {
    items: NewsItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

const CATEGORIES: Array<{label: string; value: NewsCategory | null}> = [
    {label: '全部', value: null},
    {label: '要闻', value: '要闻'},
    {label: '宏观', value: '宏观'},
    {label: '研报', value: '研报'},
    {label: '策略', value: '策略'},
    {label: 'AI洞察', value: 'AI洞察'},
    {label: '数据', value: '数据'},
];

const POLL_INTERVAL = 60_000;

export function NewsFeed({initialData, isLoggedIn = false}: {initialData: NewsResponse; isLoggedIn?: boolean}) {
    const [data, setData] = useState<NewsResponse>(initialData);
    const [activeCategory, setActiveCategory] = useState<NewsCategory | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const categoryRef = useRef<NewsCategory | null>(null);
    const pageRef = useRef(1);

    useEffect(() => {
        setLastUpdated(new Date());
    }, []);

    const fetchNews = useCallback(async (category: NewsCategory | null, p: number, silent = false) => {
        if (!silent) setLoading(true);
        try {
            const params = new URLSearchParams({page: String(p), pageSize: '20'});
            if (category) params.set('category', category);

            const res = await fetch(`/api/news?${params.toString()}`);
            if (!res.ok) throw new Error('fetch failed');
            const json: NewsResponse = await res.json();
            setData(json);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('[NewsFeed] fetch error:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            fetchNews(categoryRef.current, pageRef.current, true);
        }, POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [fetchNews]);

    const handleCategoryChange = (category: NewsCategory | null) => {
        setActiveCategory(category);
        categoryRef.current = category;
        setPage(1);
        pageRef.current = 1;
        fetchNews(category, 1);
    };

    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        pageRef.current = newPage;
        fetchNews(activeCategory, newPage);
        window.scrollTo({top: 0, behavior: 'smooth'});
    };

    const handleRefresh = () => {
        fetchNews(activeCategory, page);
    };

    return (
        <div>
            <div className="mb-4 flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.label}
                            onClick={() => handleCategoryChange(cat.value)}
                            disabled={loading}
                            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                activeCategory === cat.value
                                    ? 'bg-accent text-white'
                                    : 'bg-bg-card text-text-secondary hover:text-text-primary'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={loading}
                    className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-text-disabled transition-colors hover:text-text-secondary"
                    title={lastUpdated ? `上次更新: ${lastUpdated.toLocaleTimeString('zh-CN')}` : undefined}
                >
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden lg:inline">
                        {lastUpdated
                            ? lastUpdated.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})
                            : '--:--'}
                    </span>
                </button>
            </div>

            {loading && <NewsFeedSkeleton count={4} />}

            {!loading && data.items.length === 0 && (
                <div className="py-12 text-center text-sm text-text-disabled">暂无新闻</div>
            )}

            {!loading && data.items.length > 0 && (
                <div className="space-y-2">
                    {data.items.map((item) => (
                        <NewsCard
                            key={item.id}
                            id={item.id}
                            title={item.title}
                            summary={item.summary}
                            category={item.category}
                            source={item.source}
                            sourceUrl={item.sourceUrl}
                            publishedAt={item.publishedAt}
                            sentiment={item.sentiment}
                            tickers={item.tickers}
                            tags={item.tags}
                            importance={item.importance}
                            isAiGenerated={item.isAiGenerated}
                            relatedCount={item.relatedCount}
                            isLoggedIn={isLoggedIn}
                        />
                    ))}
                </div>
            )}

            {/* 移动端：到底了 */}
            {!loading && data.totalPages <= 1 && data.items.length > 0 && (
                <div className="mt-4 py-4 text-center text-xs text-text-disabled lg:hidden">到底了</div>
            )}

            {/* 分页 */}
            {!loading && data.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-1">
                    <button
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page <= 1}
                        className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>

                    {(() => {
                        const pages: (number | 'dots')[] = [];
                        const total = data.totalPages;
                        if (total <= 7) {
                            for (let i = 1; i <= total; i++) pages.push(i);
                        } else {
                            pages.push(1);
                            const start = Math.max(2, page - 1);
                            const end = Math.min(total - 1, page + 1);
                            if (start > 2) pages.push('dots');
                            for (let i = start; i <= end; i++) pages.push(i);
                            if (end < total - 1) pages.push('dots');
                            pages.push(total);
                        }
                        return pages.map((p, idx) =>
                            p === 'dots' ? (
                                <span key={`dots-${idx}`} className="px-1 text-text-disabled">…</span>
                            ) : (
                                <button
                                    key={p}
                                    onClick={() => handlePageChange(p)}
                                    className={`h-8 min-w-8 rounded px-1 text-sm font-medium transition-colors ${
                                        page === p
                                            ? 'bg-accent text-white'
                                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                                    }`}
                                >
                                    {p}
                                </button>
                            )
                        );
                    })()}

                    <button
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page >= data.totalPages}
                        className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
}
