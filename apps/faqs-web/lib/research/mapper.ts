import type {getNewsById} from '~/lib/news';
import {toIsoString} from '~/lib/date';

type NewsRecord = NonNullable<Awaited<ReturnType<typeof getNewsById>>>;

export function mapNewsToAnalysisInput(news: NewsRecord) {
    const rawText = [news.title, news.summary, news.content].filter(Boolean).join('\n');

    return {
        mode: 'news_analysis' as const,
        rawText,
        title: news.title,
        summary: news.summary,
        tickers: news.tickers ?? [],
        securityHints: news.relatedSecurities ?? [],
        tags: news.tags ?? [],
        source: news.source,
        publishedAt: toIsoString(news.publishedAt),
    };
}

export function mapQueryToAnalysisInput(query: string) {
    return {
        mode: 'chat_research' as const,
        rawText: query.trim(),
        query: query.trim(),
        tickers: [] as string[],
        securityHints: [] as Array<{name: string; code: string; exchange?: string}>,
        tags: [] as string[],
    };
}
