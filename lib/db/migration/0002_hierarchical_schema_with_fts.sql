-- Migration: Add hierarchical document structure with full-text search
-- This migration implements the RAG approach from https://anyblockers.com/posts/building-rag-with-postgres

-- Step 1: Create Document table for file metadata
CREATE TABLE IF NOT EXISTS "Document" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"filePath" text NOT NULL UNIQUE,
	"source" text NOT NULL,
	"author" varchar(64) NOT NULL REFERENCES "User"("email"),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"metadata" json
);

-- Create indexes for Document table
CREATE INDEX IF NOT EXISTS "document_author_idx" ON "Document" ("author");
CREATE INDEX IF NOT EXISTS "document_file_path_idx" ON "Document" ("filePath");
CREATE INDEX IF NOT EXISTS "document_created_at_idx" ON "Document" ("createdAt");

-- Step 2: Backup existing chunks (if any)
CREATE TEMP TABLE IF NOT EXISTS "Chunk_backup" AS SELECT * FROM "Chunk";

-- Step 3: Drop old Chunk table and recreate with new schema
DROP TABLE IF EXISTS "Chunk";

CREATE TABLE IF NOT EXISTS "Chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"documentId" text NOT NULL REFERENCES "Document"("id") ON DELETE CASCADE,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"startToken" integer NOT NULL,
	"endToken" integer NOT NULL,
	"chunkIndex" integer NOT NULL,
	-- Full-text search vector - automatically generated from content
	"fts" tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

-- Step 4: Create indexes for efficient retrieval
-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS "chunk_embedding_idx" ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS "chunk_fts_idx" ON "Chunk" USING gin ("fts");

-- B-tree indexes for filtering and ordering
CREATE INDEX IF NOT EXISTS "chunk_document_idx" ON "Chunk" ("documentId");
CREATE INDEX IF NOT EXISTS "chunk_order_idx" ON "Chunk" ("documentId", "chunkIndex");

-- Step 5: Migrate existing data (if any)
-- Create documents from existing chunks' filePaths
INSERT INTO "Document" ("id", "title", "filePath", "source", "author", "createdAt", "metadata")
SELECT
	gen_random_uuid()::text as "id",
	split_part("filePath", '/', -1) as "title",
	"filePath",
	CASE
		WHEN "filePath" LIKE '%.pdf' THEN 'pdf'
		WHEN "filePath" LIKE '%.txt' THEN 'txt'
		WHEN "filePath" LIKE '%.md' THEN 'markdown'
		ELSE 'unknown'
	END as "source",
	split_part("filePath", '/', 1) as "author", -- Extract email from path
	now() as "createdAt",
	json_build_object('migrated', true) as "metadata"
FROM (
	SELECT DISTINCT "filePath" FROM "Chunk_backup"
) as distinct_files
ON CONFLICT ("filePath") DO NOTHING;

-- Migrate chunks with proper documentId references
INSERT INTO "Chunk" ("id", "documentId", "content", "embedding", "startToken", "endToken", "chunkIndex")
SELECT
	old."id",
	doc."id" as "documentId",
	old."content",
	old."embedding",
	0 as "startToken", -- Legacy chunks don't have token info
	0 as "endToken",
	0 as "chunkIndex"
FROM "Chunk_backup" old
JOIN "Document" doc ON doc."filePath" = old."filePath";

-- Step 6: Drop the temporary backup table
DROP TABLE IF EXISTS "Chunk_backup";

-- Add comment for documentation
COMMENT ON TABLE "Document" IS 'Stores metadata about uploaded documents/files';
COMMENT ON TABLE "Chunk" IS 'Stores text chunks with embeddings and full-text search vectors';
COMMENT ON COLUMN "Chunk"."fts" IS 'Auto-generated tsvector for PostgreSQL full-text search';
COMMENT ON INDEX "chunk_embedding_idx" IS 'HNSW index for fast vector similarity search';
COMMENT ON INDEX "chunk_fts_idx" IS 'GIN index for fast full-text search';
