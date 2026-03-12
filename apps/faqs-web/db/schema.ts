import {relations, sql} from 'drizzle-orm';
import {
    pgTable,
    pgEnum,
    serial,
    integer,
    smallint,
    varchar,
    text,
    boolean,
    timestamp,
    decimal,
    primaryKey,
    unique,
    index,
    uuid,
    jsonb,
} from 'drizzle-orm/pg-core';

// ─── Enums ──────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['admin', 'editor', 'viewer']);
export const faqStatusEnum = pgEnum('faq_status', ['draft', 'published', 'archived']);

// ─── profiles ────────────────────────────────────────
// Linked to auth.users via UUID primary key

export const profiles = pgTable('profiles', {
    id: uuid('id').primaryKey(),
    name: varchar('name', {length: 100}).notNull(),
    avatar: varchar('avatar', {length: 500}),
    role: userRoleEnum('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', {withTimezone: true})
        .notNull()
        .defaultNow()
        .$onUpdate(() => new Date()),
});

export const profilesRelations = relations(profiles, ({many}) => ({
    faqs: many(faqs),
    chatSessions: many(researchChatSessions),
}));

// ─── categories ─────────────────────────────────────

export const categories = pgTable(
    'categories',
    {
        id: serial('id').primaryKey(),
        name: varchar('name', {length: 100}).notNull(),
        slug: varchar('slug', {length: 100}).notNull().unique(),
        description: varchar('description', {length: 500}),
        parentId: integer('parent_id'),
        sortOrder: integer('sort_order').notNull().default(0),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [index('categories_parent_id_idx').on(t.parentId)]
);

export const categoriesRelations = relations(categories, ({one, many}) => ({
    parent: one(categories, {
        fields: [categories.parentId],
        references: [categories.id],
        relationName: 'categoryHierarchy',
    }),
    children: many(categories, {relationName: 'categoryHierarchy'}),
    faqs: many(faqs),
}));

// ─── faqs ───────────────────────────────────────────

export const faqs = pgTable(
    'faqs',
    {
        id: serial('id').primaryKey(),
        question: varchar('question', {length: 500}).notNull(),
        answer: text('answer').notNull(),
        categoryId: integer('category_id'),
        authorId: uuid('author_id').notNull(),
        status: faqStatusEnum('status').notNull().default('draft'),
        isFeatured: boolean('is_featured').notNull().default(false),
        viewCount: integer('view_count').notNull().default(0),
        sortOrder: integer('sort_order').notNull().default(0),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        index('faqs_category_id_idx').on(t.categoryId),
        index('faqs_author_id_idx').on(t.authorId),
        index('faqs_status_idx').on(t.status),
        index('faqs_status_sort_idx').on(t.status, t.sortOrder),
    ]
);

export const faqsRelations = relations(faqs, ({one, many}) => ({
    category: one(categories, {
        fields: [faqs.categoryId],
        references: [categories.id],
    }),
    author: one(profiles, {
        fields: [faqs.authorId],
        references: [profiles.id],
    }),
    faqTags: many(faqTags),
}));

// ─── tags ───────────────────────────────────────────

export const tags = pgTable('tags', {
    id: serial('id').primaryKey(),
    name: varchar('name', {length: 50}).notNull().unique(),
    slug: varchar('slug', {length: 50}).notNull().unique(),
    createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
});

export const tagsRelations = relations(tags, ({many}) => ({
    faqTags: many(faqTags),
}));

// ─── faq_tags ───────────────────────────────────────

export const faqTags = pgTable(
    'faq_tags',
    {
        faqId: integer('faq_id').notNull(),
        tagId: integer('tag_id').notNull(),
    },
    (t) => [primaryKey({columns: [t.faqId, t.tagId]}), index('faq_tags_tag_id_idx').on(t.tagId)]
);

export const faqTagsRelations = relations(faqTags, ({one}) => ({
    faq: one(faqs, {
        fields: [faqTags.faqId],
        references: [faqs.id],
    }),
    tag: one(tags, {
        fields: [faqTags.tagId],
        references: [tags.id],
    }),
}));

// ─── user_favorites ─────────────────────────────────

export const favoriteItemTypeEnum = pgEnum('favorite_item_type', ['faq', 'news']);
export const researchChatRoleEnum = pgEnum('research_chat_role', ['user', 'assistant']);

export const userFavorites = pgTable(
    'user_favorites',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').notNull(),
        itemType: favoriteItemTypeEnum('item_type').notNull(),
        itemId: text('item_id').notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (t) => [
        unique('user_favorites_user_item_type_id_unique').on(t.userId, t.itemType, t.itemId),
        index('user_favorites_user_id_idx').on(t.userId),
        index('user_favorites_created_at_idx').on(t.createdAt),
    ]
);

export const researchChatSessions = pgTable(
    'research_chat_sessions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: uuid('user_id').references(() => profiles.id, {onDelete: 'set null'}),
        title: varchar('title', {length: 200}),
        lastMessagePreview: varchar('last_message_preview', {length: 300}),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        index('research_chat_sessions_user_id_idx').on(t.userId),
        index('research_chat_sessions_updated_at_idx').on(t.updatedAt),
    ]
);

export const researchChatMessages = pgTable(
    'research_chat_messages',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        sessionId: uuid('session_id')
            .notNull()
            .references(() => researchChatSessions.id, {onDelete: 'cascade'}),
        role: researchChatRoleEnum('role').notNull(),
        content: text('content').notNull(),
        metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (t) => [
        index('research_chat_messages_session_id_idx').on(t.sessionId),
        index('research_chat_messages_created_at_idx').on(t.createdAt),
    ]
);

// ─── news ───────────────────────────────────────────

export const newsCategoryEnum = pgEnum('news_category', [
    '要闻',
    '宏观',
    '研报',
    '策略',
    'AI洞察',
    '数据',
]);

export const newsSentimentEnum = pgEnum('news_sentiment', ['positive', 'negative', 'neutral']);
export const kgEntityTypeEnum = pgEnum('kg_entity_type', ['theme', 'industry', 'chain_node', 'company']);
export const kgAliasTypeEnum = pgEnum('kg_alias_type', [
    'common',
    'short_name',
    'ticker_name',
    'english_name',
    'synonym',
]);
export const kgRelationTypeEnum = pgEnum('kg_relation_type', [
    'relates_to',
    'contains',
    'upstream_of',
    'belongs_to',
    'participates_in',
]);
export const kgEntityStatusEnum = pgEnum('kg_entity_status', ['active', 'inactive']);
export const kgSecurityListStatusEnum = pgEnum('kg_security_list_status', ['listed', 'delisted', 'suspended']);

export const news = pgTable(
    'news',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        title: varchar('title', {length: 500}).notNull(),
        summary: text('summary'),
        content: text('content'),
        category: newsCategoryEnum('category').notNull(),
        source: varchar('source', {length: 100}).notNull(),
        sourceUrl: varchar('source_url', {length: 1000}),
        publishedAt: timestamp('published_at', {withTimezone: true}).notNull(),
        fetchedAt: timestamp('fetched_at', {withTimezone: true}).defaultNow(),
        sentiment: newsSentimentEnum('sentiment'),
        sentimentScore: decimal('sentiment_score', {precision: 3, scale: 2}),
        tickers: text('tickers').array(),
        relatedSecurities: jsonb('related_securities')
            .$type<Array<{name: string; code: string; exchange?: string}>>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        tags: text('tags').array(),
        imageUrl: varchar('image_url', {length: 1000}),
        importance: smallint('importance').notNull().default(2),
        isAiGenerated: boolean('is_ai_generated').notNull().default(false),
        agentId: varchar('agent_id', {length: 100}),
        isPublished: boolean('is_published').notNull().default(true),
        viewCount: integer('view_count').notNull().default(0),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        unique('news_title_source_unique').on(t.title, t.source),
        index('news_published_at_idx').on(t.publishedAt),
        index('news_category_idx').on(t.category),
        index('news_importance_idx').on(t.importance),
        index('news_is_published_idx').on(t.isPublished),
        index('news_source_idx').on(t.source),
    ]
);

export const newsAnalysisSnapshots = pgTable(
    'news_analysis_snapshots',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        newsId: uuid('news_id')
            .notNull()
            .references(() => news.id, {onDelete: 'cascade'}),
        resultPayload: jsonb('result_payload').notNull(),
        resultMeta: jsonb('result_meta').notNull().default(sql`'{}'::jsonb`),
        analyzedAt: timestamp('analyzed_at', {withTimezone: true}).notNull(),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        unique('news_analysis_snapshots_news_id_unique').on(t.newsId),
        index('news_analysis_snapshots_updated_at_idx').on(t.updatedAt),
    ]
);

// ─── knowledge graph ─────────────────────────────────

export const kgEntities = pgTable(
    'kg_entities',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        entityType: kgEntityTypeEnum('entity_type').notNull(),
        name: varchar('name', {length: 200}).notNull(),
        canonicalName: varchar('canonical_name', {length: 200}).notNull(),
        description: text('description'),
        status: kgEntityStatusEnum('status').notNull().default('active'),
        metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        index('kg_entities_type_idx').on(t.entityType),
        index('kg_entities_name_idx').on(t.name),
        unique('kg_entities_type_canonical_name_unique').on(t.entityType, t.canonicalName),
    ]
);

export const kgEntityAliases = pgTable(
    'kg_entity_aliases',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        entityId: uuid('entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        alias: varchar('alias', {length: 200}).notNull(),
        aliasType: kgAliasTypeEnum('alias_type').notNull().default('common'),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (t) => [
        unique('kg_entity_aliases_entity_alias_unique').on(t.entityId, t.alias),
        index('kg_entity_aliases_alias_idx').on(t.alias),
    ]
);

export const kgRelations = pgTable(
    'kg_relations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        fromEntityId: uuid('from_entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        toEntityId: uuid('to_entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        relationType: kgRelationTypeEnum('relation_type').notNull(),
        weight: decimal('weight', {precision: 8, scale: 4}),
        confidence: decimal('confidence', {precision: 5, scale: 4}),
        source: varchar('source', {length: 200}),
        evidence: jsonb('evidence').notNull().default(sql`'{}'::jsonb`),
        validFrom: timestamp('valid_from', {withTimezone: true}),
        validTo: timestamp('valid_to', {withTimezone: true}),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        unique('kg_relations_from_to_type_unique').on(t.fromEntityId, t.toEntityId, t.relationType),
        index('kg_relations_from_idx').on(t.fromEntityId),
        index('kg_relations_to_idx').on(t.toEntityId),
        index('kg_relations_type_idx').on(t.relationType),
    ]
);

export const securities = pgTable(
    'securities',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        companyEntityId: uuid('company_entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        stockCode: varchar('stock_code', {length: 20}).notNull(),
        stockName: varchar('stock_name', {length: 100}).notNull(),
        exchange: varchar('exchange', {length: 20}).notNull(),
        listStatus: kgSecurityListStatusEnum('list_status').notNull().default('listed'),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [
        unique('securities_exchange_stock_code_unique').on(t.exchange, t.stockCode),
        index('securities_company_entity_idx').on(t.companyEntityId),
    ]
);

export const events = pgTable(
    'events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        title: varchar('title', {length: 300}).notNull(),
        eventType: varchar('event_type', {length: 100}).notNull(),
        summary: text('summary'),
        sourceNewsId: uuid('source_news_id').references(() => news.id, {onDelete: 'set null'}),
        eventTime: timestamp('event_time', {withTimezone: true}),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', {withTimezone: true})
            .notNull()
            .defaultNow()
            .$onUpdate(() => new Date()),
    },
    (t) => [index('events_event_type_idx').on(t.eventType), index('events_source_news_id_idx').on(t.sourceNewsId)]
);

export const eventEntityMap = pgTable(
    'event_entity_map',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        eventId: uuid('event_id')
            .notNull()
            .references(() => events.id, {onDelete: 'cascade'}),
        entityId: uuid('entity_id')
            .notNull()
            .references(() => kgEntities.id, {onDelete: 'cascade'}),
        impactType: varchar('impact_type', {length: 50}),
        impactScore: decimal('impact_score', {precision: 5, scale: 4}),
        createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    },
    (t) => [
        unique('event_entity_map_event_entity_unique').on(t.eventId, t.entityId),
        index('event_entity_map_event_idx').on(t.eventId),
        index('event_entity_map_entity_idx').on(t.entityId),
    ]
);

export const kgEntitiesRelations = relations(kgEntities, ({many}) => ({
    aliases: many(kgEntityAliases),
    outgoingRelations: many(kgRelations, {relationName: 'kg_relation_from'}),
    incomingRelations: many(kgRelations, {relationName: 'kg_relation_to'}),
    securities: many(securities),
    eventMappings: many(eventEntityMap),
}));

export const kgEntityAliasesRelations = relations(kgEntityAliases, ({one}) => ({
    entity: one(kgEntities, {
        fields: [kgEntityAliases.entityId],
        references: [kgEntities.id],
    }),
}));

export const kgRelationsRelations = relations(kgRelations, ({one}) => ({
    fromEntity: one(kgEntities, {
        fields: [kgRelations.fromEntityId],
        references: [kgEntities.id],
        relationName: 'kg_relation_from',
    }),
    toEntity: one(kgEntities, {
        fields: [kgRelations.toEntityId],
        references: [kgEntities.id],
        relationName: 'kg_relation_to',
    }),
}));

export const securitiesRelations = relations(securities, ({one}) => ({
    company: one(kgEntities, {
        fields: [securities.companyEntityId],
        references: [kgEntities.id],
    }),
}));

export const eventsRelations = relations(events, ({one, many}) => ({
    sourceNews: one(news, {
        fields: [events.sourceNewsId],
        references: [news.id],
    }),
    entityMappings: many(eventEntityMap),
}));

export const newsRelations = relations(news, ({many, one}) => ({
    events: many(events),
    latestAnalysisSnapshot: one(newsAnalysisSnapshots, {
        fields: [news.id],
        references: [newsAnalysisSnapshots.newsId],
    }),
}));

export const newsAnalysisSnapshotsRelations = relations(newsAnalysisSnapshots, ({one}) => ({
    news: one(news, {
        fields: [newsAnalysisSnapshots.newsId],
        references: [news.id],
    }),
}));

export const eventEntityMapRelations = relations(eventEntityMap, ({one}) => ({
    event: one(events, {
        fields: [eventEntityMap.eventId],
        references: [events.id],
    }),
    entity: one(kgEntities, {
        fields: [eventEntityMap.entityId],
        references: [kgEntities.id],
    }),
}));

export const researchChatSessionsRelations = relations(researchChatSessions, ({one, many}) => ({
    user: one(profiles, {
        fields: [researchChatSessions.userId],
        references: [profiles.id],
    }),
    messages: many(researchChatMessages),
}));

export const researchChatMessagesRelations = relations(researchChatMessages, ({one}) => ({
    session: one(researchChatSessions, {
        fields: [researchChatMessages.sessionId],
        references: [researchChatSessions.id],
    }),
}));
