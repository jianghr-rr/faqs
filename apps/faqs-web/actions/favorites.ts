'use server';

import {and, count, desc, eq} from 'drizzle-orm';
import {createClient} from '~/lib/supabase/server';
import {db} from '~/db';
import {userFavorites, faqs, categories, news} from '~/db/schema';

const MAX_FAVORITES = 100;

type ItemType = 'faq' | 'news';

async function getAuthUserId(): Promise<string> {
    const supabase = await createClient();
    const {
        data: {user},
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    return user.id;
}

export async function addFavorite(itemType: ItemType, itemId: string) {
    const userId = await getAuthUserId();

    const [{total}] = await db
        .select({total: count()})
        .from(userFavorites)
        .where(eq(userFavorites.userId, userId));

    if (total >= MAX_FAVORITES) {
        return {error: '收藏数量已达上限（100 条），请先取消部分收藏'};
    }

    const existing = await db
        .select({id: userFavorites.id})
        .from(userFavorites)
        .where(
            and(
                eq(userFavorites.userId, userId),
                eq(userFavorites.itemType, itemType),
                eq(userFavorites.itemId, itemId)
            )
        )
        .limit(1);

    if (existing.length > 0) {
        return {success: true, alreadyExists: true};
    }

    const [row] = await db
        .insert(userFavorites)
        .values({userId, itemType, itemId})
        .returning();

    return {success: true, data: row};
}

export async function removeFavorite(itemType: ItemType, itemId: string) {
    const userId = await getAuthUserId();

    await db
        .delete(userFavorites)
        .where(
            and(
                eq(userFavorites.userId, userId),
                eq(userFavorites.itemType, itemType),
                eq(userFavorites.itemId, itemId)
            )
        );

    return {success: true};
}

export async function checkFavorites(itemType: ItemType, itemIds: string[]) {
    if (itemIds.length === 0) return {};

    const userId = await getAuthUserId();

    const rows = await db
        .select({itemId: userFavorites.itemId})
        .from(userFavorites)
        .where(
            and(
                eq(userFavorites.userId, userId),
                eq(userFavorites.itemType, itemType)
            )
        );

    const favorited = new Set(rows.map((r) => r.itemId));
    return Object.fromEntries(itemIds.map((id) => [id, favorited.has(id)]));
}

export async function getFavorites(options?: {
    page?: number;
    pageSize?: number;
    itemType?: ItemType;
}) {
    const userId = await getAuthUserId();
    const page = options?.page ?? 1;
    const pageSize = Math.min(options?.pageSize ?? 20, 50);
    const offset = (page - 1) * pageSize;

    const conditions = [eq(userFavorites.userId, userId)];
    if (options?.itemType) {
        conditions.push(eq(userFavorites.itemType, options.itemType));
    }

    const where = and(...conditions);

    const [items, [{total}]] = await Promise.all([
        db
            .select()
            .from(userFavorites)
            .where(where)
            .orderBy(desc(userFavorites.createdAt))
            .limit(pageSize)
            .offset(offset),
        db.select({total: count()}).from(userFavorites).where(where),
    ]);

    const enriched = await Promise.all(
        items.map(async (fav) => {
            if (fav.itemType === 'faq') {
                const [faq] = await db
                    .select({
                        id: faqs.id,
                        question: faqs.question,
                        status: faqs.status,
                        categoryName: categories.name,
                        updatedAt: faqs.updatedAt,
                    })
                    .from(faqs)
                    .leftJoin(categories, eq(faqs.categoryId, categories.id))
                    .where(eq(faqs.id, Number(fav.itemId)))
                    .limit(1);

                return {
                    ...fav,
                    createdAt: fav.createdAt.toISOString(),
                    item: faq
                        ? {
                              id: faq.id,
                              question: faq.question,
                              status: faq.status,
                              categoryName: faq.categoryName,
                              updatedAt: faq.updatedAt.toISOString(),
                          }
                        : null,
                };
            }
            if (fav.itemType === 'news') {
                const [n] = await db
                    .select({
                        id: news.id,
                        title: news.title,
                        source: news.source,
                        sourceUrl: news.sourceUrl,
                        category: news.category,
                        publishedAt: news.publishedAt,
                    })
                    .from(news)
                    .where(eq(news.id, fav.itemId))
                    .limit(1);

                return {
                    ...fav,
                    createdAt: fav.createdAt.toISOString(),
                    item: n
                        ? {
                              ...n,
                              publishedAt: n.publishedAt.toISOString(),
                          }
                        : null,
                };
            }

            return {...fav, createdAt: fav.createdAt.toISOString(), item: null};
        })
    );

    return {
        items: enriched,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    };
}
