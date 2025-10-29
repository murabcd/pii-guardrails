import { regex } from "arkregex";
import type { GuardrailEntityType } from "./guardrails";

/**
 * Guardrail Detection result matching OpenAI Guardrails format
 */
export interface GuardrailDetectionResult {
	detected_entities: {
		RUSSIAN_NAME?: string[];
		NUMBER?: string[];
		EMAIL?: string[];
	};
	checked_text: string;
	detected: boolean;
}

/**
 * Detect and mask Russian names, numbers, and emails in text
 * Uses ArkRegex for pattern matching
 * @param text - Text to detect and mask guardrails in
 * @param enabledEntities - Array of entity types to detect (defaults to all if not provided)
 * @param userEmail - Optional user email to exclude from masking
 */
export function detectAndMask(
	text: string,
	enabledEntities?: GuardrailEntityType[],
	userEmail?: string,
): GuardrailDetectionResult {
	const detected_entities: {
		RUSSIAN_NAME?: string[];
		NUMBER?: string[];
		EMAIL?: string[];
	} = {};
	let maskedText = text;

	// If no entities specified, detect all
	const entitiesToDetect =
		enabledEntities || (["RUSSIAN_NAME", "NUMBER", "EMAIL"] as GuardrailEntityType[]);

	console.log("[Guardrail Detection] Starting detection", {
		textLength: text.length,
		enabledEntities: entitiesToDetect,
		textPreview: text.substring(0, 100),
	});

	// Pattern for Russian names (Cyrillic characters, typically 2-3 words capitalized)
	// This matches sequences of Cyrillic letters that are capitalized (common name pattern)
	// Uses explicit boundaries instead of \b since \b doesn't work properly with Cyrillic characters
	if (entitiesToDetect.includes("RUSSIAN_NAME")) {
		const russianNamePattern = regex(
			"[А-ЯЁ][а-яё]+(?:\\s+[А-ЯЁ][а-яё]+)*(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		const russianNames: string[] = [];
		const nameMatches = text.match(russianNamePattern);
		if (nameMatches) {
			russianNames.push(...nameMatches);
			detected_entities.RUSSIAN_NAME = [...new Set(russianNames)]; // Remove duplicates

			console.log(
				"[Guardrail Detection] Russian names detected:",
				detected_entities.RUSSIAN_NAME,
			);

			// Mask Russian names
			maskedText = maskedText.replace(russianNamePattern, "<RUSSIAN_NAME>");
		}
	}

	// Pattern for numbers (phone numbers: +7XXXXXXXXXX or 8XXXXXXXXXX, or sequences of digits)
	// Russian phone numbers: +7 followed by 10 digits, or 8 followed by 10 digits
	// Also detect other long number sequences (like ID numbers)
	if (entitiesToDetect.includes("NUMBER")) {
		const numberPattern = regex("(?:\\+7|8)?\\d{10,}|\\d{4,}", "g");

		const numbers: string[] = [];
		const numberMatches = text.match(numberPattern);
		if (numberMatches) {
			// Filter out common non-guardrail numbers (like years, small numbers)
			const filteredNumbers = numberMatches.filter(
				(num) =>
					num.length >= 10 || (num.length >= 4 && !/^(19|20)\d{2}$/.test(num)), // Exclude years like 1999, 2024
			);
			if (filteredNumbers.length > 0) {
				numbers.push(...filteredNumbers);
				detected_entities.NUMBER = [...new Set(numbers)]; // Remove duplicates

				console.log(
					"[Guardrail Detection] Numbers detected:",
					detected_entities.NUMBER,
				);

				// Mask numbers
				maskedText = maskedText.replace(numberPattern, "<NUMBER>");
			}
		}
	}

	// Pattern for email addresses (matches most common email formats)
	// Masks all emails except the user's email
	if (entitiesToDetect.includes("EMAIL")) {
		const emailPattern = regex(
			"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
			"g",
		);

		const emails: string[] = [];
		const emailMatches = text.match(emailPattern);
		if (emailMatches) {
			// Filter out user's email if provided
			const filteredEmails = emailMatches.filter(
				(email) =>
					!userEmail || email.toLowerCase() !== userEmail.toLowerCase(),
			);

			if (filteredEmails.length > 0) {
				emails.push(...filteredEmails);
				detected_entities.EMAIL = [...new Set(emails)]; // Remove duplicates

				console.log(
					"[Guardrail Detection] Emails detected:",
					detected_entities.EMAIL,
				);

				// Mask only the emails that are not the user's email
				maskedText = maskedText.replace(emailPattern, (match) => {
					if (userEmail && match.toLowerCase() === userEmail.toLowerCase()) {
						return match; // Don't mask user's email
					}
					return "<EMAIL>";
				});
			}
		}
	}

	const result = {
		detected_entities,
		checked_text: maskedText,
		detected:
			(detected_entities.RUSSIAN_NAME?.length ?? 0) > 0 ||
			(detected_entities.NUMBER?.length ?? 0) > 0 ||
			(detected_entities.EMAIL?.length ?? 0) > 0,
	};

	console.log("[Guardrail Detection] Detection complete", {
		detected: result.detected,
		detected_entities,
		originalText: text,
		maskedText: result.checked_text,
	});

	return result;
}

