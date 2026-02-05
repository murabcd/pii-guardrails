import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";

export async function GET(request: Request) {
	const session = await auth();

	if (!session) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	const { user } = session;

	if (!user || !user.email) {
		return NextResponse.redirect(new URL("/login", request.url));
	}

	try {
		const { blobs } = await list({ prefix: user.email });

		const result = blobs.map((blob) => ({
			...blob,
			pathname: blob.pathname.replace(`${user.email}/`, ""),
		}));

		return Response.json(result);
	} catch (error) {
		console.error("❌ Error fetching blobs:", error);
		return Response.json({ error: "Failed to fetch files" }, { status: 500 });
	}
}
