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
    } | null;
    observation?: {
        observationType: 'macro_market' | 'sector_theme' | 'industry_chain' | 'event_driver';
        summary: string;
        directions: string[];
        risks: string[];
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
            status: 'done' | 'skipped' | 'failed';
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

function formatDateTime(dateStr: string) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) {
        return dateStr;
    }

    return date.toLocaleString('zh-CN', {hour12: false});
}

function getTraceStatusLabel(status: 'done' | 'skipped' | 'failed') {
    switch (status) {
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

function getTraceStatusClassName(status: 'done' | 'skipped' | 'failed') {
    switch (status) {
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
    initialQuery,
}: {
    initialMode: AnalysisMode;
    initialNewsId?: string;
    initialQuery?: string;
}) {
    const [mode, setMode] = useState<AnalysisMode>(initialMode);
    const [newsId, setNewsId] = useState(initialNewsId ?? '');
    const [query, setQuery] = useState(initialQuery ?? '');
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [liveTrace, setLiveTrace] = useState<TraceViewModel | null>(null);
    const [traceCollapsed, setTraceCollapsed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
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
                    setResult(finalPayload);
                    setLiveTrace(null);
                    setTraceCollapsed(true);
                } else {
                    const payload = await response.json();
                    if (!response.ok) {
                        throw new Error(payload?.error?.message ?? '分析失败，请稍后重试');
                    }
                    setResult(payload);
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
                            <label className="mb-1 block text-xs text-text-secondary">新闻 ID</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-disabled" />
                                <input
                                    type="text"
                                    value={newsId}
                                    onChange={(event) => setNewsId(event.target.value)}
                                    placeholder="从新闻卡片跳转时会自动带入"
                                    className="h-11 w-full rounded-xl border border-border bg-bg-base pl-10 pr-4 text-sm text-text-primary placeholder:text-text-disabled focus:border-accent focus:outline-none"
                                />
                            </div>
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
                                        <ResultBadge
                                            label="观察类型"
                                            value={getObservationTypeLabel(result.observation.observationType)}
                                        />
                                    </div>
                                    <p className="text-sm leading-7 text-text-primary">{result.observation.summary}</p>

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
