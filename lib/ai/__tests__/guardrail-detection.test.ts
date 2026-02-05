import { describe, expect, it } from "bun:test";
import { detectAndMask } from "../guardrail-detection";

describe("detectAndMask - Russian Names", () => {
	it("should detect capitalized Russian names", () => {
		const result = detectAndMask(
			"Иван Иванов позвонил",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.RUSSIAN_NAME).toContain("Иван Иванов");
		expect(result.checked_text).toBe("<RUSSIAN_NAME> позвонил");
	});

	it("should detect multiple Russian names", () => {
		const result = detectAndMask(
			"Иван Иванов встретился с Петр Петров",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.RUSSIAN_NAME).toHaveLength(2);
		expect(result.detected_entities.RUSSIAN_NAME).toContain("Иван Иванов");
		expect(result.detected_entities.RUSSIAN_NAME).toContain("Петр Петров");
		expect(result.checked_text).toBe(
			"<RUSSIAN_NAME> встретился с <RUSSIAN_NAME>",
		);
	});

	it("should NOT detect lowercase names (conservative approach to reduce false positives)", () => {
		// CONSERVATIVE APPROACH: We intentionally DO NOT match lowercase names
		// because they cause too many false positives with common phrases
		// Russian names are almost always capitalized in proper text
		const result = detectAndMask(
			"иван иванов встретился с петр петров",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(false);
		expect(result.detected_entities.RUSSIAN_NAME || []).toHaveLength(0);
		expect(result.checked_text).toBe("иван иванов встретился с петр петров");
	});

	it("should NOT detect whitelisted words (months)", () => {
		const result = detectAndMask(
			"В Январь было холодно",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("В Январь было холодно");
	});

	it("should NOT detect whitelisted words (cities)", () => {
		const result = detectAndMask(
			"Москва это столица",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("Москва это столица");
	});

	it("should NOT detect whitelisted words (greetings)", () => {
		const result = detectAndMask(
			"Добрый день! Спасибо!",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("Добрый день! Спасибо!");
	});

	it("should NOT detect hotel/business terminology as names", () => {
		// Regression test for false positives identified by senior engineer
		// These were being incorrectly detected as RUSSIAN_NAME
		const text =
			"Служба поддержки. Стоимость услуг. Политика отеля. Незаезд запрещен. Бронирование номера.";

		const result = detectAndMask(text, ["RUSSIAN_NAME"], undefined, "other");

		// None of these business terms should be detected as names
		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe(text);
	});

	it("should NOT detect common multi-word phrases as names", () => {
		// Regression test: these phrases were incorrectly detected
		const text =
			"ночи проживания в отеле, отель взимает плату, случае незаезда гостя";

		const result = detectAndMask(text, ["RUSSIAN_NAME"], undefined, "other");

		// Common phrases should NOT be detected as names
		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe(text);
	});

	it("should NOT detect single capitalized words as names", () => {
		// Conservative approach: single words are too prone to false positives
		const text = "Извините, Служба, Отель, Стоимость, Политика";

		const result = detectAndMask(text, ["RUSSIAN_NAME"], undefined, "other");

		// Single capitalized words should NOT be detected
		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe(text);
	});

	it("should NOT detect Latin transliterated names (current limitation)", () => {
		const result = detectAndMask(
			"Dzhamilya Abdulkadyirova called",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		// This is expected behavior - only Cyrillic patterns detected
		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("Dzhamilya Abdulkadyirova called");
	});

	it("should detect Russian names with punctuation", () => {
		const result = detectAndMask(
			"Иван Иванов, Петр Петров.",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.RUSSIAN_NAME).toHaveLength(2);
		expect(result.checked_text).toBe("<RUSSIAN_NAME>, <RUSSIAN_NAME>.");
	});
});

describe("detectAndMask - Phone Numbers", () => {
	it("should detect Russian phone number with +7", () => {
		const result = detectAndMask(
			"Номер +79856004025",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.NUMBER).toContain("+79856004025");
		expect(result.checked_text).toBe("Номер <NUMBER>");
	});

	it("should detect formatted phone number with spaces", () => {
		const result = detectAndMask(
			"Позвоните на +7 900 123-45-67",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.NUMBER).toHaveLength(1);
		expect(result.checked_text).toBe("Позвоните на <NUMBER>");
	});

	it("should detect phone number starting with 8", () => {
		const result = detectAndMask(
			"Номер 89123456789",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.NUMBER).toContain("89123456789");
		expect(result.checked_text).toBe("Номер <NUMBER>");
	});

	it("should detect phone with parentheses", () => {
		const result = detectAndMask(
			"Звоните 8 (901) 234-56-78",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.NUMBER).toHaveLength(1);
		expect(result.checked_text).toBe("Звоните <NUMBER>");
	});

	it("should detect multiple phone numbers", () => {
		const result = detectAndMask(
			"Номера: +79001234567 и 89123456789",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.NUMBER).toHaveLength(2);
		expect(result.checked_text).toBe("Номера: <NUMBER> и <NUMBER>");
	});

	it("should NOT detect years as phone numbers", () => {
		const result = detectAndMask("В 2024 году", ["NUMBER"], undefined, "other");

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("В 2024 году");
	});

	it("should NOT detect common 4-digit numbers", () => {
		const result = detectAndMask(
			"Страница 1234",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("Страница 1234");
	});

	it("should detect long number sequences (7+ digits)", () => {
		const result = detectAndMask(
			"ID номер 1234567",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.NUMBER).toContain("1234567");
		expect(result.checked_text).toBe("ID номер <NUMBER>");
	});
});

describe("detectAndMask - Email Addresses", () => {
	it("should detect email addresses", () => {
		const result = detectAndMask(
			"Напишите на test@example.com",
			["EMAIL"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.EMAIL).toContain("test@example.com");
		expect(result.checked_text).toBe("Напишите на <EMAIL>");
	});

	it("should detect multiple emails", () => {
		const result = detectAndMask(
			"Контакты: user@test.com и admin@example.org",
			["EMAIL"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.EMAIL).toHaveLength(2);
		expect(result.checked_text).toBe("Контакты: <EMAIL> и <EMAIL>");
	});

	it("should NOT mask user's own email", () => {
		const userEmail = "myemail@example.com";
		const result = detectAndMask(
			"Моя почта myemail@example.com и другая test@example.com",
			["EMAIL"],
			userEmail,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.EMAIL).toHaveLength(1);
		expect(result.detected_entities.EMAIL).toContain("test@example.com");
		expect(result.detected_entities.EMAIL).not.toContain("myemail@example.com");
		expect(result.checked_text).toBe(
			"Моя почта myemail@example.com и другая <EMAIL>",
		);
	});

	it("should handle email case insensitivity for user exclusion", () => {
		const userEmail = "User@Example.Com";
		const result = detectAndMask(
			"Почта user@example.com",
			["EMAIL"],
			userEmail,
			"other",
		);

		expect(result.detected).toBe(false); // User's email not detected
		expect(result.checked_text).toBe("Почта user@example.com");
	});

	it("should detect emails with complex domains", () => {
		const result = detectAndMask(
			"Адрес admin@company.co.uk",
			["EMAIL"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.EMAIL).toContain("admin@company.co.uk");
		expect(result.checked_text).toBe("Адрес <EMAIL>");
	});
});

describe("detectAndMask - Multi-Entity Detection", () => {
	it("should detect all entity types together", () => {
		const result = detectAndMask(
			"Иван Иванов позвонил на +79001234567 и написал на ivan@example.com",
			["RUSSIAN_NAME", "NUMBER", "EMAIL"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.RUSSIAN_NAME).toHaveLength(1);
		expect(result.detected_entities.NUMBER).toHaveLength(1);
		expect(result.detected_entities.EMAIL).toHaveLength(1);
		expect(result.checked_text).toBe(
			"<RUSSIAN_NAME> позвонил на <NUMBER> и написал на <EMAIL>",
		);
	});

	it("should only detect enabled entities", () => {
		const result = detectAndMask(
			"Иван Иванов позвонил на +79001234567",
			["RUSSIAN_NAME"], // Only names enabled
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.RUSSIAN_NAME).toHaveLength(1);
		expect(result.detected_entities.NUMBER).toBeUndefined();
		expect(result.checked_text).toBe("<RUSSIAN_NAME> позвонил на +79001234567");
	});

	it("should handle empty text", () => {
		const result = detectAndMask("", ["RUSSIAN_NAME", "NUMBER", "EMAIL"]);

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("");
	});

	it("should handle text with no PII", () => {
		const result = detectAndMask(
			"Hello world, this is a test",
			["RUSSIAN_NAME", "NUMBER", "EMAIL"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("Hello world, this is a test");
	});
});

describe("detectAndMask - Idempotency", () => {
	it("should not double-mask already masked text", () => {
		const firstPass = detectAndMask(
			"Иван Иванов позвонил на +79001234567",
			["RUSSIAN_NAME", "NUMBER"],
			undefined,
			"other",
		);

		expect(firstPass.checked_text).toBe("<RUSSIAN_NAME> позвонил на <NUMBER>");

		// Second pass on already masked text
		const secondPass = detectAndMask(
			firstPass.checked_text,
			["RUSSIAN_NAME", "NUMBER"],
			undefined,
			"other",
		);

		// Should not detect placeholders as PII
		expect(secondPass.detected).toBe(false);
		expect(secondPass.checked_text).toBe("<RUSSIAN_NAME> позвонил на <NUMBER>");
	});
});

describe("detectAndMask - Edge Cases", () => {
	it("should handle duplicate entities", () => {
		const result = detectAndMask(
			"Иван Иванов встретил Иван Иванов",
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		// Should deduplicate in detected_entities array
		expect(result.detected_entities.RUSSIAN_NAME).toHaveLength(1);
		expect(result.detected_entities.RUSSIAN_NAME).toContain("Иван Иванов");
		// But should mask both occurrences
		expect(result.checked_text).toBe("<RUSSIAN_NAME> встретил <RUSSIAN_NAME>");
	});

	it("should handle overlapping number patterns", () => {
		const result = detectAndMask(
			"Номер +79001234567890",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		// Should detect as one number, not overlapping patterns
		expect(result.detected_entities.NUMBER).toHaveLength(1);
		expect(result.checked_text).toBe("Номер <NUMBER>");
	});

	it("should preserve text length changes correctly", () => {
		const originalText = "Иван Иванов";
		const result = detectAndMask(
			originalText,
			["RUSSIAN_NAME"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(originalText.length).toBe(11);
		expect(result.checked_text).toBe("<RUSSIAN_NAME>");
		expect(result.checked_text.length).toBe(14); // Placeholder is longer
	});

	it("should handle mixed Cyrillic and Latin text", () => {
		const result = detectAndMask(
			"Иван Иванов sent email to test@example.com",
			["RUSSIAN_NAME", "EMAIL"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		expect(result.detected_entities.RUSSIAN_NAME).toHaveLength(1);
		expect(result.detected_entities.EMAIL).toHaveLength(1);
		expect(result.checked_text).toBe("<RUSSIAN_NAME> sent email to <EMAIL>");
	});

	it("should handle text with only punctuation", () => {
		const result = detectAndMask(
			"... --- ...",
			["RUSSIAN_NAME", "NUMBER", "EMAIL"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(false);
		expect(result.checked_text).toBe("... --- ...");
	});
});

describe("detectAndMask - Context Parameter", () => {
	it("should accept different context values", () => {
		const contexts: Array<
			"user_message" | "rag_chunk" | "middleware" | "other"
		> = ["user_message", "rag_chunk", "middleware", "other"];

		for (const context of contexts) {
			const result = detectAndMask(
				"Иван Иванов",
				["RUSSIAN_NAME"],
				undefined,
				context,
			);

			expect(result.detected).toBe(true);
			expect(result.checked_text).toBe("<RUSSIAN_NAME>");
		}
	});
});
