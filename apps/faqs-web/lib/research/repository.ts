import {eq} from 'drizzle-orm';
import {db} from '~/db';
import {newsAnalysisSnapshots} from '~/db/schema';

type SnapshotPayload = Record<string, unknown>;

function toJsonObject(value: unknown): SnapshotPayload | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as SnapshotPayload;
}

export async function getNewsAnalysisSnapshot(newsId: string) {
    const [row] = await db
        .select({
            payload: newsAnalysisSnapshots.resultPayload,
            analyzedAt: newsAnalysisSnapshots.analyzedAt,
        })
        .from(newsAnalysisSnapshots)
        .where(eq(newsAnalysisSnapshots.newsId, newsId))
        .limit(1);

    if (!row) {
        return null;
    }

    const payload = toJsonObject(row.payload);
    if (!payload) {
        return null;
    }

    return {
        payload,
        analyzedAt: row.analyzedAt,
    };
}

export async function upsertNewsAnalysisSnapshot(input: {
    newsId: string;
    payload: SnapshotPayload;
    meta?: Record<string, unknown>;
    analyzedAt: Date;
}) {
    await db
        .insert(newsAnalysisSnapshots)
        .values({
            newsId: input.newsId,
            resultPayload: input.payload,
            resultMeta: input.meta ?? {},
            analyzedAt: input.analyzedAt,
        })
        .onConflictDoUpdate({
            target: newsAnalysisSnapshots.newsId,
            set: {
                resultPayload: input.payload,
                resultMeta: input.meta ?? {},
                analyzedAt: input.analyzedAt,
                updatedAt: new Date(),
            },
        });
}
