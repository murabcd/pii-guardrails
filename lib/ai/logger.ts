/**
 * Safe logger for guardrail operations
 * Only logs in development environment to prevent PII leakage
 * Supports log level control via GUARDRAIL_LOG_LEVEL environment variable
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "none";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	none: 4,
};

/**
 * Get the configured log level from environment
 * Defaults to 'none' in production, 'info' in development
 */
function getLogLevel(): LogLevel {
	const isDevelopment = process.env.NODE_ENV === "development";
	const envLogLevel = process.env.GUARDRAIL_LOG_LEVEL as LogLevel;

	// In production, default to 'none' unless explicitly set
	if (!isDevelopment && !envLogLevel) {
		return "none";
	}

	// Validate log level
	if (envLogLevel && envLogLevel in LOG_LEVELS) {
		return envLogLevel;
	}

	// Default to 'info' in development
	return isDevelopment ? "info" : "none";
}

const currentLogLevel = getLogLevel();

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * Safe data sanitization - removes potentially sensitive information
 * Only include metadata, never actual text content
 */
function sanitizeLogData(
	data: Record<string, unknown>,
): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};

	// Allowed keys that are safe to log
	const safeKeys = [
		"requestId",
		"userEmail",
		"route",
		"method",
		"status_code",
		"outcome",
		"duration_ms",
		"detected",
		"entityTypes",
		"guardrailEntities",
		"entityCounts",
		"textLength",
		"maskedLength",
		"hasGuardrails",
		"hasTokenVault",
		"tokenVaultSize",
		"maskedMessageDetected",
		"maskedChunks",
		"chunksFound",
		"unmaskedChunks",
		"messageCount",
		"totalMessages",
		"maskedMessages",
		"fileCount",
		"similarityThreshold",
		"instructionLength",
		"promptLength",
		"guardrailMaskingEnabled",
		"hasGuardrailMiddleware",
		"hasGuardrailInstructions",
		"type",
		"modelMessagesCount",
		// Reranker-specific keys
		"documentCount",
		"topN",
		"queryLength",
		"resultsCount",
		"tokensUsed",
		"originalCount",
		"rerankedCount",
		"originalPosition",
		"newPosition",
		"relevanceScore",
		"originalSimilarity",
		"error",
		// Hybrid search keys
		"useHybrid",
		"hasMetadataFilter",
		"hasVectorScores",
		"hasFtsRanks",
		// Chunking keys
		"originalLength",
		"cleanedLength",
		"estimatedTokens",
		"chunkCount",
		"averageChunkSize",
		"averageTokensPerChunk",
	];

	for (const [key, value] of Object.entries(data)) {
		if (safeKeys.includes(key)) {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

/**
 * Guardrail-specific logger that only logs in development
 * Automatically sanitizes data to prevent PII leakage
 */
export const guardrailLogger = {
	debug: (message: string, data?: Record<string, unknown>) => {
		if (!shouldLog("debug")) return;
		const sanitized = data ? sanitizeLogData(data) : {};
		console.debug(`[Guardrail Debug] ${message}`, sanitized);
	},

	info: (message: string, data?: Record<string, unknown>) => {
		if (!shouldLog("info")) return;
		const sanitized = data ? sanitizeLogData(data) : {};
		console.info(`[Guardrail Info] ${message}`, sanitized);
	},

	warn: (message: string, data?: Record<string, unknown>) => {
		if (!shouldLog("warn")) return;
		const sanitized = data ? sanitizeLogData(data) : {};
		console.warn(`[Guardrail Warning] ${message}`, sanitized);
	},

	error: (message: string, error?: unknown, data?: Record<string, unknown>) => {
		if (!shouldLog("error")) return;
		const sanitized = data ? sanitizeLogData(data) : {};
		console.error(`[Guardrail Error] ${message}`, error, sanitized);
	},

	/**
	 * Development-only logging with full data (use sparingly)
	 * This will NEVER log in production regardless of log level
	 */
	devOnly: (message: string, data?: unknown) => {
		if (process.env.NODE_ENV === "development") {
			console.log(`[Guardrail Dev] ${message}`, data);
		}
	},

	/**
	 * Check if a specific log level is enabled
	 */
	isEnabled: (level: LogLevel): boolean => {
		return shouldLog(level);
	},
};

/**
 * Export for testing and configuration inspection
 */
export const getGuardrailLogConfig = () => ({
	level: currentLogLevel,
	isDevelopment: process.env.NODE_ENV === "development",
	isProduction: process.env.NODE_ENV === "production",
});
