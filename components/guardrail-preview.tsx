"use client";

import { AlertCircle, Eye, EyeOff, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { GuardrailEntityType } from "@/lib/ai/guardrails";
import { detectAndMask } from "@/lib/ai/guardrails";

interface GuardrailPreviewProps {
	text: string;
	enabledEntities: GuardrailEntityType[];
	userEmail?: string;
}

/**
 * Component to preview PII masking before sending message
 * Shows detected entities and masked text preview
 */
export function GuardrailPreview({
	text,
	enabledEntities,
	userEmail,
}: GuardrailPreviewProps) {
	const [isOpen, setIsOpen] = useState(false);

	// Don't show preview if no entities enabled or text is empty
	if (enabledEntities.length === 0 || !text.trim()) {
		return null;
	}

	// Detect and mask PII
	const result = detectAndMask(text, enabledEntities, userEmail, "other");

	// Don't show preview if no PII detected
	if (!result.detected) {
		return null;
	}

	// Count detected entities
	const entityCounts = {
		RUSSIAN_NAME: result.detected_entities.RUSSIAN_NAME?.length ?? 0,
		NUMBER: result.detected_entities.NUMBER?.length ?? 0,
		EMAIL: result.detected_entities.EMAIL?.length ?? 0,
	};

	const totalDetected = Object.values(entityCounts).reduce(
		(sum, count) => sum + count,
		0,
	);

	const entityLabels: Record<GuardrailEntityType, string> = {
		RUSSIAN_NAME: "Russian Names",
		NUMBER: "Phone Numbers",
		EMAIL: "Email Addresses",
	};

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<div className="rounded-md border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20 p-3">
				<div className="flex items-start gap-3">
					<Shield className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
					<div className="flex-1 min-w-0">
						<div className="flex items-center justify-between gap-2">
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm font-medium text-orange-900 dark:text-orange-100">
									PII Detected: {totalDetected} item{totalDetected !== 1 ? "s" : ""}
								</span>
								{Object.entries(entityCounts).map(([type, count]) => {
									if (count === 0) return null;
									return (
										<Badge
											key={type}
											variant="outline"
											className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
										>
											{entityLabels[type as GuardrailEntityType]}: {count}
										</Badge>
									);
								})}
							</div>
							<CollapsibleTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-900/30"
								>
									{isOpen ? (
										<EyeOff className="h-4 w-4" />
									) : (
										<Eye className="h-4 w-4" />
									)}
									<span className="sr-only">
										{isOpen ? "Hide" : "Show"} masked preview
									</span>
								</Button>
							</CollapsibleTrigger>
						</div>
						<p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
							This information will be masked before sending to the AI
						</p>
					</div>
				</div>

				<CollapsibleContent className="mt-3">
					<div className="rounded-md border border-orange-200 dark:border-orange-800 bg-white dark:bg-orange-950/40 p-3">
						<div className="flex items-center gap-2 mb-2">
							<AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
							<span className="text-xs font-medium text-orange-900 dark:text-orange-100">
								Masked Preview
							</span>
						</div>
						<div className="text-sm text-orange-900 dark:text-orange-100 whitespace-pre-wrap break-words font-mono">
							{result.checked_text}
						</div>
						<p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
							Placeholders like <code>&lt;NUMBER&gt;</code>,{" "}
							<code>&lt;EMAIL&gt;</code>, and{" "}
							<code>&lt;RUSSIAN_NAME&gt;</code> will replace your sensitive
							data.
						</p>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}
