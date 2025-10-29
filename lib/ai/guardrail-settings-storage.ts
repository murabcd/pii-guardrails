import type { GuardrailEntityType } from "./guardrails";

const GUARDRAIL_SETTINGS_KEY = "guardrail-settings";

/**
 * Get default guardrail entity types (all enabled by default)
 */
export function getDefaultGuardrailEntities(): GuardrailEntityType[] {
	return ["RUSSIAN_NAME", "NUMBER", "EMAIL"];
}

/**
 * Load guardrail settings from localStorage
 * @param userEmail - Optional user email for per-user settings
 */
export function loadGuardrailSettings(
	userEmail?: string,
): GuardrailEntityType[] {
	if (typeof window === "undefined") {
		return getDefaultGuardrailEntities();
	}

	const key = userEmail
		? `${GUARDRAIL_SETTINGS_KEY}-${userEmail}`
		: GUARDRAIL_SETTINGS_KEY;

	try {
		const stored = localStorage.getItem(key);
		if (stored) {
			const parsed = JSON.parse(stored) as GuardrailEntityType[];
			// Validate that all entities are valid
			const validEntities: GuardrailEntityType[] = [
				"RUSSIAN_NAME",
				"NUMBER",
				"EMAIL",
			];
			const filtered = parsed.filter((e) =>
				validEntities.includes(e),
			) as GuardrailEntityType[];
			return filtered.length > 0 ? filtered : getDefaultGuardrailEntities();
		}
	} catch {
		// If parsing fails, return defaults
	}

	return getDefaultGuardrailEntities();
}

/**
 * Save guardrail settings to localStorage
 * @param entities - Array of enabled entity types
 * @param userEmail - Optional user email for per-user settings
 */
export function saveGuardrailSettings(
	entities: GuardrailEntityType[],
	userEmail?: string,
): void {
	if (typeof window === "undefined") {
		return;
	}

	const key = userEmail
		? `${GUARDRAIL_SETTINGS_KEY}-${userEmail}`
		: GUARDRAIL_SETTINGS_KEY;

	try {
		localStorage.setItem(key, JSON.stringify(entities));
	} catch {
		// If storage fails, silently fail
	}
}
