import type { GuardrailEntityType } from "./guardrails";

export type GuardrailUiSummary = {
	enabled: boolean;
	status: "pending" | "pass" | "fail";
	detected: boolean;
	entityCounts: Record<GuardrailEntityType, number>;
	maskedChunksCount: number;
	maskedUserMessage: boolean;
	enabledEntities: GuardrailEntityType[];
};

export type GuardrailMessageMetadata = {
	guardrail?: GuardrailUiSummary;
};
