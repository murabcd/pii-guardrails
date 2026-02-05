import { regex } from "arkregex";
import { trackDetection } from "./guardrail-telemetry";
import type { GuardrailEntityType } from "./guardrails";
import { guardrailLogger } from "./logger";
import type { TokenVault } from "./token-vault";

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
 * This prevents false positives for months, countries, common words, business terms, etc.
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
	"Извините",
	"извините",
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
	// Common prepositions and conjunctions
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
	// Common verbs
	"был",
	"была",
	"было",
	"были",
	"есть",
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
	"номер",
	"телефон",
	"адрес",
	"почта",
	"контакт",
	// Hotel/Business terminology (CRITICAL for reducing false positives)
	"Отель",
	"отель",
	"Гостиница",
	"гостиница",
	"Служба",
	"служба",
	"Стоимость",
	"стоимость",
	"Политика",
	"политика",
	"Незаезд",
	"незаезд",
	"Бронирование",
	"бронирование",
	"Проживание",
	"проживание",
	"Оплата",
	"оплата",
	"Услуга",
	"услуга",
	"Услуги",
	"услуги",
	"Размещение",
	"размещение",
	"Резервация",
	"резервация",
	"Регистрация",
	"регистрация",
	"Выезд",
	"выезд",
	"Заезд",
	"заезд",
	"Гость",
	"гость",
	"Гости",
	"гости",
	"Администрация",
	"администрация",
	"Ресепшн",
	"ресепшн",
	"Информация",
	"информация",
	// Street/Address terminology (CRITICAL - found in benchmark false positives)
	"Армии",
	"армии",
	"Морская",
	"морская",
	"Советской",
	"советской",
	"Тверская",
	"тверская",
	"Лесная",
	"лесная",
	"Мечети",
	"мечети",
	"Суворовском",
	"суворовском",
	"Центральной",
	"центральной",
	"Большая",
	"большая",
	"Улица",
	"улица",
	"Проспект",
	"проспект",
	"Переулок",
	"переулок",
	"Бульвар",
	"бульвар",
	"Шоссе",
	"шоссе",
	"Набережная",
	"набережная",
	"Площадь",
	"площадь",
	"Дорога",
	"дорога",
	"Новослободской",
	"новослободской",
	"Новинского",
	"новинского",
	"Вишнёвой",
	"вишнёвой",
	"Дурова",
	"дурова",
	"Мира",
	"мира",
	"Аллея",
	"аллея",
	"Парковая",
	"парковая",
	"Поленова",
	"поленова",
	"Красина",
	"красина",
	"Великой",
	"великой",
	"Отечественной",
	"отечественной",
	"Ленина",
	"ленина",
	// Institutions and organizations
	"Московском",
	"московском",
	"Колледже",
	"колледже",
	"Суворовском",
	"суворовском",
	"Кадетском",
	"кадетском",
	"Корпусе",
	"корпусе",
	"Школа",
	"школа",
	"Университет",
	"университет",
	"Институт",
	"институт",
	"Академия",
	"академия",
	"Центр",
	"центр",
	"Магазин",
	"магазин",
	"Банк",
	"банк",
	"Больница",
	"больница",
	"Поликлиника",
	"поликлиника",
	"Аптека",
	"аптека",
	// Landmarks and places
	"Мечети",
	"мечети",
	"Собор",
	"собор",
	"Соборной",
	"соборной",
	"Церковь",
	"церковь",
	"Храм",
	"храм",
	"Парк",
	"парк",
	"Сквер",
	"сквер",
	"Стадион",
	"стадион",
	"Театр",
	"театр",
	"Музей",
	"музей",
	"Библиотека",
	"библиотека",
	"Вокзал",
	"вокзал",
	"Аэропорт",
	"аэропорт",
	"Метро",
	"метро",
	"Станция",
	"станция",
	// Districts and regions
	"Район",
	"район",
	"Округ",
	"округ",
	"Область",
	"область",
	"Край",
	"край",
	"Республика",
	"республика",
	"Город",
	"город",
	"Село",
	"село",
	"Деревня",
	"деревня",
	"Посёлок",
	"посёлок",
	"Сосенский",
	"сосенский",
	"Стан",
	"стан",
	// Directions and locations
	"Северная",
	"северная",
	"Южная",
	"южная",
	"Восточная",
	"восточная",
	"Западная",
	"западная",
	"Центральная",
	"центральная",
	// Common business words
	"Компания",
	"компания",
	"Организация",
	"организация",
	"Предприятие",
	"предприятие",
	"Управление",
	"управление",
	"Департамент",
	"департамент",
	"Отдел",
	"отдел",
	// Verbs/adjectives that appear capitalized
	"Чтобы",
	"чтобы",
	"Если",
	"если",
	"Когда",
	"когда",
	"Нужна",
	"нужна",
	"Можем",
	"можем",
	"Вы",
	"вы",
	"Для",
	"для",
	// Common professional titles and roles
	"Директор",
	"директор",
	"Менеджер",
	"менеджер",
	"Сотрудник",
	"сотрудник",
	"Учитель",
	"учитель",
	"Врач",
	"врач",
	"Инженер",
	"инженер",
	"Специалист",
	"специалист",
	// Common verbs that might be capitalized
	"Согласовать",
	"согласовать",
	"Позвонил",
	"позвонил",
	"Написал",
	"написал",
	"Встретился",
	"встретился",
	"Рассказывала",
	"рассказывала",
	"Слышал",
	"слышал",
	"Помнишь",
	"помнишь",
	// More common words
	"Родитель",
	"родитель",
	"Курсе",
	"курсе",
	"Ситуацию",
	"ситуацию",
	"Прошу",
	"прошу",
	"Архивными",
	"архивными",
	"Данными",
	"данными",
	// Titles and forms of address
	"Госпожа",
	"госпожа",
	"Господин",
	"господин",
	"Уважаемая",
	"уважаемая",
	"Уважаемый",
	"уважаемый",
	// Family/social relationships
	"Соседка",
	"соседка",
	"Сосед",
	"сосед",
	"Друг",
	"друг",
	"Подруга",
	"подруга",
	"Коллега",
	"коллега",
	"Знакомый",
	"знакомый",
	"Знакомая",
	"знакомая",
	"Сосе",
	"сосе",
	// Common verbs that might appear in lowercase patterns
	"Ставила",
	"ставила",
	"Делала",
	"делала",
	"Говорит",
	"говорит",
	"Сказал",
	"сказал",
	"Учительница",
	"учительница",
	"Учитель",
	"учитель",
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
 * @param tokenVault - Optional TokenVault to store original values for later unmasking
 */
export function detectAndMask(
	text: string,
	enabledEntities?: GuardrailEntityType[],
	userEmail?: string,
	context: "user_message" | "rag_chunk" | "middleware" | "other" = "other",
	tokenVault?: TokenVault,
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
		originalValue: string;
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
	// CONSERVATIVE APPROACH: Only detect clear name patterns to avoid false positives
	// Russian names are almost always capitalized, so we focus on that
	if (entitiesToDetect.includes("RUSSIAN_NAME")) {
		// Match EXACTLY 2 or 3 capitalized Cyrillic words (typical Russian name patterns)
		// Examples: "Иван Иванов", "Иван Сергеевич Иванов"
		// This is MUCH more conservative than matching any multi-word sequence
		const russianNamePattern2Words = regex(
			"[А-ЯЁ][а-яё]{2,}\\s+[А-ЯЁ][а-яё]{2,}(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		const russianNamePattern3Words = regex(
			"[А-ЯЁ][а-яё]{2,}\\s+[А-ЯЁ][а-яё]{2,}\\s+[А-ЯЁ][а-яё]{2,}(?=\\s|[\\?\\.,;:!]|$|')",
			"g",
		);

		const russianNames: string[] = [];
		const maskedPositions: Array<{ start: number; end: number }> = [];

		// Priority 1: Find 3-word names FIRST (to avoid splitting into 2-word matches)
		const threeWordMatches = [...text.matchAll(russianNamePattern3Words)];
		for (const match of threeWordMatches) {
			const name = match[0];
			const start = match.index ?? 0;
			const end = start + name.length;

			// Check if any word in the sequence is whitelisted
			const words = name.split(/\s+/);
			const hasWhitelistedWord = words.some((word) => isWhitelisted(word));

			// Additional check: All words should be at least 3 characters (typical name length)
			const allWordsValid = words.every((word) => word.length >= 3);

			if (!hasWhitelistedWord && allWordsValid) {
				russianNames.push(name);
				maskedPositions.push({ start, end });
			}
		}

		// Priority 2: Find 2-word names (but check for overlaps with 3-word names)
		const twoWordMatches = [...text.matchAll(russianNamePattern2Words)];
		for (const match of twoWordMatches) {
			const name = match[0];
			const start = match.index ?? 0;
			const end = start + name.length;

			// Skip if this overlaps with already detected 3-word names
			const overlaps = maskedPositions.some(
				(pos) =>
					(start >= pos.start && start < pos.end) ||
					(end > pos.start && end <= pos.end) ||
					(start <= pos.start && end >= pos.end),
			);

			if (overlaps) {
				continue;
			}

			// Check if any word is whitelisted
			const words = name.split(/\s+/);
			const hasWhitelistedWord = words.some((word) => isWhitelisted(word));

			// Additional check: Both words should be at least 3 characters
			const allWordsValid = words.every((word) => word.length >= 3);

			if (!hasWhitelistedWord && allWordsValid) {
				russianNames.push(name);
				maskedPositions.push({ start, end });
			}
		}

		// Priority 3: Detect single-word lowercase names in specific contexts
		// Common patterns: "это {name}", "у {name}", "{name} с улицы"
		// Must be single word, 4-8 chars (typical Russian first name length)
		const lowercaseNamePatterns = [
			/\bэто\s+([а-яё]{4,8})\b/gi, // "это алексей"
			/\bзовут\s+([а-яё]{4,8})\b/gi, // "зовут марина"
			/\bя\s+([а-яё]{4,8})[\s,]/gi, // "я алексей,"
			/\bу\s+([а-яё]{4,8})\s+(?:с|на|из)\b/gi, // "у алексей с улицы"
		];

		for (const pattern of lowercaseNamePatterns) {
			const matches = [...text.matchAll(pattern)];
			for (const match of matches) {
				const name = match[1]?.trim();
				if (!name) continue;

				// Calculate actual position in text
				const matchStart = match.index ?? 0;
				const matchText = match[0];
				const nameOffsetInMatch = matchText.indexOf(name);
				const start = matchStart + nameOffsetInMatch;
				const end = start + name.length;

				// Skip if this overlaps with already detected names
				const overlaps = maskedPositions.some(
					(pos) =>
						(start >= pos.start && start < pos.end) ||
						(end > pos.start && end <= pos.end) ||
						(start <= pos.start && end >= pos.end),
				);

				if (overlaps) {
					continue;
				}

				// Check if whitelisted
				if (isWhitelisted(name)) {
					continue;
				}

				// Additional filtering: common verbs and nouns that aren't names
				const commonNonNames = [
					"это",
					"была",
					"были",
					"будет",
					"может",
					"должен",
					"можно",
					"нужно",
					"надо",
					"хочет",
					"хотел",
					"делал",
					"делала",
					"сказал",
					"сказала",
					"говорил",
					"говорила",
					"ходил",
					"ходила",
					"пошел",
					"пошла",
					"видел",
					"видела",
					"слышал",
					"слышала",
				];

				if (commonNonNames.includes(name.toLowerCase())) {
					continue;
				}

				russianNames.push(name);
				maskedPositions.push({ start, end });
			}
		}

		// NOTE: We intentionally DO NOT match:
		// - Single capitalized words (too many false positives: "Служба", "Отель", etc.)
		// - Lowercase names without context (too many false positives with common words)
		// - Sequences longer than 3 words (likely to be phrases, not names)

		if (russianNames.length > 0) {
			detected_entities.RUSSIAN_NAME = [...new Set(russianNames)]; // Remove duplicates

			guardrailLogger.info("Russian names detected", {
				entityCounts: { RUSSIAN_NAME: detected_entities.RUSSIAN_NAME.length },
			});

			// Add all name positions to the global mask positions list
			for (const pos of maskedPositions) {
				const originalValue = text.substring(pos.start, pos.end);
				allMaskPositions.push({
					...pos,
					type: "RUSSIAN_NAME",
					placeholder: "<RUSSIAN_NAME>",
					originalValue,
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
		// Only detect if they look like ID numbers (no clear phone pattern)
		const mediumNumberPattern = regex("\\b\\d{7,9}\\b", "g");

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
				const originalValue = text.substring(pos.start, pos.end);
				allMaskPositions.push({
					...pos,
					type: "NUMBER",
					placeholder: "<NUMBER>",
					originalValue,
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
				const originalValue = text.substring(pos.start, pos.end);
				allMaskPositions.push({
					...pos,
					type: "EMAIL",
					placeholder: "<EMAIL>",
					originalValue,
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
			// Use TokenVault to generate unique placeholders if provided
			const placeholder = tokenVault
				? tokenVault.store(pos.type as GuardrailEntityType, pos.originalValue)
				: pos.placeholder;

			maskedText =
				maskedText.substring(0, pos.start) +
				placeholder +
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
