import {Annotation, END, START, StateGraph} from '@langchain/langgraph';
import {
    extractMentionedCompanies,
    extractGroundedNewsSearchHints,
    extractNewsSearchHints,
    generateModelOnlyObservation,
    generateResearchReport,
    rerankCandidateStocksWithAi,
    validateSectorRelevanceWithAi,
} from '~/lib/ai/models/client';
import {getEnv} from '~/lib/env';
import {
    rankStocksLangChainTool,
    resolveEntitiesLangChainTool,
    searchKgContextLangChainTool,
    webSearchNewsContextLangChainTool,
} from '~/lib/ai/tools/research-tools';
import {resolveFallbackStocksFromMentions} from '~/lib/kg/service';
import type {
    KgAnalysisResult,
    ModelObservation,
    ResearchEvidence,
    ResearchReport,
    ResearchResultMeta,
} from '~/lib/kg/types';

const ResearchWorkflowStateAnnotation = Annotation.Root({
    requestId: Annotation<string>,
    mode: Annotation<'news_analysis' | 'chat_research'>,
    rawText: Annotation<string>,
    tickers: Annotation<string[]>,
    securityHints: Annotation<Array<{name: string; code: string; exchange?: string}>>,
    tags: Annotation<string[]>,
    searchKeywords: Annotation<string[]>,
    searchContextTags: Annotation<string[]>,
    kgCoverageMiss: Annotation<boolean>,
    analysisAngle: Annotation<string>,
    webSearchQuery: Annotation<string>,
    webSearchEvidence: Annotation<ResearchEvidence[]>,
    matchedEntities: Annotation<KgAnalysisResult['matchedEntities']>,
    reasoningPaths: Annotation<KgAnalysisResult['reasoningPaths']>,
    candidateStocks: Annotation<KgAnalysisResult['candidateStocks']>,
    directHitStats: Annotation<KgAnalysisResult['directHitStats']>,
    directHitEntityIds: Annotation<KgAnalysisResult['directHitEntityIds']>,
    report: Annotation<ResearchReport | null>,
    observation: Annotation<ModelObservation | null>,
    resultMeta: Annotation<ResearchResultMeta>,
});

type ResearchWorkflowState = typeof ResearchWorkflowStateAnnotation.State;

function createEmptyMatchedEntities(): KgAnalysisResult['matchedEntities'] {
    return {
        themes: [],
        industries: [],
        chainNodes: [],
        companies: [],
    };
}

function normalizeName(value: string) {
    return value.trim().toLowerCase();
}

const KG_OUT_OF_COVERAGE_MARKERS = ['石油', '原油', '布伦特', 'wti', '战略石油储备', '大宗商品', '外汇', '汇率', '美元指数'];

function hasOutOfCoverageMarker(state: ResearchWorkflowState) {
    const haystack = `${state.rawText} ${state.searchKeywords.join(' ')}`.toLowerCase();
    return KG_OUT_OF_COVERAGE_MARKERS.some((marker) => haystack.includes(marker.toLowerCase()));
}

async function resolveEntitiesNode(state: ResearchWorkflowState) {
    const result = await resolveEntitiesLangChainTool.invoke({
        text: state.rawText,
        tickers: state.tickers,
        tags: [...state.tags, ...state.searchKeywords, ...state.searchContextTags],
    });

    return {
        ...state,
        matchedEntities: result.matchedEntities,
        reasoningPaths: result.reasoningPaths,
        candidateStocks: result.candidateStocks,
        directHitStats: result.directHitStats,
        directHitEntityIds: result.directHitEntityIds,
    };
}

function hasStructuredResult(state: ResearchWorkflowState) {
    return state.reasoningPaths.length > 0 || state.candidateStocks.length > 0;
}

function hasDirectResult(state: ResearchWorkflowState) {
    return state.directHitStats.industries > 0 || state.directHitStats.companies > 0;
}

function hasFallbackResult(state: ResearchWorkflowState) {
    return state.candidateStocks.some((stock) => stock.origin === 'fallback_llm_mapping');
}

function deriveConfidenceFromDirectHits(state: ResearchWorkflowState): ResearchResultMeta['confidence'] {
    if (state.directHitStats.companies >= 1) {
        return 'high';
    }

    if (state.directHitStats.industries >= 1) {
        return 'medium';
    }

    return 'low';
}

async function extractNewsHintsNode(state: ResearchWorkflowState) {
    if (state.mode !== 'news_analysis' || !getEnv().OPENAI_API_KEY) {
        return {
            searchKeywords: [],
            analysisAngle: '',
        };
    }

    const result = await extractNewsSearchHints({
        rawText: state.rawText,
    });

    return {
        searchKeywords: [...new Set([...result.keywords, ...result.tags])].slice(0, 12),
        analysisAngle: result.angle,
    };
}

async function webSearchContextNode(state: ResearchWorkflowState) {
    if (state.mode !== 'news_analysis' || state.searchKeywords.length === 0 || !getEnv().TAVILY_API_KEY) {
        return {
            webSearchQuery: '',
            webSearchEvidence: [],
        };
    }

    const result = await webSearchNewsContextLangChainTool.invoke({
        rawText: state.rawText,
        keywords: state.searchKeywords.slice(0, 8),
        angle: state.analysisAngle,
    });

    return {
        webSearchQuery: result.query,
        webSearchEvidence: result.results,
    };
}

async function extractGroundedHintsNode(state: ResearchWorkflowState) {
    if (state.mode !== 'news_analysis' || state.webSearchEvidence.length === 0 || !getEnv().OPENAI_API_KEY) {
        return {};
    }

    const result = await extractGroundedNewsSearchHints({
        rawText: state.rawText,
        searchKeywords: state.searchKeywords,
        webSearchEvidence: state.webSearchEvidence,
    });

    return {
        searchKeywords: [...new Set([...state.searchKeywords, ...result.keywords, ...result.tags])].slice(0, 14),
        analysisAngle: result.angle || state.analysisAngle,
    };
}

async function searchKgContextNode(state: ResearchWorkflowState) {
    if (state.mode === 'news_analysis' && hasOutOfCoverageMarker(state)) {
        return {
            searchContextTags: [],
            kgCoverageMiss: true,
        };
    }

    if (state.searchKeywords.length === 0) {
        return {
            searchContextTags: [],
            kgCoverageMiss: false,
        };
    }

    const result = await searchKgContextLangChainTool.invoke({
        keywords: state.searchKeywords.slice(0, 8),
    });

    return {
        searchContextTags: result.suggestedTags,
        kgCoverageMiss: false,
    };
}

function routeAfterSearchKgContext(state: ResearchWorkflowState) {
    return 'resolveEntities';
}

async function validateSectorRelevanceNode(state: ResearchWorkflowState) {
    if (state.mode !== 'news_analysis' || state.matchedEntities.industries.length === 0 || !getEnv().OPENAI_API_KEY) {
        return {};
    }

    const decisions = await validateSectorRelevanceWithAi({
        rawText: state.rawText,
        industries: state.matchedEntities.industries.map((industry) => ({
            id: industry.id,
            name: industry.name,
        })),
    });
    const relevantIndustryIdSet = new Set(decisions.filter((item) => item.isRelevant).map((item) => item.industryId));
    const relevantIndustryNameSet = new Set(
        state.matchedEntities.industries
            .filter((industry) => relevantIndustryIdSet.has(industry.id))
            .map((industry) => normalizeName(industry.name))
    );
    const directCompanyIdSet = new Set(state.directHitEntityIds.companies);

    const filteredReasoningPaths = state.reasoningPaths.filter((path) => {
        const rootIndustry = path.path[0] ?? '';
        return relevantIndustryNameSet.has(normalizeName(rootIndustry));
    });
    const relatedChainNodeNames = new Set(filteredReasoningPaths.map((path) => normalizeName(path.path[1] ?? '')).filter(Boolean));
    const relatedCompanyNames = new Set(filteredReasoningPaths.map((path) => normalizeName(path.path[2] ?? '')).filter(Boolean));

    const matchedEntities = {
        themes: state.matchedEntities.themes,
        industries: state.matchedEntities.industries.filter((industry) => relevantIndustryIdSet.has(industry.id)),
        chainNodes: state.matchedEntities.chainNodes.filter((chainNode) => relatedChainNodeNames.has(normalizeName(chainNode.name))),
        companies: state.matchedEntities.companies.filter(
            (company) => directCompanyIdSet.has(company.id) || relatedCompanyNames.has(normalizeName(company.name))
        ),
    };
    const candidateStocks = state.candidateStocks.filter(
        (stock) => directCompanyIdSet.has(stock.companyEntityId) || relatedCompanyNames.has(normalizeName(stock.companyName))
    );
    const directHitEntityIds = {
        industries: state.directHitEntityIds.industries.filter((id) => relevantIndustryIdSet.has(id)),
        companies: state.directHitEntityIds.companies.filter((id) =>
            matchedEntities.companies.some((company) => company.id === id)
        ),
    };

    return {
        matchedEntities,
        reasoningPaths: filteredReasoningPaths,
        candidateStocks,
        directHitEntityIds,
        directHitStats: {
            industries: directHitEntityIds.industries.length,
            companies: directHitEntityIds.companies.length,
        },
    };
}

async function fillFallbackStocksNode(state: ResearchWorkflowState) {
    if (state.mode !== 'news_analysis') {
        return {};
    }

    if (hasStructuredResult(state) && hasDirectResult(state)) {
        return {};
    }

    const extracted = await extractMentionedCompanies({
        rawText: state.rawText,
        searchKeywords: state.searchKeywords,
        webSearchEvidence: state.webSearchEvidence,
    });
    if (extracted.companies.length === 0) {
        return {};
    }

    const fallbackStocks = await resolveFallbackStocksFromMentions({
        mentions: extracted.companies,
        tickers: state.tickers,
        securityHints: state.securityHints,
    });
    if (fallbackStocks.length === 0) {
        return {};
    }

    const mergedStocks = [...new Map(
        [...state.candidateStocks, ...fallbackStocks]
            .sort((a, b) => b.score - a.score)
            .map((stock) => [stock.stockCode, stock] as const)
    ).values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

    return {
        candidateStocks: mergedStocks,
    };
}

async function rankStocksNode(state: ResearchWorkflowState) {
    return {
        candidateStocks: await rankStocksLangChainTool.invoke({
            stocks: state.candidateStocks,
            tickers: state.tickers,
        }),
    };
}

async function rerankStocksNode(state: ResearchWorkflowState) {
    return {
        candidateStocks: await rerankCandidateStocksWithAi({
            rawText: state.rawText,
            reasoningPaths: state.reasoningPaths,
            candidateStocks: state.candidateStocks,
        }),
    };
}

async function generateReportNode(state: ResearchWorkflowState) {
    return {
        report: await generateResearchReport({
            rawText: state.rawText,
            reasoningPaths: state.reasoningPaths,
            candidateStocks: state.candidateStocks,
            matchedEntities: state.matchedEntities,
            searchKeywords: state.searchKeywords,
            webSearchEvidence: state.webSearchEvidence,
        }),
        resultMeta: (() => {
            if (!hasStructuredResult(state)) {
                return {
                    confidence: 'low',
                    sourceType: 'model_plus_search',
                    validationStatus: 'model_only',
                } satisfies ResearchResultMeta;
            }

            const fallbackOnly = hasFallbackResult(state) && !hasDirectResult(state);
            if (fallbackOnly) {
                return {
                    confidence: 'low',
                    sourceType: 'model_mapping',
                    validationStatus: 'mixed',
                } satisfies ResearchResultMeta;
            }

            const hasMixedEvidence = state.webSearchEvidence.length > 0 || hasFallbackResult(state);
            return {
                confidence: deriveConfidenceFromDirectHits(state),
                sourceType: hasMixedEvidence ? 'kg_plus_model' : 'kg',
                validationStatus: hasMixedEvidence ? 'mixed' : 'kg_verified',
            } satisfies ResearchResultMeta;
        })(),
    };
}

async function generateModelOnlyObservationNode(state: ResearchWorkflowState) {
    return {
        observation: await generateModelOnlyObservation({
            rawText: state.rawText,
            searchKeywords: state.searchKeywords,
            webSearchEvidence: state.webSearchEvidence,
        }),
        resultMeta: {
            confidence: 'low',
            sourceType: 'model_plus_search',
            validationStatus: 'model_only',
        } satisfies ResearchResultMeta,
    };
}

function routeAfterRanking(state: ResearchWorkflowState) {
    if (!hasStructuredResult(state) && state.mode === 'news_analysis') {
        return 'generateObservation';
    }

    if (state.candidateStocks.length > 1 && Boolean(getEnv().OPENAI_API_KEY)) {
        return 'rerankStocks';
    }

    return 'generateReport';
}

const researchWorkflowGraph = new StateGraph(ResearchWorkflowStateAnnotation)
    .addNode('extractNewsHints', extractNewsHintsNode)
    .addNode('webSearchContext', webSearchContextNode)
    .addNode('extractGroundedHints', extractGroundedHintsNode)
    .addNode('searchKgContext', searchKgContextNode)
    .addNode('resolveEntities', resolveEntitiesNode)
    .addNode('validateSectorRelevance', validateSectorRelevanceNode)
    .addNode('fillFallbackStocks', fillFallbackStocksNode)
    .addNode('rankStocks', rankStocksNode)
    .addNode('rerankStocks', rerankStocksNode)
    .addNode('generateReport', generateReportNode)
    .addNode('generateObservation', generateModelOnlyObservationNode)
    .addEdge(START, 'extractNewsHints')
    .addEdge('extractNewsHints', 'webSearchContext')
    .addEdge('webSearchContext', 'extractGroundedHints')
    .addEdge('extractGroundedHints', 'searchKgContext')
    .addConditionalEdges('searchKgContext', routeAfterSearchKgContext, {
        resolveEntities: 'resolveEntities',
    })
    .addEdge('resolveEntities', 'validateSectorRelevance')
    .addEdge('validateSectorRelevance', 'fillFallbackStocks')
    .addEdge('fillFallbackStocks', 'rankStocks')
    .addConditionalEdges('rankStocks', routeAfterRanking, {
        rerankStocks: 'rerankStocks',
        generateReport: 'generateReport',
        generateObservation: 'generateObservation',
    })
    .addEdge('rerankStocks', 'generateReport')
    .addEdge('generateReport', END)
    .addEdge('generateObservation', END)
    .compile();

export async function runResearchWorkflow(input: {
    requestId: string;
    mode: 'news_analysis' | 'chat_research';
    rawText: string;
    tickers?: string[];
    securityHints?: Array<{name: string; code: string; exchange?: string}>;
    tags?: string[];
}) {
    return researchWorkflowGraph.invoke({
        requestId: input.requestId,
        mode: input.mode,
        rawText: input.rawText,
        tickers: [...(input.tickers ?? [])],
        securityHints: [...(input.securityHints ?? [])],
        tags: [...(input.tags ?? [])],
        searchKeywords: [],
        searchContextTags: [],
        kgCoverageMiss: false,
        analysisAngle: '',
        webSearchQuery: '',
        webSearchEvidence: [],
        matchedEntities: createEmptyMatchedEntities(),
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
        report: null,
        observation: null,
        resultMeta: {
            confidence: 'low',
            sourceType: 'kg',
            validationStatus: 'kg_verified',
        },
    });
}
