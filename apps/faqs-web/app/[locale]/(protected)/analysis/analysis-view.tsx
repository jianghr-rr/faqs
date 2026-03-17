'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ExternalLink, Loader2, Search} from 'lucide-react';

type AnalysisMode = 'news' | 'query';

type AnalysisResult = {
    requestId: string;
    news?: {
        id: string;
        title: string;
        publishedAt: string;
        source: string;
    };
    query?: string;
    matchedEntities?: {
        themes: Array<{id: string; name: string; confidence: number}>;
        industries: Array<{id: string; name: string; confidence: number}>;
        chainNodes: Array<{id: string; name: string; confidence: number}>;
        companies: Array<{id: string; name: string; confidence: number}>;
    };
    resolvedEntities?: {
        themes: Array<{id: string; name: string; confidence: number}>;
        industries: Array<{id: string; name: string; confidence: number}>;
        chainNodes: Array<{id: string; name: string; confidence: number}>;
        companies: Array<{id: string; name: string; confidence: number}>;
    };
    reasoningPaths: Array<{path: string[]; description: string}>;
    candidateStocks: Array<{
        companyEntityId: string;
        companyName: string;
        stockCode: string;
        stockName: string;
        exchange: string;
        score: number;
        reason: string;
        origin: 'kg' | 'fallback_llm_mapping';
    }>;
    report?: {
        summary: string;
        reasoning: string[];
        risks: string[];
        professionalAnalysis?: {
            coreEvent: string;
            newsType: '政策' | '行业' | '公司' | '宏观' | '事件驱动' | '其他';
            signalCategory: '情绪噪音' | '短期事件' | '中期逻辑' | '长期趋势';
            eventWindow: string;
            impactMechanism: string[];
            impactTerm: '短期' | '中期' | '长期' | '混合';
            industryImpacts: Array<{
                industry: string;
                sentiment: '利好' | '利空' | '中性';
                path: string;
            }>;
            chainAnalysis: {
                upstream: string[];
                midstream: string[];
                downstream: string[];
                mostBenefitedLink: string;
                reason: string;
            };
            aShareMapping: Array<{
                stockCode: string;
                stockName: string;
                companyName: string;
                logic: string;
                elasticity: '高' | '中' | '低';
                leaderPotential: '高' | '中' | '低';
            }>;
            tradingView: {
                opportunityType: '情绪题材' | '趋势机会' | '基本面机会' | '观察';
                sustainability: '强' | '中' | '弱';
                tradability: '强' | '中' | '弱';
                strategy: string[];
                worthTracking: boolean;
                tradeValueSummary: string;
            };
            falsificationPoints: string[];
            noTradeReason: string;
        };
    } | null;
    observation?: {
        observationType: 'macro_market' | 'sector_theme' | 'industry_chain' | 'event_driver';
        summary: string;
        directions: string[];
        risks: string[];
        marketSignal?: string;
        possibleDrivers?: string[];
        mappedSectors?: string[];
        aShareImpact?: string;
        tradeValue?: 'weak' | 'medium' | 'strong';
    } | null;
    resultMeta?: {
        confidence: 'high' | 'medium' | 'low';
        sourceType: 'kg' | 'kg_plus_model' | 'model_plus_search' | 'model_mapping';
        validationStatus: 'kg_verified' | 'mixed' | 'model_only';
    };
    searchMetadata?: {
        keywords: string[];
        angle: string;
        webQuery: string;
        evidence: Array<{
            title: string;
            url: string;
            snippet: string;
            source: string;
            score: number | null;
        }>;
    };
    cache?: {
        hit: boolean;
        forced: boolean;
        analyzedAt: string;
    };
    trace?: {
        version: 'v1';
        requestId: string;
        mode: 'news_analysis' | 'chat_research';
        startedAt: string;
        finishedAt: string;
        elapsedMs: number;
        steps: Array<{
            name: string;
            label: string;
            status: 'running' | 'done' | 'skipped' | 'failed';
            elapsedMs: number;
            summary: string;
        }>;
    };
};

type TraceViewModel = NonNullable<AnalysisResult['trace']>;
type AnalyzeNewsStreamEvent =
    | {type: 'trace_start'; data: {mode: 'news_analysis'; startedAt: string}}
    | {type: 'trace_step'; data: TraceViewModel['steps'][number]}
    | {type: 'final'; data: AnalysisResult}
    | {type: 'error'; error: {code: string; message: string}};

function ResultBadge({label, value}: {label: string; value: string}) {
    return (
        <div className="rounded-full bg-bg-hover px-3 py-1 text-[11px] font-medium text-text-secondary">
            {label}：{value}
        </div>
    );
}

function getObservationTypeLabel(type: 'macro_market' | 'sector_theme' | 'industry_chain' | 'event_driver') {
    switch (type) {
        case 'macro_market':
            return '宏观/市场风格';
        case 'sector_theme':
            return '行业/主题轮动';
        case 'industry_chain':
            return '产业链变化';
        case 'event_driver':
            return '事件驱动';
        default:
            return '模型观察';
    }
}

function getTradeValueLabel(value: 'weak' | 'medium' | 'strong') {
    switch (value) {
        case 'strong':
            return '强';
        case 'medium':
            return '中';
        case 'weak':
            return '弱';
        default:
            return '弱';
    }
}

function formatDateTime(dateStr: string) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
        return dateStr;
    }

    return date.toLocaleString('zh-CN', {hour12: false});
}

function getTraceStatusLabel(status: 'running' | 'done' | 'skipped' | 'failed') {
    switch (status) {
        case 'running':
            return '进行中';
        case 'done':
            return '完成';
        case 'skipped':
            return '跳过';
        case 'failed':
            return '失败';
        default:
            return status;
    }
}

function getTraceStatusClassName(status: 'running' | 'done' | 'skipped' | 'failed') {
    switch (status) {
        case 'running':
            return 'bg-accent/10 text-accent animate-pulse';
        case 'done':
            return 'bg-accent/10 text-accent';
        case 'skipped':
            return 'bg-bg-hover text-text-secondary';
        case 'failed':
            return 'bg-danger/10 text-danger';
        default:
            return 'bg-bg-hover text-text-secondary';
    }
}

function getIndustrySentimentClassName(sentiment: '利好' | '利空' | '中性') {
    switch (sentiment) {
        case '利好':
            return 'bg-accent/10 text-accent';
        case '利空':
            return 'bg-danger/10 text-danger';
        default:
            return 'bg-bg-hover text-text-secondary';
    }
}

function explainNewsType(type: '政策' | '行业' | '公司' | '宏观' | '事件驱动' | '其他') {
    switch (type) {
        case '政策':
            return '通常是监管或部门文件，先看执行力度和落地时间。';
        case '行业':
            return '属于板块层面的变化，常影响一批公司而不是单家公司。';
        case '公司':
            return '主要影响个股基本面，关注订单、利润和估值变化。';
        case '宏观':
            return '影响市场风险偏好，常先作用于指数和大盘风格。';
        case '事件驱动':
            return '突发消息带来的短线波动，持续性不一定强。';
        default:
            return '信息不足或归因不明确，建议先观察。';
    }
}

function explainSignalCategory(category: '情绪噪音' | '短期事件' | '中期逻辑' | '长期趋势') {
    switch (category) {
        case '情绪噪音':
            return '大概率只影响情绪，不足以支撑持续行情。';
        case '短期事件':
            return '通常在 1-3 天内交易，过期后影响快速衰减。';
        case '中期逻辑':
            return '一般对应 1-3 个月主线，需要持续验证数据。';
        case '长期趋势':
            return '半年以上的方向，核心看产业和业绩兑现。';
        default:
            return '';
    }
}

function explainOpportunityType(type: '情绪题材' | '趋势机会' | '基本面机会' | '观察') {
    switch (type) {
        case '情绪题材':
            return '更看情绪与资金博弈，波动大、节奏快。';
        case '趋势机会':
            return '更看连续性，重在跟随而非猜顶猜底。';
        case '基本面机会':
            return '更看业绩与估值匹配，适合耐心跟踪。';
        default:
            return '当前更适合学习与观察，不建议激进交易。';
    }
}

const QUERY_SUGGESTIONS = [
    '储能政策利好哪些股票？',
    '光伏链条里逆变器和组件谁更有弹性？',
    '算力产业链里谁更值得关注？',
];

function ResultStat({
    label,
    value,
    hint,
}: {
    label: string;
    value: number;
    hint: string;
}) {
    return (
        <div className="rounded-xl border border-border bg-bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-text-primary">{value}</div>
            <div className="mt-1 text-xs text-text-secondary">{hint}</div>
        </div>
    );
}

function EntitySection({
    title,
    items,
}: {
    title: string;
    items: Array<{id: string; name: string; confidence: number}>;
}) {
    if (items.length === 0) return null;

    return (
        <div className="rounded-xl border border-border bg-bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-text-primary">{title}</h3>
                <span className="rounded-full bg-bg-hover px-2 py-1 text-[11px] text-text-secondary">
                    {items.length} 个命中
                </span>
            </div>
            <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                    <div key={item.id} className="rounded-lg bg-bg-hover px-3 py-2.5 text-sm text-text-primary">
                        <div className="font-medium">{item.name}</div>
                        <div className="mt-1 text-xs text-text-secondary">置信度 {Math.round(item.confidence * 100)}%</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function AnalysisView({
    initialMode,
    initialNewsId,
    initialNewsTitle,
    initialQuery,
}: {
    initialMode: AnalysisMode;
    initialNewsId?: string;
    initialNewsTitle?: string;
    initialQuery?: string;
}) {
    const [mode, setMode] = useState<AnalysisMode>(initialMode);
    const [newsId, setNewsId] = useState(initialNewsId ?? '');
    const [newsTitle, setNewsTitle] = useState(initialNewsTitle ?? '');
    const [query, setQuery] = useState(initialQuery ?? '');
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [liveTrace, setLiveTrace] = useState<TraceViewModel | null>(null);
    const [traceCollapsed, setTraceCollapsed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [knowledgeQuickView, setKnowledgeQuickView] = useState(true);
    const inFlightRequestKeyRef = useRef<string | null>(null);
    const initialAutoRunKeyRef = useRef<string | null>(null);

    const entityGroups = useMemo(() => result?.matchedEntities ?? result?.resolvedEntities, [result]);
    const resultStats = useMemo(
        () => ({
            industries: entityGroups?.industries.length ?? 0,
            chainNodes: entityGroups?.chainNodes.length ?? 0,
            companies: entityGroups?.companies.length ?? 0,
            candidateStocks: result?.candidateStocks.length ?? 0,
        }),
        [entityGroups, result]
    );
    const visibleEvidence = useMemo(() => result?.searchMetadata?.evidence.slice(0, 3) ?? [], [result]);

    const runAnalysis = useCallback(
        async (nextMode = mode, options?: {forceReanalyze?: boolean}) => {
            const forceReanalyze = options?.forceReanalyze === true;
            const requestKey =
                nextMode === 'news'
                    ? `news:${newsId.trim()}:force:${forceReanalyze}`
                    : `query:${query.trim()}:force:${forceReanalyze}`;
            if (inFlightRequestKeyRef.current === requestKey) {
                return;
            }

            inFlightRequestKeyRef.current = requestKey;
            setLoading(true);
            setError('');
            setLiveTrace(null);
            setTraceCollapsed(false);

            try {
                const endpoint = nextMode === 'news' ? '/api/research/analyze-news' : '/api/research/analyze-query';
                const body =
                    nextMode === 'news'
                        ? {
                              newsId,
                              forceReanalyze,
                              stream: true,
                          }
                        : {query};

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(body),
                });

                const isStreamResponse = response.headers.get('content-type')?.includes('application/x-ndjson');
                if (nextMode === 'news' && isStreamResponse && response.body) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let finalPayload: AnalysisResult | null = null;
                    let currentTrace: TraceViewModel | null = null;

                    const consumeEvent = (event: AnalyzeNewsStreamEvent) => {
                        if (event.type === 'trace_start') {
                            currentTrace = {
                                version: 'v1',
                                requestId: '',
                                mode: event.data.mode,
                                startedAt: event.data.startedAt,
                                finishedAt: '',
                                elapsedMs: 0,
                                steps: [],
                            };
                            setLiveTrace(currentTrace);
                            return;
                        }

                        if (event.type === 'trace_step') {
                            const baseTrace =
                                currentTrace ??
                                ({
                                    version: 'v1',
                                    requestId: '',
                                    mode: 'news_analysis',
                                    startedAt: new Date().toISOString(),
                                    finishedAt: '',
                                    elapsedMs: 0,
                                    steps: [],
                                } satisfies TraceViewModel);
                            const nextTrace: TraceViewModel = {
                                ...baseTrace,
                                steps: [...baseTrace.steps, event.data],
                                elapsedMs: baseTrace.steps.reduce((sum, item) => sum + item.elapsedMs, 0) + event.data.elapsedMs,
                            };
                            currentTrace = nextTrace;
                            setLiveTrace(nextTrace);
                            return;
                        }

                        if (event.type === 'final') {
                            finalPayload = event.data;
                            return;
                        }

                        if (event.type === 'error') {
                            throw new Error(event.error.message || '分析失败，请稍后重试');
                        }
                    };

                    while (true) {
                        const {value, done} = await reader.read();
                        if (done) {
                            break;
                        }
                        buffer += decoder.decode(value, {stream: true});
                        const lines = buffer.split('\n');
                        buffer = lines.pop() ?? '';
                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed) {
                                continue;
                            }
                            consumeEvent(JSON.parse(trimmed) as AnalyzeNewsStreamEvent);
                        }
                    }

                    if (buffer.trim()) {
                        consumeEvent(JSON.parse(buffer.trim()) as AnalyzeNewsStreamEvent);
                    }

                    if (!finalPayload) {
                        throw new Error('流式分析未返回最终结果');
                    }
                    const streamResult = finalPayload as AnalysisResult;
                    setResult(streamResult);
                    if (streamResult.news?.title) {
                        setNewsTitle(streamResult.news.title);
                    }
                    setLiveTrace(null);
                    setTraceCollapsed(true);
                } else {
                    const payload = (await response.json()) as AnalysisResult & {error?: {message?: string}};
                    if (!response.ok) {
                        throw new Error(payload?.error?.message ?? '分析失败，请稍后重试');
                    }
                    setResult(payload);
                    if (payload?.news?.title) {
                        setNewsTitle(payload.news.title);
                    }
                    setTraceCollapsed(true);
                }
            } catch (requestError) {
                setResult(null);
                setLiveTrace(null);
                setError(requestError instanceof Error ? requestError.message : '分析失败，请稍后重试');
            } finally {
                if (inFlightRequestKeyRef.current === requestKey) {
                    inFlightRequestKeyRef.current = null;
                }
                setLoading(false);
            }
        },
        [mode, newsId, query]
    );

    const visibleTrace = liveTrace ?? result?.trace ?? null;

    useEffect(() => {
        if (initialNewsId && initialMode === 'news') {
            const autoRunKey = `auto:news:${initialNewsId}`;
            if (initialAutoRunKeyRef.current === autoRunKey) {
                return;
            }
            initialAutoRunKeyRef.current = autoRunKey;
            void runAnalysis('news');
        }
        if (initialQuery && initialMode === 'query') {
            const autoRunKey = `auto:query:${initialQuery}`;
            if (initialAutoRunKeyRef.current === autoRunKey) {
                return;
            }
            initialAutoRunKeyRef.current = autoRunKey;
            void runAnalysis('query');
        }
    }, [initialMode, initialNewsId, initialQuery, runAnalysis]);

    return (
        <div className="mx-auto max-w-5xl px-4 py-4 lg:py-6">
            <div className="mt-5 rounded-2xl border border-border bg-bg-card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-medium text-text-primary">开始一次分析</div>
                        <p className="mt-1 text-xs leading-6 text-text-secondary">
                            支持按 `newsId` 分析新闻，或者直接输入一个研究问题。
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setMode('news')}
                            className={`rounded-md px-3 py-1.5 text-sm ${
                                mode === 'news' ? 'bg-accent text-white' : 'bg-bg-hover text-text-secondary'
                            }`}
                        >
                            新闻分析
                        </button>
                    </div>
                </div>

                {mode === 'query' && (
                    <div className="mb-4 flex flex-wrap gap-2">
                        {QUERY_SUGGESTIONS.map((item) => (
                            <button
                                key={item}
                                onClick={() => setQuery(item)}
                                className="rounded-full bg-bg-hover px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                )}

                {mode === 'news' ? (
                    <div className="space-y-3 lg:flex lg:items-end lg:gap-3 lg:space-y-0">
                        <div className="flex-1">
                            {newsTitle.trim() ? (
                                <>
                                    <label className="mb-1 block text-xs text-text-secondary">新闻标题</label>
                                    <div className="h-11 w-full rounded-xl border border-border bg-bg-base px-4 text-sm leading-[44px] text-text-primary">
                                        {newsTitle}
                                    </div>
                                    <div className="mt-1 text-[11px] text-text-disabled">
                                        内部标识：{newsId}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <label className="mb-1 block text-xs text-text-secondary">新闻 ID</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-disabled" />
                                        <input
                                            type="text"
                                            value={newsId}
                                            onChange={(event) => {
                                                setNewsId(event.target.value);
                                                setNewsTitle('');
                                            }}
                                            placeholder="从新闻卡片跳转时会自动带入"
                                            className="h-11 w-full rounded-xl border border-border bg-bg-base pl-10 pr-4 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        <button
                            onClick={() => void runAnalysis('news')}
                            disabled={!newsId.trim() || loading}
                            className="h-11 w-full rounded-xl bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 lg:w-auto"
                        >
                            {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : '执行分析'}
                        </button>
                        <button
                            onClick={() => void runAnalysis('news', {forceReanalyze: true})}
                            disabled={!newsId.trim() || loading}
                            className="h-11 w-full rounded-xl border border-accent/40 bg-accent/5 px-6 text-sm font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50 lg:w-auto"
                        >
                            强制重新分析
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs text-text-secondary">研究问题</label>
                            <textarea
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="例如：储能链条里谁最受益？"
                                className="min-h-28 w-full rounded-xl border border-border bg-bg-base px-3 py-3 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="text-xs text-text-secondary">需要连续追问时，建议切到聊天页保留上下文。</div>
                            <button
                                onClick={() => void runAnalysis('query')}
                                disabled={!query.trim() || loading}
                                className="h-11 rounded-xl bg-accent px-6 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : '执行分析'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}

            {visibleTrace && (
                <div className="mt-6 rounded-2xl border border-border bg-bg-card p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-medium text-text-primary">思考过程</h3>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-bg-hover px-2 py-1 text-[11px] text-text-secondary">
                                总耗时 {Math.round(visibleTrace.elapsedMs / 100) / 10}s
                            </span>
                            <span className="rounded-full bg-bg-hover px-2 py-1 text-[11px] text-text-secondary">
                                {visibleTrace.steps.length} 个步骤
                            </span>
                            {!liveTrace && (
                                <button
                                    type="button"
                                    onClick={() => setTraceCollapsed((prev) => !prev)}
                                    className="rounded-full bg-bg-hover px-2 py-1 text-[11px] text-text-secondary transition-colors hover:text-text-primary"
                                >
                                    {traceCollapsed ? '展开过程' : '收起过程'}
                                </button>
                            )}
                        </div>
                    </div>

                    {traceCollapsed && !liveTrace ? (
                        <div className="rounded-xl border border-border bg-bg-hover/60 px-4 py-3 text-xs text-text-secondary">
                            思考过程已收起，点击“展开过程”可查看每一步详情。
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {visibleTrace.steps.map((step, index) => (
                                <div key={`${step.name}-${index}`} className="rounded-xl border border-border bg-bg-hover/60 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-sm font-medium text-text-primary">{index + 1}. {step.label}</div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-bg-card px-2 py-1 text-[11px] text-text-secondary">
                                                {step.elapsedMs} ms
                                            </span>
                                            <span
                                                className={`rounded-full px-2 py-1 text-[11px] font-medium ${getTraceStatusClassName(step.status)}`}
                                            >
                                                {getTraceStatusLabel(step.status)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-xs leading-6 text-text-secondary">{step.summary}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {result && (
                <div className="mt-6 space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <ResultStat label="命中行业" value={resultStats.industries} hint="识别到的行业实体" />
                        <ResultStat label="链条环节" value={resultStats.chainNodes} hint="命中的产业链节点" />
                        <ResultStat label="关联公司" value={resultStats.companies} hint="图谱扩展后的公司实体" />
                        <ResultStat label="候选股票" value={resultStats.candidateStocks} hint="当前返回的证券候选" />
                    </div>

                    {(result.news || result.query) && (
                        <div className="rounded-2xl border border-border bg-bg-card p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div className="text-xs text-text-secondary">解读层级</div>
                                <button
                                    type="button"
                                    onClick={() => setKnowledgeQuickView((prev) => !prev)}
                                    className="rounded-full bg-bg-hover px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                                >
                                    {knowledgeQuickView ? '切换到深度拆解' : '切换到知识速览'}
                                </button>
                            </div>
                            {result.cache && (
                                <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-text-secondary">
                                    {result.cache.hit
                                        ? `已使用历史分析结果（分析时间：${formatDateTime(result.cache.analyzedAt)}）`
                                        : result.cache.forced
                                          ? `已重新分析并更新结果（分析时间：${formatDateTime(result.cache.analyzedAt)}）`
                                          : `已生成最新分析结果（分析时间：${formatDateTime(result.cache.analyzedAt)}）`}
                                </div>
                            )}
                            {result.news ? (
                                <>
                                    <div className="text-xs text-text-secondary">{result.news.source}</div>
                                    <h3 className="mt-1 text-lg font-semibold text-text-primary">{result.news.title}</h3>
                                    <div className="mt-2 text-xs text-text-secondary">
                                        发布时间 {new Date(result.news.publishedAt).toLocaleString('zh-CN')}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="text-xs text-text-secondary">研究问题</div>
                                    <h3 className="mt-1 text-lg font-semibold text-text-primary">{result.query}</h3>
                                </>
                            )}
                            {result.resultMeta && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <ResultBadge
                                        label="验证状态"
                                        value={
                                            result.resultMeta.validationStatus === 'kg_verified'
                                                ? '图谱验证'
                                                : result.resultMeta.validationStatus === 'mixed'
                                                  ? '图谱+模型'
                                                  : '模型观察'
                                        }
                                    />
                                    <ResultBadge
                                        label="结果来源"
                                        value={
                                            result.resultMeta.sourceType === 'kg'
                                                ? '图谱'
                                                : result.resultMeta.sourceType === 'kg_plus_model'
                                                  ? '图谱+模型'
                                                  : result.resultMeta.sourceType === 'model_mapping'
                                                    ? '模型抽取+本地映射'
                                                  : '模型+搜索'
                                        }
                                    />
                                    <ResultBadge
                                        label="置信度"
                                        value={
                                            result.resultMeta.confidence === 'high'
                                                ? '高'
                                                : result.resultMeta.confidence === 'medium'
                                                  ? '中'
                                                  : '低'
                                        }
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <EntitySection title="命中主题" items={entityGroups?.themes ?? []} />
                        <EntitySection title="命中行业" items={entityGroups?.industries ?? []} />
                        <EntitySection title="命中链条环节" items={entityGroups?.chainNodes ?? []} />
                        <EntitySection title="命中公司" items={entityGroups?.companies ?? []} />
                    </div>

                    {result.searchMetadata &&
                        (result.searchMetadata.keywords.length > 0 || visibleEvidence.length > 0) && (
                            <div className="rounded-2xl border border-border bg-bg-card p-5">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <h3 className="text-sm font-medium text-text-primary">外部搜索增强</h3>
                                    <span className="rounded-full bg-bg-hover px-2 py-1 text-[11px] text-text-secondary">
                                        展示 {visibleEvidence.length} / {result.searchMetadata.evidence.length} 条证据
                                    </span>
                                </div>

                                {result.searchMetadata.keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {result.searchMetadata.keywords.slice(0, 8).map((keyword) => (
                                            <span
                                                key={keyword}
                                                className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                                            >
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {result.searchMetadata.webQuery && (
                                    <div className="mt-4 rounded-xl bg-bg-hover/60 px-3 py-2 text-sm text-text-secondary">
                                        {result.searchMetadata.webQuery}
                                    </div>
                                )}

                                {visibleEvidence.length > 0 && (
                                    <div className="mt-4 space-y-3">
                                        {visibleEvidence.map((item, index) => (
                                            <a
                                                key={`${item.url}-${index}`}
                                                href={item.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="block rounded-xl border border-border bg-bg-hover/60 p-4 transition-colors hover:border-accent/40"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium text-text-primary">{item.title}</div>
                                                        <div className="mt-2 text-xs text-text-secondary">{item.source}</div>
                                                        <div className="mt-2 text-xs leading-6 text-text-secondary">{item.snippet}</div>
                                                    </div>
                                                    <div className="shrink-0 rounded-lg bg-bg-card px-2 py-1 text-right">
                                                        <div className="text-[11px] uppercase tracking-wide text-text-secondary">
                                                            相关度
                                                        </div>
                                                        <div className="mt-1 flex items-center gap-1 text-sm font-medium text-accent">
                                                            {item.score !== null ? Math.round(item.score * 100) : '-'}
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="rounded-2xl border border-border bg-bg-card p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-medium text-text-primary">候选股票</h3>
                                <span className="rounded-full bg-bg-hover px-2 py-1 text-[11px] text-text-secondary">
                                    {result.candidateStocks.length} 个结果
                                </span>
                            </div>
                            {result.candidateStocks.length === 0 ? (
                                <div className="text-sm text-text-secondary">暂无候选股票。</div>
                            ) : (
                                <div className="space-y-3">
                                    {result.candidateStocks.map((stock, index) => (
                                        <div
                                            key={`${stock.companyEntityId}:${stock.stockCode}`}
                                            className="rounded-xl border border-border bg-bg-hover/60 p-4"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded-full bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent">
                                                            TOP {index + 1}
                                                        </span>
                                                        <span className="rounded-full bg-bg-card px-2 py-1 text-[11px] text-text-secondary">
                                                            {stock.origin === 'kg' ? '图谱验证' : '低置信映射'}
                                                        </span>
                                                        <span className="text-sm font-medium text-text-primary">
                                                            {stock.companyName}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 font-mono text-sm text-text-secondary">
                                                        {stock.stockCode}.{stock.exchange}
                                                    </div>
                                                    <div className="mt-2 text-xs leading-6 text-text-secondary">{stock.reason}</div>
                                                </div>
                                                <div className="rounded-xl bg-bg-card px-3 py-2 text-right">
                                                    <div className="text-[11px] uppercase tracking-wide text-text-secondary">评分</div>
                                                    <div className="mt-1 text-lg font-semibold text-accent">
                                                        {Math.round(stock.score * 100)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-5">
                            <div className="rounded-2xl border border-border bg-bg-card p-5">
                                <h3 className="mb-4 text-sm font-medium text-text-primary">推理路径</h3>
                                {result.reasoningPaths.length === 0 ? (
                                    <div className="text-sm text-text-secondary">暂无明确推理路径。</div>
                                ) : (
                                    <div className="space-y-3">
                                        {result.reasoningPaths.map((path, index) => (
                                            <div key={`${path.path.join('-')}-${index}`} className="rounded-xl bg-bg-hover p-4">
                                                <div className="text-sm font-medium text-text-primary">{path.path.join(' -> ')}</div>
                                                <div className="mt-2 text-xs leading-6 text-text-secondary">{path.description}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {result.observation && (
                                <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <h3 className="text-sm font-medium text-text-primary">模型补充观察</h3>
                                        <div className="flex flex-wrap gap-2">
                                            <ResultBadge
                                                label="观察类型"
                                                value={getObservationTypeLabel(result.observation.observationType)}
                                            />
                                            {result.observation.tradeValue && (
                                                <ResultBadge
                                                    label="交易价值"
                                                    value={getTradeValueLabel(result.observation.tradeValue)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-sm leading-7 text-text-primary">{result.observation.summary}</p>

                                    {result.observation.marketSignal && (
                                        <div className="mt-3 rounded-xl bg-bg-hover px-3 py-2 text-sm text-text-primary">
                                            市场信号：{result.observation.marketSignal}
                                        </div>
                                    )}

                                    {result.observation.directions.length > 0 && (
                                        <div className="mt-4">
                                            <div className="mb-2 text-xs font-medium uppercase text-text-secondary">
                                                潜在方向
                                            </div>
                                            <div className="space-y-2">
                                                {result.observation.directions.map((item, index) => (
                                                    <div
                                                        key={index}
                                                        className="rounded-xl bg-bg-hover px-3 py-2 text-sm text-text-primary"
                                                    >
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {result.observation.possibleDrivers && result.observation.possibleDrivers.length > 0 && (
                                        <div className="mt-4">
                                            <div className="mb-2 text-xs font-medium uppercase text-text-secondary">可能驱动</div>
                                            <div className="flex flex-wrap gap-2">
                                                {result.observation.possibleDrivers.map((item, index) => (
                                                    <span
                                                        key={index}
                                                        className="rounded-full bg-bg-hover px-3 py-1 text-xs text-text-primary"
                                                    >
                                                        {item}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {result.observation.mappedSectors && result.observation.mappedSectors.length > 0 && (
                                        <div className="mt-4">
                                            <div className="mb-2 text-xs font-medium uppercase text-text-secondary">映射方向</div>
                                            <div className="flex flex-wrap gap-2">
                                                {result.observation.mappedSectors.map((item, index) => (
                                                    <span
                                                        key={index}
                                                        className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent"
                                                    >
                                                        {item}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {result.observation.aShareImpact && (
                                        <div className="mt-4 rounded-xl bg-accent/5 px-3 py-2 text-sm text-text-primary">
                                            A股联动：{result.observation.aShareImpact}
                                        </div>
                                    )}

                                    {result.observation.risks.length > 0 && (
                                        <div className="mt-4">
                                            <div className="mb-2 text-xs font-medium uppercase text-text-secondary">
                                                观察边界
                                            </div>
                                            <div className="space-y-2">
                                                {result.observation.risks.map((item, index) => (
                                                    <div key={index} className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {result.report && (
                                <div className="rounded-2xl border border-border bg-bg-card p-5">
                                    <h3 className="mb-3 text-sm font-medium text-text-primary">AI 结论</h3>
                                    <p className="text-sm leading-7 text-text-primary">{result.report.summary}</p>

                                    {result.report.professionalAnalysis && (
                                        <div className="mt-4 space-y-4">
                                            <div className="rounded-xl border border-accent/25 bg-accent/5 p-4">
                                                <div className="mb-2 text-sm font-medium text-text-primary">商业知识解读（先看这个）</div>
                                                <div className="space-y-2 text-sm text-text-primary">
                                                    <div>
                                                        这条新闻在说：{result.report.professionalAnalysis.coreEvent || result.report.summary}
                                                    </div>
                                                    <div>
                                                        对股价的影响通常来自：
                                                        {result.report.professionalAnalysis.impactMechanism[0] ||
                                                            result.report.professionalAnalysis.industryImpacts[0]?.path ||
                                                            '市场预期变化'}
                                                    </div>
                                                    <div>
                                                        当前判断：{explainSignalCategory(result.report.professionalAnalysis.signalCategory)}
                                                    </div>
                                                    <div>
                                                        商业解读结论：
                                                        {result.report.professionalAnalysis.tradingView.worthTracking
                                                            ? '该信息具备跟踪价值，优先验证成交量、产业链反馈和持续催化。'
                                                            : '该信息更偏情绪扰动，缺少可持续的商业变量支撑。'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-border bg-bg-hover/50 p-4">
                                                <div className="mb-3 flex flex-wrap gap-2">
                                                    <ResultBadge label="新闻类型" value={result.report.professionalAnalysis.newsType} />
                                                    <ResultBadge
                                                        label="信号分层"
                                                        value={result.report.professionalAnalysis.signalCategory}
                                                    />
                                                    <ResultBadge
                                                        label="影响期限"
                                                        value={result.report.professionalAnalysis.impactTerm}
                                                    />
                                                    <ResultBadge
                                                        label="可跟踪性"
                                                        value={
                                                            result.report.professionalAnalysis.tradingView.worthTracking
                                                                ? '值得关注'
                                                                : '不建议交易'
                                                        }
                                                    />
                                                </div>
                                                <div className="mb-2 rounded-xl bg-bg-card px-3 py-2 text-xs text-text-secondary">
                                                    术语翻译：新闻类型={explainNewsType(result.report.professionalAnalysis.newsType)}
                                                </div>
                                                <div className="mb-2 rounded-xl bg-bg-card px-3 py-2 text-xs text-text-secondary">
                                                    术语翻译：机会类型=
                                                    {explainOpportunityType(
                                                        result.report.professionalAnalysis.tradingView.opportunityType
                                                    )}
                                                </div>
                                                <div className="text-xs text-text-secondary">核心事件</div>
                                                <div className="mt-1 text-sm font-medium text-text-primary">
                                                    {result.report.professionalAnalysis.coreEvent || '未提炼核心事件'}
                                                </div>
                                                {result.report.professionalAnalysis.eventWindow && (
                                                    <div className="mt-2 text-xs text-text-secondary">
                                                        时效窗口：{result.report.professionalAnalysis.eventWindow}
                                                    </div>
                                                )}
                                                {result.report.professionalAnalysis.noTradeReason && (
                                                    <div className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
                                                        无交易价值：{result.report.professionalAnalysis.noTradeReason}
                                                    </div>
                                                )}
                                            </div>

                                            {!knowledgeQuickView && result.report.professionalAnalysis.impactMechanism.length > 0 && (
                                                <div>
                                                    <div className="mb-2 text-xs font-medium uppercase text-text-secondary">
                                                        商业本质变化
                                                    </div>
                                                    <div className="space-y-2">
                                                        {result.report.professionalAnalysis.impactMechanism.map((item, index) => (
                                                            <div
                                                                key={index}
                                                                className="rounded-xl bg-bg-hover px-3 py-2 text-sm text-text-primary"
                                                            >
                                                                {item}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {!knowledgeQuickView && result.report.professionalAnalysis.industryImpacts.length > 0 && (
                                                <div>
                                                    <div className="mb-2 text-xs font-medium uppercase text-text-secondary">
                                                        行业影响路径
                                                    </div>
                                                    <div className="space-y-2">
                                                        {result.report.professionalAnalysis.industryImpacts.map((item, index) => (
                                                            <div key={index} className="rounded-xl bg-bg-hover p-3">
                                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                                    <div className="text-sm font-medium text-text-primary">
                                                                        {item.industry}
                                                                    </div>
                                                                    <span
                                                                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${getIndustrySentimentClassName(item.sentiment)}`}
                                                                    >
                                                                        {item.sentiment}
                                                                    </span>
                                                                </div>
                                                                <div className="text-xs leading-6 text-text-secondary">
                                                                    {item.path}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {!knowledgeQuickView &&
                                                (result.report.professionalAnalysis.chainAnalysis.upstream.length > 0 ||
                                                    result.report.professionalAnalysis.chainAnalysis.midstream.length > 0 ||
                                                    result.report.professionalAnalysis.chainAnalysis.downstream.length > 0) && (
                                                <div>
                                                    <div className="mb-2 text-xs font-medium uppercase text-text-secondary">
                                                        产业链拆解
                                                    </div>
                                                    <div className="grid gap-2 sm:grid-cols-3">
                                                        <div className="rounded-xl bg-bg-hover p-3">
                                                            <div className="text-xs text-text-secondary">上游</div>
                                                            <div className="mt-1 text-sm text-text-primary">
                                                                {result.report.professionalAnalysis.chainAnalysis.upstream.join('、') ||
                                                                    '暂无'}
                                                            </div>
                                                        </div>
                                                        <div className="rounded-xl bg-bg-hover p-3">
                                                            <div className="text-xs text-text-secondary">中游</div>
                                                            <div className="mt-1 text-sm text-text-primary">
                                                                {result.report.professionalAnalysis.chainAnalysis.midstream.join('、') ||
                                                                    '暂无'}
                                                            </div>
                                                        </div>
                                                        <div className="rounded-xl bg-bg-hover p-3">
                                                            <div className="text-xs text-text-secondary">下游</div>
                                                            <div className="mt-1 text-sm text-text-primary">
                                                                {result.report.professionalAnalysis.chainAnalysis.downstream.join('、') ||
                                                                    '暂无'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {(result.report.professionalAnalysis.chainAnalysis.mostBenefitedLink ||
                                                        result.report.professionalAnalysis.chainAnalysis.reason) && (
                                                        <div className="mt-2 rounded-xl bg-accent/5 px-3 py-2 text-sm text-text-primary">
                                                            最受益环节：
                                                            {result.report.professionalAnalysis.chainAnalysis.mostBenefitedLink ||
                                                                '未明确'}
                                                            {result.report.professionalAnalysis.chainAnalysis.reason
                                                                ? `；${result.report.professionalAnalysis.chainAnalysis.reason}`
                                                                : ''}
                                                        </div>
                                                    )}
                                                </div>
                                                )}

                                            {!knowledgeQuickView && result.report.professionalAnalysis.aShareMapping.length > 0 && (
                                                <div>
                                                    <div className="mb-2 text-xs font-medium uppercase text-text-secondary">
                                                        A股映射
                                                    </div>
                                                    <div className="space-y-2">
                                                        {result.report.professionalAnalysis.aShareMapping.map((item, index) => (
                                                            <div key={`${item.stockCode}-${index}`} className="rounded-xl bg-bg-hover p-3">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="text-sm font-medium text-text-primary">
                                                                        {item.companyName || item.stockName || item.stockCode}
                                                                    </div>
                                                                    {item.stockCode && (
                                                                        <span className="rounded-full bg-bg-card px-2 py-1 text-[11px] text-text-secondary">
                                                                            {item.stockCode}
                                                                        </span>
                                                                    )}
                                                                    <span className="rounded-full bg-accent/10 px-2 py-1 text-[11px] text-accent">
                                                                        弹性 {item.elasticity}
                                                                    </span>
                                                                    <span className="rounded-full bg-warning/10 px-2 py-1 text-[11px] text-warning">
                                                                        情绪龙头潜力 {item.leaderPotential}
                                                                    </span>
                                                                </div>
                                                                {item.logic && (
                                                                    <div className="mt-2 text-xs leading-6 text-text-secondary">
                                                                        {item.logic}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="rounded-xl border border-border bg-bg-hover/60 p-4">
                                                <div className="mb-2 text-xs font-medium uppercase text-text-secondary">交易视角</div>
                                                <div className="flex flex-wrap gap-2">
                                                    <ResultBadge
                                                        label="机会类型"
                                                        value={result.report.professionalAnalysis.tradingView.opportunityType}
                                                    />
                                                    <ResultBadge
                                                        label="持续性"
                                                        value={result.report.professionalAnalysis.tradingView.sustainability}
                                                    />
                                                    <ResultBadge
                                                        label="可交易性"
                                                        value={result.report.professionalAnalysis.tradingView.tradability}
                                                    />
                                                </div>
                                                {result.report.professionalAnalysis.tradingView.tradeValueSummary && (
                                                    <div className="mt-2 text-sm text-text-primary">
                                                        {result.report.professionalAnalysis.tradingView.tradeValueSummary}
                                                    </div>
                                                )}
                                                {result.report.professionalAnalysis.tradingView.strategy.length > 0 && (
                                                    <div className="mt-2 text-xs text-text-secondary">
                                                        策略建议：{result.report.professionalAnalysis.tradingView.strategy.join('、')}
                                                    </div>
                                                )}
                                            </div>

                                            {(!knowledgeQuickView || !result.report.professionalAnalysis.tradingView.worthTracking) &&
                                                result.report.professionalAnalysis.falsificationPoints.length > 0 && (
                                                <div>
                                                    <div className="mb-2 text-xs font-medium uppercase text-text-secondary">
                                                        证伪点
                                                    </div>
                                                    <div className="space-y-2">
                                                        {result.report.professionalAnalysis.falsificationPoints.map((item, index) => (
                                                            <div
                                                                key={index}
                                                                className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning"
                                                            >
                                                                {item}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {result.report.reasoning.length > 0 && (
                                        <div className="mt-4">
                                            <div className="mb-2 text-xs font-medium uppercase text-text-secondary">推理要点</div>
                                            <div className="space-y-2">
                                                {result.report.reasoning.map((item, index) => (
                                                    <div key={index} className="rounded-xl bg-bg-hover px-3 py-2 text-sm text-text-primary">
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {result.report.risks.length > 0 && (
                                        <div className="mt-4">
                                            <div className="mb-2 text-xs font-medium uppercase text-text-secondary">风险提示</div>
                                            <div className="space-y-2">
                                                {result.report.risks.map((item, index) => (
                                                    <div key={index} className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
