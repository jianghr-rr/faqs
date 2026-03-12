import {
    getEntitiesByIds,
    getEntityById,
    getIncomingRelations,
    getOutgoingRelations,
    getSecuritiesByCompanyIds,
    getSecuritiesByStockCodes,
    listEntitiesWithAliases,
    listSecurities,
    searchEntitiesByKeyword,
} from './repository';
import type {
    CandidateStock,
    CompanyOverview,
    IndustryOverview,
    KgAnalysisResult,
    KgEntityRecord,
    KgSearchResult,
    MatchedEntity,
    MentionedCompany,
    ReasoningPath,
    SecurityRecord,
} from './types';

const KG_CATALOG_CACHE_TTL_MS = 30_000;

type KgCatalogSnapshot = {
    entities: Awaited<ReturnType<typeof listEntitiesWithAliases>>['entities'];
    aliases: Awaited<ReturnType<typeof listEntitiesWithAliases>>['aliases'];
    allSecurities: SecurityRecord[];
};

let kgCatalogCache:
    | {
          expiresAt: number;
          value: KgCatalogSnapshot;
      }
    | undefined;
let kgCatalogInFlight: Promise<KgCatalogSnapshot> | undefined;

type AnalyzeInput = {
    text: string;
    tickers?: string[];
    tags?: string[];
};

function normalizeText(value: string) {
    return value.trim().toLowerCase();
}

function normalizeToken(value: string) {
    return normalizeText(value).replace(/[\s()（）\-_.·,，]/g, '');
}

function uniqueById<T extends {id: string}>(items: T[]) {
    return [...new Map(items.map((item) => [item.id, item])).values()];
}

function scoreTextMatch(input: string, candidate: string) {
    const normalizedInput = normalizeText(input);
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate || !normalizedInput.includes(normalizedCandidate)) {
        return 0;
    }

    return Math.min(0.55 + normalizedCandidate.length * 0.03, 0.95);
}

function toMatchedEntity(entity: KgEntityRecord, confidence: number): MatchedEntity {
    return {
        id: entity.id,
        name: entity.name,
        entityType: entity.entityType,
        confidence: Number(confidence.toFixed(2)),
    };
}

function buildReportDescription(industryName: string, chainNodeName: string, companyName: string) {
    return `${industryName} 产业链中的 ${chainNodeName} 环节与 ${companyName} 存在较强映射关系。`;
}

function clampConfidence(value: number, min = 0, max = 0.99) {
    return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}

function inferExchangeFromStockCode(stockCode: string) {
    if (/^(60|68|51|56|58|11|12)/.test(stockCode)) {
        return 'SSE';
    }
    if (/^(00|20|30|15|16|18|12)/.test(stockCode)) {
        return 'SZSE';
    }
    if (/^(4|8|92)/.test(stockCode)) {
        return 'BSE';
    }
    return 'UNKNOWN';
}

function buildSyntheticCompanyId(stockCode: string, companyName: string) {
    return `fallback:${stockCode}:${normalizeToken(companyName) || 'unknown'}`;
}

async function getKgCatalogSnapshot() {
    const now = Date.now();
    if (kgCatalogCache && kgCatalogCache.expiresAt > now) {
        return kgCatalogCache.value;
    }

    if (!kgCatalogInFlight) {
        kgCatalogInFlight = (async () => {
            const [{entities, aliases}, allSecurities] = await Promise.all([listEntitiesWithAliases(), listSecurities()]);
            const snapshot: KgCatalogSnapshot = {entities, aliases, allSecurities};
            kgCatalogCache = {
                value: snapshot,
                expiresAt: Date.now() + KG_CATALOG_CACHE_TTL_MS,
            };
            return snapshot;
        })().finally(() => {
            kgCatalogInFlight = undefined;
        });
    }

    return kgCatalogInFlight;
}

export async function searchKgEntities(keyword: string): Promise<KgSearchResult> {
    const items = await searchEntitiesByKeyword(keyword);
    return {items};
}

export async function getIndustryOverview(industryId: string): Promise<IndustryOverview | null> {
    const industry = await getEntityById(industryId);
    if (!industry || industry.entityType !== 'industry') {
        return null;
    }

    const containsRelations = await getOutgoingRelations([industry.id], 'contains');
    const chainNodes = await getEntitiesByIds(containsRelations.map((relation) => relation.toEntityId));

    const belongsRelations = await getIncomingRelations([industry.id], 'belongs_to');
    const companies = await getEntitiesByIds(belongsRelations.map((relation) => relation.fromEntityId));
    const companySecurities = await getSecuritiesByCompanyIds(companies.map((company) => company.id));
    const securityMap = new Map<string, SecurityRecord[]>();

    for (const security of companySecurities) {
        const items = securityMap.get(security.companyEntityId) ?? [];
        items.push(security);
        securityMap.set(security.companyEntityId, items);
    }

    return {
        industry,
        chainNodes,
        companies: companies.map((company) => ({
            ...company,
            securities: securityMap.get(company.id) ?? [],
        })),
    };
}

export async function getCompanyOverview(companyId: string): Promise<CompanyOverview | null> {
    const company = await getEntityById(companyId);
    if (!company || company.entityType !== 'company') {
        return null;
    }

    const [industryRelations, chainRelations, companySecurities] = await Promise.all([
        getOutgoingRelations([company.id], 'belongs_to'),
        getOutgoingRelations([company.id], 'participates_in'),
        getSecuritiesByCompanyIds([company.id]),
    ]);

    const [industries, chainNodes] = await Promise.all([
        getEntitiesByIds(industryRelations.map((relation) => relation.toEntityId)),
        getEntitiesByIds(chainRelations.map((relation) => relation.toEntityId)),
    ]);

    return {
        company,
        industries,
        chainNodes,
        securities: companySecurities,
    };
}

export async function resolveFallbackStocksFromMentions(input: {
    mentions: MentionedCompany[];
    tickers?: string[];
    securityHints?: Array<{name: string; code: string; exchange?: string}>;
}) {
    const normalizedMentions = [...new Map(
        input.mentions
            .map((mention) => ({
                ...mention,
                name: mention.name.trim(),
                evidence: mention.evidence.trim(),
            }))
            .filter((mention) => mention.name)
            .map((mention) => [normalizeToken(mention.name), mention] as const)
    ).values()];
    const tickerHints = [...new Set((input.tickers ?? []).map((ticker) => ticker.trim()).filter(Boolean))];
    const securityHints = [...new Map(
        (input.securityHints ?? [])
            .map((item) => ({
                name: item.name.trim(),
                code: item.code.trim(),
                exchange: item.exchange?.trim() || inferExchangeFromStockCode(item.code.trim()),
            }))
            .filter((item) => item.name && item.code)
            .map((item) => [`${normalizeToken(item.name)}:${item.code}`, item] as const)
    ).values()];

    if (normalizedMentions.length === 0 && tickerHints.length === 0 && securityHints.length === 0) {
        return [];
    }

    const [{entities, aliases, allSecurities}, tickerSecurities] = await Promise.all([
        getKgCatalogSnapshot(),
        getSecuritiesByStockCodes(tickerHints),
    ]);
    const aliasMap = new Map<string, string[]>();
    for (const alias of aliases) {
        const items = aliasMap.get(alias.entityId) ?? [];
        items.push(alias.alias);
        aliasMap.set(alias.entityId, items);
    }

    const companyEntities = entities.filter((entity) => entity.entityType === 'company');
    const companySecurityMap = new Map<string, SecurityRecord[]>();
    for (const security of allSecurities) {
        const items = companySecurityMap.get(security.companyEntityId) ?? [];
        items.push(security);
        companySecurityMap.set(security.companyEntityId, items);
    }
    const tickerSecurityMap = new Map(tickerSecurities.map((security) => [security.stockCode, security]));
    const usedTickerCodes = new Set<string>();
    const candidates = new Map<string, CandidateStock>();

    for (const mention of normalizedMentions) {
        const normalizedName = normalizeToken(mention.name);
        if (!normalizedName) {
            continue;
        }

        const directSecurityHints = securityHints.filter((item) => normalizeToken(item.name) === normalizedName);
        for (const hint of directSecurityHints) {
            usedTickerCodes.add(hint.code);
            const candidate: CandidateStock = {
                companyEntityId: buildSyntheticCompanyId(hint.code, hint.name),
                companyName: hint.name,
                stockCode: hint.code,
                stockName: hint.name,
                exchange: hint.exchange,
                score: clampConfidence(mention.confidence * 0.72 + 0.14, 0.32, 0.84),
                reason: `新闻源已直接提供 ${hint.name}(${hint.code}) 证券线索，并与正文提及交叉验证`,
                origin: 'fallback_llm_mapping',
            };
            const existing = candidates.get(hint.code);
            if (!existing || existing.score < candidate.score) {
                candidates.set(hint.code, candidate);
            }
        }

        const matchedCompanies = companyEntities.filter((entity) => {
            const tokens = [
                entity.name,
                entity.canonicalName,
                ...(aliasMap.get(entity.id) ?? []),
                ...(companySecurityMap.get(entity.id) ?? []).map((security) => security.stockName),
            ];
            return tokens.some((token) => normalizeToken(token) === normalizedName);
        });

        for (const company of matchedCompanies) {
            const securities = companySecurityMap.get(company.id) ?? [];
            for (const security of securities) {
                const tickerMatched = tickerHints.includes(security.stockCode);
                if (tickerMatched) {
                    usedTickerCodes.add(security.stockCode);
                }

                const score = clampConfidence(mention.confidence * 0.62 + (tickerMatched ? 0.18 : 0), 0.24, 0.78);
                const existing = candidates.get(security.stockCode);
                const next: CandidateStock = {
                    companyEntityId: company.id,
                    companyName: company.name,
                    stockCode: security.stockCode,
                    stockName: security.stockName,
                    exchange: security.exchange,
                    score,
                    reason: tickerMatched
                        ? `新闻中直接提到 ${mention.name}，并与新闻自带证券代码交叉验证`
                        : `新闻中直接提到 ${mention.name}，通过本地证券映射补充得到该标的`,
                    origin: 'fallback_llm_mapping',
                };

                if (!existing || existing.score < next.score) {
                    candidates.set(security.stockCode, next);
                }
            }
        }
    }

    const unresolvedMentions = normalizedMentions.filter(
        (mention) =>
            ![...candidates.values()].some((candidate) => normalizeToken(candidate.companyName) === normalizeToken(mention.name))
    );
    const remainingTickerCodes = tickerHints.filter((ticker) => !usedTickerCodes.has(ticker));

    unresolvedMentions.forEach((mention, index) => {
        const stockCode = remainingTickerCodes[index];
        if (!stockCode) {
            return;
        }

        const security = tickerSecurityMap.get(stockCode);
        const companyName = security?.stockName || mention.name;
        const candidate: CandidateStock = {
            companyEntityId: security?.companyEntityId ?? buildSyntheticCompanyId(stockCode, companyName),
            companyName,
            stockCode,
            stockName: security?.stockName || mention.name,
            exchange: security?.exchange || inferExchangeFromStockCode(stockCode),
            score: clampConfidence(mention.confidence * 0.48 + 0.16, 0.22, 0.6),
            reason: `新闻中直接提到 ${mention.name}，并按新闻自带证券代码做低置信映射`,
            origin: 'fallback_llm_mapping',
        };

        const existing = candidates.get(stockCode);
        if (!existing || existing.score < candidate.score) {
            candidates.set(stockCode, candidate);
        }
    });

    return [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}

export async function analyzeKgText(input: AnalyzeInput): Promise<KgAnalysisResult> {
    const normalizedText = normalizeText(input.text);
    const tickers = new Set((input.tickers ?? []).map((ticker) => ticker.toUpperCase()));
    const tags = new Set((input.tags ?? []).map((tag) => normalizeText(tag)));
    const directIndustryIds = new Set<string>();
    const directCompanyIds = new Set<string>();

    const {entities, aliases, allSecurities} = await getKgCatalogSnapshot();

    const aliasMap = new Map<string, string[]>();
    for (const alias of aliases) {
        const items = aliasMap.get(alias.entityId) ?? [];
        items.push(alias.alias);
        aliasMap.set(alias.entityId, items);
    }

    const companySecurityMap = new Map<string, SecurityRecord[]>();
    for (const security of allSecurities) {
        const items = companySecurityMap.get(security.companyEntityId) ?? [];
        items.push(security);
        companySecurityMap.set(security.companyEntityId, items);
    }

    const matched = entities
        .map((entity) => {
            const tokens = uniqueById(
                [
                    {id: `${entity.id}:name`, value: entity.name},
                    {id: `${entity.id}:canonical`, value: entity.canonicalName},
                    ...(aliasMap.get(entity.id) ?? []).map((alias, index) => ({id: `${entity.id}:alias:${index}`, value: alias})),
                ].map((item) => ({...item, id: item.id}))
            ).map((item) => item.value);

            let textScore = 0;
            let tagScore = 0;
            let tickerMatched = false;
            for (const token of tokens) {
                textScore = Math.max(textScore, scoreTextMatch(normalizedText, token));
                if (tags.has(normalizeText(token))) {
                    tagScore = Math.max(tagScore, 0.78);
                }
            }

            let score = Math.max(textScore, tagScore);
            if (entity.entityType === 'company') {
                for (const security of companySecurityMap.get(entity.id) ?? []) {
                    if (tickers.has(security.stockCode.toUpperCase())) {
                        score = 0.99;
                        tickerMatched = true;
                    }
                }
            }

            if (entity.entityType === 'industry' && textScore > 0) {
                directIndustryIds.add(entity.id);
            }
            if (entity.entityType === 'company' && (textScore > 0 || tickerMatched)) {
                directCompanyIds.add(entity.id);
            }

            return score > 0 ? toMatchedEntity(entity, score) : null;
        })
        .filter((item): item is MatchedEntity => Boolean(item))
        .sort((a, b) => b.confidence - a.confidence);

    const matchedThemes = matched.filter((item) => item.entityType === 'theme');
    const directIndustries = matched.filter((item) => item.entityType === 'industry');
    const directChainNodes = matched.filter((item) => item.entityType === 'chain_node');
    const directCompanies = matched.filter((item) => item.entityType === 'company');
    const themeConfidenceMap = new Map(matchedThemes.map((item) => [item.id, item.confidence]));

    const themeIndustryRelations = await getOutgoingRelations(
        matchedThemes.map((item) => item.id),
        'relates_to'
    );
    const relatedIndustryConfidenceMap = new Map<string, number>();
    for (const relation of themeIndustryRelations) {
        const themeConfidence = themeConfidenceMap.get(relation.fromEntityId) ?? 0;
        const relationSignal = ((relation.weight ?? 0.5) + (relation.confidence ?? 0.5)) / 2;
        const derivedConfidence = clampConfidence(themeConfidence * 0.85 + relationSignal * 0.08, 0.35, 0.95);
        const current = relatedIndustryConfidenceMap.get(relation.toEntityId) ?? 0;
        relatedIndustryConfidenceMap.set(relation.toEntityId, Math.max(current, derivedConfidence));
    }
    const relatedIndustries = await getEntitiesByIds([...relatedIndustryConfidenceMap.keys()]);
    const industries = uniqueById<MatchedEntity>([
        ...directIndustries,
        ...relatedIndustries.map((entity) =>
            toMatchedEntity(entity, relatedIndustryConfidenceMap.get(entity.id) ?? 0.45)
        ),
    ]);
    const industryConfidenceMap = new Map(industries.map((item) => [item.id, item.confidence]));

    const containsRelations = await getOutgoingRelations(
        industries.map((item) => item.id),
        'contains'
    );
    const chainNodeConfidenceMap = new Map(directChainNodes.map((item) => [item.id, item.confidence]));
    for (const relation of containsRelations) {
        const industryConfidence = industryConfidenceMap.get(relation.fromEntityId) ?? 0;
        const relationSignal = ((relation.weight ?? 0.5) + (relation.confidence ?? 0.5)) / 2;
        const derivedConfidence = clampConfidence(industryConfidence * 0.88 + relationSignal * 0.06, 0.3, 0.92);
        const current = chainNodeConfidenceMap.get(relation.toEntityId) ?? 0;
        chainNodeConfidenceMap.set(relation.toEntityId, Math.max(current, derivedConfidence));
    }
    const containedChainNodes = await getEntitiesByIds([...chainNodeConfidenceMap.keys()]);
    const chainNodes = uniqueById<MatchedEntity>([
        ...directChainNodes,
        ...containedChainNodes.map((entity) => toMatchedEntity(entity, chainNodeConfidenceMap.get(entity.id) ?? 0.4)),
    ]);
    const chainConfidenceMap = new Map(chainNodes.map((item) => [item.id, item.confidence]));

    const [companyIndustryRelations, companyChainRelations] = await Promise.all([
        getIncomingRelations(
            industries.map((item) => item.id),
            'belongs_to'
        ),
        getIncomingRelations(
            chainNodes.map((item) => item.id),
            'participates_in'
        ),
    ]);

    const relationCompanyIds = [
        ...companyIndustryRelations.map((relation) => relation.fromEntityId),
        ...companyChainRelations.map((relation) => relation.fromEntityId),
        ...directCompanies.map((item) => item.id),
    ];
    const companyEntities = await getEntitiesByIds([...new Set(relationCompanyIds)]);
    const directCompanyConfidenceMap = new Map(directCompanies.map((item) => [item.id, item.confidence]));
    const companyDerivedConfidenceMap = new Map<string, number>();
    for (const relation of companyIndustryRelations) {
        const industryConfidence = industryConfidenceMap.get(relation.toEntityId) ?? 0;
        const relationSignal = ((relation.weight ?? 0.5) + (relation.confidence ?? 0.5)) / 2;
        const derivedConfidence = clampConfidence(industryConfidence * 0.82 + relationSignal * 0.07, 0.28, 0.9);
        const current = companyDerivedConfidenceMap.get(relation.fromEntityId) ?? 0;
        companyDerivedConfidenceMap.set(relation.fromEntityId, Math.max(current, derivedConfidence));
    }
    for (const relation of companyChainRelations) {
        const chainConfidence = chainConfidenceMap.get(relation.toEntityId) ?? 0;
        const relationSignal = ((relation.weight ?? 0.5) + (relation.confidence ?? 0.5)) / 2;
        const derivedConfidence = clampConfidence(chainConfidence * 0.9 + relationSignal * 0.06, 0.3, 0.93);
        const current = companyDerivedConfidenceMap.get(relation.fromEntityId) ?? 0;
        companyDerivedConfidenceMap.set(relation.fromEntityId, Math.max(current, derivedConfidence));
    }
    const companies = uniqueById<MatchedEntity>([
        ...directCompanies,
        ...companyEntities.map((entity) =>
            toMatchedEntity(
                entity,
                directCompanyConfidenceMap.get(entity.id) ?? companyDerivedConfidenceMap.get(entity.id) ?? 0.45
            )
        ),
    ]);

    const industryMap = new Map(industries.map((item) => [item.id, item]));
    const chainNodeMap = new Map(chainNodes.map((item) => [item.id, item]));
    const companyEntityMap = new Map(companyEntities.map((item) => [item.id, item]));

    const reasoningPaths: ReasoningPath[] = [];
    const candidateStocks: CandidateStock[] = [];
    const relationWeightMap = new Map<string, number>();

    for (const relation of companyChainRelations) {
        const company = companyEntityMap.get(relation.fromEntityId);
        const chainNode = chainNodeMap.get(relation.toEntityId);
        if (!company || !chainNode) continue;

        const parentIndustryRelation = containsRelations.find((item) => item.toEntityId === chainNode.id);
        const industry = parentIndustryRelation ? industryMap.get(parentIndustryRelation.fromEntityId) : industries[0];
        if (!industry) continue;

        const securities = companySecurityMap.get(company.id) ?? [];
        const relationSignal = ((relation.weight ?? 0.5) + (relation.confidence ?? 0.5)) / 2;
        const score = clampConfidence(
            industry.confidence * 0.35 + chainNode.confidence * 0.45 + relationSignal * 0.2,
            0.18,
            0.98
        );

        for (const security of securities) {
            candidateStocks.push({
                companyEntityId: company.id,
                companyName: company.name,
                stockCode: security.stockCode,
                stockName: security.stockName,
                exchange: security.exchange,
                score,
                reason: `${chainNode.name} 环节核心参与者`,
                origin: 'kg',
            });
            relationWeightMap.set(`${company.id}:${security.stockCode}`, score);
        }

        reasoningPaths.push({
            path: [industry.name, chainNode.name, company.name],
            description: buildReportDescription(industry.name, chainNode.name, company.name),
        });
    }

    for (const relation of companyIndustryRelations) {
        const company = companyEntityMap.get(relation.fromEntityId);
        const industry = industryMap.get(relation.toEntityId);
        if (!company || !industry) continue;

        const securities = companySecurityMap.get(company.id) ?? [];
        const relationSignal = ((relation.weight ?? 0.5) + (relation.confidence ?? 0.5)) / 2;
        const score = clampConfidence(industry.confidence * 0.6 + relationSignal * 0.2, 0.16, 0.9);

        for (const security of securities) {
            const key = `${company.id}:${security.stockCode}`;
            if (relationWeightMap.has(key)) {
                continue;
            }
            candidateStocks.push({
                companyEntityId: company.id,
                companyName: company.name,
                stockCode: security.stockCode,
                stockName: security.stockName,
                exchange: security.exchange,
                score,
                reason: `公司主业归属于 ${industry.name}`,
                origin: 'kg',
            });
        }
    }

    const dedupStocks = [...new Map(candidateStocks.map((item) => [`${item.companyEntityId}:${item.stockCode}`, item])).values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

    return {
        matchedEntities: {
            themes: matchedThemes,
            industries,
            chainNodes,
            companies,
        },
        reasoningPaths: reasoningPaths.slice(0, 6),
        candidateStocks: dedupStocks,
        directHitStats: {
            industries: industries.filter((item) => directIndustryIds.has(item.id)).length,
            companies: companies.filter((item) => directCompanyIds.has(item.id)).length,
        },
        directHitEntityIds: {
            industries: industries.filter((item) => directIndustryIds.has(item.id)).map((item) => item.id),
            companies: companies.filter((item) => directCompanyIds.has(item.id)).map((item) => item.id),
        },
    };
}
