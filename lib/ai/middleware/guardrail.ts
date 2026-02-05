import type {
	LanguageModelV2,
	LanguageModelV2CallOptions,
	LanguageModelV2Message,
	LanguageModelV2Middleware,
} from "@ai-sdk/provider";
import type { GuardrailEntityType } from "../guardrails";
import {
	detectAndMaskWithNer,
	getDefaultGuardrailEntities,
	type TokenVault,
} from "../guardrails";
import { guardrailLogger } from "../logger";

/**
 * Create Guardrail Middleware for AI SDK v5
 * Masks Russian names, numbers, and emails in user input before sending to LLM
 * Operates in pre-flight stage (input masking only, block=false mode)
 *
 * @param enabledEntities - Array of guardrail entity types to detect. Defaults to all if not provided.
 * @param userEmail - Optional user email to exclude from email masking
 * @param tokenVault - Optional TokenVault to store original values for later unmasking
 */
export function createGuardrailMiddleware(
	enabledEntities?: GuardrailEntityType[],
	userEmail?: string,
	tokenVault?: TokenVault,
): LanguageModelV2Middleware {
	const entitiesToUse = enabledEntities || getDefaultGuardrailEntities();

	guardrailLogger.info("Middleware created", {
		entityTypes: entitiesToUse,
	});

	return {
		transformParams: async ({
			params,
			type,
		}: {
			params: LanguageModelV2CallOptions;
			type: "generate" | "stream";
			model: LanguageModelV2;
		}) => {
			guardrailLogger.info("Transform params called", {
				type,
				messageCount: Array.isArray(params.prompt) ? params.prompt.length : 0,
			});

			// Handle prompt as array of messages
			if (Array.isArray(params.prompt)) {
				let maskedCount = 0;
				const maskedPrompt: LanguageModelV2Message[] = [];
				for (const message of params.prompt) {
					if (message.role !== "user") {
						maskedPrompt.push(message);
						continue;
					}

					if (Array.isArray(message.content)) {
						const maskedContent = [];
						for (const part of message.content) {
							if (part.type !== "text") {
								maskedContent.push(part);
								continue;
							}

							const isAlreadyMasked =
								/<(?:NUMBER|EMAIL|RUSSIAN_NAME)(?:_\\d+)?>/.test(part.text);
							if (isAlreadyMasked) {
								guardrailLogger.debug("Text already masked, skipping", {
									textLength: part.text.length,
								});
								maskedContent.push(part);
								continue;
							}

							const result = await detectAndMaskWithNer(
								part.text,
								entitiesToUse,
								userEmail,
								"middleware",
								tokenVault,
							);
							if (result.detected) {
								maskedCount++;
								guardrailLogger.info("Masked user message in middleware", {
									detected: result.detected,
									textLength: part.text.length,
									maskedLength: result.checked_text.length,
								});
								maskedContent.push({
									...part,
									text: result.checked_text,
								});
							} else {
								maskedContent.push(part);
							}
						}

						maskedPrompt.push({
							...message,
							content: maskedContent,
						});
						continue;
					}

					maskedPrompt.push(message);
				}

				guardrailLogger.info("Middleware processing complete", {
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
