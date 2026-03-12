export type KgEntityType = 'theme' | 'industry' | 'chain_node' | 'company';

export type KgRelationType = 'relates_to' | 'contains' | 'upstream_of' | 'belongs_to' | 'participates_in';

export type KgEntityRecord = {
    id: string;
    entityType: KgEntityType;
    name: string;
    canonicalName: string;
    description: string | null;
    metadata: Record<string, unknown>;
};

export type KgAliasRecord = {
    entityId: string;
    alias: string;
    aliasType: 'common' | 'short_name' | 'ticker_name' | 'english_name' | 'synonym';
};

export type KgRelationRecord = {
    id: string;
    fromEntityId: string;
    toEntityId: string;
    relationType: KgRelationType;
    weight: number | null;
    confidence: number | null;
    source: string | null;
};

export type SecurityRecord = {
    id: string;
    companyEntityId: string;
    stockCode: string;
    stockName: string;
    exchange: string;
    listStatus: 'listed' | 'delisted' | 'suspended';
};

export type MatchedEntity = {
    id: string;
    name: string;
    entityType: KgEntityType;
    confidence: number;
};

export type ReasoningPath = {
    path: string[];
    description: string;
};

export type CandidateStockOrigin = 'kg' | 'fallback_llm_mapping';

export type CandidateStock = {
    companyEntityId: string;
    companyName: string;
    stockCode: string;
    stockName: string;
    exchange: string;
    score: number;
    reason: string;
    origin: CandidateStockOrigin;
};

export type ResearchReport = {
    summary: string;
    reasoning: string[];
    risks: string[];
};

export type ResearchResultConfidence = 'high' | 'medium' | 'low';
export type ResearchResultSourceType = 'kg' | 'kg_plus_model' | 'model_plus_search' | 'model_mapping';
export type ResearchValidationStatus = 'kg_verified' | 'mixed' | 'model_only';

export type ResearchResultMeta = {
    confidence: ResearchResultConfidence;
    sourceType: ResearchResultSourceType;
    validationStatus: ResearchValidationStatus;
};

export type ResearchEvidence = {
    title: string;
    url: string;
    snippet: string;
    source: string;
    score: number | null;
};

export type MentionedCompany = {
    name: string;
    confidence: number;
    evidence: string;
};

export type ModelObservationType = 'macro_market' | 'sector_theme' | 'industry_chain' | 'event_driver';

export type ModelObservation = {
    observationType: ModelObservationType;
    summary: string;
    directions: string[];
    risks: string[];
};

export type KgSearchResult = {
    items: Array<
        KgEntityRecord & {
            aliases: string[];
        }
    >;
};

export type IndustryOverview = {
    industry: KgEntityRecord;
    chainNodes: KgEntityRecord[];
    companies: Array<
        KgEntityRecord & {
            securities: SecurityRecord[];
        }
    >;
};

export type CompanyOverview = {
    company: KgEntityRecord;
    industries: KgEntityRecord[];
    chainNodes: KgEntityRecord[];
    securities: SecurityRecord[];
};

export type KgAnalysisResult = {
    matchedEntities: {
        themes: MatchedEntity[];
        industries: MatchedEntity[];
        chainNodes: MatchedEntity[];
        companies: MatchedEntity[];
    };
    reasoningPaths: ReasoningPath[];
    candidateStocks: CandidateStock[];
    directHitStats: {
        industries: number;
        companies: number;
    };
    directHitEntityIds: {
        industries: string[];
        companies: string[];
    };
};
