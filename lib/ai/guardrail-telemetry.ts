/**
 * Telemetry tracking for guardrail detections
 * Helps identify false positives/negatives and improve detection accuracy
 * All data stored is anonymized and contains no PII
 */

import type { GuardrailEntityType } from "./guardrails";

export interface GuardrailDetectionEvent {
	timestamp: number;
	detected: boolean;
	entityTypes: GuardrailEntityType[];
	entityCounts: Record<GuardrailEntityType, number>;
	textLength: number;
	maskedLength: number;
	context: "user_message" | "rag_chunk" | "middleware" | "other";
	sessionId?: string;
}

export interface GuardrailTelemetryStats {
	totalDetections: number;
	detectionsByType: Record<GuardrailEntityType, number>;
	detectionsByContext: Record<string, number>;
	averageTextLength: number;
	averageMaskingRate: number; // percentage of text masked
	lastDetectionTime: number | null;
}

/**
 * In-memory telemetry store (consider persisting to database in production)
 */
class GuardrailTelemetry {
	private events: GuardrailDetectionEvent[] = [];
	private maxEvents = 1000; // Keep last 1000 events in memory

	/**
	 * Track a guardrail detection event
	 */
	track(event: Omit<GuardrailDetectionEvent, "timestamp">): void {
		const fullEvent: GuardrailDetectionEvent = {
			...event,
			timestamp: Date.now(),
		};

		this.events.push(fullEvent);

		// Keep only the most recent events
		if (this.events.length > this.maxEvents) {
			this.events.shift();
		}
	}

	/**
	 * Get telemetry statistics
	 */
	getStats(): GuardrailTelemetryStats {
		if (this.events.length === 0) {
			return {
				totalDetections: 0,
				detectionsByType: {
					RUSSIAN_NAME: 0,
					NUMBER: 0,
					EMAIL: 0,
				},
				detectionsByContext: {},
				averageTextLength: 0,
				averageMaskingRate: 0,
				lastDetectionTime: null,
			};
		}

		const detectionsByType: Record<GuardrailEntityType, number> = {
			RUSSIAN_NAME: 0,
			NUMBER: 0,
			EMAIL: 0,
		};

		const detectionsByContext: Record<string, number> = {};
		let totalTextLength = 0;
		let totalMaskingRate = 0;
		let detectionsWithMasking = 0;

		for (const event of this.events) {
			if (event.detected) {
				for (const type of event.entityTypes) {
					detectionsByType[type] = (detectionsByType[type] || 0) + 1;
				}
			}

			detectionsByContext[event.context] =
				(detectionsByContext[event.context] || 0) + 1;

			totalTextLength += event.textLength;

			if (event.textLength > 0) {
				const maskingRate =
					((event.textLength - event.maskedLength) / event.textLength) * 100;
				totalMaskingRate += maskingRate;
				detectionsWithMasking++;
			}
		}

		return {
			totalDetections: this.events.filter((e) => e.detected).length,
			detectionsByType,
			detectionsByContext,
			averageTextLength:
				this.events.length > 0 ? totalTextLength / this.events.length : 0,
			averageMaskingRate:
				detectionsWithMasking > 0
					? totalMaskingRate / detectionsWithMasking
					: 0,
			lastDetectionTime:
				this.events.length > 0
					? (this.events[this.events.length - 1]?.timestamp ?? null)
					: null,
		};
	}

	/**
	 * Get recent detection events (for debugging/monitoring)
	 * Returns only metadata, no actual text content
	 */
	getRecentEvents(limit = 10): GuardrailDetectionEvent[] {
		return this.events.slice(-limit);
	}

	/**
	 * Clear all telemetry data
	 */
	clear(): void {
		this.events = [];
	}

	/**
	 * Export telemetry data (for analysis/reporting)
	 */
	export(): GuardrailDetectionEvent[] {
		return [...this.events];
	}
}

// Singleton instance
export const telemetry = new GuardrailTelemetry();

/**
 * Helper to track detection from detection result
 */
export function trackDetection(
	detected: boolean,
	entityTypes: GuardrailEntityType[],
	entityCounts: Record<GuardrailEntityType, number>,
	textLength: number,
	maskedLength: number,
	context: GuardrailDetectionEvent["context"],
	sessionId?: string,
): void {
	telemetry.track({
		detected,
		entityTypes,
		entityCounts,
		textLength,
		maskedLength,
		context,
		sessionId,
	});
}
