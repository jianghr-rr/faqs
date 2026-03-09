import 'server-only';

import {unstable_cache} from 'next/cache';
import {db} from '~/db';
import {news, userFavorites} from '~/db/schema';
import {desc, eq, and, gte, lt, inArray, sql, type SQL} from 'drizzle-orm';
import type {NewsAdapter, NewsCategory, RawNewsItem} from './types';
import {recordSuccess, recordFailure, isAdapterHealthy} from './health';

// ─── Dedup ──────────────────────────────────────────

function normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        u.searchParams.delete('utm_source');
        u.searchParams.delete('utm_medium');
        u.searchParams.delete('utm_campaign');
        u.searchParams.delete('utm_content');
        u.searchParams.delete('utm_term');
        u.searchParams.delete('from');
        u.searchParams.delete('ref');
        u.hash = '';
        return u.toString();
    } catch {
        return url;
    }
}

function titleSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(''));
    const setB = new Set(b.split(''));
    const intersection = new Set([...setA].filter((c) => setB.has(c)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

function dedup(items: RawNewsItem[]): RawNewsItem[] {
    const seen = new Map<string, RawNewsItem>();
    const result: RawNewsItem[] = [];

    for (const item of items) {
        const urlKey = item.sourceUrl ? normalizeUrl(item.sourceUrl) : '';

        if (urlKey && seen.has(urlKey)) continue;

        let isDuplicate = false;
        for (const existing of result) {
            if (titleSimilarity(item.title, existing.title) > 0.7) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            if (urlKey) seen.set(urlKey, item);
            result.push(item);
        }
    }

    return result;
}

// ─── Ingest ─────────────────────────────────────────

export interface IngestResult {
    inserted: number;
    fetched: number;
    afterDedup: number;
    dedupRate: number;
}

export async function ingestFromAdapters(adapters: NewsAdapter[]): Promise<IngestResult> {
    const healthy = adapters.filter((a) => isAdapterHealthy(a.name));
    if (healthy.length === 0) {
        console.warn('[news] all adapters disabled, skipping ingest');
        return {inserted: 0, fetched: 0, afterDedup: 0, dedupRate: 0};
    }

    const results = await Promise.allSettled(healthy.map((a) => a.fetch({pageSize: 30})));

    const allItems: RawNewsItem[] = [];
    for (const [i, result] of results.entries()) {
        const adapterName = healthy[i]?.name ?? 'unknown';
        if (result.status === 'fulfilled') {
            recordSuccess(adapterName);
            allItems.push(...result.value);
        } else {
            recordFailure(adapterName);
            console.error(`[news] adapter "${adapterName}" failed:`, result.reason);
        }
    }

    const fetched = allItems.length;
    if (fetched === 0) return {inserted: 0, fetched: 0, afterDedup: 0, dedupRate: 0};

    const unique = dedup(allItems);
    const afterDedup = unique.length;
    const dedupRate = fetched > 0 ? ((fetched - afterDedup) / fetched) * 100 : 0;

    const inserted = await db
        .insert(news)
        .values(
            unique.map((item) => ({
                title: item.title,
                summary: item.summary,
                content: item.content,
                category: item.category,
                source: item.source,
                sourceUrl: item.sourceUrl,
                publishedAt: item.publishedAt,
                sentiment: item.sentiment,
                sentimentScore: item.sentimentScore?.toString(),
                tickers: item.tickers,
                tags: item.tags,
                imageUrl: item.imageUrl,
                importance: item.importance ?? 2,
                isAiGenerated: false,
            }))
        )
        .onConflictDoNothing()
        .returning({id: news.id});

    return {inserted: inserted.length, fetched, afterDedup, dedupRate: Math.round(dedupRate * 100) / 100};
}

// ─── Query ──────────────────────────────────────────

export interface NewsQueryOptions {
    category?: NewsCategory;
    importance?: number;
    page?: number;
    pageSize?: number;
}

const NEWS_CACHE_REVALIDATE_SECONDS = 30;

async function queryNewsUncached(options: NewsQueryOptions = {}) {
    const {category, importance, page = 1, pageSize = 20} = options;

    const conditions: SQL[] = [eq(news.isPublished, true)];

    if (category) {
        conditions.push(eq(news.category, category));
    }
    if (importance) {
        conditions.push(eq(news.importance, importance));
    }

    const offset = (page - 1) * pageSize;

    const [items, countResult] = await Promise.all([
        db
            .select()
            .from(news)
            .where(and(...conditions))
            .orderBy(desc(news.publishedAt))
            .limit(pageSize)
            .offset(offset),
        db
            .select({count: sql<number>`count(*)`})
            .from(news)
            .where(and(...conditions)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    const enriched = items.map((item) => {
        let relatedCount = 0;
        for (const other of items) {
            if (other.id !== item.id && titleSimilarity(item.title, other.title) > 0.6) {
                relatedCount++;
            }
        }
        return {...item, relatedCount};
    });

    return {
        items: enriched,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}

const queryNewsCached = unstable_cache(
    async (category: NewsCategory | null, importance: number | null, page: number, pageSize: number) =>
        queryNewsUncached({
            category: category ?? undefined,
            importance: importance ?? undefined,
            page,
            pageSize,
        }),
    ['news-query'],
    {
        revalidate: NEWS_CACHE_REVALIDATE_SECONDS,
        tags: ['news'],
    }
);

export async function queryNews(options: NewsQueryOptions = {}) {
    const {category, importance, page = 1, pageSize = 20} = options;
    return queryNewsCached(category ?? null, importance ?? null, page, pageSize);
}

async function queryTopNewsUncached(limit = 5) {
    return db
        .select()
        .from(news)
        .where(and(eq(news.isPublished, true), eq(news.importance, 1)))
        .orderBy(desc(news.publishedAt))
        .limit(limit);
}

const queryTopNewsCached = unstable_cache(
    async (limit: number) => queryTopNewsUncached(limit),
    ['top-news-query'],
    {
        revalidate: NEWS_CACHE_REVALIDATE_SECONDS,
        tags: ['news'],
    }
);

export async function queryTopNews(limit = 5) {
    return queryTopNewsCached(limit);
}

export async function queryRecentNews(since: Date, limit = 50) {
    return db
        .select()
        .from(news)
        .where(and(eq(news.isPublished, true), gte(news.publishedAt, since)))
        .orderBy(desc(news.publishedAt))
        .limit(limit);
}

// ─── Purge ──────────────────────────────────────────

export interface PurgeResult {
    deletedNews: number;
    deletedFavorites: number;
    cutoffDate: string;
}

export async function purgeOldNews(retentionDays = 7): Promise<PurgeResult> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const staleIds = await db
        .select({id: news.id})
        .from(news)
        .where(lt(news.publishedAt, cutoff));

    if (staleIds.length === 0) {
        return {deletedNews: 0, deletedFavorites: 0, cutoffDate: cutoff.toISOString()};
    }

    const idList = staleIds.map((r) => r.id);

    const BATCH_SIZE = 500;
    let deletedFavorites = 0;
    let deletedNews = 0;

    for (let i = 0; i < idList.length; i += BATCH_SIZE) {
        const batch = idList.slice(i, i + BATCH_SIZE);

        const favRows = await db
            .delete(userFavorites)
            .where(and(eq(userFavorites.itemType, 'news'), inArray(userFavorites.itemId, batch)))
            .returning({id: userFavorites.id});
        deletedFavorites += favRows.length;

        const newsRows = await db.delete(news).where(inArray(news.id, batch)).returning({id: news.id});
        deletedNews += newsRows.length;
    }

    return {deletedNews, deletedFavorites, cutoffDate: cutoff.toISOString()};
}
