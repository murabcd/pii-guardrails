import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2Message,
	LanguageModelV2Middleware,
} from "@ai-sdk/provider";
import type { GuardrailEntityType } from "../guardrails";
import { detectAndMask, getDefaultGuardrailEntities } from "../guardrails";

/**
 * Create Guardrail Middleware for AI SDK v5
 * Masks Russian names, numbers, and emails in user input before sending to LLM
 * Operates in pre-flight stage (input masking only, block=false mode)
 *
 * @param enabledEntities - Array of guardrail entity types to detect. Defaults to all if not provided.
 * @param userEmail - Optional user email to exclude from email masking
 */
export function createGuardrailMiddleware(
	enabledEntities?: GuardrailEntityType[],
	userEmail?: string,
): LanguageModelV2Middleware {
	const entitiesToUse = enabledEntities || getDefaultGuardrailEntities();

	console.log("[Guardrail Middleware] Created with entities:", entitiesToUse);

	return {
		transformParams: async ({
			params,
			type,
		}: {
			params: LanguageModelV2CallOptions;
			type: "generate" | "stream";
			model: LanguageModelV2;
		}) => {
			console.log("[Guardrail Middleware] transformParams called", {
				type,
				messageCount: Array.isArray(params.prompt) ? params.prompt.length : 0,
			});

			// Handle prompt as array of messages
			if (Array.isArray(params.prompt)) {
				let maskedCount = 0;
				const maskedPrompt = params.prompt.map(
					(message: LanguageModelV2Message) => {
						// Only process user messages
						if (message.role !== "user") {
							return message;
						}

						// Handle array content (multimodal)
						if (Array.isArray(message.content)) {
							const maskedContent = message.content.map((part) => {
								if (part.type === "text") {
									// Skip guardrail detection if text is already masked (idempotency)
									// This optimizes performance when transformParams is called multiple times
									const isAlreadyMasked = /<(?:NUMBER|EMAIL|RUSSIAN_NAME)>/.test(
										part.text,
									);
									if (isAlreadyMasked) {
										// Text is already masked, skip processing
										return part;
									}

									const originalText = part.text;
									const result = detectAndMask(
										part.text,
										entitiesToUse,
										userEmail,
									);
									if (result.detected) {
										maskedCount++;
										console.log("[Guardrail Middleware] Masked user message", {
											original: originalText,
											masked: result.checked_text,
											detectedEntities: result.detected_entities,
										});
										return {
											...part,
											text: result.checked_text,
										};
									}
								}
								return part;
							});

							return {
								...message,
								content: maskedContent,
							};
						}

						return message;
					},
				);

				console.log("[Guardrail Middleware] Processing complete", {
					maskedMessages: maskedCount,
					totalMessages: maskedPrompt.length,
				});

				return {
					...params,
					prompt: maskedPrompt,
				};
			}

			return params;
		},
	};
}

// Default middleware with all entities enabled
export const guardrailMiddleware = createGuardrailMiddleware();

