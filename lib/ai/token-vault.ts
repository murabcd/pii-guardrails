import type { GuardrailEntityType } from "./guardrails";

/**
 * TokenVault stores mappings between placeholders and original PII values
 * Used for unmasking LLM responses to restore original data for the user
 *
 * DEDUPLICATION: If the same PII value appears multiple times (e.g., same phone number
 * in both user query and RAG context), it receives the SAME placeholder token.
 * This allows the LLM to match references across query and context.
 *
 * Example:
 * - First occurrence of "+79856004025" -> "<NUMBER_1>"
 * - Second occurrence of "+79856004025" -> "<NUMBER_1>" (reused, not <NUMBER_2>!)
 */
export class TokenVault {
	private vault = new Map<string, string>(); // placeholder -> value
	private reverseVault = new Map<string, string>(); // value -> placeholder (for deduplication)
	private counters: Record<GuardrailEntityType, number> = {
		RUSSIAN_NAME: 0,
		NUMBER: 0,
		EMAIL: 0,
	};

	/**
	 * Store an original value and return its placeholder
	 * DEDUPLICATION: If value already exists, returns existing placeholder instead of creating new one
	 * @param entityType - Type of entity (RUSSIAN_NAME, NUMBER, EMAIL)
	 * @param originalValue - Original PII value to store
	 * @returns Placeholder like "<NUMBER_1>" (existing or new)
	 */
	store(entityType: GuardrailEntityType, originalValue: string): string {
		// CRITICAL: Check if we've already stored this exact value
		// This ensures same PII gets same token across query and context
		const existingPlaceholder = this.reverseVault.get(originalValue);
		if (existingPlaceholder) {
			return existingPlaceholder;
		}

		// Value is new, create a new placeholder
		this.counters[entityType]++;
		const placeholder = `<${entityType}_${this.counters[entityType]}>`;
		this.vault.set(placeholder, originalValue);
		this.reverseVault.set(originalValue, placeholder);

		return placeholder;
	}

	/**
	 * Unmask text by replacing all placeholders with original values
	 * @param text - Text containing placeholders like "<NUMBER_1>"
	 * @returns Text with original PII values restored
	 */
	unmask(text: string): string {
		let unmaskedText = text;

		// Replace each placeholder with its original value
		for (const [placeholder, originalValue] of this.vault.entries()) {
			if (unmaskedText.includes(placeholder)) {
				unmaskedText = unmaskedText.replaceAll(placeholder, originalValue);
			}
		}

		return unmaskedText;
	}

	/**
	 * Get the number of stored tokens
	 */
	size(): number {
		return this.vault.size;
	}

	/**
	 * Clear all stored tokens (useful for testing)
	 */
	clear(): void {
		this.vault.clear();
		this.reverseVault.clear();
		this.counters = {
			RUSSIAN_NAME: 0,
			NUMBER: 0,
			EMAIL: 0,
		};
	}

	/**
	 * Get all stored placeholders (for debugging)
	 */
	getPlaceholders(): string[] {
		return Array.from(this.vault.keys());
	}
}
