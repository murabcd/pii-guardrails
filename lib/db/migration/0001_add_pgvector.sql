-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop existing Chunk table
DROP TABLE IF EXISTS "Chunk";

-- Recreate Chunk table with proper vector type
CREATE TABLE IF NOT EXISTS "Chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"filePath" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL
);

-- Create HNSW index for efficient similarity search
CREATE INDEX IF NOT EXISTS "chunk_embedding_idx" ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);

