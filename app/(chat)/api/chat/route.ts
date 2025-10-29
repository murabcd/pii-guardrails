import { convertToModelMessages, streamText, wrapLanguageModel } from "ai";
import { auth } from "@/app/(auth)/auth";
import { createMessage, findSimilarChunksByFilePaths } from "@/app/db";
import { customModel } from "@/lib/ai";
import type { GuardrailEntityType } from "@/lib/ai/guardrails";
import { detectAndMask } from "@/lib/ai/guardrails";
import { createGuardrailMiddleware } from "@/lib/ai/middleware/guardrail";

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

	console.log("[API Route] Guardrail settings received", {
		guardrailEnabledEntities,
		userEmail: session.user?.email,
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

			console.log("[API Route] Sending UNMASKED query to RAG", {
				query: ragQuery,
				fileCount: selectedFilePathnames.length,
				hasGuardrails: !!(
					guardrailEnabledEntities && guardrailEnabledEntities.length > 0
				),
			});

			const similarChunks = await findSimilarChunksByFilePaths({
				query: ragQuery,
				filePaths: selectedFilePathnames.map(
					(path: string) => `${session.user?.email}/${path}`,
				),
				limit: 10,
				similarityThreshold,
			});

			console.log("[API Route] RAG search complete", {
				chunksFound: similarChunks.length,
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

				console.log("[API Route] Masked user message for AI (after RAG)", {
					originalLength: lastUserMessageContent.length,
					maskedLength: maskedResult.checked_text.length,
					detected: maskedResult.detected,
				});
			}

			// Inject context into messages if we found relevant chunks
			if (similarChunks.length > 0) {
				const hasMaskedGuardrails =
					maskedMessageText !== null &&
					/<NUMBER>|<EMAIL>|<RUSSIAN_NAME>/.test(maskedMessageText);

				// CRITICAL SECURITY: Mask guardrails in RAG context chunks before sending to AI
				// This ensures no guardrails from documents is sent to external LLM
				const maskedChunks =
					guardrailEnabledEntities && guardrailEnabledEntities.length > 0
						? similarChunks.map((chunk, idx) => {
								const maskedResult = detectAndMask(
									chunk.content,
									guardrailEnabledEntities as GuardrailEntityType[],
									session.user?.email ?? undefined,
								);

								// Log if this chunk had guardrails masked
								if (maskedResult.detected) {
									console.log(
										`[API Route] Masked RAG chunk ${idx + 1}/${similarChunks.length}`,
										{
											hasGuardrails: true,
											detectedEntities: maskedResult.detected_entities,
											originalLength: chunk.content.length,
											maskedLength: maskedResult.checked_text.length,
											preview: chunk.content.substring(0, 100),
											maskedPreview: maskedResult.checked_text.substring(
												0,
												100,
											),
										},
									);
								}

								return {
									...chunk,
									content: maskedResult.checked_text,
								};
							})
						: similarChunks;

				const maskedChunksCount = maskedChunks.filter(
					(chunk, idx) => chunk.content !== similarChunks[idx]?.content,
				).length;

				console.log("[API Route] Masked RAG context chunks - Summary", {
					totalChunks: similarChunks.length,
					maskedChunks: maskedChunksCount,
					unmaskedChunks: similarChunks.length - maskedChunksCount,
					guardrailMaskingEnabled: !!(
						guardrailEnabledEntities && guardrailEnabledEntities.length > 0
					),
				});

				const contextInstruction = hasMaskedGuardrails
					? "\n---\nIMPORTANT: The user's question may contain masked placeholders like <NUMBER>, <EMAIL>, or <RUSSIAN_NAME>. These placeholders represent real values that were used to retrieve this context. When the user asks about these masked entities, match them with the corresponding actual values found in the context above. Use the context above to answer the user's question accurately. Base your answer primarily on this context. If the information needed to answer the question is not in the context, say so clearly."
					: "\n---\nUse the context above to answer the user's question. Base your answer primarily on this context. If the information needed to answer the question is not in the context, say so clearly.";

				const contextText = [
					"## Context from uploaded documents:",
					...maskedChunks.map((chunk) => chunk.content),
					contextInstruction,
				].join("\n\n");

				modelMessages.push({
					role: "system",
					content: contextText,
				});

				console.log("[API Route] Context instruction added", {
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

	console.log("[API Route] Model configured", {
		hasGuardrailMiddleware:
			!!guardrailEnabledEntities && guardrailEnabledEntities.length > 0,
		guardrailEnabledEntities,
		modelMessagesCount: modelMessages.length,
	});

	// Build system prompt with guardrail-aware instructions
	const hasGuardrailsEnabled =
		guardrailEnabledEntities && guardrailEnabledEntities.length > 0;
	const systemPrompt = hasGuardrailsEnabled
		? "You are a helpful assistant that answers questions based on the provided document context. IMPORTANT: When the user's question contains masked placeholders like <NUMBER>, <EMAIL>, or <RUSSIAN_NAME>, these represent real values that were used to retrieve the context. Match these placeholders with corresponding actual values in the context to answer the question. When context is available, prioritize it in your responses. Keep your responses concise, accurate, and grounded in the provided information."
		: "You are a helpful assistant that answers questions based on the provided document context. When the context is available, prioritize it in your responses. Keep your responses concise, accurate, and grounded in the provided information.";

	console.log("[API Route] System prompt configured", {
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
