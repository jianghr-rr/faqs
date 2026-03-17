import {ChatPromptTemplate, MessagesPlaceholder} from '@langchain/core/prompts';
import {z} from 'zod';
import type {
    CandidateStock,
    KgAnalysisResult,
    MentionedCompany,
    ModelObservation,
    NewsClassificationType,
    ReasoningPath,
    ResearchEvidence,
} from '~/lib/kg/types';
import researchReportV1Template from '~/lib/ai/prompts/templates/research-report.v1.json';
import researchReportV2Template from '~/lib/ai/prompts/templates/research-report.v2.json';

export type BuildPromptInput = {
    rawText: string;
    candidateStocks: CandidateStock[];
    reasoningPaths: ReasoningPath[];
    matchedEntities?: KgAnalysisResult['matchedEntities'];
    searchKeywords?: string[];
    webSearchEvidence?: ResearchEvidence[];
    newsTypeHint?: string;
};

export type ChatHistoryTurn = {
    role: 'user' | 'assistant';
    content: string;
};

type PromptTemplateVersion = 'v1' | 'v2';
type PromptTemplateRecord = {
    name: string;
    version: PromptTemplateVersion;
    system: string;
    human: string;
};

const RESEARCH_REPORT_PROMPT_REGISTRY: Record<PromptTemplateVersion, PromptTemplateRecord> = {
    v1: researchReportV1Template as PromptTemplateRecord,
    v2: researchReportV2Template as PromptTemplateRecord,
};

function resolveResearchReportPromptTemplate(version?: string) {
    if (version === 'v1') {
        return RESEARCH_REPORT_PROMPT_REGISTRY.v1;
    }
    return RESEARCH_REPORT_PROMPT_REGISTRY.v2;
}

export const researchReportSchema = z.object({
    summary: z.string().min(1),
    reasoning: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    professionalAnalysis: z
        .object({
            coreEvent: z.string().default(''),
            newsType: z.enum(['政策', '行业', '公司', '宏观', '事件驱动', '其他']).default('其他'),
            signalCategory: z.enum(['情绪噪音', '短期事件', '中期逻辑', '长期趋势']).default('情绪噪音'),
            eventWindow: z.string().default(''),
            impactMechanism: z.array(z.string()).default([]),
            impactTerm: z.enum(['短期', '中期', '长期', '混合']).default('短期'),
            industryImpacts: z
                .array(
                    z.object({
                        industry: z.string().min(1),
                        sentiment: z.enum(['利好', '利空', '中性']).default('中性'),
                        path: z.string().default(''),
                    })
                )
                .default([]),
            chainAnalysis: z
                .object({
                    upstream: z.array(z.string()).default([]),
                    midstream: z.array(z.string()).default([]),
                    downstream: z.array(z.string()).default([]),
                    mostBenefitedLink: z.string().default(''),
                    reason: z.string().default(''),
                })
                .default({
                    upstream: [],
                    midstream: [],
                    downstream: [],
                    mostBenefitedLink: '',
                    reason: '',
                }),
            aShareMapping: z
                .array(
                    z.object({
                        stockCode: z.string().default(''),
                        stockName: z.string().default(''),
                        companyName: z.string().default(''),
                        logic: z.string().default(''),
                        elasticity: z.enum(['高', '中', '低']).default('中'),
                        leaderPotential: z.enum(['高', '中', '低']).default('中'),
                    })
                )
                .max(6)
                .default([]),
            tradingView: z
                .object({
                    opportunityType: z.enum(['情绪题材', '趋势机会', '基本面机会', '观察']).default('观察'),
                    sustainability: z.enum(['强', '中', '弱']).default('弱'),
                    tradability: z.enum(['强', '中', '弱']).default('弱'),
                    strategy: z.array(z.string()).default([]),
                    worthTracking: z.boolean().default(false),
                    tradeValueSummary: z.string().default(''),
                })
                .default({
                    opportunityType: '观察',
                    sustainability: '弱',
                    tradability: '弱',
                    strategy: [],
                    worthTracking: false,
                    tradeValueSummary: '',
                }),
            falsificationPoints: z.array(z.string()).default([]),
            noTradeReason: z.string().default(''),
        })
        .optional(),
});

export const researchSelfCheckSchema = z.object({
    needsRevision: z.boolean().default(false),
    issues: z.array(z.string()).default([]),
    revisedReport: researchReportSchema.optional(),
});

export const rerankedStocksSchema = z.object({
    stocks: z
        .array(
            z.object({
                stockCode: z.string().min(1),
                score: z.number().min(0).max(1),
                reason: z.string().min(1),
            })
        )
        .max(8)
        .default([]),
});

export const chatQueryRewriteSchema = z.object({
    standaloneQuery: z.string().min(1),
});

export const newsSearchHintsSchema = z.object({
    keywords: z.array(z.string().min(1)).max(8).default([]),
    tags: z.array(z.string().min(1)).max(8).default([]),
    angle: z.string().default(''),
});

export const groundedNewsSearchHintsSchema = z.object({
    keywords: z.array(z.string().min(1)).max(10).default([]),
    tags: z.array(z.string().min(1)).max(10).default([]),
    angle: z.string().default(''),
});

export const newsClassificationSchema = z.object({
    type: z.enum(['event_driven', 'data_release', 'market_status', 'noise']),
    reason: z.string().default(''),
});

export const mentionedCompaniesSchema = z.object({
    companies: z
        .array(
            z.object({
                name: z.string().min(1),
                confidence: z.number().min(0).max(1).default(0.5),
                evidence: z.string().default(''),
            })
        )
        .max(8)
        .default([]),
    themes: z.array(z.string().min(1)).max(8).default([]),
}) satisfies z.ZodType<{
    companies: MentionedCompany[];
    themes: string[];
}>;

export const modelOnlyObservationSchema = z.object({
    observationType: z.enum(['macro_market', 'sector_theme', 'industry_chain', 'event_driver']),
    summary: z.string().min(1),
    directions: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    marketSignal: z.string().optional(),
    possibleDrivers: z.array(z.string()).default([]),
    mappedSectors: z.array(z.string()).default([]),
    aShareImpact: z.string().optional(),
    tradeValue: z.enum(['weak', 'medium', 'strong']).optional(),
}) satisfies z.ZodType<ModelObservation>;

export const sectorRelevanceSchema = z.object({
    industries: z
        .array(
            z.object({
                industryName: z.string().min(1),
                isRelevant: z.boolean(),
                reason: z.string().default(''),
            })
        )
        .default([]),
});

export function formatCandidateStocks(stocks: CandidateStock[]) {
    return stocks.length > 0
        ? stocks
              .slice(0, 8)
              .map(
                  (stock, index) =>
                      `${index + 1}. ${stock.companyName}(${stock.stockCode}.${stock.exchange})，评分 ${stock.score}，来源：${
                          stock.origin === 'kg' ? '图谱验证' : '模型抽取映射'
                      }，原因：${stock.reason}`
              )
              .join('\n')
        : '暂无明确候选股票。';
}

export function formatReasoningPaths(paths: ReasoningPath[]) {
    return paths.length > 0
        ? paths
              .slice(0, 5)
              .map((path, index) => `${index + 1}. ${path.path.join(' -> ')}。${path.description}`)
              .join('\n')
        : '暂无明确推理路径。';
}

export function buildResearchPromptVariables(input: BuildPromptInput) {
    const matchedEntities = input.matchedEntities;
    const matchedEntityLines = matchedEntities
        ? [
              `主题：${matchedEntities.themes.map((item) => item.name).join('、') || '暂无'}`,
              `行业：${matchedEntities.industries.map((item) => item.name).join('、') || '暂无'}`,
              `环节：${matchedEntities.chainNodes.map((item) => item.name).join('、') || '暂无'}`,
              `公司：${matchedEntities.companies.map((item) => item.name).join('、') || '暂无'}`,
          ].join('\n')
        : '暂无明确实体命中。';

    const webEvidenceLines =
        input.webSearchEvidence && input.webSearchEvidence.length > 0
            ? input.webSearchEvidence
                  .slice(0, 4)
                  .map((item, index) => `${index + 1}. ${item.title} | ${item.source} | ${item.snippet}`)
                  .join('\n')
            : '暂无外部搜索证据。';

    return {
        rawText: input.rawText,
        candidateLines: formatCandidateStocks(input.candidateStocks),
        pathLines: formatReasoningPaths(input.reasoningPaths),
        matchedEntityLines,
        searchKeywordLines: input.searchKeywords?.join('、') || '暂无模型扩展关键词。',
        webEvidenceLines,
        newsTypeHint: input.newsTypeHint || '未提供',
    };
}

export function buildResearchPrompt(input: BuildPromptInput) {
    const variables = buildResearchPromptVariables(input);

    return `你是 FinAgents 的中文投研分析助手。请根据给定新闻、外部搜索证据、命中实体、候选股票和推理路径，执行“信息提纯 + 投资映射 + 结构化输出”。\n\n原始输入：\n${variables.rawText}\n\n模型扩展关键词：\n${variables.searchKeywordLines}\n\n外部搜索证据：\n${variables.webEvidenceLines}\n\n命中实体：\n${variables.matchedEntityLines}\n\n候选股票：\n${variables.candidateLines}\n\n推理路径：\n${variables.pathLines}\n\n请按 JSON 输出，不要附加额外解释。除 summary/reasoning/risks 外，补充 professionalAnalysis：\n{\n  "summary":"一句到两句总结",\n  "reasoning":["要点1","要点2"],\n  "risks":["风险1","风险2"],\n  "professionalAnalysis":{\n    "coreEvent":"30字内核心事件",\n    "newsType":"政策|行业|公司|宏观|事件驱动|其他",\n    "signalCategory":"情绪噪音|短期事件|中期逻辑|长期趋势",\n    "eventWindow":"影响时效描述",\n    "impactMechanism":["供需/成本/技术/政策/预期 的变化"],\n    "impactTerm":"短期|中期|长期|混合",\n    "industryImpacts":[{"industry":"行业名","sentiment":"利好|利空|中性","path":"事件→变量→行业"}],\n    "chainAnalysis":{"upstream":[""],"midstream":[""],"downstream":[""],"mostBenefitedLink":"最受益环节","reason":"受益原因"},\n    "aShareMapping":[{"stockCode":"","stockName":"","companyName":"","logic":"关联逻辑","elasticity":"高|中|低","leaderPotential":"高|中|低"}],\n    "tradingView":{"opportunityType":"情绪题材|趋势机会|基本面机会|观察","sustainability":"强|中|弱","tradability":"强|中|弱","strategy":["打板|低吸|趋势|观察"],"worthTracking":true,"tradeValueSummary":"一句话交易价值"},\n    "falsificationPoints":["证伪点"],\n    "noTradeReason":"若为情绪噪音，说明无交易价值原因"\n  }\n}`;
}

export function buildResearchReportPrompt(version?: string) {
    const template = resolveResearchReportPromptTemplate(version);
    return ChatPromptTemplate.fromMessages([
        ['system', template.system],
        ['human', template.human],
    ]);
}

export function buildResearchSelfCheckPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的报告自检助手。请检查当前报告是否存在：1) 编造信息；2) 逻辑断层；3) 结论缺少依据；4) 情绪噪音却给出可交易建议。若报告合格，needsRevision=false。若不合格，needsRevision=true，并返回完整 revisedReport（必须符合 schema），且修正为基于输入事实的表达。',
        ],
        [
            'human',
            '原始输入：\n{rawText}\n\n命中实体：\n{matchedEntityLines}\n\n候选股票：\n{candidateLines}\n\n推理路径：\n{pathLines}\n\n当前报告(JSON)：\n{reportJson}\n\n请执行自检并返回结果。',
        ],
    ]);
}

export function buildStockRerankPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的投研排序助手。请基于新闻文本、候选股和推理路径，对候选股做谨慎重排。不要引入列表外的新股票，分数范围 0 到 1，理由必须引用给定事实。若某候选来源为“模型抽取映射”，除非新闻中存在非常直接的公司提及，否则应比图谱验证候选更保守。若某候选与新闻缺乏直接关联，可以给出 0.1 以下的极低分，表示应排除。',
        ],
        [
            'human',
            '原始输入：\n{rawText}\n\n候选股票：\n{candidateLines}\n\n推理路径：\n{pathLines}\n\n请覆盖返回全部候选股（最多 8 个），每个候选都给出 score 与 reason。',
        ],
    ]);
}

export function buildChatRewritePrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的对话改写助手。请把用户当前问题改写成一个独立、可直接用于行业图谱与投研分析的中文查询。保留股票、行业、主题、时间和上下文指代，不要回答问题本身。',
        ],
        new MessagesPlaceholder('history'),
        ['human', '请把当前问题改写成独立查询：\n{message}'],
    ]);
}

export function buildNewsSearchHintsPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的新闻理解助手。请从碎片化财经快讯中提炼“可用于投资映射”的检索线索。关键词必须偏实体与机制：行业、主题、产品、技术、产能、成本、政策主体、公司/平台、应用场景。避免空泛词与口号，不输出投资结论。',
        ],
        ['human', '新闻原文：\n{rawText}\n\n请输出搜索提示。'],
    ]);
}

export function buildNewsClassificationPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的新闻分类助手。请先判断新闻类型：event_driven=事件驱动（政策/技术/公司事件触发因果链），data_release=数据披露（业绩/宏观数据发布），market_status=行情描述（指数涨跌、板块涨跌、资金情绪结果描述），noise=情绪噪音（信息不完整、缺乏可验证变量）。只输出结构化结果，不做投资建议。',
        ],
        ['human', '新闻原文：\n{rawText}\n\n请输出新闻类型与一句理由。'],
    ]);
}

export function buildGroundedNewsSearchHintsPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的新闻检索规划助手。请综合新闻原文和外部搜索结果，提炼最适合映射到行业知识图谱的关键词和标签。优先保留行业、主题、产品、技术、基础设施、应用场景，不要输出投资结论，不要输出泛词。',
        ],
        [
            'human',
            '新闻原文：\n{rawText}\n\n初始关键词：\n{searchKeywordLines}\n\n外部搜索证据：\n{webEvidenceLines}\n\n请输出更适合图谱映射的搜索提示。',
        ],
    ]);
}

export function buildMentionedCompaniesPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的新闻实体抽取助手。请只提取新闻正文或外部搜索证据里被明确提到的公司名称，优先 A 股/港股/美股上市主体或证券简称，不要猜测，不要补全未出现的公司。若证据不足就返回空数组。confidence 表示你对“该公司被新闻直接提及且值得作为证券映射线索”的把握，evidence 只保留一句最短命中片段。',
        ],
        [
            'human',
            '新闻原文：\n{rawText}\n\n模型扩展关键词：\n{searchKeywordLines}\n\n外部搜索证据：\n{webEvidenceLines}\n\n请输出被明确提到的公司与主题。',
        ],
    ]);
}

export function buildModelOnlyObservationPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的投研观察助手。当前新闻没有命中足够强的图谱结构化结果，因此你不能输出“已验证的受益股结论”。你只能基于新闻原文和外部搜索证据，输出低置信的补充观察，强调这是模型推断而非图谱验证结果。请先判断 observationType：macro_market=宏观/市场风格，sector_theme=行业或主题轮动，industry_chain=产业链环节变化，event_driver=单一事件驱动。方向要写成行业/板块/业务方向，不要编造确定受益股票。若 newsTypeHint=market_status，必须优先按“市场情绪”框架输出：marketSignal（情绪信号）、possibleDrivers（常见驱动）、mappedSectors（板块方向）、aShareImpact（A股联动）、tradeValue（weak/medium/strong）。',
        ],
        [
            'human',
            '新闻原文：\n{rawText}\n\n新闻类型提示：\n{newsTypeHint}\n\n模型扩展关键词：\n{searchKeywordLines}\n\n外部搜索证据：\n{webEvidenceLines}\n\n请输出模型补充观察。',
        ],
    ]);
}

export function mapNewsClassificationLabel(type: NewsClassificationType) {
    switch (type) {
        case 'event_driven':
            return '事件驱动';
        case 'data_release':
            return '数据披露';
        case 'market_status':
            return '行情描述';
        case 'noise':
            return '情绪噪音';
        default:
            return '未知';
    }
}

export function buildSectorRelevancePrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的行业相关性验证助手。请判断“命中行业”是否真的受新闻事件影响。只做相关性判断，不做投资建议。若新闻是石油、汇率、地缘冲突等宏观事件，不要机械映射到新能源或其他泛行业。请严格返回结构化结果。',
        ],
        [
            'human',
            '新闻原文：\n{rawText}\n\n待验证行业：\n{industryLines}\n\n请输出每个行业是否相关（isRelevant=true/false），并给一句简短理由。',
        ],
    ]);
}
