import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { auth } from "@/app/(auth)/auth";
import { chunkText, estimateChunkStats } from "@/lib/ai/chunking";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { guardrailLogger } from "@/lib/ai/logger";
import { insertChunks, insertDocument } from "@/lib/db/db";
import { getPdfContentFromUrl } from "@/utils/pdf";

export async function POST(request: Request) {
	const { searchParams } = new URL(request.url);
	const filename = searchParams.get("filename");

	const session = await auth();

	if (!session) {
		return Response.redirect("/login");
	}

	const { user } = session;

	if (!user) {
		return Response.redirect("/login");
	}

	if (request.body === null) {
		return new Response("Request body is empty", { status: 400 });
	}

	if (!filename) {
		return new Response("Filename is required", { status: 400 });
	}

	// Upload file to blob storage
	const { downloadUrl } = await put(`${user.email}/${filename}`, request.body, {
		access: "public",
	});

	// Extract content from PDF
	const content = await getPdfContentFromUrl(downloadUrl);

	guardrailLogger.info("File upload: PDF content extracted", {
		fileCount: 1,
		textLength: content.length,
	});

	// Get file metadata
	const fileExtension = filename.split(".").pop()?.toLowerCase() || "unknown";
	const source = fileExtension === "pdf" ? "pdf" : fileExtension;

	// Estimate chunking stats for logging
	const stats = estimateChunkStats(content, {
		minTokens: 256,
		maxTokens: 304,
		overlapTokens: 32,
	});

	guardrailLogger.info("File upload: Chunking stats", {
		originalLength: stats.originalLength,
		cleanedLength: stats.cleanedLength,
		estimatedTokens: stats.estimatedTokens,
		chunkCount: stats.chunkCount,
		averageChunkSize: stats.averageChunkSize,
		averageTokensPerChunk: stats.averageTokensPerChunk,
	});

	// Smart chunking with token-based splitting and overlap
	const textChunks = chunkText(content, {
		minTokens: 256,
		maxTokens: 304,
		overlapTokens: 32,
		preserveParagraphs: true,
	});

	guardrailLogger.info("File upload: Text chunked", {
		chunkCount: textChunks.length,
	});

	// Generate embeddings for all chunks
	const embeddings = await generateEmbeddings(
		textChunks.map((chunk) => chunk.content),
	);

	guardrailLogger.info("File upload: Embeddings generated", {
		chunkCount: embeddings.length,
	});

	// Create document entry
	const documentId = uuidv4();
	const filePath = `${user.email}/${filename}`;

	await insertDocument({
		id: documentId,
		title: filename,
		filePath,
		source,
		author: user.email ?? "",
		metadata: {
			fileSize: content.length,
			chunkCount: textChunks.length,
			uploadedAt: new Date().toISOString(),
			downloadUrl,
		},
	});

	guardrailLogger.info("File upload: Document created", {
		fileCount: 1,
	});

	// Insert chunks with embeddings
	await insertChunks({
		chunks: textChunks.map((chunk, i) => ({
			id: `${documentId}/${i}`,
			documentId,
			content: chunk.content,
			embedding: embeddings[i],
			startToken: chunk.startToken,
			endToken: chunk.endToken,
			chunkIndex: chunk.chunkIndex,
		})),
	});

	guardrailLogger.info("File upload: Chunks inserted", {
		chunkCount: textChunks.length,
	});

	return Response.json({
		documentId,
		chunkCount: textChunks.length,
		stats,
	});
}
