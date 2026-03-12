import {and, eq, ilike, inArray, or, type SQL} from 'drizzle-orm';
import {db} from '~/db';
import {kgEntities, kgEntityAliases, kgRelations, securities} from '~/db/schema';
import type {KgEntityRecord, KgRelationRecord, SecurityRecord} from './types';

function toEntityRecord(row: typeof kgEntities.$inferSelect): KgEntityRecord {
    return {
        id: row.id,
        entityType: row.entityType,
        name: row.name,
        canonicalName: row.canonicalName,
        description: row.description,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
}

function toRelationRecord(row: typeof kgRelations.$inferSelect): KgRelationRecord {
    return {
        id: row.id,
        fromEntityId: row.fromEntityId,
        toEntityId: row.toEntityId,
        relationType: row.relationType,
        weight: row.weight ? Number(row.weight) : null,
        confidence: row.confidence ? Number(row.confidence) : null,
        source: row.source,
    };
}

function toSecurityRecord(row: typeof securities.$inferSelect): SecurityRecord {
    return {
        id: row.id,
        companyEntityId: row.companyEntityId,
        stockCode: row.stockCode,
        stockName: row.stockName,
        exchange: row.exchange,
        listStatus: row.listStatus,
    };
}

export async function getEntityById(id: string) {
    const rows = await db.select().from(kgEntities).where(eq(kgEntities.id, id)).limit(1);
    return rows[0] ? toEntityRecord(rows[0]) : null;
}

export async function getEntitiesByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await db.select().from(kgEntities).where(inArray(kgEntities.id, ids));
    return rows.map(toEntityRecord);
}

export async function listEntitiesWithAliases() {
    const [entities, aliases] = await Promise.all([db.select().from(kgEntities), db.select().from(kgEntityAliases)]);
    return {
        entities: entities.map(toEntityRecord),
        aliases: aliases.map((row) => ({
            entityId: row.entityId,
            alias: row.alias,
            aliasType: row.aliasType,
        })),
    };
}

export async function searchEntitiesByKeyword(keyword: string, limit = 10) {
    const normalized = keyword.trim();
    if (!normalized) return [];

    const conditions: SQL[] = [
        ilike(kgEntities.name, `%${normalized}%`),
        ilike(kgEntities.canonicalName, `%${normalized}%`),
        ilike(kgEntityAliases.alias, `%${normalized}%`),
    ];

    const rows = await db
        .select({
            entity: kgEntities,
            alias: kgEntityAliases.alias,
        })
        .from(kgEntities)
        .leftJoin(kgEntityAliases, eq(kgEntityAliases.entityId, kgEntities.id))
        .where(or(...conditions))
        .limit(limit * 3);

    const dedup = new Map<
        string,
        KgEntityRecord & {
            aliases: string[];
        }
    >();

    for (const row of rows) {
        const entity = toEntityRecord(row.entity);
        const existing = dedup.get(entity.id) ?? {...entity, aliases: [] as string[]};
        if (row.alias && !existing.aliases.includes(row.alias)) {
            existing.aliases.push(row.alias);
        }
        dedup.set(entity.id, existing);
    }

    return [...dedup.values()].slice(0, limit);
}

export async function getOutgoingRelations(entityIds: string[], relationType?: typeof kgRelations.$inferSelect.relationType) {
    if (entityIds.length === 0) return [];
    const conditions = [inArray(kgRelations.fromEntityId, entityIds)];
    if (relationType) {
        conditions.push(eq(kgRelations.relationType, relationType));
    }

    const rows = await db.select().from(kgRelations).where(and(...conditions));
    return rows.map(toRelationRecord);
}

export async function getIncomingRelations(entityIds: string[], relationType?: typeof kgRelations.$inferSelect.relationType) {
    if (entityIds.length === 0) return [];
    const conditions = [inArray(kgRelations.toEntityId, entityIds)];
    if (relationType) {
        conditions.push(eq(kgRelations.relationType, relationType));
    }

    const rows = await db.select().from(kgRelations).where(and(...conditions));
    return rows.map(toRelationRecord);
}

export async function getSecuritiesByCompanyIds(companyIds: string[]) {
    if (companyIds.length === 0) return [];
    const rows = await db.select().from(securities).where(inArray(securities.companyEntityId, companyIds));
    return rows.map(toSecurityRecord);
}

export async function getSecuritiesByStockCodes(stockCodes: string[]) {
    if (stockCodes.length === 0) return [];
    const normalizedCodes = [...new Set(stockCodes.map((code) => code.trim()).filter(Boolean))];
    if (normalizedCodes.length === 0) return [];
    const rows = await db.select().from(securities).where(inArray(securities.stockCode, normalizedCodes));
    return rows.map(toSecurityRecord);
}

export async function listSecurities() {
    const rows = await db.select().from(securities);
    return rows.map(toSecurityRecord);
}
