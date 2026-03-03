export type NewsCategory = '要闻' | '宏观' | '研报' | '策略' | 'AI洞察' | '数据';

export type NewsSentiment = 'positive' | 'negative' | 'neutral';

export interface RawNewsItem {
    title: string;
    summary?: string;
    content?: string;
    category: NewsCategory;
    source: string;
    sourceUrl?: string;
    publishedAt: Date;
    sentiment?: NewsSentiment;
    sentimentScore?: number;
    tickers?: string[];
    tags?: string[];
    imageUrl?: string;
    importance?: 1 | 2 | 3;
}

export interface NewsAdapter {
    readonly name: string;
    fetch(options?: NewsFetchOptions): Promise<RawNewsItem[]>;
}

export interface NewsFetchOptions {
    category?: NewsCategory;
    ticker?: string;
    pageSize?: number;
    since?: Date;
}
