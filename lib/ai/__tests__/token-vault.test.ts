import { describe, expect, it } from "bun:test";
import { detectAndMask } from "../guardrail-detection";
import { TokenVault } from "../token-vault";

describe("TokenVault - Basic Operations", () => {
	it("should store and retrieve a single token", () => {
		const vault = new TokenVault();

		const placeholder = vault.store("NUMBER", "+79856004025");

		expect(placeholder).toBe("<NUMBER_1>");
		expect(vault.size()).toBe(1);
	});

	it("should deduplicate identical values (same token for same value)", () => {
		const vault = new TokenVault();

		// Store the same phone number twice
		const placeholder1 = vault.store("NUMBER", "+79856004025");
		const placeholder2 = vault.store("NUMBER", "+79856004025");

		// Should return the SAME token, not create a new one
		expect(placeholder1).toBe("<NUMBER_1>");
		expect(placeholder2).toBe("<NUMBER_1>");

		// Vault size should still be 1 (not 2)
		expect(vault.size()).toBe(1);
	});

	it("should deduplicate across different contexts (query + RAG)", () => {
		const vault = new TokenVault();

		// Simulate: User asks about a number
		const queryPlaceholder = vault.store("NUMBER", "+79856004025");

		// Simulate: Same number appears in RAG context
		const contextPlaceholder = vault.store("NUMBER", "+79856004025");

		// CRITICAL: Both should use the SAME token
		expect(queryPlaceholder).toBe(contextPlaceholder);
		expect(queryPlaceholder).toBe("<NUMBER_1>");

		// Vault size should be 1, not 2
		expect(vault.size()).toBe(1);
	});

	it("should deduplicate names across multiple RAG chunks", () => {
		const vault = new TokenVault();

		// Same name appears in multiple RAG chunks
		const placeholder1 = vault.store("RUSSIAN_NAME", "Иван Иванов");
		const placeholder2 = vault.store("RUSSIAN_NAME", "Иван Иванов");
		const placeholder3 = vault.store("RUSSIAN_NAME", "Иван Иванов");

		// All should use the same token
		expect(placeholder1).toBe("<RUSSIAN_NAME_1>");
		expect(placeholder2).toBe("<RUSSIAN_NAME_1>");
		expect(placeholder3).toBe("<RUSSIAN_NAME_1>");

		// Vault size should be 1
		expect(vault.size()).toBe(1);
	});

	it("should generate unique placeholders for multiple tokens", () => {
		const vault = new TokenVault();

		const placeholder1 = vault.store("NUMBER", "+79856004025");
		const placeholder2 = vault.store("NUMBER", "+79001234567");
		const placeholder3 = vault.store("RUSSIAN_NAME", "Иван Иванов");

		expect(placeholder1).toBe("<NUMBER_1>");
		expect(placeholder2).toBe("<NUMBER_2>");
		expect(placeholder3).toBe("<RUSSIAN_NAME_1>");
		expect(vault.size()).toBe(3);
	});

	it("should unmask text with placeholders", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");
		vault.store("RUSSIAN_NAME", "Иван Иванов");

		const maskedText = "Позвоните <RUSSIAN_NAME_1> по номеру <NUMBER_1>";
		const unmaskedText = vault.unmask(maskedText);

		expect(unmaskedText).toBe("Позвоните Иван Иванов по номеру +79856004025");
	});

	it("should handle text without placeholders", () => {
		const vault = new TokenVault();

		const text = "Hello world";
		const unmaskedText = vault.unmask(text);

		expect(unmaskedText).toBe("Hello world");
	});

	it("should handle multiple occurrences of same placeholder", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		const maskedText =
			"Номер <NUMBER_1> это тот же номер <NUMBER_1>, повторяю: <NUMBER_1>";
		const unmaskedText = vault.unmask(maskedText);

		expect(unmaskedText).toBe(
			"Номер +79856004025 это тот же номер +79856004025, повторяю: +79856004025",
		);
	});

	it("should clear all tokens", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");
		vault.store("EMAIL", "test@example.com");

		expect(vault.size()).toBe(2);

		vault.clear();

		expect(vault.size()).toBe(0);
		expect(vault.getPlaceholders()).toHaveLength(0);
	});

	it("should get all placeholders", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");
		vault.store("RUSSIAN_NAME", "Иван Иванов");
		vault.store("EMAIL", "test@example.com");

		const placeholders = vault.getPlaceholders();

		expect(placeholders).toHaveLength(3);
		expect(placeholders).toContain("<NUMBER_1>");
		expect(placeholders).toContain("<RUSSIAN_NAME_1>");
		expect(placeholders).toContain("<EMAIL_1>");
	});
});

describe("TokenVault - Integration with detectAndMask", () => {
	it("should integrate with detectAndMask for masking", () => {
		const vault = new TokenVault();

		const result = detectAndMask(
			"Позвоните на +79856004025",
			["NUMBER"],
			undefined,
			"other",
			vault,
		);

		expect(result.detected).toBe(true);
		expect(result.checked_text).toBe("Позвоните на <NUMBER_1>");
		expect(vault.size()).toBe(1);
	});

	it("should create unique placeholders for multiple entities", () => {
		const vault = new TokenVault();

		const result = detectAndMask(
			"Иван Иванов позвонил на +79001234567 и написал на ivan@example.com",
			["RUSSIAN_NAME", "NUMBER", "EMAIL"],
			undefined,
			"other",
			vault,
		);

		expect(result.detected).toBe(true);
		expect(result.checked_text).toBe(
			"<RUSSIAN_NAME_1> позвонил на <NUMBER_1> и написал на <EMAIL_1>",
		);
		expect(vault.size()).toBe(3);
	});

	it("should unmask text after masking", () => {
		const vault = new TokenVault();

		// Mask the input
		const result = detectAndMask(
			"позвоните Иван Петров по номеру +79856004025",
			["RUSSIAN_NAME", "NUMBER"],
			undefined,
			"other",
			vault,
		);

		expect(result.checked_text).toBe(
			"позвоните <RUSSIAN_NAME_1> по номеру <NUMBER_1>",
		);

		// Unmask the output
		const unmaskedText = vault.unmask(result.checked_text);

		expect(unmaskedText).toBe("позвоните Иван Петров по номеру +79856004025");
	});

	it("should work without TokenVault (backward compatibility)", () => {
		const result = detectAndMask(
			"Позвоните на +79856004025",
			["NUMBER"],
			undefined,
			"other",
		);

		expect(result.detected).toBe(true);
		// Without TokenVault, should use simple placeholders
		expect(result.checked_text).toBe("Позвоните на <NUMBER>");
	});
});

describe("TokenVault - Full Round-Trip (Input → LLM → Output)", () => {
	it("should handle full masking and unmasking flow", () => {
		const vault = new TokenVault();

		// Step 1: User asks question with PII
		const userQuery = "Что это за номер? +79856004025";

		// Step 2: Mask query before sending to LLM
		const maskedQuery = detectAndMask(
			userQuery,
			["NUMBER"],
			undefined,
			"user_message",
			vault,
		);

		expect(maskedQuery.checked_text).toBe("Что это за номер? <NUMBER_1>");

		// Step 3: LLM responds with placeholder
		const llmResponse =
			"Ваш вопрос о номере <NUMBER_1>. Этот номер указан для связи.";

		// Step 4: Unmask LLM response before showing to user
		const unmaskedResponse = vault.unmask(llmResponse);

		expect(unmaskedResponse).toBe(
			"Ваш вопрос о номере +79856004025. Этот номер указан для связи.",
		);
	});

	it("should deduplicate PII across query and RAG context (senior engineer scenario)", () => {
		const vault = new TokenVault();

		// Scenario: User asks "Чей это номер? +79856004025"
		// RAG finds context with the SAME number

		// Step 1: Mask user query
		const userQuery = "Чей это номер? +79856004025";
		const maskedQuery = detectAndMask(
			userQuery,
			["NUMBER"],
			undefined,
			"user_message",
			vault,
		);

		expect(maskedQuery.checked_text).toBe("Чей это номер? <NUMBER_1>");

		// Step 2: Mask RAG context containing the SAME number
		const ragContext = "Телефон для связи: +79856004025, владелец: Иван";
		const maskedContext = detectAndMask(
			ragContext,
			["NUMBER"],
			undefined,
			"rag_chunk",
			vault,
		);

		// CRITICAL: Same number should get SAME token (not <NUMBER_2>!)
		expect(maskedContext.checked_text).toBe(
			"Телефон для связи: <NUMBER_1>, владелец: Иван",
		);

		// Verify vault only has 1 token (deduplication worked)
		expect(vault.size()).toBe(1);

		// Step 3: LLM can now match the query and context
		// Query: "Чей это номер? <NUMBER_1>"
		// Context: "Телефон для связи: <NUMBER_1>, владелец: Иван"
		// LLM sees same token and can answer!
		const llmResponse = "Номер <NUMBER_1> принадлежит владельцу Иван";

		// Step 4: Unmask for user
		const unmasked = vault.unmask(llmResponse);
		expect(unmasked).toBe("Номер +79856004025 принадлежит владельцу Иван");
	});

	it("should handle complex round-trip with multiple PII types", () => {
		const vault = new TokenVault();

		// Step 1: Mask RAG context chunks
		const ragChunk =
			"встретил гостя: Иван Петров, номер +79856004025, email guest@example.com";

		const maskedChunk = detectAndMask(
			ragChunk,
			["RUSSIAN_NAME", "NUMBER", "EMAIL"],
			undefined,
			"rag_chunk",
			vault,
		);

		expect(maskedChunk.checked_text).toBe(
			"встретил гостя: <RUSSIAN_NAME_1>, номер <NUMBER_1>, email <EMAIL_1>",
		);

		// Step 2: User query also masked (same name appears again)
		const userQuery = "как связаться с Иван Петров?";

		const maskedQuery = detectAndMask(
			userQuery,
			["RUSSIAN_NAME", "NUMBER", "EMAIL"],
			undefined,
			"user_message",
			vault,
		);

		// DEDUPLICATION: Same name should reuse existing token
		expect(maskedQuery.checked_text).toBe("как связаться с <RUSSIAN_NAME_1>?");

		// Vault should have 3 unique values (1 name, 1 number, 1 email)
		expect(vault.size()).toBe(3);

		// Step 3: LLM generates response with placeholders
		// Note: <RUSSIAN_NAME_1> is used because of deduplication
		const llmResponse =
			"чтобы связаться с <RUSSIAN_NAME_1>, позвоните по номеру <NUMBER_1> или напишите на <EMAIL_1>.";

		// Step 4: Unmask for user
		const unmaskedResponse = vault.unmask(llmResponse);

		expect(unmaskedResponse).toBe(
			"чтобы связаться с Иван Петров, позвоните по номеру +79856004025 или напишите на guest@example.com.",
		);
	});

	it("should handle partial unmasking when some placeholders not in vault", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");
		// Note: We didn't store RUSSIAN_NAME

		const llmResponse = "Позвоните <RUSSIAN_NAME_1> по номеру <NUMBER_1>";

		const unmaskedText = vault.unmask(llmResponse);

		// Should unmask what it can
		expect(unmaskedText).toBe(
			"Позвоните <RUSSIAN_NAME_1> по номеру +79856004025",
		);
	});

	it("should preserve text without placeholders in LLM response", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		// LLM might respond without using the placeholder
		const llmResponse = "Извините, я не могу найти информацию об этом номере.";

		const unmaskedText = vault.unmask(llmResponse);

		expect(unmaskedText).toBe(llmResponse); // Should remain unchanged
	});
});

describe("TokenVault - Streaming Scenarios", () => {
	it("should handle progressive unmasking as buffer grows", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		// Simulate streaming: buffer grows with each chunk
		let buffer = "";

		// Chunk 1: Regular text
		buffer += "Номер ";
		expect(vault.unmask(buffer)).toBe("Номер ");

		// Chunk 2: Start of placeholder
		buffer += "<";
		expect(vault.unmask(buffer)).toBe("Номер <");

		// Chunk 3: Partial placeholder
		buffer += "NUMBER";
		expect(vault.unmask(buffer)).toBe("Номер <NUMBER");

		// Chunk 4: More of placeholder
		buffer += "_";
		expect(vault.unmask(buffer)).toBe("Номер <NUMBER_");

		// Chunk 5: Almost complete
		buffer += "1";
		expect(vault.unmask(buffer)).toBe("Номер <NUMBER_1");

		// Chunk 6: Placeholder completes - NOW it should unmask
		buffer += ">";
		expect(vault.unmask(buffer)).toBe("Номер +79856004025");

		// Chunk 7: More text after placeholder
		buffer += " для связи";
		expect(vault.unmask(buffer)).toBe("Номер +79856004025 для связи");
	});

	it("should handle multiple placeholders arriving in stream", () => {
		const vault = new TokenVault();

		vault.store("RUSSIAN_NAME", "Иван Иванов");
		vault.store("NUMBER", "+79856004025");

		let buffer = "";

		// First placeholder arrives
		buffer += "Позвоните <RUSSIAN_NAME_1>";
		expect(vault.unmask(buffer)).toBe("Позвоните Иван Иванов");

		// Second placeholder starts
		buffer += " по номеру <NUMBER";
		expect(vault.unmask(buffer)).toBe(
			"Позвоните Иван Иванов по номеру <NUMBER",
		);

		// Second placeholder completes
		buffer += "_1>";
		expect(vault.unmask(buffer)).toBe(
			"Позвоните Иван Иванов по номеру +79856004025",
		);
	});

	it("should correctly unmask when buffer contains incomplete placeholder at end", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		// This simulates what the TransformStream holdback logic prevents
		// TokenVault itself doesn't do holdback - it just replaces what it finds

		// Buffer with incomplete placeholder
		const buffer1 = "Номер <NUMBER_1";
		expect(vault.unmask(buffer1)).toBe("Номер <NUMBER_1"); // Can't unmask incomplete

		// Buffer with complete placeholder
		const buffer2 = "Номер <NUMBER_1>";
		expect(vault.unmask(buffer2)).toBe("Номер +79856004025");
	});

	it("should handle false starts that aren't placeholders", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		// Text that starts with < but isn't a placeholder
		let buffer = "Цена < 1000 рублей";
		expect(vault.unmask(buffer)).toBe("Цена < 1000 рублей");

		// Real placeholder after false start
		buffer += " для номера <NUMBER_1>";
		expect(vault.unmask(buffer)).toBe(
			"Цена < 1000 рублей для номера +79856004025",
		);
	});

	it("should handle rapid successive unmasking calls (streaming simulation)", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");
		vault.store("EMAIL", "test@example.com");

		// Simulate what happens in real streaming:
		// Multiple calls to unmask with growing buffer

		const chunks = [
			"Контакт: ",
			"Контакт: <",
			"Контакт: <NUMBER",
			"Контакт: <NUMBER_",
			"Контакт: <NUMBER_1",
			"Контакт: <NUMBER_1>",
			"Контакт: <NUMBER_1>, email: ",
			"Контакт: <NUMBER_1>, email: <EMAIL",
			"Контакт: <NUMBER_1>, email: <EMAIL_1>",
		];

		const expectedResults = [
			"Контакт: ",
			"Контакт: <",
			"Контакт: <NUMBER",
			"Контакт: <NUMBER_",
			"Контакт: <NUMBER_1",
			"Контакт: +79856004025", // Unmasked!
			"Контакт: +79856004025, email: ",
			"Контакт: +79856004025, email: <EMAIL",
			"Контакт: +79856004025, email: test@example.com", // Unmasked!
		];

		chunks.forEach((chunk, index) => {
			const result = vault.unmask(chunk);
			expect(result).toBe(expectedResults[index]);
		});
	});
});

describe("TokenVault - Edge Cases", () => {
	it("should handle empty strings", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		expect(vault.unmask("")).toBe("");
	});

	it("should handle text with only placeholders", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");
		vault.store("EMAIL", "test@example.com");

		const text = "<NUMBER_1> <EMAIL_1>";
		const unmasked = vault.unmask(text);

		expect(unmasked).toBe("+79856004025 test@example.com");
	});

	it("should handle placeholders at start and end of text", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		const text = "<NUMBER_1> это номер телефона <NUMBER_1>";
		const unmasked = vault.unmask(text);

		expect(unmasked).toBe("+79856004025 это номер телефона +79856004025");
	});

	it("should handle Cyrillic text correctly", () => {
		const vault = new TokenVault();

		vault.store("RUSSIAN_NAME", "Иван Иванов");

		const text = "Здравствуйте, <RUSSIAN_NAME_1>!";
		const unmasked = vault.unmask(text);

		expect(unmasked).toBe("Здравствуйте, Иван Иванов!");
	});

	it("should not interfere with similar-looking text", () => {
		const vault = new TokenVault();

		vault.store("NUMBER", "+79856004025");

		// Text that looks like a placeholder but isn't
		const text = "The pattern <NUMBER_1> is a placeholder";
		const unmasked = vault.unmask(text);

		// Should actually unmask it if it matches
		expect(unmasked).toBe("The pattern +79856004025 is a placeholder");
	});

	it("should handle consecutive placeholders", () => {
		const vault = new TokenVault();

		vault.store("RUSSIAN_NAME", "Иван");
		vault.store("RUSSIAN_NAME", "Иванов");

		const text = "<RUSSIAN_NAME_1><RUSSIAN_NAME_2>";
		const unmasked = vault.unmask(text);

		expect(unmasked).toBe("ИванИванов");
	});
});
