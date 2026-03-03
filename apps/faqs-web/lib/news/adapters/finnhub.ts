import type {NewsAdapter, NewsCategory, NewsFetchOptions, RawNewsItem} from '../types';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

interface FinnhubNewsItem {
    id: number;
    category: string;
    datetime: number;
    headline: string;
    image: string;
    related: string;
    source: string;
    summary: string;
    url: string;
}

const FINNHUB_CATEGORY_MAP: Record<string, NewsCategory> = {
    general: '要闻',
    forex: '宏观',
    crypto: '数据',
    merger: '策略',
    technology: 'AI洞察',
};

function mapCategory(finnhubCategory: string): NewsCategory {
    return FINNHUB_CATEGORY_MAP[finnhubCategory] ?? '要闻';
}

function toRawNewsItem(item: FinnhubNewsItem): RawNewsItem {
    return {
        title: item.headline,
        summary: item.summary || undefined,
        category: mapCategory(item.category),
        source: item.source || 'Finnhub',
        sourceUrl: item.url || undefined,
        publishedAt: new Date(item.datetime * 1000),
        tickers: item.related ? item.related.split(',').map((t) => t.trim()) : undefined,
        imageUrl: item.image || undefined,
        importance: 2,
    };
}

export class FinnhubAdapter implements NewsAdapter {
    readonly name = 'Finnhub';
    private apiKey: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.FINNHUB_API_KEY || '';
        if (!this.apiKey) {
            throw new Error('FINNHUB_API_KEY is required');
        }
    }

    async fetch(options?: NewsFetchOptions): Promise<RawNewsItem[]> {
        if (options?.ticker) {
            return this.fetchCompanyNews(options.ticker, options);
        }
        return this.fetchMarketNews(options);
    }

    private async fetchMarketNews(options?: NewsFetchOptions): Promise<RawNewsItem[]> {
        const url = new URL(`${FINNHUB_BASE_URL}/news`);
        url.searchParams.set('category', 'general');
        url.searchParams.set('token', this.apiKey);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Finnhub market news request failed: ${response.status} ${response.statusText}`);
        }

        const items: FinnhubNewsItem[] = await response.json();
        let result = items.map(toRawNewsItem);

        if (options?.since) {
            result = result.filter((item) => item.publishedAt >= options.since!);
        }
        if (options?.pageSize) {
            result = result.slice(0, options.pageSize);
        }

        return result;
    }

    private async fetchCompanyNews(ticker: string, options?: NewsFetchOptions): Promise<RawNewsItem[]> {
        const now = new Date();
        const from =
            options?.since ??
            new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        const to = now;

        const url = new URL(`${FINNHUB_BASE_URL}/company-news`);
        url.searchParams.set('symbol', ticker);
        url.searchParams.set('from', formatDate(from));
        url.searchParams.set('to', formatDate(to));
        url.searchParams.set('token', this.apiKey);

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Finnhub company news request failed: ${response.status} ${response.statusText}`);
        }

        const items: FinnhubNewsItem[] = await response.json();
        let result = items.map(toRawNewsItem);

        if (options?.pageSize) {
            result = result.slice(0, options.pageSize);
        }

        return result;
    }
}

function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
