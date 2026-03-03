CREATE TYPE "public"."faq_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."news_category" AS ENUM('要闻', '宏观', '研报', '策略', 'AI洞察', '数据');--> statement-breakpoint
CREATE TYPE "public"."news_sentiment" AS ENUM('positive', 'negative', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" varchar(500),
	"parent_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "faq_tags" (
	"faq_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "faq_tags_faq_id_tag_id_pk" PRIMARY KEY("faq_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "faqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"question" varchar(500) NOT NULL,
	"answer" text NOT NULL,
	"category_id" integer,
	"author_id" uuid NOT NULL,
	"status" "faq_status" DEFAULT 'draft' NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"summary" text,
	"content" text,
	"category" "news_category" NOT NULL,
	"source" varchar(100) NOT NULL,
	"source_url" varchar(1000),
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"sentiment" "news_sentiment",
	"sentiment_score" numeric(3, 2),
	"tickers" text[],
	"tags" text[],
	"image_url" varchar(1000),
	"importance" smallint DEFAULT 2 NOT NULL,
	"is_ai_generated" boolean DEFAULT false NOT NULL,
	"agent_id" varchar(100),
	"is_published" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"avatar" varchar(500),
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "faq_tags_tag_id_idx" ON "faq_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "faqs_category_id_idx" ON "faqs" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "faqs_author_id_idx" ON "faqs" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "faqs_status_idx" ON "faqs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "faqs_status_sort_idx" ON "faqs" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "news_published_at_idx" ON "news" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "news_category_idx" ON "news" USING btree ("category");--> statement-breakpoint
CREATE INDEX "news_importance_idx" ON "news" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "news_is_published_idx" ON "news" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "news_source_idx" ON "news" USING btree ("source");