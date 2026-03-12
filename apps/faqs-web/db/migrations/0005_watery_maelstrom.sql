CREATE TABLE "news_analysis_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"news_id" uuid NOT NULL,
	"result_payload" jsonb NOT NULL,
	"result_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"analyzed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_analysis_snapshots_news_id_unique" UNIQUE("news_id")
);
--> statement-breakpoint
ALTER TABLE "news_analysis_snapshots" ADD CONSTRAINT "news_analysis_snapshots_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "news_analysis_snapshots_updated_at_idx" ON "news_analysis_snapshots" USING btree ("updated_at");
