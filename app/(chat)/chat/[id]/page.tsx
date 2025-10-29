import { notFound } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { getChatById } from "@/lib/db/db";
import { Chat as PreviewChat } from "@/components/chat";
import type { Chat } from "@/lib/db/schema";

export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const chatFromDb = await getChatById({ id });

	if (!chatFromDb) {
		notFound();
	}

	// type casting
	const chat: Chat = {
		...chatFromDb,
		messages: chatFromDb.messages
			? typeof chatFromDb.messages === "string"
				? JSON.parse(chatFromDb.messages)
				: chatFromDb.messages
			: [],
	};

	const session = await auth();

	if (chat.author !== session?.user?.email) {
		notFound();
	}

	return (
		<PreviewChat
			id={chat.id}
			initialMessages={chat.messages}
			session={session}
		/>
	);
}
