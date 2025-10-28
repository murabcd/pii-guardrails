import { embed, embedMany } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "@/app/db";
import { chunk } from "@/lib/db/schema";
import { sql, inArray, desc, and } from "drizzle-orm";

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

/**
 * Find similar chunks using database-level similarity search with pgvector
 */
export async function findSimilarChunks(
	query: string,
	filePaths: string[],
	limit: number = 10,
	similarityThreshold: number = 1.0,
) {
	// Generate embedding for the query
	const queryEmbedding = await generateEmbedding(query);

	// Use pgvector's cosine distance operator (<=>) for similarity search
	// Convert the embedding array to a proper vector format for pgvector
	const queryVectorStr = `[${queryEmbedding.join(",")}]`;
	const similarity = sql<number>`1 - (${chunk.embedding} <=> ${queryVectorStr}::vector)`;

	// First, let's check if there are any chunks for these file paths
	const allChunks = await db
		.select({
			id: chunk.id,
			filePath: chunk.filePath,
			content: chunk.content,
		})
		.from(chunk)
		.where(inArray(chunk.filePath, filePaths));

	// Now do the similarity search with the user-defined threshold
	const results = await db
		.select({
			id: chunk.id,
			filePath: chunk.filePath,
			content: chunk.content,
			similarity,
		})
		.from(chunk)
		.where(
			and(
				inArray(chunk.filePath, filePaths),
				sql`(${chunk.embedding} <=> ${queryVectorStr}::vector) < ${similarityThreshold}`,
			),
		)
		.orderBy(desc(similarity))
		.limit(limit);

	return results;
}
