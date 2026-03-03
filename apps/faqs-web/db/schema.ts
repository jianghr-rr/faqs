import {relations} from 'drizzle-orm';
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
    index,
    uuid,
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
        index('news_published_at_idx').on(t.publishedAt),
        index('news_category_idx').on(t.category),
        index('news_importance_idx').on(t.importance),
        index('news_is_published_idx').on(t.isPublished),
        index('news_source_idx').on(t.source),
    ]
);
