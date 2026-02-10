import { convertToModelMessages, streamText, wrapLanguageModel } from "ai";
import { auth } from "@/app/(auth)/auth";
import { customModel } from "@/lib/ai";
import {
	generateContextInstruction,
	generateSystemPrompt,
} from "@/lib/ai/guardrail-prompt-utils";
import type { GuardrailEntityType } from "@/lib/ai/guardrails";
import { detectAndMaskWithNer, TokenVault } from "@/lib/ai/guardrails";
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

	const startTime = Date.now();
	const hasGuardrailsEnabled =
		guardrailEnabledEntities && guardrailEnabledEntities.length > 0;
	const wideEvent: Record<string, unknown> = {
		method: "POST",
		route: "/api/chat",
		requestId: id,
		userEmail: session.user?.email ?? null,
		fileCount: selectedFilePathnames?.length ?? 0,
		similarityThreshold,
		hasGuardrails: !!hasGuardrailsEnabled,
		guardrailEntities: guardrailEnabledEntities ?? [],
	};

	try {
		// Create TokenVault for storing PII mappings (needed for output unmasking)
		const tokenVault = hasGuardrailsEnabled ? new TokenVault() : undefined;
		wideEvent.hasTokenVault = !!tokenVault;

		// Convert UIMessages to ModelMessages
		const modelMessages = convertToModelMessages(messages);

		// Save user messages to database before streaming
		await createMessage({
			id,
			messages,
			author: session.user?.email ?? "",
		});

		let maskedMessageDetected = false;
		let maskedChunksCount = 0;
		let chunksFound = 0;
		let rerankedCount = 0;

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

				chunksFound = similarChunks.length;

				// Rerank the results using Jina AI for better relevance
				// This reorders the vector search results based on semantic relevance to the query
				const rerankedChunks = await rerankDocuments(
					ragQuery,
					similarChunks,
					10, // Keep top 10 after reranking
				);

				rerankedCount = rerankedChunks.length;

				// NOW mask guardrails in the user message before sending to AI
				// This ensures RAG can find documents, but AI doesn't see the guardrails
				let maskedMessageText: string | null = null;
				if (
					hasGuardrailsEnabled &&
					typeof lastUserMessageContent === "string"
				) {
					const maskedResult = await detectAndMaskWithNer(
						lastUserMessageContent,
						guardrailEnabledEntities as GuardrailEntityType[],
						session.user?.email ?? undefined,
						"user_message",
						tokenVault,
					);

					maskedMessageText = maskedResult.checked_text;
					maskedMessageDetected = maskedResult.detected;

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
				}

				// Inject context into messages if we found relevant chunks
				if (rerankedChunks.length > 0) {
					const hasMaskedGuardrails =
						maskedMessageText !== null &&
						/<(?:NUMBER|EMAIL|RUSSIAN_NAME)(?:_\d+)?>/.test(maskedMessageText);

					// CRITICAL SECURITY: Mask guardrails in RAG context chunks before sending to AI
					// This ensures no guardrails from documents is sent to external LLM
					const maskedChunks = hasGuardrailsEnabled
						? await Promise.all(
								rerankedChunks.map(async (chunk) => {
									const maskedResult = await detectAndMaskWithNer(
										chunk.content,
										guardrailEnabledEntities as GuardrailEntityType[],
										session.user?.email ?? undefined,
										"rag_chunk",
										tokenVault,
									);

									return {
										...chunk,
										content: maskedResult.checked_text,
									};
								}),
							)
						: rerankedChunks;

					maskedChunksCount = maskedChunks.filter(
						(chunk, idx) => chunk.content !== rerankedChunks[idx]?.content,
					).length;

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
				}
			}
		}

		// Create model with guardrail middleware configured with user settings
		// Only create middleware if entities array exists and has at least one entity
		const modelWithGuardrails = hasGuardrailsEnabled
			? wrapLanguageModel({
					model: customModel,
					middleware: createGuardrailMiddleware(
						guardrailEnabledEntities as GuardrailEntityType[],
						session.user?.email ?? undefined,
						tokenVault,
					),
				})
			: customModel;

		// Build system prompt with guardrail-aware instructions
		const systemPrompt = generateSystemPrompt(
			hasGuardrailsEnabled,
			guardrailEnabledEntities as GuardrailEntityType[],
		);

		const result = streamText({
			model: modelWithGuardrails,
			system: systemPrompt,
			messages: modelMessages,
			experimental_telemetry: {
				isEnabled: true,
				functionId: "stream-text",
			},
		});

		const response = result.toUIMessageStreamResponse({
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

		wideEvent.maskedMessageDetected = maskedMessageDetected;
		wideEvent.maskedChunks = maskedChunksCount;
		wideEvent.chunksFound = chunksFound;
		wideEvent.rerankedCount = rerankedCount;
		wideEvent.tokenVaultSize = tokenVault?.size() ?? 0;
		wideEvent.status_code = response.status;
		wideEvent.outcome = response.status >= 400 ? "error" : "success";

		// If no TokenVault, return response as-is (no unmasking needed)
		if (!tokenVault || tokenVault.size() === 0) {
			return response;
		}

		// Create a TransformStream to unmask the LLM response chunks
		// We need to buffer text because placeholders are streamed character-by-character
		let lineBuffer = "";
		let textBuffer = ""; // Accumulates delta text for progressive unmasking
		let lastSentLength = 0; // Track how much unmasked text we've already sent

		const { readable, writable } = new TransformStream({
			transform(chunk, controller) {
				try {
					// Decode the chunk
					const text = new TextDecoder().decode(chunk);

					// Add to line buffer
					lineBuffer += text;

					// Try to extract complete SSE messages from buffer
					const lines = lineBuffer.split("\n");

					// Process all complete lines (keep last incomplete line in buffer)
					for (let i = 0; i < lines.length - 1; i++) {
						const line = lines[i];

						// Skip empty lines
						if (!line.trim()) {
							controller.enqueue(new TextEncoder().encode("\n"));
							continue;
						}

						// Parse SSE format: "data: {...}"
						if (line.startsWith("data: ")) {
							const dataContent = line.substring(6); // Remove "data: " prefix

							// Special SSE messages that don't contain JSON
							if (dataContent === "[DONE]") {
								controller.enqueue(new TextEncoder().encode(`${line}\n`));
								continue;
							}

							try {
								// Parse the JSON payload
								const jsonData = JSON.parse(dataContent);

								// Handle text delta - accumulate and progressively unmask
								if (jsonData.delta && typeof jsonData.delta === "string") {
									// Add new delta to buffer
									textBuffer += jsonData.delta;

									// Check if buffer ends with an incomplete placeholder pattern
									// Pattern matches: <, <NUMBER, <NUMBER_, <NUMBER_1, etc. (but not <NUMBER_1> which is complete)
									const incompleteMatch = textBuffer.match(/<[A-Z_]*\d*$/);
									const hasIncompletePlaceholder = incompleteMatch !== null;

									// Calculate how much of the buffer is safe to unmask and send
									let safeTextBuffer = textBuffer;
									let holdbackLength = 0;

									if (hasIncompletePlaceholder) {
										// Hold back the incomplete placeholder portion
										holdbackLength = incompleteMatch[0].length;
										safeTextBuffer = textBuffer.substring(
											0,
											textBuffer.length - holdbackLength,
										);
									}

									// Unmask only the safe portion (excluding incomplete placeholder)
									const unmaskedBuffer = tokenVault.unmask(safeTextBuffer);

									// Only send the NEW portion (what we haven't sent yet)
									const newPortion = unmaskedBuffer.substring(lastSentLength);
									lastSentLength = unmaskedBuffer.length;

									// Update the delta with only the new unmasked text
									jsonData.delta = newPortion;
								} else if (jsonData.text && typeof jsonData.text === "string") {
									// For complete messages, unmask directly
									jsonData.text = tokenVault.unmask(jsonData.text);
								}

								// Re-encode the JSON and SSE format
								const unmaskedLine = `data: ${JSON.stringify(jsonData)}`;
								controller.enqueue(
									new TextEncoder().encode(`${unmaskedLine}\n`),
								);
							} catch {
								// If JSON parsing fails, pass through original line
								controller.enqueue(new TextEncoder().encode(`${line}\n`));
							}
						} else {
							// Non-SSE line, pass through as-is
							controller.enqueue(new TextEncoder().encode(`${line}\n`));
						}
					}

					// Keep the last incomplete line in buffer
					lineBuffer = lines[lines.length - 1];
				} catch {
					// If unmasking fails, pass through original chunk
					controller.enqueue(chunk);
					lineBuffer = "";
				}
			},
			flush(controller) {
				// Process any remaining line buffer
				if (lineBuffer.length > 0) {
					if (lineBuffer.startsWith("data: ")) {
						const dataContent = lineBuffer.substring(6);
						if (dataContent === "[DONE]") {
							controller.enqueue(new TextEncoder().encode(lineBuffer));
						} else {
							try {
								const jsonData = JSON.parse(dataContent);
								if (jsonData.delta && typeof jsonData.delta === "string") {
									textBuffer += jsonData.delta;
									const unmaskedBuffer = tokenVault.unmask(textBuffer);
									const newPortion = unmaskedBuffer.substring(lastSentLength);
									jsonData.delta = newPortion;
								} else if (jsonData.text && typeof jsonData.text === "string") {
									jsonData.text = tokenVault.unmask(jsonData.text);
								}
								const unmaskedBuffer = `data: ${JSON.stringify(jsonData)}`;
								controller.enqueue(new TextEncoder().encode(unmaskedBuffer));
							} catch {
								controller.enqueue(new TextEncoder().encode(lineBuffer));
							}
						}
					} else {
						controller.enqueue(new TextEncoder().encode(lineBuffer));
					}
				}
			},
		});

		// Pipe the response body through our transform stream
		if (response.body) {
			response.body.pipeTo(writable).catch((error) => {
				guardrailLogger.error("Error piping response stream", { error });
			});
		}

		// Return a new Response with the transformed body
		return new Response(readable, {
			headers: response.headers,
			status: response.status,
			statusText: response.statusText,
		});
	} catch (error) {
		wideEvent.status_code = 500;
		wideEvent.outcome = "error";
		wideEvent.error =
			error instanceof Error
				? { message: error.message, type: error.name }
				: { message: String(error), type: "unknown" };
		throw error;
	} finally {
		wideEvent.duration_ms = Date.now() - startTime;
		guardrailLogger.info("chat_request", wideEvent);
	}
}
