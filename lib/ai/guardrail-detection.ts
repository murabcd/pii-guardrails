import { regex } from "arkregex";
import type { GuardrailEntityType } from "./guardrails";
import { guardrailLogger } from "./logger";
import { trackDetection } from "./guardrail-telemetry";

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
 * Whitelist of common Cyrillic words that are NOT names
 * This prevents false positives for months, countries, common words
 */
const CYRILLIC_WHITELIST = new Set([
	// Months (capitalized and lowercase)
	"Январь", "январь", "Февраль", "февраль", "Март", "март",
	"Апрель", "апрель", "Май", "май", "Июнь", "июнь",
	"Июль", "июль", "Август", "август", "Сентябрь", "сентябрь",
	"Октябрь", "октябрь", "Ноябрь", "ноябрь", "Декабрь", "декабрь",
	// Countries & Cities
	"Россия", "россия", "Москва", "москва", "Украина", "украина",
	"Беларусь", "беларусь", "Казахстан", "казахстан",
	"Санкт", "Петербург", "санкт", "петербург",
	// Common greetings/words
	"Добрый", "добрый", "День", "день", "Утро", "утро",
	"Вечер", "вечер", "Здравствуйте", "здравствуйте",
	"Спасибо", "спасибо", "Пожалуйста", "пожалуйста",
	// Days of week
	"Понедельник", "понедельник", "Вторник", "вторник",
	"Среда", "среда", "Четверг", "четверг", "Пятница", "пятница",
	"Суббота", "суббота", "Воскресенье", "воскресенье",
]);

/**
 * Check if a Cyrillic word should not be masked (whitelist check)
 */
function isWhitelisted(word: string): boolean {
	return CYRILLIC_WHITELIST.has(word);
}

/**
 * Detect and mask Russian names, numbers, and emails in text
 * Uses ArkRegex for pattern matching
 * @param text - Text to detect and mask guardrails in
 * @param enabledEntities - Array of entity types to detect (defaults to all if not provided)
 * @param userEmail - Optional user email to exclude from masking
 * @param context - Context for telemetry tracking (default: "other")
 */
export function detectAndMask(
	text: string,
	enabledEntities?: GuardrailEntityType[],
	userEmail?: string,
	context: "user_message" | "rag_chunk" | "middleware" | "other" = "other",
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

	guardrailLogger.info("Starting detection", {
		textLength: text.length,
		entityTypes: entitiesToDetect,
	});

	// Pattern for Russian names (Cyrillic characters, typically 2-3 words capitalized)
	// This matches sequences of Cyrillic letters that are capitalized (common name pattern)
	// Supports both capitalized and lowercase names (e.g., "Иван Иванов" or "иван иванов")
	// Uses explicit boundaries instead of \b since \b doesn't work properly with Cyrillic characters
	if (entitiesToDetect.includes("RUSSIAN_NAME")) {
		// Match capitalized Cyrillic words (standard names)
		const russianNamePatternCapitalized = regex(
			"[А-ЯЁ][а-яё]+(?:\\s+[А-ЯЁ][а-яё]+)*(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		// Match lowercase Cyrillic names (e.g., "иван иванов")
		// Only match sequences of 2+ words to reduce false positives
		const russianNamePatternLowercase = regex(
			"[а-яё]+(?:\\s+[а-яё]+)+(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		const russianNames: string[] = [];

		// Find capitalized names
		const capitalizedMatches = text.match(russianNamePatternCapitalized);
		if (capitalizedMatches) {
			// Filter out whitelisted words
			const filteredCapitalized = capitalizedMatches.filter(
				(name) => !isWhitelisted(name)
			);
			russianNames.push(...filteredCapitalized);
		}

		// Find lowercase names (only multi-word sequences)
		const lowercaseMatches = text.match(russianNamePatternLowercase);
		if (lowercaseMatches) {
			// Filter out whitelisted and short sequences
			const filteredLowercase = lowercaseMatches.filter(
				(name) => !isWhitelisted(name) && name.split(/\s+/).length >= 2
			);
			russianNames.push(...filteredLowercase);
		}

		if (russianNames.length > 0) {
			detected_entities.RUSSIAN_NAME = [...new Set(russianNames)]; // Remove duplicates

			guardrailLogger.info("Russian names detected", {
				entityCounts: { RUSSIAN_NAME: detected_entities.RUSSIAN_NAME.length },
			});

			// Mask Russian names (both patterns)
			maskedText = maskedText.replace(russianNamePatternCapitalized, (match) => {
				return isWhitelisted(match) ? match : "<RUSSIAN_NAME>";
			});
			maskedText = maskedText.replace(russianNamePatternLowercase, (match) => {
				return isWhitelisted(match) ? match : "<RUSSIAN_NAME>";
			});
		}
	}

	// Pattern for numbers (phone numbers: +7XXXXXXXXXX or 8XXXXXXXXXX, or sequences of digits)
	// Russian phone numbers: +7 followed by 10 digits, or 8 followed by 10 digits
	// Supports formatted numbers with spaces, dashes, parentheses
	// Also detect other long number sequences (like ID numbers)
	if (entitiesToDetect.includes("NUMBER")) {
		// Pattern for Russian phone numbers with formatting
		// Matches: +7 900 123-45-67, 8 (900) 123-45-67, +79001234567, 89001234567
		const phonePattern = regex(
			"(?:\\+7|8)\\s?[\\(]?\\d{3}[\\)]?[\\s-]?\\d{3}[\\s-]?\\d{2}[\\s-]?\\d{2}",
			"g",
		);

		// Pattern for unformatted long numbers (10+ digits)
		const longNumberPattern = regex("(?:\\+7|8)?\\d{10,}", "g");

		// Pattern for medium number sequences (4-9 digits)
		// More conservative to avoid page numbers, building numbers, etc.
		const mediumNumberPattern = regex("\\d{6,9}", "g");

		const numbers: string[] = [];
		const detectedPositions: Array<{ start: number; end: number }> = [];

		// Find formatted phone numbers first (highest priority)
		const phoneMatches = [...text.matchAll(phonePattern)];
		for (const match of phoneMatches) {
			const num = match[0];
			const start = match.index ?? 0;
			const end = start + num.length;
			numbers.push(num);
			detectedPositions.push({ start, end });
		}

		// Find long unformatted numbers
		const longMatches = [...text.matchAll(longNumberPattern)];
		for (const match of longMatches) {
			const num = match[0];
			const start = match.index ?? 0;
			const end = start + num.length;

			// Skip if this overlaps with already detected phone number
			const overlaps = detectedPositions.some(
				(pos) => (start >= pos.start && start < pos.end) || (end > pos.start && end <= pos.end)
			);

			if (!overlaps) {
				numbers.push(num);
				detectedPositions.push({ start, end });
			}
		}

		// Find medium numbers (more conservative)
		const mediumMatches = [...text.matchAll(mediumNumberPattern)];
		for (const match of mediumMatches) {
			const num = match[0];
			const start = match.index ?? 0;
			const end = start + num.length;

			// Skip if overlaps with already detected numbers
			const overlaps = detectedPositions.some(
				(pos) => (start >= pos.start && start < pos.end) || (end > pos.start && end <= pos.end)
			);

			// Filter out years (1900-2099) and common non-PII patterns
			const isYear = /^(19|20)\d{2}$/.test(num);
			const isCommonNumber = num.length === 4 || num.length === 6; // More likely to be page/building numbers

			if (!overlaps && !isYear && !isCommonNumber) {
				numbers.push(num);
				detectedPositions.push({ start, end });
			}
		}

		if (numbers.length > 0) {
			detected_entities.NUMBER = [...new Set(numbers)]; // Remove duplicates

			guardrailLogger.info("Numbers detected", {
				entityCounts: { NUMBER: detected_entities.NUMBER.length },
			});

			// Mask numbers in order of longest first to avoid partial replacements
			const sortedPositions = detectedPositions.sort((a, b) => b.start - a.start);
			for (const pos of sortedPositions) {
				maskedText = maskedText.substring(0, pos.start) + "<NUMBER>" + maskedText.substring(pos.end);
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

				guardrailLogger.info("Emails detected", {
					entityCounts: { EMAIL: detected_entities.EMAIL.length },
				});

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

	// Track telemetry
	const entityTypes: GuardrailEntityType[] = Object.keys(detected_entities).filter(
		(key) => (detected_entities[key as GuardrailEntityType]?.length ?? 0) > 0,
	) as GuardrailEntityType[];

	const entityCounts: Record<GuardrailEntityType, number> = {
		RUSSIAN_NAME: detected_entities.RUSSIAN_NAME?.length ?? 0,
		NUMBER: detected_entities.NUMBER?.length ?? 0,
		EMAIL: detected_entities.EMAIL?.length ?? 0,
	};

	trackDetection(
		result.detected,
		entityTypes,
		entityCounts,
		text.length,
		maskedText.length,
		context,
	);

	guardrailLogger.info("Detection complete", {
		detected: result.detected,
		entityTypes,
		entityCounts,
		textLength: text.length,
		maskedLength: maskedText.length,
	});

	return result;
}

