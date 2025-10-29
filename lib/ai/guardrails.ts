/**
 * Guardrail Entity Types supported by the detection system
 */
export type GuardrailEntityType = "RUSSIAN_NAME" | "NUMBER" | "EMAIL";

/**
 * Configuration for guardrail entities with display information
 */
export const GUARDRAIL_ENTITIES: Array<{
	id: GuardrailEntityType;
	label: string;
	example: string;
}> = [
	{
		id: "RUSSIAN_NAME",
		label: "Russian Names",
		example: "Иван Иванов, Мария Петрова",
	},
	{
		id: "NUMBER",
		label: "Phone Numbers & IDs",
		example: "+79001234567, 89123456789",
	},
	{
		id: "EMAIL",
		label: "Email Addresses",
		example: "user@example.com",
	},
];

// Re-export guardrail detection functions
export { detectAndMask } from "./guardrail-detection";

// Re-export guardrail settings storage functions
export {
	getDefaultGuardrailEntities,
	loadGuardrailSettings,
	saveGuardrailSettings,
} from "./guardrail-settings-storage";

