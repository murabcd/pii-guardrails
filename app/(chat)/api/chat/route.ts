import { convertToModelMessages, streamText, wrapLanguageModel } from "ai";
import { auth } from "@/app/(auth)/auth";
import { customModel } from "@/lib/ai";
import {
	generateContextInstruction,
	generateSystemPrompt,
} from "@/lib/ai/guardrail-prompt-utils";
import type { GuardrailEntityType } from "@/lib/ai/guardrails";
import { detectAndMask } from "@/lib/ai/guardrails";
import { guardrailLogger } from "@/lib/ai/logger";
import { createGuardrailMiddleware } from "@/lib/ai/middleware/guardrail";
import { rerankDocuments } from "@/lib/ai/reranker";
import { createMessage, findSimilarChunksByFilePaths } from "@/lib/db/db";

export async function POST(request: Request) {
	const {
		id,
		messages,
		selectedFilePathnames,
		similarityThreshold = 1.0,
		guardrailEnabledEntities,
	} = await request.json();

	const session = await auth();

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	guardrailLogger.info("API route: Request received", {
		hasGuardrails: !!(
			guardrailEnabledEntities && guardrailEnabledEntities.length > 0
		),
		entityTypes: guardrailEnabledEntities,
		fileCount: selectedFilePathnames?.length ?? 0,
	});

	// Convert UIMessages to ModelMessages
	const modelMessages = convertToModelMessages(messages);

	// Save user messages to database before streaming
	await createMessage({
		id,
		messages,
		author: session.user?.email ?? "",
	});

	// Implement RAG if files are selected
	if (selectedFilePathnames?.length > 0) {
		const lastMessage = modelMessages[modelMessages.length - 1];

		if (lastMessage && lastMessage.role === "user") {
			const lastUserMessageContent = Array.isArray(lastMessage.content)
				? lastMessage.content
						.filter((content) => content.type === "text")
						.map((content) => content.text)
						.join("\n")
				: lastMessage.content;

			// Send UNMASKED query to RAG - we need actual guardrails to find relevant documents
			// RAG search needs the real number/email/name to match against documents
			const ragQuery =
				typeof lastUserMessageContent === "string"
					? lastUserMessageContent
					: "";

			guardrailLogger.info("API route: Sending query to RAG", {
				textLength: ragQuery.length,
				fileCount: selectedFilePathnames.length,
				hasGuardrails: !!(
					guardrailEnabledEntities && guardrailEnabledEntities.length > 0
				),
			});

			// Use hybrid search (vector + full-text) for better relevance
			const similarChunks = await findSimilarChunksByFilePaths({
				query: ragQuery,
				filePaths: selectedFilePathnames.map(
					(path: string) => `${session.user?.email}/${path}`,
				),
				limit: 10,
				similarityThreshold,
				useHybrid: true, // Enable hybrid search (vector + FTS)
				// You can add metadata filtering here if needed
				// metadataFilter: {
				//   createdAfter: new Date('2024-01-01'),
				//   source: 'pdf',
				//   tags: ['important'],
				// }
			});

			guardrailLogger.info("API route: RAG search complete (hybrid)", {
				chunksFound: similarChunks.length,
			});

			// Rerank the results using Jina AI for better relevance
			// This reorders the vector search results based on semantic relevance to the query
			const rerankedChunks = await rerankDocuments(
				ragQuery,
				similarChunks,
				10, // Keep top 10 after reranking
			);

			guardrailLogger.info("API route: Reranking complete", {
				originalCount: similarChunks.length,
				rerankedCount: rerankedChunks.length,
			});

			// NOW mask guardrails in the user message before sending to AI
			// This ensures RAG can find documents, but AI doesn't see the guardrails
			let maskedMessageText: string | null = null;
			if (
				guardrailEnabledEntities &&
				guardrailEnabledEntities.length > 0 &&
				typeof lastUserMessageContent === "string"
			) {
				const maskedResult = detectAndMask(
					lastUserMessageContent,
					guardrailEnabledEntities as GuardrailEntityType[],
					session.user?.email ?? undefined,
					"user_message",
				);

				maskedMessageText = maskedResult.checked_text;

				// Update the message in modelMessages so it's masked before reaching AI
				// Middleware will skip it due to idempotency check
				if (Array.isArray(lastMessage.content)) {
					const updatedContent = lastMessage.content.map((part) => {
						if (part.type === "text") {
							return { ...part, text: maskedResult.checked_text };
						}
						return part;
					});
					lastMessage.content = updatedContent;
				} else {
					lastMessage.content = maskedResult.checked_text;
				}

				guardrailLogger.info("API route: Masked user message (after RAG)", {
					textLength: lastUserMessageContent.length,
					maskedLength: maskedResult.checked_text.length,
					detected: maskedResult.detected,
				});
			}

			// Inject context into messages if we found relevant chunks
			if (rerankedChunks.length > 0) {
				const hasMaskedGuardrails =
					maskedMessageText !== null &&
					/<NUMBER>|<EMAIL>|<RUSSIAN_NAME>/.test(maskedMessageText);

				// CRITICAL SECURITY: Mask guardrails in RAG context chunks before sending to AI
				// This ensures no guardrails from documents is sent to external LLM
				const maskedChunks =
					guardrailEnabledEntities && guardrailEnabledEntities.length > 0
						? rerankedChunks.map((chunk, idx) => {
								const maskedResult = detectAndMask(
									chunk.content,
									guardrailEnabledEntities as GuardrailEntityType[],
									session.user?.email ?? undefined,
									"rag_chunk",
								);

								// Log if this chunk had guardrails masked
								if (maskedResult.detected) {
									guardrailLogger.info(
										`API route: Masked RAG chunk ${idx + 1}/${rerankedChunks.length}`,
										{
											detected: true,
											entityTypes: Object.keys(
												maskedResult.detected_entities,
											).filter(
												(key) =>
													(maskedResult.detected_entities[
														key as GuardrailEntityType
													]?.length ?? 0) > 0,
											),
											textLength: chunk.content.length,
											maskedLength: maskedResult.checked_text.length,
										},
									);
								}

								return {
									...chunk,
									content: maskedResult.checked_text,
								};
							})
						: rerankedChunks;

				const maskedChunksCount = maskedChunks.filter(
					(chunk, idx) => chunk.content !== rerankedChunks[idx]?.content,
				).length;

				guardrailLogger.info("API route: Masked RAG context chunks - Summary", {
					totalChunks: rerankedChunks.length,
					maskedChunks: maskedChunksCount,
					unmaskedChunks: rerankedChunks.length - maskedChunksCount,
					guardrailMaskingEnabled: !!(
						guardrailEnabledEntities && guardrailEnabledEntities.length > 0
					),
				});

				// Generate context instruction with dynamic placeholders
				const contextInstruction = generateContextInstruction(
					hasMaskedGuardrails,
					guardrailEnabledEntities as GuardrailEntityType[],
				);

				const contextText = [
					"## Context from uploaded documents:",
					...maskedChunks.map((chunk) => chunk.content),
					contextInstruction,
				].join("\n\n");

				modelMessages.push({
					role: "system",
					content: contextText,
				});

				guardrailLogger.info("API route: Context instruction added", {
					hasMaskedGuardrails,
					instructionLength: contextInstruction.length,
					contextChunksMasked: maskedChunksCount > 0,
				});
			}
		}
	}

	// Create model with guardrail middleware configured with user settings
	// Only create middleware if entities array exists and has at least one entity
	const modelWithGuardrails =
		guardrailEnabledEntities && guardrailEnabledEntities.length > 0
			? wrapLanguageModel({
					model: customModel,
					middleware: createGuardrailMiddleware(
						guardrailEnabledEntities as GuardrailEntityType[],
						session.user?.email ?? undefined,
					),
				})
			: customModel;

	guardrailLogger.info("API route: Model configured", {
		hasGuardrailMiddleware:
			!!guardrailEnabledEntities && guardrailEnabledEntities.length > 0,
		entityTypes: guardrailEnabledEntities,
		modelMessagesCount: modelMessages.length,
	});

	// Build system prompt with guardrail-aware instructions
	const hasGuardrailsEnabled =
		guardrailEnabledEntities && guardrailEnabledEntities.length > 0;

	const systemPrompt = generateSystemPrompt(
		hasGuardrailsEnabled,
		guardrailEnabledEntities as GuardrailEntityType[],
	);

	guardrailLogger.info("API route: System prompt configured", {
		hasGuardrailInstructions: hasGuardrailsEnabled,
		promptLength: systemPrompt.length,
	});

	const result = streamText({
		model: modelWithGuardrails,
		system: systemPrompt,
		messages: modelMessages,
		experimental_telemetry: {
			isEnabled: true,
			functionId: "stream-text",
		},
	});

	return result.toUIMessageStreamResponse({
		originalMessages: messages,
		generateMessageId: () => crypto.randomUUID(),
		onFinish: async ({ messages: allMessages }) => {
			await createMessage({
				id,
				messages: allMessages,
				author: session.user?.email ?? "",
			});
		},
	});
}
