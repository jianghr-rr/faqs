import type {NewsAdapter, NewsCategory, NewsFetchOptions, RawNewsItem} from '../types';

const EASTMONEY_NEWS_URL = 'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns';

interface EastMoneyNewsItem {
    Art_UniqueUrl: string;
    Art_Title: string;
    Art_Url: string;
    Art_CreateTime: string;
    Art_Content?: string;
    Art_Abstract?: string;
    Art_Image?: string;
    Art_MediaName?: string;
    Art_Codes?: string;
}

interface EastMoneyResponse {
    data?: {
        list?: EastMoneyNewsItem[];
    };
    success: boolean;
}

/**
 * 东方财富新闻频道 Column ID:
 * - 重要资讯: 350
 * - 全球: 351
 * - 宏观: 353
 * - 公司: 352
 */
const COLUMN_MAP: Record<string, {id: string; category: NewsCategory}> = {
    important: {id: '350', category: '要闻'},
    global: {id: '351', category: '宏观'},
    company: {id: '352', category: '研报'},
    macro: {id: '353', category: '宏观'},
};

const CATEGORY_TO_COLUMNS: Partial<Record<NewsCategory, string[]>> = {
    要闻: ['important'],
    宏观: ['macro', 'global'],
    研报: ['company'],
};

function toRawNewsItem(item: EastMoneyNewsItem, category: NewsCategory): RawNewsItem {
    const tickers = item.Art_Codes
        ? item.Art_Codes.split(',')
              .map((c) => c.trim())
              .filter(Boolean)
        : undefined;

    return {
        title: item.Art_Title,
        summary: item.Art_Abstract || undefined,
        content: item.Art_Content || undefined,
        category,
        source: item.Art_MediaName || '东方财富',
        sourceUrl: item.Art_Url || undefined,
        publishedAt: new Date(item.Art_CreateTime),
        tickers,
        imageUrl: item.Art_Image || undefined,
        importance: 2,
    };
}

export class EastMoneyAdapter implements NewsAdapter {
    readonly name = '东方财富';

    async fetch(options?: NewsFetchOptions): Promise<RawNewsItem[]> {
        const columnKeys = options?.category
            ? (CATEGORY_TO_COLUMNS[options.category] ?? ['important'])
            : ['important', 'macro'];

        const results = await Promise.allSettled(
            columnKeys.map((key) => this.fetchByColumn(key, options?.pageSize ?? 20))
        );

        let items: RawNewsItem[] = [];
        for (const result of results) {
            if (result.status === 'fulfilled') {
                items.push(...result.value);
            }
        }

        items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

        if (options?.since) {
            items = items.filter((item) => item.publishedAt >= options.since!);
        }
        if (options?.pageSize) {
            items = items.slice(0, options.pageSize);
        }

        return items;
    }

    private async fetchByColumn(columnKey: string, pageSize: number): Promise<RawNewsItem[]> {
        const column = COLUMN_MAP[columnKey];
        if (!column) return [];

        const params = new URLSearchParams({
            client: 'web',
            biz: 'web_news_col',
            column: column.id,
            order: '1',
            needInteractData: '0',
            page_index: '1',
            page_size: String(pageSize),
        });

        const response = await fetch(`${EASTMONEY_NEWS_URL}?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`EastMoney news request failed: ${response.status} ${response.statusText}`);
        }

        const data: EastMoneyResponse = await response.json();
        if (!data.success || !data.data?.list) {
            return [];
        }

        return data.data.list.map((item) => toRawNewsItem(item, column.category));
    }
}
