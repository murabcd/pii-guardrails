import { auth } from "@/app/(auth)/auth";
import { deleteChat } from "@/app/db";

export async function DELETE(request: Request) {
	const session = await auth();

	if (!session || !session.user || !session.user.email) {
		return Response.json("Unauthorized!", { status: 401 });
	}

	try {
		const { id } = await request.json();

		if (!id) {
			return Response.json("Chat ID is required", { status: 400 });
		}

		await deleteChat({ id });
		return Response.json({ success: true });
	} catch (error) {
		console.error("Error deleting chat:", error);
		return Response.json("Internal server error", { status: 500 });
	}
}

