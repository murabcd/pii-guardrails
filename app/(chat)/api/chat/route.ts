import { convertToModelMessages, streamText } from "ai";
import { auth } from "@/app/(auth)/auth";
import { createMessage, findSimilarChunksByFilePaths } from "@/app/db";
import { customModel } from "@/lib/ai";

export async function POST(request: Request) {
	const {
		id,
		messages,
		selectedFilePathnames,
		similarityThreshold = 1.0,
	} = await request.json();

	const session = await auth();

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	// Convert UIMessages to ModelMessages
	const modelMessages = convertToModelMessages(messages);

	// Save user messages to database before streaming
	await createMessage({
		id,
		messages,
		author: session.user?.email ?? "",
	});

	// Implement RAG if files are selected
	if (selectedFilePathnames?.length > 0) {
		const lastMessage = modelMessages[modelMessages.length - 1];

		if (lastMessage && lastMessage.role === "user") {
			const lastUserMessageContent = Array.isArray(lastMessage.content)
				? lastMessage.content
						.filter((content) => content.type === "text")
						.map((content) => content.text)
						.join("\n")
				: lastMessage.content;

			// Find relevant chunks using database-level similarity search
			const similarChunks = await findSimilarChunksByFilePaths({
				query: lastUserMessageContent,
				filePaths: selectedFilePathnames.map(
					(path: string) => `${session.user?.email}/${path}`,
				),
				limit: 10,
				similarityThreshold,
			});

			// Inject context into messages if we found relevant chunks
			if (similarChunks.length > 0) {
				const contextText = [
					"Here is some relevant information that you can use to answer the question:",
					...similarChunks.map((chunk) => chunk.content),
				].join("\n\n");

				modelMessages.push({
					role: "system",
					content: contextText,
				});
			}
		}
	}

	const result = streamText({
		model: customModel,
		system:
			"you are a friendly assistant! keep your responses concise and helpful.",
		messages: modelMessages,
		experimental_telemetry: {
			isEnabled: true,
			functionId: "stream-text",
		},
	});

	return result.toUIMessageStreamResponse({
		originalMessages: messages,
		generateMessageId: () => crypto.randomUUID(),
		onFinish: async ({ messages: allMessages }) => {
			await createMessage({
				id,
				messages: allMessages,
				author: session.user?.email ?? "",
			});
		},
	});
}
