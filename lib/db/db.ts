import { genSaltSync, hashSync } from "bcrypt-ts";
import { desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chat, chunk, user } from "@/lib/db/schema";

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

export async function insertChunks({
	chunks,
}: {
	chunks: Array<{
		id: string;
		filePath: string;
		content: string;
		embedding: number[];
	}>;
}) {
	return await db.insert(chunk).values(chunks);
}

export async function getChunksByFilePaths({
	filePaths,
}: {
	filePaths: Array<string>;
}) {
	return await db
		.select()
		.from(chunk)
		.where(inArray(chunk.filePath, filePaths));
}

/**
 * Find similar chunks using pgvector similarity search
 * This replaces the old method that fetched all chunks and computed similarity in JavaScript
 */
export async function findSimilarChunksByFilePaths({
	query,
	filePaths,
	limit = 10,
	similarityThreshold = 1.0,
}: {
	query: string;
	filePaths: Array<string>;
	limit?: number;
	similarityThreshold?: number;
}) {
	const { findSimilarChunks } = await import("@/lib/ai/embeddings");
	return await findSimilarChunks(query, filePaths, limit, similarityThreshold);
}

export async function deleteChunksByFilePath({
	filePath,
}: {
	filePath: string;
}) {
	return await db.delete(chunk).where(eq(chunk.filePath, filePath));
}

export async function deleteChat({ id }: { id: string }) {
	return await db.delete(chat).where(eq(chat.id, id));
}
