/**
 * Smart text chunking utility for RAG
 * Implements token-based chunking with overlap as described in:
 * https://anyblockers.com/posts/building-rag-with-postgres
 *
 * Features:
 * - Token-based chunking (256-304 tokens per chunk)
 * - 32-token overlap between chunks
 * - Text cleaning and normalization
 * - Token position tracking
 */

export interface TextChunk {
	content: string;
	startToken: number;
	endToken: number;
	chunkIndex: number;
}

export interface ChunkingOptions {
	minTokens?: number; // Default: 256
	maxTokens?: number; // Default: 304
	overlapTokens?: number; // Default: 32
	preserveParagraphs?: boolean; // Try to break at paragraph boundaries
}

/**
 * Approximate token count using a simple heuristic
 * OpenAI's tokenizer roughly: 1 token ≈ 4 characters for English text
 * This is a fast approximation; for exact counts, use tiktoken
 */
function estimateTokenCount(text: string): number {
	// Remove extra whitespace and normalize
	const normalized = text.trim().replace(/\s+/g, " ");
	// Rough estimate: 1 token ≈ 4 chars
	return Math.ceil(normalized.length / 4);
}

/**
 * Get approximate character count for target token count
 */
function tokensToChars(tokens: number): number {
	return tokens * 4;
}

/**
 * Clean and normalize text before chunking
 */
export function cleanText(text: string): string {
	return (
		text
			// Normalize line breaks
			.replace(/\r\n/g, "\n")
			.replace(/\r/g, "\n")
			// Remove multiple consecutive blank lines (keep max 2)
			.replace(/\n{3,}/g, "\n\n")
			// Normalize whitespace (but preserve single spaces)
			.replace(/[^\S\n]+/g, " ")
			// Trim each line
			.split("\n")
			.map((line) => line.trim())
			.join("\n")
			// Trim the whole text
			.trim()
	);
}

/**
 * Split text into sentences for better chunk boundaries
 */
function splitIntoSentences(text: string): string[] {
	// Simple sentence splitting - can be improved with NLP libraries
	const sentences = text.match(/[^.!?]+(?:[.!?]+(?:\s|$)|$)/g);
	return sentences?.map((s) => s.trim()).filter((s) => s.length > 0) || [text];
}

/**
 * Split text into paragraphs
 */
function splitIntoParagraphs(text: string): string[] {
	return text
		.split(/\n\n+/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
}

/**
 * Chunk text with smart boundaries (prefer paragraph/sentence breaks)
 */
export function chunkText(
	text: string,
	options: ChunkingOptions = {},
): TextChunk[] {
	const {
		minTokens = 256,
		maxTokens = 304,
		overlapTokens = 32,
		preserveParagraphs = true,
	} = options;

	// Clean the text first
	const cleanedText = cleanText(text);

	if (cleanedText.length === 0) {
		return [];
	}

	const totalTokens = estimateTokenCount(cleanedText);

	// If text is small enough, return as single chunk
	if (totalTokens <= maxTokens) {
		return [
			{
				content: cleanedText,
				startToken: 0,
				endToken: totalTokens,
				chunkIndex: 0,
			},
		];
	}

	const chunks: TextChunk[] = [];
	const paragraphs = preserveParagraphs
		? splitIntoParagraphs(cleanedText)
		: [cleanedText];

	let currentChunk = "";
	let currentTokenCount = 0;
	let currentStartToken = 0;
	let chunkIndex = 0;

	for (const paragraph of paragraphs) {
		const paragraphTokens = estimateTokenCount(paragraph);

		// If paragraph alone exceeds maxTokens, split it by sentences
		if (paragraphTokens > maxTokens) {
			// Save current chunk if any
			if (currentChunk) {
				chunks.push({
					content: currentChunk.trim(),
					startToken: currentStartToken,
					endToken: currentStartToken + currentTokenCount,
					chunkIndex: chunkIndex++,
				});
				currentChunk = "";
				currentTokenCount = 0;
			}

			// Split large paragraph by sentences
			const sentences = splitIntoSentences(paragraph);
			let sentenceChunk = "";
			let sentenceTokenCount = 0;
			const sentenceStartToken = currentStartToken + currentTokenCount;

			for (const sentence of sentences) {
				const sentenceTokens = estimateTokenCount(sentence);

				if (sentenceTokenCount + sentenceTokens > maxTokens && sentenceChunk) {
					// Save sentence chunk
					chunks.push({
						content: sentenceChunk.trim(),
						startToken: sentenceStartToken,
						endToken: sentenceStartToken + sentenceTokenCount,
						chunkIndex: chunkIndex++,
					});

					// Start new chunk with overlap
					const overlapText = getOverlapText(sentenceChunk, overlapTokens);
					sentenceChunk = overlapText + (overlapText ? " " : "") + sentence;
					sentenceTokenCount = estimateTokenCount(sentenceChunk);
				} else {
					sentenceChunk += (sentenceChunk ? " " : "") + sentence;
					sentenceTokenCount += sentenceTokens;
				}
			}

			// Add remaining sentence chunk
			if (sentenceChunk) {
				currentChunk = sentenceChunk;
				currentTokenCount = sentenceTokenCount;
				currentStartToken = sentenceStartToken;
			}

			continue;
		}

		// Check if adding this paragraph exceeds maxTokens
		if (currentTokenCount + paragraphTokens > maxTokens && currentChunk) {
			// Save current chunk
			chunks.push({
				content: currentChunk.trim(),
				startToken: currentStartToken,
				endToken: currentStartToken + currentTokenCount,
				chunkIndex: chunkIndex++,
			});

			// Start new chunk with overlap
			const overlapText = getOverlapText(currentChunk, overlapTokens);
			const overlapTokenCount = estimateTokenCount(overlapText);

			currentChunk = overlapText + (overlapText ? "\n\n" : "") + paragraph;
			currentTokenCount = overlapTokenCount + paragraphTokens;
			currentStartToken += currentTokenCount - overlapTokenCount;
		} else {
			// Add paragraph to current chunk
			currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
			currentTokenCount += paragraphTokens;
		}

		// If chunk is at minimum size, save it
		if (currentTokenCount >= minTokens && currentTokenCount <= maxTokens) {
			chunks.push({
				content: currentChunk.trim(),
				startToken: currentStartToken,
				endToken: currentStartToken + currentTokenCount,
				chunkIndex: chunkIndex++,
			});

			// Start new chunk with overlap
			const overlapText = getOverlapText(currentChunk, overlapTokens);
			const overlapTokenCount = estimateTokenCount(overlapText);

			currentChunk = overlapText;
			currentTokenCount = overlapTokenCount;
			currentStartToken += currentTokenCount - overlapTokenCount;
		}
	}

	// Add any remaining text
	if (currentChunk.trim()) {
		chunks.push({
			content: currentChunk.trim(),
			startToken: currentStartToken,
			endToken: currentStartToken + currentTokenCount,
			chunkIndex: chunkIndex++,
		});
	}

	return chunks;
}

/**
 * Get the last N tokens worth of text for overlap
 */
function getOverlapText(text: string, overlapTokens: number): string {
	const targetChars = tokensToChars(overlapTokens);

	if (text.length <= targetChars) {
		return text;
	}

	// Get last targetChars characters
	let overlapText = text.slice(-targetChars);

	// Try to start at a sentence boundary
	const sentenceStart = overlapText.search(/[.!?]\s+/);
	if (sentenceStart !== -1) {
		overlapText = overlapText.slice(sentenceStart + 2);
	}

	// Try to start at a word boundary
	const wordStart = overlapText.indexOf(" ");
	if (wordStart !== -1) {
		overlapText = overlapText.slice(wordStart + 1);
	}

	return overlapText.trim();
}

/**
 * Estimate chunk statistics for a given text
 */
export function estimateChunkStats(
	text: string,
	options: ChunkingOptions = {},
) {
	const cleanedText = cleanText(text);
	const totalTokens = estimateTokenCount(cleanedText);
	const chunks = chunkText(cleanedText, options);

	return {
		originalLength: text.length,
		cleanedLength: cleanedText.length,
		estimatedTokens: totalTokens,
		chunkCount: chunks.length,
		averageChunkSize:
			chunks.length > 0
				? Math.round(
						chunks.reduce((sum, c) => sum + c.content.length, 0) /
							chunks.length,
					)
				: 0,
		averageTokensPerChunk:
			chunks.length > 0
				? Math.round(
						chunks.reduce((sum, c) => sum + (c.endToken - c.startToken), 0) /
							chunks.length,
					)
				: 0,
	};
}
