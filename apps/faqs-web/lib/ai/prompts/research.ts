import {ChatPromptTemplate, MessagesPlaceholder} from '@langchain/core/prompts';
import {z} from 'zod';
import type {CandidateStock, KgAnalysisResult, MentionedCompany, ModelObservation, ReasoningPath, ResearchEvidence} from '~/lib/kg/types';

export type BuildPromptInput = {
    rawText: string;
    candidateStocks: CandidateStock[];
    reasoningPaths: ReasoningPath[];
    matchedEntities?: KgAnalysisResult['matchedEntities'];
    searchKeywords?: string[];
    webSearchEvidence?: ResearchEvidence[];
};

export type ChatHistoryTurn = {
    role: 'user' | 'assistant';
    content: string;
};

export const researchReportSchema = z.object({
    summary: z.string().min(1),
    reasoning: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
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
    };
}

export function buildResearchPrompt(input: BuildPromptInput) {
    const variables = buildResearchPromptVariables(input);

    return `你是 FinAgents 的中文投研分析助手。请根据给定的新闻或问题、外部搜索证据、命中实体、候选股票和推理路径，输出简洁、克制、可解释的结论。\n\n原始输入：\n${variables.rawText}\n\n模型扩展关键词：\n${variables.searchKeywordLines}\n\n外部搜索证据：\n${variables.webEvidenceLines}\n\n命中实体：\n${variables.matchedEntityLines}\n\n候选股票：\n${variables.candidateLines}\n\n推理路径：\n${variables.pathLines}\n\n请按以下 JSON 结构输出，不要附加额外解释：\n{"summary":"一句到两句总结","reasoning":["要点1","要点2"],"risks":["风险1","风险2"]}`;
}

export function buildResearchReportPrompt() {
    return ChatPromptTemplate.fromMessages([
        [
            'system',
            '你是 FinAgents 的中文投研分析助手。你的输出必须克制、可解释、偏研究备忘录风格。你可以参考外部搜索证据理解新闻语义，但最终结论必须以给定的命中实体、候选股票和推理路径为核心依据，不能脱离图谱事实自由发挥。如果候选股票标注为“模型抽取映射”，必须明确它属于低置信映射结果，不能写成图谱已验证受益结论。如果候选股票和推理路径都为空，必须明确表达“当前没有足够强的结构化命中结果”，reasoning 应为空数组，risks 应强调图谱覆盖有限。请严格返回结构化结果，不要补充 schema 之外的文字。',
        ],
        [
            'human',
            '原始输入：\n{rawText}\n\n模型扩展关键词：\n{searchKeywordLines}\n\n外部搜索证据：\n{webEvidenceLines}\n\n命中实体：\n{matchedEntityLines}\n\n候选股票：\n{candidateLines}\n\n推理路径：\n{pathLines}\n\n请输出 research report。',
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
            '你是 FinAgents 的新闻理解助手。请从新闻中提炼最适合做行业知识图谱搜索的关键词、主题标签和分析角度。优先输出行业、主题、产品名、技术方向、公司/平台名、应用场景，不要输出空泛形容词。不要直接给投资结论。',
        ],
        ['human', '新闻原文：\n{rawText}\n\n请输出搜索提示。'],
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
            '你是 FinAgents 的投研观察助手。当前新闻没有命中足够强的图谱结构化结果，因此你不能输出“已验证的受益股结论”。你只能基于新闻原文和外部搜索证据，输出低置信的补充观察，强调这是模型推断而非图谱验证结果。请先判断 observationType：macro_market=宏观/市场风格，sector_theme=行业或主题轮动，industry_chain=产业链环节变化，event_driver=单一事件驱动。方向要写成行业/板块/业务方向，不要编造确定受益股票。',
        ],
        [
            'human',
            '新闻原文：\n{rawText}\n\n模型扩展关键词：\n{searchKeywordLines}\n\n外部搜索证据：\n{webEvidenceLines}\n\n请输出模型补充观察。',
        ],
    ]);
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
