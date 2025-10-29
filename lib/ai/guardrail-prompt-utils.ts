import type { GuardrailEntityType } from "./guardrails";

/**
 * Generate a comma-separated list of placeholder tags for enabled entities
 * Example: "<RUSSIAN_NAME>, <NUMBER>, <EMAIL>"
 */
export function generatePlaceholderList(
	entities: GuardrailEntityType[] | undefined | null,
): string {
	if (!entities || entities.length === 0) {
		return "";
	}
	return entities.map((entity) => `<${entity}>`).join(", ");
}

/**
 * Generate guardrail-aware context instruction
 */
export function generateContextInstruction(
	hasMaskedGuardrails: boolean,
	entities?: GuardrailEntityType[] | null,
): string {
	if (!hasMaskedGuardrails) {
		return "\n---\nUse the context above to answer the user's question. Base your answer primarily on this context. If the information needed to answer the question is not in the context, say so clearly.";
	}

	const placeholders = generatePlaceholderList(entities);
	return `\n---\nIMPORTANT: The user's question may contain masked placeholders like ${placeholders}. These placeholders represent real values that were used to retrieve this context. When the user asks about these masked entities, match them with the corresponding actual values found in the context above. Use the context above to answer the user's question accurately. Base your answer primarily on this context. If the information needed to answer the question is not in the context, say so clearly.`;
}

/**
 * Generate guardrail-aware system prompt
 */
export function generateSystemPrompt(
	hasGuardrails: boolean,
	entities?: GuardrailEntityType[] | null,
): string {
	const basePrompt =
		"You are a helpful assistant that answers questions based on the provided document context.";
	const standardSuffix =
		"When context is available, prioritize it in your responses. Keep your responses concise, accurate, and grounded in the provided information.";

	if (!hasGuardrails) {
		return `${basePrompt} ${standardSuffix}`;
	}

	const placeholders = generatePlaceholderList(entities);
	return `${basePrompt} IMPORTANT: When the user's question contains masked placeholders like ${placeholders}, these represent real values that were used to retrieve the context. Match these placeholders with corresponding actual values in the context to answer the question. ${standardSuffix}`;
}
