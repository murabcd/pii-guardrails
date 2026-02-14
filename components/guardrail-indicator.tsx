"use client";

import { CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import type { GuardrailUiSummary } from "@/lib/ai/guardrail-ui";
import { cn } from "@/lib/utils";

const ENTITY_LABELS: Record<string, string> = {
	RUSSIAN_NAME: "Name",
	NUMBER: "Number",
	EMAIL: "Email",
};

function formatCounts(summary: GuardrailUiSummary) {
	return Object.entries(summary.entityCounts)
		.filter(([, count]) => count > 0)
		.map(([key, count]) => `${ENTITY_LABELS[key] ?? key} ${count}`)
		.join(" · ");
}

export function GuardrailIndicator({
	summary,
}: {
	summary: GuardrailUiSummary;
}) {
	const status = summary.status;
	const label =
		status === "pending" ? "Pending" : status === "pass" ? "Pass" : "Fail";
	const Icon =
		status === "pending"
			? Clock3
			: status === "pass"
				? CheckCircle2
				: ShieldAlert;
	const tone =
		status === "pending"
			? "text-muted-foreground"
			: status === "pass"
				? "text-green-600"
				: "text-rose-600";

	return (
		<div className={cn("inline-flex items-center gap-2 text-xs", tone)}>
			<span className="text-foreground/80">Guardrail:</span>
			<Icon
				size={14}
				className={cn("shrink-0", status === "pending" ? "animate-spin" : "")}
			/>
			<span className="font-medium">{label}</span>
			{status === "fail" && summary.detected ? (
				<span className="opacity-80">{formatCounts(summary)}</span>
			) : null}
		</div>
	);
}
