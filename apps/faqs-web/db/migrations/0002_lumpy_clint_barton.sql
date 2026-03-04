-- Remove duplicate rows before adding unique constraint (keep the earliest per title+source)
DELETE FROM "news" a USING "news" b
WHERE a."title" = b."title" AND a."source" = b."source"
  AND a."created_at" > b."created_at";--> statement-breakpoint
ALTER TABLE "news" ADD CONSTRAINT "news_title_source_unique" UNIQUE("title","source");