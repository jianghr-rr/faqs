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
    NewsClassificationType,
    ResearchEvidence,
    ResearchReport,
} from '~/lib/kg/types';
import {
    buildChatRewritePrompt,
    buildNewsClassificationPrompt,
    buildGroundedNewsSearchHintsPrompt,
    mapNewsClassificationLabel,
    buildMentionedCompaniesPrompt,
    buildModelOnlyObservationPrompt,
    buildNewsSearchHintsPrompt,
    buildResearchPrompt,
    buildResearchPromptVariables,
    buildResearchReportPrompt,
    buildResearchSelfCheckPrompt,
    buildSectorRelevancePrompt,
    buildStockRerankPrompt,
    chatQueryRewriteSchema,
    groundedNewsSearchHintsSchema,
    mentionedCompaniesSchema,
    modelOnlyObservationSchema,
    newsClassificationSchema,
    newsSearchHintsSchema,
    rerankedStocksSchema,
    researchReportSchema,
    researchSelfCheckSchema,
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
type PromptVersion = 'v1' | 'v2';

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

function getOpenAiProviderMeta() {
    const env = getEnv();
    const host = (() => {
        if (!env.OPENAI_BASE_URL) {
            return 'api.openai.com';
        }
        try {
            return new URL(env.OPENAI_BASE_URL).host;
        } catch {
            return 'invalid_base_url';
        }
    })();
    return {
        model: env.OPENAI_MODEL,
        providerHost: host,
    };
}

function isTimeoutError(error: unknown) {
    return error instanceof Error && error.name === 'TimeoutError';
}

async function withTimeout<T>(input: {operation: string; timeoutMs: number; run: () => Promise<T>}): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                const error = new Error(`${input.operation} timed out after ${input.timeoutMs}ms`);
                error.name = 'TimeoutError';
                reject(error);
            }, input.timeoutMs);
        });
        return await Promise.race([input.run(), timeoutPromise]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
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

type PartialProfessionalAnalysis = {
    coreEvent?: string;
    newsType?: '政策' | '行业' | '公司' | '宏观' | '事件驱动' | '其他';
    signalCategory?: '情绪噪音' | '短期事件' | '中期逻辑' | '长期趋势';
    eventWindow?: string;
    impactMechanism?: string[];
    impactTerm?: '短期' | '中期' | '长期' | '混合';
    industryImpacts?: Array<{
        industry?: string;
        sentiment?: '利好' | '利空' | '中性';
        path?: string;
    }>;
    chainAnalysis?: {
        upstream?: string[];
        midstream?: string[];
        downstream?: string[];
        mostBenefitedLink?: string;
        reason?: string;
    };
    aShareMapping?: Array<{
        stockCode?: string;
        stockName?: string;
        companyName?: string;
        logic?: string;
        elasticity?: '高' | '中' | '低';
        leaderPotential?: '高' | '中' | '低';
    }>;
    tradingView?: {
        opportunityType?: '情绪题材' | '趋势机会' | '基本面机会' | '观察';
        sustainability?: '强' | '中' | '弱';
        tradability?: '强' | '中' | '弱';
        strategy?: string[];
        worthTracking?: boolean;
        tradeValueSummary?: string;
    };
    falsificationPoints?: string[];
    noTradeReason?: string;
};

function sanitizeReport(
    report: {
        summary: string;
        reasoning?: string[];
        risks?: string[];
        professionalAnalysis?: PartialProfessionalAnalysis;
    }
): ResearchReport {
    const professional = report.professionalAnalysis;
    return {
        summary: report.summary.trim(),
        reasoning: (report.reasoning ?? []).map((item) => item.trim()).filter(Boolean),
        risks: (report.risks ?? []).map((item) => item.trim()).filter(Boolean),
        professionalAnalysis: professional
            ? {
                  coreEvent: professional.coreEvent?.trim() ?? '',
                  newsType: professional.newsType ?? '其他',
                  signalCategory: professional.signalCategory ?? '情绪噪音',
                  eventWindow: professional.eventWindow?.trim() ?? '',
                  impactMechanism: (professional.impactMechanism ?? []).map((item) => item.trim()).filter(Boolean),
                  impactTerm: professional.impactTerm ?? '短期',
                  industryImpacts: (professional.industryImpacts ?? [])
                      .map((item) => ({
                          industry: item.industry?.trim() ?? '',
                          sentiment: item.sentiment ?? '中性',
                          path: item.path?.trim() ?? '',
                      }))
                      .filter((item) => item.industry),
                  chainAnalysis: {
                      upstream: (professional.chainAnalysis?.upstream ?? []).map((item) => item.trim()).filter(Boolean),
                      midstream: (professional.chainAnalysis?.midstream ?? []).map((item) => item.trim()).filter(Boolean),
                      downstream: (professional.chainAnalysis?.downstream ?? []).map((item) => item.trim()).filter(Boolean),
                      mostBenefitedLink: professional.chainAnalysis?.mostBenefitedLink?.trim() ?? '',
                      reason: professional.chainAnalysis?.reason?.trim() ?? '',
                  },
                  aShareMapping: (professional.aShareMapping ?? [])
                      .map((item) => ({
                          stockCode: item.stockCode?.trim() ?? '',
                          stockName: item.stockName?.trim() ?? '',
                          companyName: item.companyName?.trim() ?? '',
                          logic: item.logic?.trim() ?? '',
                          elasticity: item.elasticity ?? '中',
                          leaderPotential: item.leaderPotential ?? '中',
                      }))
                      .filter((item) => item.companyName || item.stockCode)
                      .slice(0, 6),
                  tradingView: {
                      opportunityType: professional.tradingView?.opportunityType ?? '观察',
                      sustainability: professional.tradingView?.sustainability ?? '弱',
                      tradability: professional.tradingView?.tradability ?? '弱',
                      strategy: (professional.tradingView?.strategy ?? []).map((item) => item.trim()).filter(Boolean),
                      worthTracking: professional.tradingView?.worthTracking === true,
                      tradeValueSummary: professional.tradingView?.tradeValueSummary?.trim() ?? '',
                  },
                  falsificationPoints: (professional.falsificationPoints ?? []).map((item) => item.trim()).filter(Boolean),
                  noTradeReason: professional.noTradeReason?.trim() ?? '',
              }
            : undefined,
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
        professionalAnalysis: {
            coreEvent: input.rawText.slice(0, 30),
            newsType: '其他',
            signalCategory: topStocks.length > 0 ? '短期事件' : '情绪噪音',
            eventWindow: topStocks.length > 0 ? '预计 1-3 天观察窗口' : '缺少有效窗口',
            impactMechanism: [],
            impactTerm: '短期',
            industryImpacts: [],
            chainAnalysis: {
                upstream: [],
                midstream: [],
                downstream: [],
                mostBenefitedLink: '',
                reason: '',
            },
            aShareMapping: topStocks.map((stock) => ({
                stockCode: stock.stockCode,
                stockName: stock.stockName,
                companyName: stock.companyName,
                logic: stock.reason,
                elasticity: '中',
                leaderPotential: '中',
            })),
            tradingView: {
                opportunityType: topStocks.length > 0 ? '观察' : '观察',
                sustainability: topStocks.length > 0 ? '中' : '弱',
                tradability: topStocks.length > 0 ? '中' : '弱',
                strategy: topStocks.length > 0 ? ['观察'] : [],
                worthTracking: topStocks.length > 0,
                tradeValueSummary: topStocks.length > 0 ? '可作为观察池跟踪，需等待更强催化。' : '无交易价值，建议等待更明确催化。',
            },
            falsificationPoints: ['若后续缺乏增量政策/业绩/订单验证，当前逻辑将迅速衰减。'],
            noTradeReason: topStocks.length > 0 ? '' : '结构化命中与外部证据不足，无法形成可执行交易信号。',
        },
    };
}

function getShadowPromptVersion(version: PromptVersion): PromptVersion {
    return version === 'v1' ? 'v2' : 'v1';
}

async function runResearchReportWithVersion(input: GenerateReportInput, version: PromptVersion) {
    const env = getEnv();
    const model = createChatModel(0.2);
    if (!model) {
        return null;
    }

    const chain = buildResearchReportPrompt(version).pipe(model.withStructuredOutput(researchReportSchema));
    const parsed = await withTimeout({
        operation: `runResearchReportWithVersion:${version}`,
        timeoutMs: env.OPENAI_REPORT_TIMEOUT_MS,
        run: () => chain.invoke(buildResearchPromptVariables(input)),
    });
    return sanitizeReport(parsed);
}

function logPromptComparison(input: {
    baseVersion: PromptVersion;
    baseReport: ResearchReport;
    shadowVersion: PromptVersion;
    shadowReport: ResearchReport;
}) {
    const base = input.baseReport.professionalAnalysis;
    const shadow = input.shadowReport.professionalAnalysis;
    const baseCodes = new Set((base?.aShareMapping ?? []).map((item) => item.stockCode).filter(Boolean));
    const shadowCodes = new Set((shadow?.aShareMapping ?? []).map((item) => item.stockCode).filter(Boolean));
    const onlyBase = [...baseCodes].filter((code) => !shadowCodes.has(code));
    const onlyShadow = [...shadowCodes].filter((code) => !baseCodes.has(code));

    console.info(
        `[ai-prof][ab-compare] base=${input.baseVersion} shadow=${input.shadowVersion} ` +
            `signalCategory=${base?.signalCategory ?? 'n/a'}->${shadow?.signalCategory ?? 'n/a'} ` +
            `worthTracking=${base?.tradingView.worthTracking ?? false}->${shadow?.tradingView.worthTracking ?? false} ` +
            `aShareCount=${base?.aShareMapping.length ?? 0}->${shadow?.aShareMapping.length ?? 0} ` +
            `onlyBaseCodes=${onlyBase.join('|') || '-'} onlyShadowCodes=${onlyShadow.join('|') || '-'}`
    );
}

export async function selfCheckResearchReport(input: GenerateReportInput & {report: ResearchReport}): Promise<ResearchReport> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
        return input.report;
    }
    const start = Date.now();
    const providerMeta = getOpenAiProviderMeta();
    console.info(
        `[ai-prof] op=selfCheckResearchReport phase=start timeoutMs=${env.OPENAI_REPORT_SELF_CHECK_TIMEOUT_MS} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
    );

    try {
        const model = createChatModel(0);
        if (!model) {
            return input.report;
        }

        const chain = buildResearchSelfCheckPrompt().pipe(model.withStructuredOutput(researchSelfCheckSchema));
        const check = await withTimeout({
            operation: 'selfCheckResearchReport',
            timeoutMs: env.OPENAI_REPORT_SELF_CHECK_TIMEOUT_MS,
            run: () =>
                chain.invoke({
                    ...buildResearchPromptVariables(input),
                    reportJson: JSON.stringify(input.report),
                }),
        });
        console.info(
            `[ai-prof] op=selfCheckResearchReport phase=done elapsedMs=${Date.now() - start} needsRevision=${
                check.needsRevision ? 'true' : 'false'
            } model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
        );

        if (!check.needsRevision || !check.revisedReport) {
            return input.report;
        }

        return sanitizeReport(check.revisedReport);
    } catch (error) {
        if (isTimeoutError(error)) {
            console.warn(
                `[ai-prof] op=selfCheckResearchReport phase=timeout elapsedMs=${Date.now() - start} timeoutMs=${env.OPENAI_REPORT_SELF_CHECK_TIMEOUT_MS} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
            );
            return input.report;
        }
        console.error(
            `[ai-prof] op=selfCheckResearchReport phase=error elapsedMs=${Date.now() - start} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`,
            error
        );
        console.error('[ai] self check research report failed:', error);
        return input.report;
    }
}

export async function generateResearchReport(input: GenerateReportInput): Promise<ResearchReport> {
    const env = getEnv();
    if (input.candidateStocks.length === 0 && input.reasoningPaths.length === 0) {
        return buildFallbackReport(input);
    }

    if (!env.OPENAI_API_KEY) {
        return buildFallbackReport(input);
    }
    const start = Date.now();
    const providerMeta = getOpenAiProviderMeta();
    console.info(
        `[ai-prof] op=generateResearchReport phase=start timeoutMs=${env.OPENAI_REPORT_TIMEOUT_MS} promptVersion=${env.RESEARCH_REPORT_PROMPT_VERSION} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
    );

    try {
        const activeVersion = env.RESEARCH_REPORT_PROMPT_VERSION;
        const baseReport = await runResearchReportWithVersion(input, activeVersion);
        if (!baseReport) {
            return buildFallbackReport(input);
        }

        const checked = await selfCheckResearchReport({
            ...input,
            report: baseReport,
        });
        console.info(
            `[ai-prof] op=generateResearchReport phase=done elapsedMs=${Date.now() - start} reasoningCount=${checked.reasoning.length} riskCount=${checked.risks.length} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
        );
        if (env.RESEARCH_REPORT_AB_COMPARE_ENABLED) {
            const shadowVersion = getShadowPromptVersion(activeVersion);
            try {
                const shadowReport = await runResearchReportWithVersion(input, shadowVersion);
                if (shadowReport) {
                    logPromptComparison({
                        baseVersion: activeVersion,
                        baseReport: checked,
                        shadowVersion,
                        shadowReport,
                    });
                }
            } catch (shadowError) {
                console.warn(
                    `[ai-prof][ab-compare] shadow run failed base=${activeVersion} shadow=${shadowVersion}:`,
                    shadowError
                );
            }
        }
        return checked;
    } catch (error) {
        if (isTimeoutError(error)) {
            console.warn(
                `[ai-prof] op=generateResearchReport phase=timeout elapsedMs=${Date.now() - start} timeoutMs=${env.OPENAI_REPORT_TIMEOUT_MS} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
            );
            return buildFallbackReport(input);
        }
        console.error(
            `[ai-prof] op=generateResearchReport phase=error elapsedMs=${Date.now() - start} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`,
            error
        );
        console.error('[ai] generate report failed:', error);
        try {
            const model = createChatModel(0.2);
            if (!model) {
                return buildFallbackReport(input);
            }

            const response = await withTimeout({
                operation: 'generateResearchReportFallback',
                timeoutMs: env.OPENAI_REPORT_TIMEOUT_MS,
                run: () => model.invoke(buildResearchPrompt(input)),
            });
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
            const sanitized = sanitizeReport(parsed);
            console.info(
                `[ai-prof] op=generateResearchReport phase=done_fallback elapsedMs=${Date.now() - start} reasoningCount=${sanitized.reasoning.length} riskCount=${sanitized.risks.length} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
            );
            return selfCheckResearchReport({
                ...input,
                report: sanitized,
            });
        } catch (fallbackError) {
            if (isTimeoutError(fallbackError)) {
                console.warn(
                    `[ai-prof] op=generateResearchReport phase=timeout_fallback elapsedMs=${Date.now() - start} timeoutMs=${env.OPENAI_REPORT_TIMEOUT_MS} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
                );
                return buildFallbackReport(input);
            }
            console.error('[ai] structured report fallback failed:', fallbackError);
            return buildFallbackReport(input);
        }
    }
}

export async function extractNewsSearchHints(input: {rawText: string}) {
    const env = getEnv();
    const trimmed = input.rawText.trim();
    if (!trimmed) {
        return {keywords: [] as string[], tags: [] as string[], angle: ''};
    }
    const start = Date.now();
    const providerMeta = getOpenAiProviderMeta();
    console.info(
        `[ai-prof] op=extractNewsSearchHints phase=start rawTextChars=${trimmed.length} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
    );

    try {
        const model = createChatModel(0);
        if (!model) {
            return {keywords: [] as string[], tags: [] as string[], angle: ''};
        }

        const chain = buildNewsSearchHintsPrompt().pipe(model.withStructuredOutput(newsSearchHintsSchema));
        const result = await withTimeout({
            operation: 'extractNewsSearchHints',
            timeoutMs: env.OPENAI_HINTS_TIMEOUT_MS,
            run: () => chain.invoke({rawText: trimmed}),
        });
        console.info(
            `[ai-prof] op=extractNewsSearchHints phase=done elapsedMs=${Date.now() - start} keywordCount=${
                result.keywords?.length ?? 0
            } tagCount=${result.tags?.length ?? 0} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
        );

        return {
            keywords: [...new Set((result.keywords ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 8),
            tags: [...new Set((result.tags ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 8),
            angle: (result.angle ?? '').trim(),
        };
    } catch (error) {
        if (isTimeoutError(error)) {
            console.warn(
                `[ai-prof] op=extractNewsSearchHints phase=timeout elapsedMs=${Date.now() - start} timeoutMs=${env.OPENAI_HINTS_TIMEOUT_MS} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
            );
            return {keywords: [] as string[], tags: [] as string[], angle: ''};
        }
        console.error(
            `[ai-prof] op=extractNewsSearchHints phase=error elapsedMs=${Date.now() - start} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`,
            error
        );
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

function fallbackClassifyNewsType(rawText: string): NewsClassificationType {
    if (/指数|涨|跌|收涨|收跌|反弹|回落|风险偏好|资金回流|情绪/.test(rawText)) {
        return 'market_status';
    }
    if (/同比|环比|业绩|营收|利润|cpi|ppi|pmi|非农|gdp|数据/.test(rawText)) {
        return 'data_release';
    }
    if (/政策|发布|落地|签约|投产|禁令|制裁|并购|合作|事故|中标/.test(rawText)) {
        return 'event_driven';
    }
    return 'noise';
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
        console.info(
            `[ai-prof] op=searchWebNewsContext phase=cache_hit keywordCount=${input.keywords.length} maxResults=${env.TAVILY_MAX_RESULTS}`
        );
        return cached;
    }

    const start = Date.now();
    console.info(
        `[ai-prof] op=searchWebNewsContext phase=start keywordCount=${input.keywords.length} maxResults=${env.TAVILY_MAX_RESULTS} timeoutMs=${env.TAVILY_TIMEOUT_MS}`
    );
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
        console.info(
            `[ai-prof] op=searchWebNewsContext phase=done elapsedMs=${Date.now() - start} resultCount=${
                result.results.length
            }`
        );
        return result;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn(
                `[ai-prof] op=searchWebNewsContext phase=timeout elapsedMs=${Date.now() - start} timeoutMs=${
                    env.TAVILY_TIMEOUT_MS
                }`
            );
            console.warn(`[ai] tavily web search timeout after ${env.TAVILY_TIMEOUT_MS}ms`);
            return {query, results: []} satisfies TavilySearchResult;
        }
        console.error(`[ai-prof] op=searchWebNewsContext phase=error elapsedMs=${Date.now() - start}`, error);
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
    newsType?: NewsClassificationType;
}): Promise<ModelObservation> {
    if (input.webSearchEvidence.length === 0) {
        return {
            observationType: inferObservationTypeFromText(input.rawText),
            summary: '当前新闻未命中图谱，且缺少足够外部证据，暂时只能做低置信观察。',
            directions: [],
            risks: ['当前判断仅基于原始新闻，未完成图谱验证。'],
            marketSignal:
                input.newsType === 'market_status' ? '当前更接近市场结果描述，反映风险偏好与资金风格变化。' : undefined,
            possibleDrivers: input.newsType === 'market_status' ? [] : undefined,
            mappedSectors: input.newsType === 'market_status' ? [] : undefined,
            aShareImpact: input.newsType === 'market_status' ? '对A股更多体现为情绪联动，非确定性基本面催化。' : undefined,
            tradeValue: input.newsType === 'market_status' ? 'weak' : undefined,
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
                newsTypeHint: mapNewsClassificationLabel(input.newsType ?? 'event_driven'),
            })
        );

        return {
            observationType: result.observationType ?? inferObservationTypeFromText(input.rawText),
            summary: result.summary.trim(),
            directions: (result.directions ?? []).map((item) => item.trim()).filter(Boolean),
            risks: (result.risks ?? []).map((item) => item.trim()).filter(Boolean),
            marketSignal: result.marketSignal?.trim() ?? '',
            possibleDrivers: (result.possibleDrivers ?? []).map((item) => item.trim()).filter(Boolean),
            mappedSectors: (result.mappedSectors ?? []).map((item) => item.trim()).filter(Boolean),
            aShareImpact: result.aShareImpact?.trim() ?? '',
            tradeValue: result.tradeValue,
        };
    } catch (error) {
        console.error('[ai] generate model-only observation failed:', error);
        return {
            observationType: inferObservationTypeFromText(input.rawText),
            summary: '当前新闻未命中图谱，但外部搜索显示其更接近市场情绪或主题风格变化，建议先作为观察线索。',
            directions: [],
            risks: ['当前判断依赖模型与外部搜索，未完成图谱验证。'],
            marketSignal:
                input.newsType === 'market_status' ? '更接近市场结果描述，指向风险偏好变化而非单一事件冲击。' : undefined,
            possibleDrivers: input.newsType === 'market_status' ? ['资金流向', '外盘联动', '政策预期'] : undefined,
            mappedSectors: input.newsType === 'market_status' ? ['科技成长', '互联网平台'] : undefined,
            aShareImpact: input.newsType === 'market_status' ? '可能带动A股成长风格短线情绪修复。' : undefined,
            tradeValue: input.newsType === 'market_status' ? 'weak' : undefined,
        };
    }
}

export async function classifyNewsType(input: {rawText: string}): Promise<{type: NewsClassificationType; reason: string}> {
    const trimmed = input.rawText.trim();
    if (!trimmed) {
        return {
            type: 'noise',
            reason: '空文本默认视为噪音输入。',
        };
    }

    try {
        const model = createChatModel(0);
        if (!model) {
            const type = fallbackClassifyNewsType(trimmed);
            return {type, reason: '模型不可用，使用规则分类。'};
        }

        const chain = buildNewsClassificationPrompt().pipe(model.withStructuredOutput(newsClassificationSchema));
        const result = await chain.invoke({rawText: trimmed});
        return {
            type: result.type,
            reason: (result.reason ?? '').trim(),
        };
    } catch (error) {
        console.error('[ai] classify news type failed:', error);
        const type = fallbackClassifyNewsType(trimmed);
        return {
            type,
            reason: '分类模型异常，使用规则分类回退。',
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
    const env = getEnv();
    const trimmed = input.rawText.trim();
    if (!trimmed) {
        return {companies: [], themes: []};
    }
    const start = Date.now();
    const providerMeta = getOpenAiProviderMeta();
    console.info(
        `[ai-prof] op=extractMentionedCompanies phase=start rawTextChars=${trimmed.length} keywordCount=${
            input.searchKeywords.length
        } evidenceCount=${input.webSearchEvidence.length} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
    );

    try {
        const model = createChatModel(0);
        if (!model) {
            return {companies: [], themes: []};
        }

        const chain = buildMentionedCompaniesPrompt().pipe(model.withStructuredOutput(mentionedCompaniesSchema));
        const result = await withTimeout({
            operation: 'extractMentionedCompanies',
            timeoutMs: env.OPENAI_MENTION_TIMEOUT_MS,
            run: () =>
                chain.invoke(
                    buildResearchPromptVariables({
                        rawText: trimmed,
                        candidateStocks: [],
                        reasoningPaths: [],
                        searchKeywords: input.searchKeywords,
                        webSearchEvidence: input.webSearchEvidence,
                    })
                ),
        });
        console.info(
            `[ai-prof] op=extractMentionedCompanies phase=done elapsedMs=${Date.now() - start} mentionCount=${
                result.companies?.length ?? 0
            } themeCount=${result.themes?.length ?? 0} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
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
        if (isTimeoutError(error)) {
            console.warn(
                `[ai-prof] op=extractMentionedCompanies phase=timeout elapsedMs=${Date.now() - start} timeoutMs=${env.OPENAI_MENTION_TIMEOUT_MS} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`
            );
            return {companies: [], themes: []};
        }
        console.error(
            `[ai-prof] op=extractMentionedCompanies phase=error elapsedMs=${Date.now() - start} model=${providerMeta.model} providerHost=${providerMeta.providerHost}`,
            error
        );
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
