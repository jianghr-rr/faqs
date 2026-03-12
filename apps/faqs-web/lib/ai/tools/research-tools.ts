import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {searchWebNewsContext} from '~/lib/ai/models/client';
import {analyzeKgText, searchKgEntities} from '~/lib/kg/service';
import type {KgAnalysisResult} from '~/lib/kg/types';
import {rankCandidateStocks} from '~/lib/research/ranker';

const candidateStockSchema = z.object({
    companyEntityId: z.string().min(1),
    companyName: z.string().min(1),
    stockCode: z.string().min(1),
    stockName: z.string().min(1),
    exchange: z.string().min(1),
    score: z.number(),
    reason: z.string().min(1),
    origin: z.enum(['kg', 'fallback_llm_mapping']),
});

export const resolveEntitiesToolSchema = z.object({
    text: z.string().min(1),
    tickers: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
});

export const rankStocksToolSchema = z.object({
    stocks: z.array(candidateStockSchema),
    tickers: z.array(z.string()).optional(),
});

export const searchKgContextToolSchema = z.object({
    keywords: z.array(z.string()).min(1).max(8),
});

export const webSearchNewsContextToolSchema = z.object({
    rawText: z.string().min(1),
    keywords: z.array(z.string()).max(8).default([]),
    angle: z.string().optional(),
});

function createEmptyKgAnalysisResult(): KgAnalysisResult {
    return {
        matchedEntities: {
            themes: [],
            industries: [],
            chainNodes: [],
            companies: [],
        },
        reasoningPaths: [],
        candidateStocks: [],
        directHitStats: {
            industries: 0,
            companies: 0,
        },
        directHitEntityIds: {
            industries: [],
            companies: [],
        },
    };
}

export async function resolveEntitiesTool(input: {text: string; tickers?: string[]; tags?: string[]}) {
    try {
        return await analyzeKgText(input);
    } catch (error) {
        console.error('[research] resolve entities failed, fallback to empty KG result:', error);
        return createEmptyKgAnalysisResult();
    }
}

export async function rankStocksTool(input: {
    stocks: Awaited<ReturnType<typeof analyzeKgText>>['candidateStocks'];
    tickers?: string[];
}) {
    return rankCandidateStocks(input.stocks, {tickers: input.tickers});
}

export async function searchKgContextTool(input: {keywords: string[]}) {
    const dedupEntities = new Map<
        string,
        {
            id: string;
            name: string;
            entityType: string;
            aliases: string[];
        }
    >();

    for (const keyword of input.keywords) {
        const result = await searchKgEntities(keyword);
        for (const item of result.items) {
            if (!dedupEntities.has(item.id)) {
                dedupEntities.set(item.id, {
                    id: item.id,
                    name: item.name,
                    entityType: item.entityType,
                    aliases: item.aliases.slice(0, 3),
                });
            }
        }
    }

    const entities = [...dedupEntities.values()].slice(0, 12);
    const suggestedTags = [...new Set(entities.flatMap((item) => [item.name, ...item.aliases]).filter(Boolean))].slice(0, 20);

    return {entities, suggestedTags};
}

export async function webSearchNewsContextTool(input: {rawText: string; keywords: string[]; angle?: string}) {
    return searchWebNewsContext(input);
}

export const resolveEntitiesLangChainTool = tool(resolveEntitiesTool, {
    name: 'resolve_entities',
    description: '根据文本、ticker 和标签命中行业知识图谱，返回实体、推理路径和候选股票。',
    schema: resolveEntitiesToolSchema,
});

export const rankStocksLangChainTool = tool(rankStocksTool, {
    name: 'rank_stocks',
    description: '对候选股票做确定性排序，优先保留图谱证据和 ticker 直连命中。',
    schema: rankStocksToolSchema,
});

export const searchKgContextLangChainTool = tool(searchKgContextTool, {
    name: 'search_kg_context',
    description: '根据模型提炼的关键词检索知识图谱实体，用于扩展主题、行业、链条和别名。',
    schema: searchKgContextToolSchema,
});

export const webSearchNewsContextLangChainTool = tool(webSearchNewsContextTool, {
    name: 'web_search_news_context',
    description: '使用 Tavily 搜索新闻相关外部信息，补充新词、产品、技术方向和上下文证据。',
    schema: webSearchNewsContextToolSchema,
});
