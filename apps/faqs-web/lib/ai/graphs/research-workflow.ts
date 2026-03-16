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
    ResearchTrace,
    ResearchTraceStep,
    ResearchTraceStepStatus,
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
type ResearchWorkflowNode = (
    state: ResearchWorkflowState
) => Promise<Partial<ResearchWorkflowState> | ResearchWorkflowState>;
type WorkflowTraceCollector = {
    startedAt: number;
    steps: ResearchTraceStep[];
};

const traceCollectors = new Map<string, WorkflowTraceCollector>();
const traceStepListeners = new Map<string, (step: ResearchTraceStep) => void | Promise<void>>();

const NODE_LABEL_MAP: Record<string, string> = {
    extractNewsHints: '提取新闻线索',
    webSearchContext: '外部搜索补充',
    extractGroundedHints: '基于证据二次提炼',
    searchKgContext: '图谱上下文检索',
    resolveEntities: '实体命中与扩展',
    validateSectorRelevance: '行业相关性校验',
    fillFallbackStocks: '低置信标的补全',
    rankStocks: '规则排序',
    rerankStocks: '模型重排',
    generateReport: '生成结构化结论',
    generateObservation: '生成观察结论',
};

function logNodeStart(requestId: string, nodeName: string) {
    console.info(`[research-workflow] requestId=${requestId} node=${nodeName} phase=start`);
}

function logNodeSuccess(requestId: string, nodeName: string, elapsedMs: number) {
    console.info(`[research-workflow] requestId=${requestId} node=${nodeName} phase=done elapsedMs=${elapsedMs}`);
}

function logNodeError(requestId: string, nodeName: string, elapsedMs: number, error: unknown) {
    console.error(`[research-workflow] requestId=${requestId} node=${nodeName} phase=error elapsedMs=${elapsedMs}`, error);
}

function isEmptyNodeResult(result: Partial<ResearchWorkflowState> | ResearchWorkflowState) {
    return Object.keys(result).length === 0;
}

function summarizeNodeResult(
    nodeName: string,
    state: ResearchWorkflowState,
    result: Partial<ResearchWorkflowState> | ResearchWorkflowState
) {
    switch (nodeName) {
        case 'extractNewsHints': {
            const nextKeywords = result.searchKeywords ?? [];
            const sample = nextKeywords.slice(0, 3).join('、');
            const angle = result.analysisAngle ? `，角度「${result.analysisAngle}」` : '';
            return sample
                ? `提取 ${nextKeywords.length} 个关键词（${sample}）${angle}`
                : `未提取到有效关键词${angle}`;
        }
        case 'webSearchContext': {
            const evidenceCount = (result.webSearchEvidence ?? []).length;
            const query = result.webSearchQuery || state.webSearchQuery;
            if (evidenceCount === 0) {
                return query ? `检索查询已执行（${query}），未返回有效外部证据` : '未返回有效外部证据';
            }
            return query ? `检索查询：${query}，获取外部证据 ${evidenceCount} 条` : `获取外部证据 ${evidenceCount} 条`;
        }
        case 'extractGroundedHints': {
            if (isEmptyNodeResult(result)) {
                return '无可用外部证据，已跳过';
            }
            const before = state.searchKeywords.length;
            const after = (result.searchKeywords ?? state.searchKeywords).length;
            return `基于外部证据重写关键词：${before} -> ${after}`;
        }
        case 'searchKgContext': {
            if (result.kgCoverageMiss) {
                return '图谱覆盖不足，跳过上下文扩展';
            }
            const tags = (result.searchContextTags ?? []).length;
            return `使用 ${state.searchKeywords.slice(0, 8).length} 个关键词检索图谱，上下文标签 ${tags} 个`;
        }
        case 'resolveEntities': {
            const themes = (result.matchedEntities?.themes ?? []).length;
            const industries = (result.matchedEntities?.industries ?? []).length;
            const chainNodes = (result.matchedEntities?.chainNodes ?? []).length;
            const companies = (result.matchedEntities?.companies ?? []).length;
            const reasoning = (result.reasoningPaths ?? []).length;
            const candidates = (result.candidateStocks ?? []).length;
            return `命中主题 ${themes}、行业 ${industries}、环节 ${chainNodes}、公司 ${companies}；推理 ${reasoning} 条，候选 ${candidates} 个`;
        }
        case 'validateSectorRelevance': {
            if (isEmptyNodeResult(result)) {
                return '无行业命中或无需校验，已跳过';
            }
            const before = state.matchedEntities.industries.length;
            const industries = (result.matchedEntities?.industries ?? state.matchedEntities.industries).length;
            return `行业相关性校验后保留 ${industries}/${before} 个行业`;
        }
        case 'fillFallbackStocks': {
            if (isEmptyNodeResult(result)) {
                if (hasStructuredResult(state) && hasDirectResult(state)) {
                    return '已有直接图谱命中，跳过低置信补全';
                }
                return '无需补全候选';
            }
            const before = state.candidateStocks.length;
            const candidates = (result.candidateStocks ?? state.candidateStocks).length;
            return `低置信补全后候选：${before} -> ${candidates}`;
        }
        case 'rankStocks':
        case 'rerankStocks': {
            const ranked = result.candidateStocks ?? state.candidateStocks;
            const candidates = ranked.length;
            const top = ranked[0];
            if (!top) {
                return '无候选可排序';
            }
            return `候选 ${candidates} 个，TOP1：${top.companyName}(${top.stockCode})`;
        }
        case 'generateReport': {
            const reasoningCount = state.reasoningPaths.length;
            const candidateCount = state.candidateStocks.length;
            return `已生成 AI 结论（推理 ${reasoningCount} 条，候选 ${candidateCount} 个）`;
        }
        case 'generateObservation': {
            const type = result.observation?.observationType ?? state.observation?.observationType;
            return type ? `已生成观察结论（类型：${type}）` : '已生成观察结论';
        }
        default:
            return '步骤完成';
    }
}

function appendTraceStep(requestId: string, step: ResearchTraceStep) {
    const collector = traceCollectors.get(requestId);
    if (!collector) {
        return;
    }
    collector.steps.push(step);
    const listener = traceStepListeners.get(requestId);
    if (listener) {
        void Promise.resolve(listener(step)).catch((error) => {
            console.warn(`[research-workflow] requestId=${requestId} trace step listener failed:`, error);
        });
    }
}

function withNodeTiming(nodeName: string, node: ResearchWorkflowNode): ResearchWorkflowNode {
    return async (state) => {
        const requestId = state.requestId || 'unknown';
        const start = Date.now();
        logNodeStart(requestId, nodeName);
        try {
            const result = await node(state);
            const elapsedMs = Date.now() - start;
            const status: ResearchTraceStepStatus = isEmptyNodeResult(result) ? 'skipped' : 'done';
            appendTraceStep(requestId, {
                name: nodeName,
                label: NODE_LABEL_MAP[nodeName] ?? nodeName,
                status,
                elapsedMs,
                summary: summarizeNodeResult(nodeName, state, result),
            });
            logNodeSuccess(requestId, nodeName, elapsedMs);
            return result;
        } catch (error) {
            const elapsedMs = Date.now() - start;
            appendTraceStep(requestId, {
                name: nodeName,
                label: NODE_LABEL_MAP[nodeName] ?? nodeName,
                status: 'failed',
                elapsedMs,
                summary: error instanceof Error ? `失败：${error.message}` : '步骤执行失败',
            });
            logNodeError(requestId, nodeName, elapsedMs, error);
            throw error;
        }
    };
}

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

    const llmStart = Date.now();
    console.info(`[research-workflow] requestId=${state.requestId} node=extractNewsHints substep=extractNewsSearchHints phase=start`);
    const result = await extractNewsSearchHints({
        rawText: state.rawText,
    });
    console.info(
        `[research-workflow] requestId=${state.requestId} node=extractNewsHints substep=extractNewsSearchHints phase=done elapsedMs=${
            Date.now() - llmStart
        } keywordCount=${result.keywords.length} tagCount=${result.tags.length}`
    );

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

function routeAfterSearchKgContext(_state: ResearchWorkflowState) {
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

    const extractStart = Date.now();
    console.info(
        `[research-workflow] requestId=${state.requestId} node=fillFallbackStocks substep=extractMentionedCompanies phase=start`
    );
    const extracted = await extractMentionedCompanies({
        rawText: state.rawText,
        searchKeywords: state.searchKeywords,
        webSearchEvidence: state.webSearchEvidence,
    });
    console.info(
        `[research-workflow] requestId=${state.requestId} node=fillFallbackStocks substep=extractMentionedCompanies phase=done elapsedMs=${
            Date.now() - extractStart
        } mentionCount=${extracted.companies.length}`
    );
    if (extracted.companies.length === 0) {
        return {};
    }

    const resolveStart = Date.now();
    console.info(
        `[research-workflow] requestId=${state.requestId} node=fillFallbackStocks substep=resolveFallbackStocksFromMentions phase=start mentionCount=${
            extracted.companies.length
        } tickerHintCount=${state.tickers.length} securityHintCount=${state.securityHints.length}`
    );
    const fallbackStocks = await resolveFallbackStocksFromMentions({
        mentions: extracted.companies,
        tickers: state.tickers,
        securityHints: state.securityHints,
    });
    console.info(
        `[research-workflow] requestId=${state.requestId} node=fillFallbackStocks substep=resolveFallbackStocksFromMentions phase=done elapsedMs=${
            Date.now() - resolveStart
        } fallbackCount=${fallbackStocks.length}`
    );
    if (fallbackStocks.length === 0) {
        return {};
    }

    const mergeStart = Date.now();
    const mergedStocks = [...new Map(
        [...state.candidateStocks, ...fallbackStocks]
            .sort((a, b) => b.score - a.score)
            .map((stock) => [stock.stockCode, stock] as const)
    ).values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    console.info(
        `[research-workflow] requestId=${state.requestId} node=fillFallbackStocks substep=mergeCandidates phase=done elapsedMs=${
            Date.now() - mergeStart
        } mergedCount=${mergedStocks.length}`
    );

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

    // Rerank is an extra LLM call; avoid it for tiny candidate sets.
    if (state.candidateStocks.length > 2 && Boolean(getEnv().OPENAI_API_KEY)) {
        return 'rerankStocks';
    }

    return 'generateReport';
}

const researchWorkflowGraph = new StateGraph(ResearchWorkflowStateAnnotation)
    .addNode('extractNewsHints', withNodeTiming('extractNewsHints', extractNewsHintsNode))
    .addNode('webSearchContext', withNodeTiming('webSearchContext', webSearchContextNode))
    .addNode('extractGroundedHints', withNodeTiming('extractGroundedHints', extractGroundedHintsNode))
    .addNode('searchKgContext', withNodeTiming('searchKgContext', searchKgContextNode))
    .addNode('resolveEntities', withNodeTiming('resolveEntities', resolveEntitiesNode))
    .addNode('validateSectorRelevance', withNodeTiming('validateSectorRelevance', validateSectorRelevanceNode))
    .addNode('fillFallbackStocks', withNodeTiming('fillFallbackStocks', fillFallbackStocksNode))
    .addNode('rankStocks', withNodeTiming('rankStocks', rankStocksNode))
    .addNode('rerankStocks', withNodeTiming('rerankStocks', rerankStocksNode))
    .addNode('generateReport', withNodeTiming('generateReport', generateReportNode))
    .addNode('generateObservation', withNodeTiming('generateObservation', generateModelOnlyObservationNode))
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
    onTraceStep?: (step: ResearchTraceStep) => void;
}) {
    const start = Date.now();
    console.info(`[research-workflow] requestId=${input.requestId} phase=start mode=${input.mode}`);
    traceCollectors.set(input.requestId, {
        startedAt: start,
        steps: [],
    });
    if (input.onTraceStep) {
        traceStepListeners.set(input.requestId, input.onTraceStep);
    }
    try {
        const result = await researchWorkflowGraph.invoke({
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
        const finishedAt = Date.now();
        const collector = traceCollectors.get(input.requestId);
        const trace: ResearchTrace = {
            version: 'v1',
            requestId: input.requestId,
            mode: input.mode,
            startedAt: new Date(collector?.startedAt ?? start).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            elapsedMs: finishedAt - (collector?.startedAt ?? start),
            steps: collector?.steps ?? [],
        };

        console.info(
            `[research-workflow] requestId=${input.requestId} phase=done elapsedMs=${
                Date.now() - start
            } evidenceCount=${result.webSearchEvidence.length} reasoningCount=${result.reasoningPaths.length} candidateCount=${
                result.candidateStocks.length
            }`
        );
        return {
            ...result,
            trace,
        };
    } catch (error) {
        console.error(
            `[research-workflow] requestId=${input.requestId} phase=error elapsedMs=${Date.now() - start}`,
            error
        );
        throw error;
    } finally {
        traceCollectors.delete(input.requestId);
        traceStepListeners.delete(input.requestId);
    }
}
