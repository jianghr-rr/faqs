CREATE TYPE "public"."kg_alias_type" AS ENUM('common', 'short_name', 'ticker_name', 'english_name', 'synonym');--> statement-breakpoint
CREATE TYPE "public"."kg_entity_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."kg_entity_type" AS ENUM('theme', 'industry', 'chain_node', 'company');--> statement-breakpoint
CREATE TYPE "public"."kg_relation_type" AS ENUM('relates_to', 'contains', 'upstream_of', 'belongs_to', 'participates_in');--> statement-breakpoint
CREATE TYPE "public"."kg_security_list_status" AS ENUM('listed', 'delisted', 'suspended');--> statement-breakpoint
CREATE TABLE "event_entity_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"impact_type" varchar(50),
	"impact_score" numeric(5, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_entity_map_event_entity_unique" UNIQUE("event_id","entity_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(300) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"summary" text,
	"source_news_id" uuid,
	"event_time" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kg_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "kg_entity_type" NOT NULL,
	"name" varchar(200) NOT NULL,
	"canonical_name" varchar(200) NOT NULL,
	"description" text,
	"status" "kg_entity_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_entities_type_canonical_name_unique" UNIQUE("entity_type","canonical_name")
);
--> statement-breakpoint
CREATE TABLE "kg_entity_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias" varchar(200) NOT NULL,
	"alias_type" "kg_alias_type" DEFAULT 'common' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_entity_aliases_entity_alias_unique" UNIQUE("entity_id","alias")
);
--> statement-breakpoint
CREATE TABLE "kg_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"relation_type" "kg_relation_type" NOT NULL,
	"weight" numeric(8, 4),
	"confidence" numeric(5, 4),
	"source" varchar(200),
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kg_relations_from_to_type_unique" UNIQUE("from_entity_id","to_entity_id","relation_type")
);
--> statement-breakpoint
CREATE TABLE "securities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_entity_id" uuid NOT NULL,
	"stock_code" varchar(20) NOT NULL,
	"stock_name" varchar(100) NOT NULL,
	"exchange" varchar(20) NOT NULL,
	"list_status" "kg_security_list_status" DEFAULT 'listed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "securities_exchange_stock_code_unique" UNIQUE("exchange","stock_code")
);
--> statement-breakpoint
ALTER TABLE "event_entity_map" ADD CONSTRAINT "event_entity_map_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_entity_map" ADD CONSTRAINT "event_entity_map_entity_id_kg_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kg_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_news_id_news_id_fk" FOREIGN KEY ("source_news_id") REFERENCES "public"."news"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_entity_aliases" ADD CONSTRAINT "kg_entity_aliases_entity_id_kg_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."kg_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_relations" ADD CONSTRAINT "kg_relations_from_entity_id_kg_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."kg_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kg_relations" ADD CONSTRAINT "kg_relations_to_entity_id_kg_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."kg_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "securities" ADD CONSTRAINT "securities_company_entity_id_kg_entities_id_fk" FOREIGN KEY ("company_entity_id") REFERENCES "public"."kg_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_entity_map_event_idx" ON "event_entity_map" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_entity_map_entity_idx" ON "event_entity_map" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "events_event_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "events_source_news_id_idx" ON "events" USING btree ("source_news_id");--> statement-breakpoint
CREATE INDEX "kg_entities_type_idx" ON "kg_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "kg_entities_name_idx" ON "kg_entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "kg_entity_aliases_alias_idx" ON "kg_entity_aliases" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "kg_relations_from_idx" ON "kg_relations" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "kg_relations_to_idx" ON "kg_relations" USING btree ("to_entity_id");--> statement-breakpoint
CREATE INDEX "kg_relations_type_idx" ON "kg_relations" USING btree ("relation_type");--> statement-breakpoint
CREATE INDEX "securities_company_entity_idx" ON "securities" USING btree ("company_entity_id");