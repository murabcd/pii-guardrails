import type { UIMessage } from "ai";
import type { InferSelectModel } from "drizzle-orm";
import {
	index,
	integer,
	json,
	pgTable,
	text,
	timestamp,
	varchar,
	vector,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
	email: varchar("email", { length: 64 }).primaryKey().notNull(),
	password: varchar("password", { length: 64 }),
});

export const chat = pgTable("Chat", {
	id: text("id").primaryKey().notNull(),
	createdAt: timestamp("createdAt").notNull(),
	messages: json("messages").notNull(),
	author: varchar("author", { length: 64 })
		.notNull()
		.references(() => user.email),
});

// Documents table - stores metadata about uploaded files
export const document = pgTable(
	"Document",
	{
		id: text("id").primaryKey().notNull(),
		title: text("title").notNull(),
		filePath: text("filePath").notNull().unique(),
		source: text("source").notNull(), // file type/source (pdf, txt, etc)
		author: varchar("author", { length: 64 })
			.notNull()
			.references(() => user.email),
		createdAt: timestamp("createdAt").notNull().defaultNow(),
		metadata: json("metadata").$type<{
			fileSize?: number;
			mimeType?: string;
			uploadedAt?: string;
			tags?: string[];
			[key: string]: unknown;
		}>(),
	},
	(table) => ({
		authorIdx: index("document_author_idx").on(table.author),
		filePathIdx: index("document_file_path_idx").on(table.filePath),
		createdAtIdx: index("document_created_at_idx").on(table.createdAt),
	}),
);

// Document chunks table - stores text chunks with embeddings and full-text search
export const chunk = pgTable(
	"Chunk",
	{
		id: text("id").primaryKey().notNull(),
		documentId: text("documentId")
			.notNull()
			.references(() => document.id, { onDelete: "cascade" }),
		content: text("content").notNull(),
		embedding: vector("embedding", { dimensions: 1536 }).notNull(),
		// Token-based positioning for overlap tracking
		startToken: integer("startToken").notNull(),
		endToken: integer("endToken").notNull(),
		chunkIndex: integer("chunkIndex").notNull(),
		// Full-text search vector - automatically generated from content
		// Note: This column is created via migration SQL as Drizzle doesn't fully support generated tsvector columns
	},
	(table) => ({
		embeddingIndex: index("chunk_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops"),
		),
		// GIN index for full-text search - created via migration SQL
		documentIdx: index("chunk_document_idx").on(table.documentId),
		chunkOrderIdx: index("chunk_order_idx").on(
			table.documentId,
			table.chunkIndex,
		),
	}),
);

export type Chat = Omit<InferSelectModel<typeof chat>, "messages"> & {
	messages: Array<UIMessage>;
};

export type Document = InferSelectModel<typeof document>;
export type Chunk = InferSelectModel<typeof chunk>;
