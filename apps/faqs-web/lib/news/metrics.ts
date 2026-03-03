import 'server-only';

import {db} from '~/db';
import {news} from '~/db/schema';
import {desc, gte, eq, sql} from 'drizzle-orm';

/**
 * SLO 指标定义：
 * - ingest_latency_p95:  源发布 → 入库时间 (目标 <= 3min, 告警 > 5min)
 * - display_latency_p95: 入库 → 首页可见时间 (目标 <= 30s, 告警 > 60s)
 * - freshness_top20:     首页 Top20 中 30min 内新闻占比 (目标 >= 70%, 告警 < 50%)
 * - source_failure_rate:  见 health.ts
 * - dedup_hit_rate:       去重命中率 (目标 20%-60%)
 */

interface SloMetrics {
    ingestLatency: {
        p50Minutes: number;
        p95Minutes: number;
        status: 'ok' | 'warn' | 'critical';
    };
    freshness: {
        top20Within30min: number;
        ratioPercent: number;
        status: 'ok' | 'warn' | 'critical';
    };
    volume: {
        last1h: number;
        last24h: number;
        total: number;
    };
    sources: Array<{source: string; count: number; latestAt: string | null}>;
}

export async function computeSloMetrics(): Promise<SloMetrics> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const [latencyRows, freshnessRows, volumeRows, sourceRows] = await Promise.all([
        // 采集延迟: fetched_at - published_at
        db
            .select({
                latencySeconds: sql<number>`EXTRACT(EPOCH FROM (${news.fetchedAt} - ${news.publishedAt}))`,
            })
            .from(news)
            .where(gte(news.fetchedAt, oneHourAgo))
            .orderBy(sql`1`),

        // Top20 新鲜度
        db
            .select({
                publishedAt: news.publishedAt,
            })
            .from(news)
            .where(eq(news.isPublished, true))
            .orderBy(desc(news.publishedAt))
            .limit(20),

        // 新闻量统计
        db
            .select({
                last1h: sql<number>`count(*) FILTER (WHERE ${news.fetchedAt} >= ${oneHourAgo})`,
                last24h: sql<number>`count(*) FILTER (WHERE ${news.fetchedAt} >= ${oneDayAgo})`,
                total: sql<number>`count(*)`,
            })
            .from(news),

        // 按来源统计
        db
            .select({
                source: news.source,
                count: sql<number>`count(*)`,
                latestAt: sql<string>`max(${news.publishedAt})`,
            })
            .from(news)
            .where(gte(news.fetchedAt, oneDayAgo))
            .groupBy(news.source)
            .orderBy(sql`count(*) DESC`),
    ]);

    // 计算采集延迟 P50/P95
    const latencies = latencyRows
        .map((r) => Math.max(0, Number(r.latencySeconds) / 60))
        .filter((v) => !isNaN(v));

    const p50 = percentile(latencies, 0.5);
    const p95 = percentile(latencies, 0.95);

    let latencyStatus: 'ok' | 'warn' | 'critical' = 'ok';
    if (p95 > 5) latencyStatus = 'critical';
    else if (p95 > 3) latencyStatus = 'warn';

    // 计算新鲜度
    const top20Fresh = freshnessRows.filter((r) => r.publishedAt >= thirtyMinAgo).length;
    const ratioPercent = freshnessRows.length > 0 ? (top20Fresh / freshnessRows.length) * 100 : 0;

    let freshnessStatus: 'ok' | 'warn' | 'critical' = 'ok';
    if (ratioPercent < 50) freshnessStatus = 'critical';
    else if (ratioPercent < 70) freshnessStatus = 'warn';

    const vol = volumeRows[0];

    return {
        ingestLatency: {
            p50Minutes: round2(p50),
            p95Minutes: round2(p95),
            status: latencyStatus,
        },
        freshness: {
            top20Within30min: top20Fresh,
            ratioPercent: round2(ratioPercent),
            status: freshnessStatus,
        },
        volume: {
            last1h: Number(vol?.last1h ?? 0),
            last24h: Number(vol?.last24h ?? 0),
            total: Number(vol?.total ?? 0),
        },
        sources: sourceRows.map((r) => ({
            source: r.source,
            count: Number(r.count),
            latestAt: r.latestAt,
        })),
    };
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil(p * sorted.length) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
