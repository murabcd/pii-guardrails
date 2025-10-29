import { eq } from "drizzle-orm";
import { auth } from "@/app/(auth)/auth";
import { db, getChatsByUser } from "@/lib/db/db";
import { chat } from "@/lib/db/schema";

export async function GET() {
	const session = await auth();

	if (!session || !session.user || !session.user.email) {
		return Response.json("Unauthorized!", { status: 401 });
	}

	const chats = await getChatsByUser({ email: session.user.email });
	return Response.json(chats);
}

export async function DELETE() {
	const session = await auth();

	if (!session || !session.user || !session.user.email) {
		return Response.json("Unauthorized!", { status: 401 });
	}

	try {
		await db.delete(chat).where(eq(chat.author, session.user.email));
		return Response.json({ success: true });
	} catch (error) {
		console.error("Error deleting all chats:", error);
		return Response.json("Internal server error", { status: 500 });
	}
}
