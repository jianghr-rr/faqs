import type {NewsAdapter, NewsCategory, NewsFetchOptions, RawNewsItem} from '../types';

const CLS_API_BASE = 'https://www.cls.cn/nodeapi';

interface ClsNewsItem {
    id: number;
    title: string;
    brief: string;
    content: string;
    ctime: number;
    category: string;
    shareurl: string;
    imgs: string[];
    stock_list: Array<{name: string; code: string}>;
    level: string;
    bold: number;
    tags: Array<{id: number; name: string}>;
}

interface ClsResponse {
    error: number;
    data: {
        roll_data: ClsNewsItem[];
    };
}

function mapCategory(item: ClsNewsItem): NewsCategory {
    const content = (item.title || item.brief || item.content || '').toLowerCase();

    if (item.category === 'A股' || /a股|沪指|深指|创业板|科创板|两市/.test(content)) return '要闻';
    if (/央行|cpi|pmi|gdp|利率|货币政策|社融|lpr/.test(content)) return '宏观';
    if (/研报|评级|目标价|券商/.test(content)) return '研报';
    if (/策略|配置|仓位|调仓/.test(content)) return '策略';
    if (/ai|人工智能|大模型|机器人/.test(content)) return 'AI洞察';
    if (/数据|接口|api/.test(content)) return '数据';

    return '要闻';
}

function mapImportance(item: ClsNewsItem): 1 | 2 | 3 {
    if (item.bold === 1 || item.level === 'A') return 1;
    if (item.level === 'B') return 2;
    return 3;
}

function toRawNewsItem(item: ClsNewsItem): RawNewsItem {
    return {
        title: item.title || item.brief || item.content.substring(0, 100),
        summary: item.content ? item.content.substring(0, 200) : undefined,
        category: mapCategory(item),
        source: '财联社',
        sourceUrl: item.shareurl || undefined,
        publishedAt: new Date(item.ctime * 1000),
        tickers: item.stock_list?.map((s) => s.code).filter(Boolean),
        tags: item.tags?.map((t) => t.name).filter(Boolean),
        imageUrl: item.imgs?.[0] || undefined,
        importance: mapImportance(item),
    };
}

export class ClsAdapter implements NewsAdapter {
    readonly name = '财联社';

    async fetch(options?: NewsFetchOptions): Promise<RawNewsItem[]> {
        const pageSize = options?.pageSize ?? 30;
        const url = `${CLS_API_BASE}/updateTelegraphList?app=CailianpressWeb&os=web&sv=8.4.6&rn=${pageSize}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`CLS news request failed: ${response.status} ${response.statusText}`);
        }

        const data: ClsResponse = await response.json();
        if (data.error !== 0 || !data.data?.roll_data) {
            throw new Error(`CLS API error: ${data.error}`);
        }

        let items = data.data.roll_data.map(toRawNewsItem);

        if (options?.category) {
            items = items.filter((item) => item.category === options.category);
        }
        if (options?.since) {
            items = items.filter((item) => item.publishedAt >= options.since!);
        }

        return items;
    }
}
