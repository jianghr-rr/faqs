import {randomUUID} from 'node:crypto';
import {runResearchWorkflow} from '~/lib/ai/graphs/research-workflow';
import {appendPersistedChatTurns, getPersistedChatHistory} from '~/lib/ai/chat/repository';
import {rewriteChatQuery} from '~/lib/ai/models/client';
import type {ChatHistoryTurn} from '~/lib/ai/prompts/research';
import {toIsoString} from '~/lib/date';
import {getNewsById} from '~/lib/news/service';
import type {ResearchEvidence} from '~/lib/kg/types';
import {mapNewsToAnalysisInput, mapQueryToAnalysisInput} from './mapper';
import {getNewsAnalysisSnapshot, upsertNewsAnalysisSnapshot} from './repository';

function toSearchMetadata(workflowResult: Awaited<ReturnType<typeof runResearchWorkflow>>) {
    return {
        keywords: workflowResult.searchKeywords,
        angle: workflowResult.analysisAngle,
        webQuery: workflowResult.webSearchQuery,
        evidence: workflowResult.webSearchEvidence as ResearchEvidence[],
    };
}

function toResultMeta(workflowResult: Awaited<ReturnType<typeof runResearchWorkflow>>) {
    return workflowResult.resultMeta;
}

function withNewsAnalysisCache(
    payload: Record<string, unknown>,
    input: {
        hit: boolean;
        forced: boolean;
        analyzedAt: Date;
    }
) {
    return {
        ...payload,
        cache: {
            hit: input.hit,
            forced: input.forced,
            analyzedAt: toIsoString(input.analyzedAt),
        },
    };
}

export async function analyzeNewsById(newsId: string, options?: {forceReanalyze?: boolean}) {
    const news = await getNewsById(newsId);
    if (!news) {
        throw new Error('NEWS_NOT_FOUND');
    }

    const forceReanalyze = options?.forceReanalyze === true;
    if (!forceReanalyze) {
        const snapshot = await getNewsAnalysisSnapshot(newsId);
        if (snapshot) {
            return withNewsAnalysisCache(snapshot.payload, {
                hit: true,
                forced: false,
                analyzedAt: snapshot.analyzedAt,
            });
        }
    }

    const requestId = randomUUID();
    const input = mapNewsToAnalysisInput(news);
    const workflowResult = await runResearchWorkflow({
        requestId,
        mode: input.mode,
        rawText: input.rawText,
        tickers: input.tickers,
        securityHints: input.securityHints,
        tags: input.tags,
    });

    const payload = {
        requestId,
        news: {
            id: news.id,
            title: news.title,
            publishedAt: toIsoString(news.publishedAt),
            source: news.source,
        },
        matchedEntities: workflowResult.matchedEntities,
        reasoningPaths: workflowResult.reasoningPaths,
        candidateStocks: workflowResult.candidateStocks,
        report: workflowResult.report,
        observation: workflowResult.observation,
        resultMeta: toResultMeta(workflowResult),
        searchMetadata: toSearchMetadata(workflowResult),
    };

    const analyzedAt = new Date();
    await upsertNewsAnalysisSnapshot({
        newsId: news.id,
        payload,
        meta: {
            workflowVersion: 'research-workflow-v1',
        },
        analyzedAt,
    });

    return withNewsAnalysisCache(payload, {
        hit: false,
        forced: forceReanalyze,
        analyzedAt,
    });
}

export async function analyzeQuery(query: string, options?: {history?: ChatHistoryTurn[]}) {
    const trimmed = query.trim();
    if (!trimmed) {
        throw new Error('QUERY_REQUIRED');
    }

    const resolvedQuery =
        options?.history && options.history.length > 0
            ? await rewriteChatQuery({
                  message: trimmed,
                  history: options.history,
              })
            : trimmed;
    const requestId = randomUUID();
    const input = mapQueryToAnalysisInput(resolvedQuery);
    const workflowResult = await runResearchWorkflow({
        requestId,
        mode: input.mode,
        rawText: input.rawText,
        securityHints: input.securityHints,
    });

    return {
        requestId,
        query: trimmed,
        resolvedEntities: workflowResult.matchedEntities,
        reasoningPaths: workflowResult.reasoningPaths,
        candidateStocks: workflowResult.candidateStocks,
        report: workflowResult.report,
        observation: workflowResult.observation,
        resultMeta: toResultMeta(workflowResult),
        searchMetadata: toSearchMetadata(workflowResult),
    };
}

export async function chatResearch(input: {sessionId?: string; message: string; userId?: string | null}) {
    const sessionId = input.sessionId ?? randomUUID();
    const history = await getPersistedChatHistory(sessionId);
    const result = await analyzeQuery(input.message, {history});
    const answerText = result.report?.summary ?? '暂时没有足够的结构化信息来回答这个问题。';
    const answerReferences = {
        entities: [
            ...result.resolvedEntities.industries.map((entity) => ({
                id: entity.id,
                name: entity.name,
                type: entity.entityType,
            })),
            ...result.resolvedEntities.chainNodes.map((entity) => ({
                id: entity.id,
                name: entity.name,
                type: entity.entityType,
            })),
        ].slice(0, 6),
        stocks: result.candidateStocks.slice(0, 5).map((stock) => ({
            stockCode: stock.stockCode,
            stockName: stock.stockName,
        })),
    };

    await appendPersistedChatTurns({
        sessionId,
        userId: input.userId ?? null,
        turns: [
            {role: 'user', content: input.message},
            {
                role: 'assistant',
                content: answerText,
                metadata: {
                    reasoningPaths: result.reasoningPaths.map((item) => item.path),
                    references: answerReferences,
                },
            },
        ],
    });

    return {
        sessionId,
        messageId: randomUUID(),
        answer: {
            text: answerText,
            reasoningPaths: result.reasoningPaths.map((item) => item.path),
            references: answerReferences,
        },
    };
}
