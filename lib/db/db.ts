import { genSaltSync, hashSync } from "bcrypt-ts";
import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chat, chunk, document, user } from "@/lib/db/schema";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle
const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
	throw new Error("POSTGRES_URL environment variable is required");
}
const client = postgres(`${postgresUrl}?sslmode=require`);
export const db = drizzle(client);

export async function getUser(email: string) {
	return await db.select().from(user).where(eq(user.email, email));
}

export async function createUser(email: string, password: string) {
	const salt = genSaltSync(10);
	const hash = hashSync(password, salt);

	return await db.insert(user).values({ email, password: hash });
}

export async function createMessage({
	id,
	messages,
	author,
}: {
	id: string;
	messages: unknown;
	author: string;
}) {
	const selectedChats = await db.select().from(chat).where(eq(chat.id, id));

	if (selectedChats.length > 0) {
		return await db
			.update(chat)
			.set({
				messages: JSON.stringify(messages),
			})
			.where(eq(chat.id, id));
	}

	return await db.insert(chat).values({
		id,
		createdAt: new Date(),
		messages: JSON.stringify(messages),
		author,
	});
}

export async function getChatsByUser({ email }: { email: string }) {
	return await db
		.select()
		.from(chat)
		.where(eq(chat.author, email))
		.orderBy(desc(chat.createdAt));
}

export async function getChatById({ id }: { id: string }) {
	const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
	return selectedChat;
}

/**
 * Insert a document with metadata
 */
export async function insertDocument({
	id,
	title,
	filePath,
	source,
	author,
	metadata,
}: {
	id: string;
	title: string;
	filePath: string;
	source: string;
	author: string;
	metadata?: Record<string, unknown>;
}) {
	return await db.insert(document).values({
		id,
		title,
		filePath,
		source,
		author,
		metadata: metadata ? (metadata as any) : null,
		createdAt: new Date(),
	});
}

/**
 * Get document by file path
 */
export async function getDocumentByFilePath({
	filePath,
}: {
	filePath: string;
}) {
	const [doc] = await db
		.select()
		.from(document)
		.where(eq(document.filePath, filePath));
	return doc;
}

/**
 * Get documents by author
 */
export async function getDocumentsByAuthor({ author }: { author: string }) {
	return await db
		.select()
		.from(document)
		.where(eq(document.author, author))
		.orderBy(desc(document.createdAt));
}

/**
 * Insert chunks for a document
 */
export async function insertChunks({
	chunks,
}: {
	chunks: Array<{
		id: string;
		documentId: string;
		content: string;
		embedding: number[];
		startToken: number;
		endToken: number;
		chunkIndex: number;
	}>;
}) {
	return await db.insert(chunk).values(chunks);
}

/**
 * Get chunks by document IDs
 */
export async function getChunksByDocumentIds({
	documentIds,
}: {
	documentIds: Array<string>;
}) {
	return await db
		.select()
		.from(chunk)
		.where(inArray(chunk.documentId, documentIds))
		.orderBy(chunk.chunkIndex);
}

/**
 * Legacy function - maintained for backward compatibility
 * Use getChunksByDocumentIds instead
 */
export async function getChunksByFilePaths({
	filePaths,
}: {
	filePaths: Array<string>;
}) {
	const docs = await db
		.select()
		.from(document)
		.where(inArray(document.filePath, filePaths));

	const documentIds = docs.map((doc) => doc.id);

	if (documentIds.length === 0) {
		return [];
	}

	return await db
		.select({
			id: chunk.id,
			documentId: chunk.documentId,
			filePath: document.filePath,
			content: chunk.content,
			chunkIndex: chunk.chunkIndex,
		})
		.from(chunk)
		.innerJoin(document, eq(chunk.documentId, document.id))
		.where(inArray(chunk.documentId, documentIds))
		.orderBy(chunk.chunkIndex);
}

/**
 * Find similar chunks using hybrid search (vector + full-text search)
 * Implements the approach from: https://anyblockers.com/posts/building-rag-with-postgres
 */
export async function findSimilarChunksByFilePaths({
	query,
	filePaths,
	limit = 10,
	similarityThreshold = 1.0,
	useHybrid = true,
	metadataFilter,
}: {
	query: string;
	filePaths: Array<string>;
	limit?: number;
	similarityThreshold?: number;
	useHybrid?: boolean;
	metadataFilter?: {
		createdAfter?: Date;
		createdBefore?: Date;
		source?: string | string[];
		tags?: string[];
	};
}) {
	const { findSimilarChunksHybrid } = await import("@/lib/ai/embeddings");
	return await findSimilarChunksHybrid(query, filePaths, {
		limit,
		minVectorScore: 1 - similarityThreshold,
		useHybrid,
		metadataFilter,
	});
}

/**
 * Delete document and its chunks by file path
 * Chunks are automatically deleted via CASCADE
 */
export async function deleteDocumentByFilePath({
	filePath,
}: {
	filePath: string;
}) {
	return await db.delete(document).where(eq(document.filePath, filePath));
}

/**
 * Legacy function - maintained for backward compatibility
 */
export async function deleteChunksByFilePath({
	filePath,
}: {
	filePath: string;
}) {
	return await deleteDocumentByFilePath({ filePath });
}

export async function deleteChat({ id }: { id: string }) {
	return await db.delete(chat).where(eq(chat.id, id));
}
