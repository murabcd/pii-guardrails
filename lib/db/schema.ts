import type { UIMessage } from "ai";
import type { InferSelectModel } from "drizzle-orm";
import {
	index,
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

export const chunk = pgTable(
	"Chunk",
	{
		id: text("id").primaryKey().notNull(),
		filePath: text("filePath").notNull(),
		content: text("content").notNull(),
		embedding: vector("embedding", { dimensions: 1536 }).notNull(),
	},
	(table) => ({
		embeddingIndex: index("chunk_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops"),
		),
	}),
);

export type Chat = Omit<InferSelectModel<typeof chat>, "messages"> & {
	messages: Array<UIMessage>;
};

export type Chunk = InferSelectModel<typeof chunk>;
