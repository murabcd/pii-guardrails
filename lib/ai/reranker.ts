import { guardrailLogger } from "./logger";

export interface RerankerDocument {
	id: string;
	filePath: string;
	content: string;
	similarity?: number;
}

export interface RerankedResult extends RerankerDocument {
	relevance_score: number;
	original_index: number;
}

interface JinaRerankerRequest {
	model: string;
	query: string;
	top_n?: number;
	documents: string[];
	return_documents?: boolean;
}

interface JinaRerankerResponse {
	model: string;
	usage: {
		total_tokens: number;
		prompt_tokens: number;
	};
	results: Array<{
		index: number;
		relevance_score: number;
		document?: {
			text: string;
		};
	}>;
}

/**
 * Rerank documents using Jina AI's reranker API
 * This improves RAG retrieval quality by reordering results based on semantic relevance
 */
export async function rerankDocuments(
	query: string,
	documents: RerankerDocument[],
	topN?: number,
): Promise<RerankedResult[]> {
	const jinaApiKey = process.env.JINA_API_KEY;

	if (!jinaApiKey) {
		guardrailLogger.warn(
			"Reranker: JINA_API_KEY not found, skipping reranking",
		);
		// Return original documents with default relevance scores
		return documents.map((doc, idx) => ({
			...doc,
			relevance_score: doc.similarity ?? 1 - idx * 0.1,
			original_index: idx,
		}));
	}

	try {
		guardrailLogger.info("Reranker: Starting reranking", {
			documentCount: documents.length,
			topN: topN ?? documents.length,
			queryLength: query.length,
		});

		const requestBody: JinaRerankerRequest = {
			model: "jina-reranker-v2-base-multilingual",
			query,
			top_n: topN ?? documents.length,
			documents: documents.map((doc) => doc.content),
			return_documents: false, // We already have the documents
		};

		const response = await fetch("https://api.jina.ai/v1/rerank", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${jinaApiKey}`,
			},
			body: JSON.stringify(requestBody),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Jina AI reranker API error: ${response.status} - ${errorText}`,
			);
		}

		const data = (await response.json()) as JinaRerankerResponse;

		guardrailLogger.info("Reranker: Reranking complete", {
			resultsCount: data.results.length,
			tokensUsed: data.usage.total_tokens,
		});

		// Map the reranked results back to our document format
		const rerankedResults: RerankedResult[] = data.results.map((result) => {
			const originalDoc = documents[result.index];
			if (!originalDoc) {
				throw new Error(`Invalid index ${result.index} from reranker`);
			}
			return {
				...originalDoc,
				relevance_score: result.relevance_score,
				original_index: result.index,
			};
		});

		// Log score improvements
		if (guardrailLogger.isEnabled("debug")) {
			rerankedResults.forEach((doc, newIdx) => {
				guardrailLogger.debug(
					`Reranker: Document ${doc.original_index} -> position ${newIdx}`,
					{
						originalPosition: doc.original_index,
						newPosition: newIdx,
						relevanceScore: doc.relevance_score,
						originalSimilarity: doc.similarity,
					},
				);
			});
		}

		return rerankedResults;
	} catch (error) {
		guardrailLogger.error("Reranker: Error during reranking", {
			error: error instanceof Error ? error.message : String(error),
		});

		// Fallback to original documents on error
		return documents.map((doc, idx) => ({
			...doc,
			relevance_score: doc.similarity ?? 1 - idx * 0.1,
			original_index: idx,
		}));
	}
}
