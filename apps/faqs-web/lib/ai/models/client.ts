import {AIMessage, HumanMessage} from '@langchain/core/messages';
import {ChatOpenAI} from '@langchain/openai';
import {getTavilyCache} from '~/lib/ai/web-search/cache';
import {getEnv} from '~/lib/env';
import type {
    CandidateStock,
    KgAnalysisResult,
    MentionedCompany,
    ModelObservation,
    ModelObservationType,
    ResearchEvidence,
    ResearchReport,
} from '~/lib/kg/types';
import {
    buildChatRewritePrompt,
    buildGroundedNewsSearchHintsPrompt,
    buildMentionedCompaniesPrompt,
    buildModelOnlyObservationPrompt,
    buildNewsSearchHintsPrompt,
    buildResearchPrompt,
    buildResearchPromptVariables,
    buildResearchReportPrompt,
    buildSectorRelevancePrompt,
    buildStockRerankPrompt,
    chatQueryRewriteSchema,
    groundedNewsSearchHintsSchema,
    mentionedCompaniesSchema,
    modelOnlyObservationSchema,
    newsSearchHintsSchema,
    rerankedStocksSchema,
    researchReportSchema,
    sectorRelevanceSchema,
    type ChatHistoryTurn,
} from '~/lib/ai/prompts/research';

type GenerateReportInput = {
    rawText: string;
    reasoningPaths: Array<{path: string[]; description: string}>;
    candidateStocks: CandidateStock[];
    matchedEntities?: KgAnalysisResult['matchedEntities'];
    searchKeywords?: string[];
    webSearchEvidence?: ResearchEvidence[];
};

export type SectorRelevanceDecision = {
    industryId: string;
    industryName: string;
    isRelevant: boolean;
    reason: string;
};

function extractJsonBlock(text: string) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }
    return text.slice(start, end + 1);
}

function createChatModel(temperature = 0.2) {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
        return null;
    }

    return new ChatOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        temperature,
        configuration: env.OPENAI_BASE_URL ? {baseURL: env.OPENAI_BASE_URL} : undefined,
    });
}

function clampScore(score: number) {
    return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

const RERANK_KEEP_SCORE_THRESHOLD = 0.15;

function fallbackRewriteChatQuery(input: RewriteChatQueryInput) {
    const trimmed = input.message.trim();
    if (!trimmed) {
        return trimmed;
    }

    const lastUserMessage = [...input.history].reverse().find((item) => item.role === 'user')?.content.trim();
    if (!lastUserMessage) {
        return trimmed;
    }

    const isLikelyFollowUp =
        trimmed.length <= 24 ||
        /^(那|这个|这条|它|其|上游|下游|核心|相关|对应|还有|那么)/.test(trimmed);

    if (!isLikelyFollowUp) {
        return trimmed;
    }

    return `${lastUserMessage}\n补充问题：${trimmed}`;
}

function sanitizeReport(report: Partial<ResearchReport> & {summary: string}): ResearchReport {
    return {
        summary: report.summary.trim(),
        reasoning: (report.reasoning ?? []).map((item) => item.trim()).filter(Boolean),
        risks: (report.risks ?? []).map((item) => item.trim()).filter(Boolean),
    };
}

export function buildFallbackReport(input: GenerateReportInput): ResearchReport {
    const topStocks = input.candidateStocks.slice(0, 3);
    const topLabels = topStocks.map((stock) => `${stock.companyName}(${stock.stockCode})`);

    return {
        summary:
            topStocks.length > 0
                ? `当前更值得关注的方向集中在 ${topLabels.join('、')} 等标的所对应的产业链环节。`
                : '当前没有足够强的结构化命中结果，建议结合更多上下文继续观察。',
        reasoning: input.reasoningPaths.slice(0, 3).map((item) => item.description),
        risks: [
            '当前结论基于试点行业图谱与规则排序，覆盖范围仍有限。',
            '若新闻上下文不完整或别名命中存在歧义，结果可能偏保守。',
        ],
    };
}

export async function generateResearchReport(input: GenerateReportInput): Promise<ResearchReport> {
    const env = getEnv();
    if (input.candidateStocks.length === 0 && input.reasoningPaths.length === 0) {
        return buildFallbackReport(input);
    }

    if (!env.OPENAI_API_KEY) {
        return buildFallbackReport(input);
    }

    try {
        const model = createChatModel(0.2);
        if (!model) {
            return buildFallbackReport(input);
        }

        const chain = buildResearchReportPrompt().pipe(model.withStructuredOutput(researchReportSchema));
        const parsed = await chain.invoke(buildResearchPromptVariables(input));
        return sanitizeReport(parsed);
    } catch (error) {
        console.error('[ai] generate report failed:', error);
        try {
            const model = createChatModel(0.2);
            if (!model) {
                return buildFallbackReport(input);
            }

            const response = await model.invoke(buildResearchPrompt(input));
            const content =
                typeof response.content === 'string'
                    ? response.content
                    : response.content
                          .map((item) => ('text' in item && typeof item.text === 'string' ? item.text : ''))
                          .join('');
            const jsonBlock = extractJsonBlock(content);
            if (!jsonBlock) {
                return buildFallbackReport(input);
            }

            const parsed = researchReportSchema.parse(JSON.parse(jsonBlock));
            return sanitizeReport(parsed);
        } catch (fallbackError) {
            console.error('[ai] structured report fallback failed:', fallbackError);
            return buildFallbackReport(input);
        }
    }
}

export async function extractNewsSearchHints(input: {rawText: string}) {
    const trimmed = input.rawText.trim();
    if (!trimmed) {
        return {keywords: [] as string[], tags: [] as string[], angle: ''};
    }

    try {
        const model = createChatModel(0);
        if (!model) {
            return {keywords: [] as string[], tags: [] as string[], angle: ''};
        }

        const chain = buildNewsSearchHintsPrompt().pipe(model.withStructuredOutput(newsSearchHintsSchema));
        const result = await chain.invoke({rawText: trimmed});

        return {
            keywords: [...new Set((result.keywords ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 8),
            tags: [...new Set((result.tags ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 8),
            angle: (result.angle ?? '').trim(),
        };
    } catch (error) {
        console.error('[ai] extract news search hints failed:', error);
        return {keywords: [] as string[], tags: [] as string[], angle: ''};
    }
}

type TavilySearchResult = {
    query: string;
    results: ResearchEvidence[];
};

type NewsSearchPlan = {
    profile: 'general' | 'china_market' | 'market_turnover' | 'brokerage' | 'index' | 'policy';
    queryKeywords: string[];
    preferredDomains: string[];
    relevancePattern: RegExp | null;
};

function normalizeDomains(value?: string) {
    return (value ?? '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function uniqueStrings(items: Array<string | undefined | null>) {
    return [...new Set(items.map((item) => item?.trim()).filter(Boolean) as string[])];
}

function normalizeSearchKeywords(keywords: string[]) {
    const genericWords = new Set([
        '市场动态',
        '股市分析',
        '分析',
        '变化',
        '影响',
        '动态',
        '市场',
        '股市',
        '新闻',
    ]);

    return uniqueStrings(keywords)
        .filter((item) => item.length >= 2)
        .filter((item) => !genericWords.has(item))
        .slice(0, 8);
}

function inferNewsSearchPlan(rawText: string, keywords: string[]) {
    const text = `${rawText} ${keywords.join(' ')}`.toLowerCase();
    const chinaFinanceDomains = ['cls.cn', 'eastmoney.com', 'stcn.com', '10jqka.com.cn', 'jrj.com.cn', 'caixin.com'];
    const normalizedKeywords = normalizeSearchKeywords(keywords);

    if (/成交额|放量|缩量|交投|换手|活跃资金|两市/.test(rawText)) {
        return {
            profile: 'market_turnover',
            queryKeywords: uniqueStrings(['中国A股', '沪深两市', 'A股成交额', '市场交投', ...normalizedKeywords]),
            preferredDomains: chinaFinanceDomains,
            relevancePattern: /沪深|两市|a股|成交额|交投|放量|缩量|券商|北交所|上证|深证/i,
        } satisfies NewsSearchPlan;
    }

    if (/券商|两融|证券板块|经纪业务|投行/.test(rawText)) {
        return {
            profile: 'brokerage',
            queryKeywords: uniqueStrings(['中国A股', '券商板块', '两融', '市场交投', ...normalizedKeywords]),
            preferredDomains: chinaFinanceDomains,
            relevancePattern: /券商|证券|两融|经纪业务|投行|a股|沪深/i,
        } satisfies NewsSearchPlan;
    }

    if (/上证|深证|创业板|科创板|北证|指数|沪指|深成指/.test(rawText)) {
        return {
            profile: 'index',
            queryKeywords: uniqueStrings(['中国A股', '沪深指数', '市场风格', ...normalizedKeywords]),
            preferredDomains: chinaFinanceDomains,
            relevancePattern: /指数|沪指|深成指|创业板|科创板|北证|a股|沪深/i,
        } satisfies NewsSearchPlan;
    }

    if (/政策|发改委|工信部|国务院|财政部|证监会|监管/.test(rawText)) {
        return {
            profile: 'policy',
            queryKeywords: uniqueStrings(['中国政策', '产业政策', ...normalizedKeywords]),
            preferredDomains: [...chinaFinanceDomains, 'gov.cn', 'ndrc.gov.cn', 'miit.gov.cn', 'csrc.gov.cn'],
            relevancePattern: /政策|监管|发改委|工信部|国务院|财政部|证监会/i,
        } satisfies NewsSearchPlan;
    }

    if (/沪深|两市|a股|上证|深证|北证|财联社|涨停|跌停|10jqka|eastmoney|cls/.test(text)) {
        return {
            profile: 'china_market',
            queryKeywords: uniqueStrings(['中国A股', '沪深两市', '财联社', ...normalizedKeywords]),
            preferredDomains: chinaFinanceDomains,
            relevancePattern: /沪深|两市|a股|上证|深证|北证|券商|成交额|财联社/i,
        } satisfies NewsSearchPlan;
    }

    return {
        profile: 'general',
        queryKeywords: normalizedKeywords,
        preferredDomains: [],
        relevancePattern: null,
    } satisfies NewsSearchPlan;
}

function isRelevantEvidence(item: ResearchEvidence, pattern: RegExp | null) {
    if (!pattern) {
        return true;
    }

    const haystack = `${item.title} ${item.snippet} ${item.source}`;
    return pattern.test(haystack);
}

function inferObservationTypeFromText(rawText: string): ModelObservationType {
    if (/成交额|放量|缩量|指数|沪深|两市|情绪|风险偏好|风格/.test(rawText)) {
        return 'macro_market';
    }

    if (/主题|概念|板块|轮动/.test(rawText)) {
        return 'sector_theme';
    }

    if (/上游|下游|中游|环节|供给|产能|原材料|设备/.test(rawText)) {
        return 'industry_chain';
    }

    return 'event_driver';
}

function normalizeAngleForSearch(angle?: string) {
    const trimmed = angle?.trim() ?? '';
    if (!trimmed) {
        return '';
    }

    return trimmed.replace(/^(分析|研判)/, '').trim();
}

export async function searchWebNewsContext(input: {rawText: string; keywords: string[]; angle?: string}) {
    const env = getEnv();
    if (!env.TAVILY_API_KEY) {
        return {query: '', results: []} satisfies TavilySearchResult;
    }

    const searchPlan = inferNewsSearchPlan(input.rawText, input.keywords);
    const allowedDomains = normalizeDomains(env.TAVILY_ALLOWED_DOMAINS);
    const mergedDomains = uniqueStrings([...allowedDomains, ...searchPlan.preferredDomains]);
    const normalizedAngle = normalizeAngleForSearch(input.angle);
    const query =
        [...searchPlan.queryKeywords.slice(0, 6), normalizedAngle].filter(Boolean).join(' | ') ||
        input.rawText.trim();
    const cacheKey = JSON.stringify({
        query,
        domains: mergedDomains,
        maxResults: env.TAVILY_MAX_RESULTS,
    });
    const cache = getTavilyCache(env.TAVILY_CACHE_TTL_SECONDS);
    const cached = cache.get<TavilySearchResult>(cacheKey);
    if (cached) {
        return cached;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), env.TAVILY_TIMEOUT_MS);
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                api_key: env.TAVILY_API_KEY,
                query,
                topic: 'news',
                search_depth: 'advanced',
                max_results: env.TAVILY_MAX_RESULTS,
                include_answer: false,
                include_images: false,
                include_raw_content: false,
                include_domains: mergedDomains.length > 0 ? mergedDomains : undefined,
            }),
        });

        if (!response.ok) {
            throw new Error(`Tavily request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as {
            query?: string;
            results?: Array<{
                title?: string;
                url?: string;
                content?: string;
                score?: number;
            }>;
        };

        const result = {
            query: payload.query ?? query,
            results: (payload.results ?? [])
                .map((item) => ({
                    title: item.title?.trim() ?? '',
                    url: item.url?.trim() ?? '',
                    snippet: item.content?.trim() ?? '',
                    source: (() => {
                        try {
                            return item.url ? new URL(item.url).hostname : 'unknown';
                        } catch {
                            return 'unknown';
                        }
                    })(),
                    score: typeof item.score === 'number' ? Number(item.score.toFixed(4)) : null,
                }))
                .filter((item) => {
                    if (!item.title || !item.url || !item.snippet) {
                        return false;
                    }

                    if (!isRelevantEvidence(item, searchPlan.relevancePattern)) {
                        return false;
                    }

                    if (mergedDomains.length === 0) {
                        return true;
                    }

                    return mergedDomains.some((domain) => item.source === domain || item.source.endsWith(`.${domain}`));
                }),
        } satisfies TavilySearchResult;

        cache.set(cacheKey, result, env.TAVILY_CACHE_TTL_SECONDS);
        return result;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn(`[ai] tavily web search timeout after ${env.TAVILY_TIMEOUT_MS}ms`);
            return {query, results: []} satisfies TavilySearchResult;
        }
        console.error('[ai] tavily web search failed:', error);
        return {query, results: []} satisfies TavilySearchResult;
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}

export async function generateModelOnlyObservation(input: {
    rawText: string;
    searchKeywords: string[];
    webSearchEvidence: ResearchEvidence[];
}): Promise<ModelObservation> {
    if (input.webSearchEvidence.length === 0) {
        return {
            observationType: inferObservationTypeFromText(input.rawText),
            summary: '当前新闻未命中图谱，且缺少足够外部证据，暂时只能做低置信观察。',
            directions: [],
            risks: ['当前判断仅基于原始新闻，未完成图谱验证。'],
        };
    }

    try {
        const model = createChatModel(0.1);
        if (!model) {
            return {
                observationType: inferObservationTypeFromText(input.rawText),
                summary: '当前新闻未命中图谱，但外部搜索显示其更接近宏观/市场风格变化，建议作为观察线索而非结论使用。',
                directions: [],
                risks: ['当前判断依赖外部搜索证据，未完成图谱验证。'],
            };
        }

        const chain = buildModelOnlyObservationPrompt().pipe(model.withStructuredOutput(modelOnlyObservationSchema));
        const result = await chain.invoke(
            buildResearchPromptVariables({
                rawText: input.rawText,
                candidateStocks: [],
                reasoningPaths: [],
                searchKeywords: input.searchKeywords,
                webSearchEvidence: input.webSearchEvidence,
            })
        );

        return {
            observationType: result.observationType ?? inferObservationTypeFromText(input.rawText),
            summary: result.summary.trim(),
            directions: (result.directions ?? []).map((item) => item.trim()).filter(Boolean),
            risks: (result.risks ?? []).map((item) => item.trim()).filter(Boolean),
        };
    } catch (error) {
        console.error('[ai] generate model-only observation failed:', error);
        return {
            observationType: inferObservationTypeFromText(input.rawText),
            summary: '当前新闻未命中图谱，但外部搜索显示其更接近市场情绪或主题风格变化，建议先作为观察线索。',
            directions: [],
            risks: ['当前判断依赖模型与外部搜索，未完成图谱验证。'],
        };
    }
}

export async function extractGroundedNewsSearchHints(input: {
    rawText: string;
    searchKeywords: string[];
    webSearchEvidence: ResearchEvidence[];
}) {
    if (input.webSearchEvidence.length === 0) {
        return {keywords: [] as string[], tags: [] as string[], angle: ''};
    }

    try {
        const model = createChatModel(0);
        if (!model) {
            return {keywords: [] as string[], tags: [] as string[], angle: ''};
        }

        const chain = buildGroundedNewsSearchHintsPrompt().pipe(model.withStructuredOutput(groundedNewsSearchHintsSchema));
        const result = await chain.invoke(
            buildResearchPromptVariables({
                rawText: input.rawText,
                candidateStocks: [],
                reasoningPaths: [],
                searchKeywords: input.searchKeywords,
                webSearchEvidence: input.webSearchEvidence,
            })
        );

        return {
            keywords: [...new Set((result.keywords ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 10),
            tags: [...new Set((result.tags ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 10),
            angle: (result.angle ?? '').trim(),
        };
    } catch (error) {
        console.error('[ai] extract grounded news search hints failed:', error);
        return {keywords: [] as string[], tags: [] as string[], angle: ''};
    }
}

export async function extractMentionedCompanies(input: {
    rawText: string;
    searchKeywords: string[];
    webSearchEvidence: ResearchEvidence[];
}): Promise<{companies: MentionedCompany[]; themes: string[]}> {
    const trimmed = input.rawText.trim();
    if (!trimmed) {
        return {companies: [], themes: []};
    }

    try {
        const model = createChatModel(0);
        if (!model) {
            return {companies: [], themes: []};
        }

        const chain = buildMentionedCompaniesPrompt().pipe(model.withStructuredOutput(mentionedCompaniesSchema));
        const result = await chain.invoke(
            buildResearchPromptVariables({
                rawText: trimmed,
                candidateStocks: [],
                reasoningPaths: [],
                searchKeywords: input.searchKeywords,
                webSearchEvidence: input.webSearchEvidence,
            })
        );

        return {
            companies: (result.companies ?? [])
                .map((item) => ({
                    name: item.name.trim(),
                    confidence: clampScore(item.confidence ?? 0.5),
                    evidence: (item.evidence ?? '').trim(),
                }))
                .filter((item) => item.name),
            themes: [...new Set((result.themes ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 8),
        };
    } catch (error) {
        console.error('[ai] extract mentioned companies failed:', error);
        return {companies: [], themes: []};
    }
}

type RewriteChatQueryInput = {
    message: string;
    history: ChatHistoryTurn[];
};

export async function rewriteChatQuery(input: RewriteChatQueryInput) {
    const trimmed = input.message.trim();
    if (!trimmed || input.history.length === 0) {
        return trimmed;
    }

    try {
        const model = createChatModel(0);
        if (!model) {
            return fallbackRewriteChatQuery(input);
        }

        const chain = buildChatRewritePrompt().pipe(model.withStructuredOutput(chatQueryRewriteSchema));
        const result = await chain.invoke({
            message: trimmed,
            history: input.history.slice(-6).map((item) => {
                if (item.role === 'assistant') {
                    return new AIMessage(item.content);
                }

                return new HumanMessage(item.content);
            }),
        });

        const rewritten = result.standaloneQuery.trim();
        return rewritten || fallbackRewriteChatQuery(input);
    } catch (error) {
        console.error('[ai] rewrite chat query failed:', error);
        return fallbackRewriteChatQuery(input);
    }
}

type RerankCandidateStocksInput = GenerateReportInput;

export async function rerankCandidateStocksWithAi(input: RerankCandidateStocksInput): Promise<CandidateStock[]> {
    if (input.candidateStocks.length <= 1) {
        return input.candidateStocks;
    }

    try {
        const model = createChatModel(0);
        if (!model) {
            return input.candidateStocks;
        }

        const chain = buildStockRerankPrompt().pipe(model.withStructuredOutput(rerankedStocksSchema));
        const result = await chain.invoke(buildResearchPromptVariables(input));
        const stocks = result.stocks ?? [];
        if (stocks.length === 0) {
            return input.candidateStocks;
        }

        const stockMap = new Map(input.candidateStocks.map((stock) => [stock.stockCode, stock]));
        const reranked = stocks
            .map((item) => {
                const original = stockMap.get(item.stockCode);
                if (!original) {
                    return null;
                }

                return {
                    ...original,
                    score: clampScore(item.score),
                    reason: item.reason.trim(),
                };
            })
            .filter((item): item is CandidateStock => Boolean(item));

        if (reranked.length === 0) {
            return input.candidateStocks;
        }

        const includedCodes = new Set(reranked.map((stock) => stock.stockCode));
        const remaining = input.candidateStocks
            .filter((stock) => !includedCodes.has(stock.stockCode))
            .map((stock) => ({
                ...stock,
                score: clampScore(Math.min(stock.score, 0.08)),
                reason: `${stock.reason}；模型未列为重点候选，暂时降权处理`,
            }));

        return [...reranked, ...remaining]
            .filter((stock) => stock.score >= RERANK_KEEP_SCORE_THRESHOLD)
            .sort((a, b) => b.score - a.score);
    } catch (error) {
        console.error('[ai] rerank stocks failed:', error);
        return input.candidateStocks;
    }
}

export async function validateSectorRelevanceWithAi(input: {
    rawText: string;
    industries: Array<{id: string; name: string}>;
}): Promise<SectorRelevanceDecision[]> {
    if (input.industries.length === 0) {
        return [];
    }

    const fallback = input.industries.map((industry) => ({
        industryId: industry.id,
        industryName: industry.name,
        isRelevant: true,
        reason: '模型不可用，默认保留行业命中。',
    }));

    try {
        const model = createChatModel(0);
        if (!model) {
            return fallback;
        }

        const chain = buildSectorRelevancePrompt().pipe(model.withStructuredOutput(sectorRelevanceSchema));
        const result = await chain.invoke({
            rawText: input.rawText,
            industryLines: input.industries.map((item, index) => `${index + 1}. ${item.name}`).join('\n'),
        });
        const decisionByName = new Map(
            (result.industries ?? []).map((item) => [
                item.industryName.trim().toLowerCase(),
                {
                    isRelevant: item.isRelevant,
                    reason: (item.reason ?? '').trim(),
                },
            ])
        );

        return input.industries.map((industry) => {
            const matched = decisionByName.get(industry.name.trim().toLowerCase());
            return {
                industryId: industry.id,
                industryName: industry.name,
                isRelevant: matched?.isRelevant ?? true,
                reason: matched?.reason?.trim() || '模型未返回该行业结果，默认保留。',
            };
        });
    } catch (error) {
        console.error('[ai] validate sector relevance failed:', error);
        return fallback;
    }
}
