import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/db";
import { chunk, document } from "@/lib/db/schema";
import { guardrailLogger } from "./logger";

const embeddingModel = openai.embedding("text-embedding-3-small");

/**
 * Generate a single embedding for a text input
 */
export async function generateEmbedding(text: string): Promise<number[]> {
	const { embedding } = await embed({
		model: embeddingModel,
		value: text,
	});
	return embedding;
}

/**
 * Generate embeddings for multiple text inputs
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
	const { embeddings } = await embedMany({
		model: embeddingModel,
		values: texts,
	});
	return embeddings;
}

export interface MetadataFilter {
	createdAfter?: Date;
	createdBefore?: Date;
	source?: string | string[];
	tags?: string[];
	[key: string]: unknown;
}

export interface HybridSearchOptions {
	limit?: number;
	vectorWeight?: number; // Weight for vector similarity (0-1), default: 0.7
	ftsWeight?: number; // Weight for full-text search (0-1), default: 0.3
	minVectorScore?: number; // Minimum vector similarity score (0-1), default: 0.3
	minFtsRank?: number; // Minimum FTS rank, default: 0.01
	useHybrid?: boolean; // Enable hybrid search, default: true
	metadataFilter?: MetadataFilter;
}

export interface SearchResult {
	id: string;
	documentId: string;
	filePath: string;
	content: string;
	chunkIndex: number;
	vectorScore?: number;
	ftsRank?: number;
	combinedScore: number;
	metadata?: Record<string, unknown>;
}

/**
 * Find similar chunks using vector similarity only (legacy method)
 * Kept for backward compatibility
 */
export async function findSimilarChunks(
	query: string,
	filePaths: string[],
	limit: number = 10,
	similarityThreshold: number = 1.0,
): Promise<SearchResult[]> {
	return findSimilarChunksHybrid(query, filePaths, {
		limit,
		minVectorScore: 1 - similarityThreshold,
		useHybrid: false,
	});
}

/**
 * Hybrid search: Combines vector similarity with full-text search
 * Implements the approach from: https://anyblockers.com/posts/building-rag-with-postgres
 */
export async function findSimilarChunksHybrid(
	query: string,
	filePaths: string[],
	options: HybridSearchOptions = {},
): Promise<SearchResult[]> {
	const {
		limit = 10,
		vectorWeight = 0.7,
		ftsWeight = 0.3,
		minVectorScore = 0.3,
		minFtsRank = 0.01,
		useHybrid = true,
		metadataFilter,
	} = options;

	guardrailLogger.info("Hybrid search: Starting search", {
		queryLength: query.length,
		fileCount: filePaths.length,
		useHybrid,
		hasMetadataFilter: !!metadataFilter,
	});

	// Generate embedding for the query
	const queryEmbedding = await generateEmbedding(query);
	const queryVectorStr = `[${queryEmbedding.join(",")}]`;

	// Build metadata filter conditions
	const metadataConditions = [];

	if (metadataFilter?.createdAfter) {
		metadataConditions.push(
			gt(document.createdAt, metadataFilter.createdAfter),
		);
	}

	if (metadataFilter?.createdBefore) {
		metadataConditions.push(
			sql`${document.createdAt} < ${metadataFilter.createdBefore}`,
		);
	}

	if (metadataFilter?.source) {
		const sources = Array.isArray(metadataFilter.source)
			? metadataFilter.source
			: [metadataFilter.source];
		metadataConditions.push(inArray(document.source, sources));
	}

	if (metadataFilter?.tags && metadataFilter.tags.length > 0) {
		// Check if any tag matches (JSONB array contains)
		metadataConditions.push(
			sql`${document.metadata}->>'tags' ?| array[${sql.join(
				metadataFilter.tags.map((tag) => sql`${tag}`),
				sql`, `,
			)}]`,
		);
	}

	if (useHybrid) {
		// Hybrid search: Vector + Full-text search with RRF (Reciprocal Rank Fusion)
		// Convert filePaths array to PostgreSQL array format
		const filePathsArray = sql`ARRAY[${sql.join(
			filePaths.map((fp) => sql`${fp}`),
			sql`, `,
		)}]::text[]`;

		const hybridQuery = sql<SearchResult>`
			WITH vector_search AS (
				SELECT
					c.id,
					c."documentId",
					d."filePath",
					c.content,
					c."chunkIndex",
					(1 - (c.embedding <=> ${queryVectorStr}::vector)) as vector_score,
					ROW_NUMBER() OVER (ORDER BY c.embedding <=> ${queryVectorStr}::vector) as vector_rank
				FROM ${chunk} c
				INNER JOIN ${document} d ON c."documentId" = d.id
				WHERE
					d."filePath" = ANY(${filePathsArray})
					${metadataConditions.length > 0 ? sql`AND ${sql.join(metadataConditions, sql` AND `)}` : sql``}
					AND (1 - (c.embedding <=> ${queryVectorStr}::vector)) >= ${minVectorScore}
				ORDER BY c.embedding <=> ${queryVectorStr}::vector
				LIMIT ${limit * 2}
			),
			fts_search AS (
				SELECT
					c.id,
					c."documentId",
					d."filePath",
					c.content,
					c."chunkIndex",
					ts_rank_cd(c.fts, plainto_tsquery('english', ${query})) as fts_rank,
					ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.fts, plainto_tsquery('english', ${query})) DESC) as fts_rank_order
				FROM ${chunk} c
				INNER JOIN ${document} d ON c."documentId" = d.id
				WHERE
					d."filePath" = ANY(${filePathsArray})
					${metadataConditions.length > 0 ? sql`AND ${sql.join(metadataConditions, sql` AND `)}` : sql``}
					AND c.fts @@ plainto_tsquery('english', ${query})
					AND ts_rank_cd(c.fts, plainto_tsquery('english', ${query})) >= ${minFtsRank}
				ORDER BY ts_rank_cd(c.fts, plainto_tsquery('english', ${query})) DESC
				LIMIT ${limit * 2}
			),
			combined AS (
				SELECT
					COALESCE(v.id, f.id) as id,
					COALESCE(v."documentId", f."documentId") as "documentId",
					COALESCE(v."filePath", f."filePath") as "filePath",
					COALESCE(v.content, f.content) as content,
					COALESCE(v."chunkIndex", f."chunkIndex") as "chunkIndex",
					v.vector_score,
					f.fts_rank,
					-- Weighted scoring: combine normalized vector and FTS scores
					(
						COALESCE(${vectorWeight} * v.vector_score, 0) +
						COALESCE(${ftsWeight} * (f.fts_rank / NULLIF((SELECT MAX(fts_rank) FROM fts_search), 0)), 0)
					) as combined_score
				FROM vector_search v
				FULL OUTER JOIN fts_search f ON v.id = f.id
			)
			SELECT
				id,
				"documentId",
				"filePath",
				content,
				"chunkIndex",
				vector_score as "vectorScore",
				fts_rank as "ftsRank",
				combined_score as "combinedScore"
			FROM combined
			WHERE combined_score > 0
			ORDER BY combined_score DESC
			LIMIT ${limit}
		`;

		try {
			const results = await db.execute(hybridQuery);

			const resultKeys =
				typeof results === "object" && results !== null
					? Object.keys(results as object)
					: [];
			const hasRows =
				typeof results === "object" &&
				results !== null &&
				"rows" in results &&
				Array.isArray((results as { rows?: unknown }).rows);
			const rows = hasRows
				? ((results as { rows: SearchResult[] }).rows ?? [])
				: [];

			// Debug: Log the structure of results
			guardrailLogger.info("Hybrid search: Raw results structure", {
				isArray: Array.isArray(results),
				hasRows,
				type: typeof results,
				keys: resultKeys,
			});

			// Extract rows from result - postgres.js returns rows directly in the result object
			const typedResults = (
				Array.isArray(results) ? results : rows
			) as SearchResult[];

			guardrailLogger.info("Hybrid search: Search complete", {
				resultsCount: typedResults.length,
				hasVectorScores: typedResults.some((r) => r.vectorScore !== undefined),
				hasFtsRanks: typedResults.some((r) => r.ftsRank !== undefined),
			});

			return typedResults;
		} catch (error) {
			guardrailLogger.error("Hybrid search: Query failed", {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	// Vector-only search (fallback)
	const vectorSimilarity = sql<number>`1 - (${chunk.embedding} <=> ${queryVectorStr}::vector)`;

	const results = await db
		.select({
			id: chunk.id,
			documentId: chunk.documentId,
			filePath: document.filePath,
			content: chunk.content,
			chunkIndex: chunk.chunkIndex,
			vectorScore: vectorSimilarity,
			combinedScore: vectorSimilarity,
		})
		.from(chunk)
		.innerJoin(document, eq(chunk.documentId, document.id))
		.where(
			and(
				inArray(document.filePath, filePaths),
				sql`(${chunk.embedding} <=> ${queryVectorStr}::vector) < ${1 - minVectorScore}`,
				...(metadataConditions.length > 0 ? metadataConditions : []),
			),
		)
		.orderBy(desc(vectorSimilarity))
		.limit(limit);

	guardrailLogger.info("Vector search: Search complete", {
		resultsCount: results.length,
	});

	return results.map((r) => ({
		...r,
		vectorScore: r.vectorScore ?? 0,
		ftsRank: undefined,
		combinedScore: r.combinedScore ?? 0,
		metadata: undefined,
	}));
}
