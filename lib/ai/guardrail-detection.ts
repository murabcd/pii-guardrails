import { regex } from "arkregex";
import { trackDetection } from "./guardrail-telemetry";
import type { GuardrailEntityType } from "./guardrails";
import { guardrailLogger } from "./logger";

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
	"Январь",
	"январь",
	"Февраль",
	"февраль",
	"Март",
	"март",
	"Апрель",
	"апрель",
	"Май",
	"май",
	"Июнь",
	"июнь",
	"Июль",
	"июль",
	"Август",
	"август",
	"Сентябрь",
	"сентябрь",
	"Октябрь",
	"октябрь",
	"Ноябрь",
	"ноябрь",
	"Декабрь",
	"декабрь",
	// Countries & Cities
	"Россия",
	"россия",
	"Москва",
	"москва",
	"Украина",
	"украина",
	"Беларусь",
	"беларусь",
	"Казахстан",
	"казахстан",
	"Санкт",
	"Петербург",
	"санкт",
	"петербург",
	// Common greetings/words
	"Добрый",
	"добрый",
	"День",
	"день",
	"Утро",
	"утро",
	"Вечер",
	"вечер",
	"Здравствуйте",
	"здравствуйте",
	"Спасибо",
	"спасибо",
	"Пожалуйста",
	"пожалуйста",
	// Days of week
	"Понедельник",
	"понедельник",
	"Вторник",
	"вторник",
	"Среда",
	"среда",
	"Четверг",
	"четверг",
	"Пятница",
	"пятница",
	"Суббота",
	"суббота",
	"Воскресенье",
	"воскресенье",
	// Common prepositions and conjunctions (lowercase only to avoid over-filtering)
	"на",
	"в",
	"с",
	"и",
	"а",
	"но",
	"или",
	"для",
	"по",
	"от",
	"до",
	"из",
	"при",
	"про",
	"под",
	"над",
	"без",
	"через",
	"между",
	"перед",
	"за",
	// Common verbs that might be detected
	"был",
	"была",
	"было",
	"были",
	"есть",
	"было",
	"будет",
	"будут",
	"позвонил",
	"написал",
	"встретил",
	"встретился",
	"сказал",
	"сделал",
	// Common nouns
	"это",
	"столица",
	"город",
	"страна",
	"год",
	"время",
	"человек",
	"дом",
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

	// Collect ALL entity positions before masking to avoid position shifting issues
	const allMaskPositions: Array<{
		start: number;
		end: number;
		type: string;
		placeholder: string;
	}> = [];

	// If no entities specified, detect all
	const entitiesToDetect =
		enabledEntities ||
		(["RUSSIAN_NAME", "NUMBER", "EMAIL"] as GuardrailEntityType[]);

	guardrailLogger.info("Starting detection", {
		textLength: text.length,
		entityTypes: entitiesToDetect,
	});

	// Pattern for Russian names (Cyrillic characters, typically 2-3 words capitalized)
	// This matches sequences of Cyrillic letters that are capitalized (common name pattern)
	// Supports both capitalized and lowercase names (e.g., "Иван Иванов" or "иван иванов")
	// Uses explicit boundaries instead of \b since \b doesn't work properly with Cyrillic characters
	if (entitiesToDetect.includes("RUSSIAN_NAME")) {
		// Match multi-word capitalized Cyrillic sequences (2+ words for names)
		const russianNamePatternCapitalizedMulti = regex(
			"[А-ЯЁ][а-яё]+(?:\\s+[А-ЯЁ][а-яё]+)+(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		// Match single capitalized Cyrillic words (for names, but check whitelist)
		const russianNamePatternCapitalizedSingle = regex(
			"[А-ЯЁ][а-яё]+(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		// Match lowercase Cyrillic names (e.g., "иван иванов")
		// Only match sequences of EXACTLY 2 words to reduce false positives
		// Avoids matching verb phrases or longer sequences
		const russianNamePatternLowercase = regex(
			"[а-яё]{3,}\\s+[а-яё]{3,}(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		const russianNames: string[] = [];
		const maskedPositions: Array<{ start: number; end: number }> = [];

		// Find multi-word capitalized names FIRST (higher priority, longer matches)
		const multiWordMatches = [
			...text.matchAll(russianNamePatternCapitalizedMulti),
		];
		for (const match of multiWordMatches) {
			const name = match[0];
			const start = match.index ?? 0;
			const end = start + name.length;

			// Check if any word in the multi-word sequence is whitelisted
			const words = name.split(/\s+/);
			const hasWhitelistedWord = words.some((word) => isWhitelisted(word));

			if (!hasWhitelistedWord) {
				russianNames.push(name);
				maskedPositions.push({ start, end });
			}
		}

		// Find single-word capitalized names (but check whitelist strictly)
		const singleWordMatches = [
			...text.matchAll(russianNamePatternCapitalizedSingle),
		];
		for (const match of singleWordMatches) {
			const name = match[0];
			const start = match.index ?? 0;
			const end = start + name.length;

			// Skip if this overlaps with already detected multi-word names
			const overlaps = maskedPositions.some(
				(pos) =>
					(start >= pos.start && start < pos.end) ||
					(end > pos.start && end <= pos.end),
			);

			// Skip whitelisted words and overlaps
			if (!overlaps && !isWhitelisted(name)) {
				russianNames.push(name);
				maskedPositions.push({ start, end });
			}
		}

		// Find lowercase names (only multi-word sequences)
		const lowercaseMatches = [...text.matchAll(russianNamePatternLowercase)];
		for (const match of lowercaseMatches) {
			const name = match[0];
			const start = match.index ?? 0;
			const end = start + name.length;

			// Check if any word is whitelisted
			const words = name.split(/\s+/);
			const hasWhitelistedWord = words.some((word) => isWhitelisted(word));

			// Skip if overlaps or has whitelisted words
			const overlaps = maskedPositions.some(
				(pos) =>
					(start >= pos.start && start < pos.end) ||
					(end > pos.start && end <= pos.end),
			);

			if (!overlaps && !hasWhitelistedWord && words.length >= 2) {
				russianNames.push(name);
				maskedPositions.push({ start, end });
			}
		}

		if (russianNames.length > 0) {
			detected_entities.RUSSIAN_NAME = [...new Set(russianNames)]; // Remove duplicates

			guardrailLogger.info("Russian names detected", {
				entityCounts: { RUSSIAN_NAME: detected_entities.RUSSIAN_NAME.length },
			});

			// Add all name positions to the global mask positions list
			for (const pos of maskedPositions) {
				allMaskPositions.push({
					...pos,
					type: "RUSSIAN_NAME",
					placeholder: "<RUSSIAN_NAME>",
				});
			}
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

		// Pattern for unformatted long numbers (10+ digits, optionally starting with +7 or 8)
		// This handles cases like +79001234567890 (longer than standard phone)
		const longNumberPattern = regex("(?:\\+7|8)?\\d{10,}", "g");

		// Pattern for medium number sequences (7-9 digits)
		// More conservative to avoid page numbers, building numbers, etc.
		const mediumNumberPattern = regex("\\d{7,9}", "g");

		const numbers: string[] = [];
		const detectedPositions: Array<{ start: number; end: number }> = [];

		// Find long unformatted numbers FIRST (highest priority for longest matches)
		const longMatches = [...text.matchAll(longNumberPattern)];
		for (const match of longMatches) {
			const num = match[0];
			const start = match.index ?? 0;
			const end = start + num.length;
			numbers.push(num);
			detectedPositions.push({ start, end });
		}

		// Find formatted phone numbers (check for overlaps with long numbers)
		const phoneMatches = [...text.matchAll(phonePattern)];
		for (const match of phoneMatches) {
			const num = match[0];
			const start = match.index ?? 0;
			const end = start + num.length;

			// Skip if this overlaps with already detected long number
			const overlaps = detectedPositions.some(
				(pos) =>
					(start >= pos.start && start < pos.end) ||
					(end > pos.start && end <= pos.end) ||
					(start <= pos.start && end >= pos.end),
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
				(pos) =>
					(start >= pos.start && start < pos.end) ||
					(end > pos.start && end <= pos.end) ||
					(start <= pos.start && end >= pos.end),
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

			// Add all number positions to the global mask positions list
			for (const pos of detectedPositions) {
				allMaskPositions.push({
					...pos,
					type: "NUMBER",
					placeholder: "<NUMBER>",
				});
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
		const emailPositions: Array<{ start: number; end: number }> = [];

		const emailMatches = [...text.matchAll(emailPattern)];
		for (const match of emailMatches) {
			const email = match[0];
			const start = match.index ?? 0;
			const end = start + email.length;

			// Skip user's email if provided
			if (userEmail && email.toLowerCase() === userEmail.toLowerCase()) {
				continue;
			}

			emails.push(email);
			emailPositions.push({ start, end });
		}

		if (emails.length > 0) {
			detected_entities.EMAIL = [...new Set(emails)]; // Remove duplicates

			guardrailLogger.info("Emails detected", {
				entityCounts: { EMAIL: detected_entities.EMAIL.length },
			});

			// Add all email positions to the global mask positions list
			for (const pos of emailPositions) {
				allMaskPositions.push({
					...pos,
					type: "EMAIL",
					placeholder: "<EMAIL>",
				});
			}
		}
	}

	// Apply ALL masks in one pass (reverse order by position to preserve indices)
	let maskedText = text;
	if (allMaskPositions.length > 0) {
		// Sort positions in reverse order (end to start) to avoid index shifting
		const sortedPositions = allMaskPositions.sort((a, b) => b.start - a.start);

		for (const pos of sortedPositions) {
			maskedText =
				maskedText.substring(0, pos.start) +
				pos.placeholder +
				maskedText.substring(pos.end);
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
	const entityTypes: GuardrailEntityType[] = Object.keys(
		detected_entities,
	).filter(
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
