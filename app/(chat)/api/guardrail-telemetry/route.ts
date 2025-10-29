import { auth } from "@/app/(auth)/auth";
import { telemetry } from "@/lib/ai/guardrail-telemetry";

/**
 * GET endpoint to retrieve guardrail telemetry statistics
 * Only accessible to authenticated users
 * Returns aggregated stats without any PII
 */
export async function GET() {
	const session = await auth();

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	const stats = telemetry.getStats();

	return Response.json({
		success: true,
		data: stats,
		timestamp: Date.now(),
	});
}

/**
 * DELETE endpoint to clear telemetry data
 * Only accessible to authenticated users
 * Useful for resetting stats during testing or privacy compliance
 */
export async function DELETE() {
	const session = await auth();

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	telemetry.clear();

	return Response.json({
		success: true,
		message: "Telemetry data cleared successfully",
		timestamp: Date.now(),
	});
}
