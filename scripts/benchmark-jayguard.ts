#!/usr/bin/env bun

/**
 * JayGuard NER Benchmark Evaluation
 *
 * This script evaluates your PII detection system against the JayGuard benchmark.
 * It measures real-world performance on 850 Russian conversation samples.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { GuardrailEntityType } from "../lib/ai/guardrails";
import { detectAndMask } from "../lib/ai/guardrails";

interface BenchmarkSample {
	tokens: string[];
	ner_tags: string[];
}

interface GroundTruthEntity {
	text: string;
	entityType: string;
	startIdx: number;
	endIdx: number;
}

interface DetectionResult {
	sampleId: number;
	originalText: string;
	groundTruth: GroundTruthEntity[];
	detected: Partial<Record<GuardrailEntityType, string[]>>;
	truePositives: string[];
	falsePositives: string[];
	falseNegatives: string[];
	matched: boolean;
}

interface EntityMetrics {
	truePositives: number;
	falsePositives: number;
	falseNegatives: number;
	precision: number;
	recall: number;
	f1Score: number;
}

interface BenchmarkResults {
	totalSamples: number;
	samplesProcessed: number;
	overallMetrics: EntityMetrics;
	byEntityType: Record<string, EntityMetrics>;
	mappedTypes: Record<GuardrailEntityType, EntityMetrics>;
	detailedResults: DetectionResult[];
	failureExamples: Array<{
		type: "false_negative" | "false_positive";
		entityType: string;
		text: string;
		context: string;
	}>;
}

/**
 * Entity type mapping from JayGuard to your system
 */
const ENTITY_TYPE_MAPPING: Record<string, GuardrailEntityType | null> = {
	PER: "RUSSIAN_NAME", // Person names (lowercase/mixed)
	PERSON: "RUSSIAN_NAME", // Person names (proper case)
	PHONE: "NUMBER", // Phone numbers
	EMAIL: "EMAIL", // Email addresses
	STREET_ADDRESS: null, // Not supported yet
	GPE: null, // Locations - not supported
	PUBLIC_PERSON: null, // Famous people - may not need masking
	PUBLIC_PER: null, // Famous people - may not need masking
	PER_PUBLIC: null, // Famous people - may not need masking
	PUBLIC_PLACES: null, // Public landmarks - may not need masking
	THEO: null, // Theoretical concepts - not PII
	FICT: null, // Fictional entities - not PII
	PET: null, // Pet names - may not be sensitive PII
};

/**
 * Parse BIO tag into prefix and entity type
 */
function parseBIOTag(tag: string): { prefix: string; entityType: string } {
	if (tag === "O" || tag === "0") {
		return { prefix: "O", entityType: "O" };
	}
	const parts = tag.split("-");
	if (parts.length === 2) {
		return { prefix: parts[0], entityType: parts[1] };
	}
	return { prefix: "O", entityType: "O" };
}

/**
 * Extract entities from BIO-tagged sequence
 */
function extractEntities(
	tokens: string[],
	tags: string[],
): GroundTruthEntity[] {
	const entities: GroundTruthEntity[] = [];
	let currentEntity: {
		tokens: string[];
		entityType: string;
		startIdx: number;
	} | null = null;

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const tag = tags[i];
		const { prefix, entityType } = parseBIOTag(tag);

		if (prefix === "B") {
			// Start of new entity
			if (currentEntity) {
				entities.push({
					text: currentEntity.tokens.join(" "),
					entityType: currentEntity.entityType,
					startIdx: currentEntity.startIdx,
					endIdx: i - 1,
				});
			}
			currentEntity = {
				tokens: [token],
				entityType: entityType,
				startIdx: i,
			};
		} else if (prefix === "I" && currentEntity) {
			// Continue current entity
			currentEntity.tokens.push(token);
		} else {
			// O tag or mismatch - end current entity
			if (currentEntity) {
				entities.push({
					text: currentEntity.tokens.join(" "),
					entityType: currentEntity.entityType,
					startIdx: currentEntity.startIdx,
					endIdx: i - 1,
				});
				currentEntity = null;
			}
		}
	}

	// Don't forget last entity
	if (currentEntity) {
		entities.push({
			text: currentEntity.tokens.join(" "),
			entityType: currentEntity.entityType,
			startIdx: currentEntity.startIdx,
			endIdx: tokens.length - 1,
		});
	}

	return entities;
}

/**
 * Normalize text for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeText(text: string): string {
	return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Check if detected entity matches ground truth entity
 */
function entitiesMatch(detected: string, groundTruth: string): boolean {
	const detectedNorm = normalizeText(detected);
	const groundTruthNorm = normalizeText(groundTruth);

	// Exact match
	if (detectedNorm === groundTruthNorm) {
		return true;
	}

	// Check if one contains the other (partial match)
	if (
		detectedNorm.includes(groundTruthNorm) ||
		groundTruthNorm.includes(detectedNorm)
	) {
		return true;
	}

	return false;
}

/**
 * Evaluate a single sample
 */
function evaluateSample(
	sampleId: number,
	sample: BenchmarkSample,
): DetectionResult {
	// Reconstruct text from tokens
	const originalText = sample.tokens.join(" ");

	// Extract ground truth entities
	const groundTruth = extractEntities(sample.tokens, sample.ner_tags);

	// Filter to only entities we should detect (based on mapping)
	const relevantGroundTruth = groundTruth.filter(
		(entity) => ENTITY_TYPE_MAPPING[entity.entityType] !== null,
	);

	// Run your detector
	const detectionResult = detectAndMask(
		originalText,
		["RUSSIAN_NAME", "NUMBER", "EMAIL"],
		undefined,
		"other",
	);

	// Collect all detected entities
	const allDetected: Array<{ text: string; type: GuardrailEntityType }> = [];
	for (const [entityType, entities] of Object.entries(
		detectionResult.detected_entities,
	)) {
		for (const entity of entities) {
			allDetected.push({
				text: entity,
				type: entityType as GuardrailEntityType,
			});
		}
	}

	// Match detected against ground truth
	const truePositives: string[] = [];
	const falsePositives: string[] = [];
	const falseNegatives: string[] = [];

	// Check each detected entity
	for (const detected of allDetected) {
		let matched = false;

		for (const gt of relevantGroundTruth) {
			const expectedType = ENTITY_TYPE_MAPPING[gt.entityType];
			if (expectedType === detected.type) {
				if (entitiesMatch(detected.text, gt.text)) {
					truePositives.push(detected.text);
					matched = true;
					break;
				}
			}
		}

		if (!matched) {
			falsePositives.push(`${detected.type}:${detected.text}`);
		}
	}

	// Check each ground truth entity
	for (const gt of relevantGroundTruth) {
		const expectedType = ENTITY_TYPE_MAPPING[gt.entityType];
		if (!expectedType) continue;

		let matched = false;
		for (const detected of allDetected) {
			if (detected.type === expectedType) {
				if (entitiesMatch(detected.text, gt.text)) {
					matched = true;
					break;
				}
			}
		}

		if (!matched) {
			falseNegatives.push(`${gt.entityType}:${gt.text}`);
		}
	}

	return {
		sampleId,
		originalText,
		groundTruth: relevantGroundTruth,
		detected: detectionResult.detected_entities,
		truePositives,
		falsePositives,
		falseNegatives,
		matched: falsePositives.length === 0 && falseNegatives.length === 0,
	};
}

/**
 * Calculate metrics
 */
function calculateMetrics(tp: number, fp: number, fn: number): EntityMetrics {
	const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
	const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
	const f1Score =
		precision + recall > 0
			? (2 * precision * recall) / (precision + recall)
			: 0;

	return {
		truePositives: tp,
		falsePositives: fp,
		falseNegatives: fn,
		precision,
		recall,
		f1Score,
	};
}

/**
 * Run benchmark evaluation
 */
function runBenchmark(samples: BenchmarkSample[]): BenchmarkResults {
	console.log(`\n🚀 Running benchmark on ${samples.length} samples...\n`);

	const detailedResults: DetectionResult[] = [];
	const failureExamples: BenchmarkResults["failureExamples"] = [];

	// Track overall metrics
	let totalTP = 0;
	let totalFP = 0;
	let totalFN = 0;

	// Track by JayGuard entity type
	const byJayGuardType: Record<string, { tp: number; fp: number; fn: number }> =
		{};

	// Track by your system's entity type
	const byYourType: Record<
		GuardrailEntityType,
		{ tp: number; fp: number; fn: number }
	> = {
		RUSSIAN_NAME: { tp: 0, fp: 0, fn: 0 },
		NUMBER: { tp: 0, fp: 0, fn: 0 },
		EMAIL: { tp: 0, fp: 0, fn: 0 },
	};

	// Process each sample
	let processed = 0;
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];
		const result = evaluateSample(i, sample);
		detailedResults.push(result);

		totalTP += result.truePositives.length;
		totalFP += result.falsePositives.length;
		totalFN += result.falseNegatives.length;

		// Track by entity type
		for (const gt of result.groundTruth) {
			const jayguardType = gt.entityType;
			const yourType = ENTITY_TYPE_MAPPING[jayguardType];

			if (!byJayGuardType[jayguardType]) {
				byJayGuardType[jayguardType] = { tp: 0, fp: 0, fn: 0 };
			}

			// Check if this entity was detected
			const wasDetected = result.truePositives.some((tp) =>
				entitiesMatch(tp, gt.text),
			);

			if (wasDetected) {
				byJayGuardType[jayguardType].tp++;
				if (yourType) {
					byYourType[yourType].tp++;
				}
			} else {
				byJayGuardType[jayguardType].fn++;
				if (yourType) {
					byYourType[yourType].fn++;
				}

				// Collect failure example
				if (failureExamples.length < 50) {
					const contextTokens = sample.tokens.slice(
						Math.max(0, gt.startIdx - 5),
						Math.min(sample.tokens.length, gt.endIdx + 6),
					);
					failureExamples.push({
						type: "false_negative",
						entityType: jayguardType,
						text: gt.text,
						context: contextTokens.join(" "),
					});
				}
			}
		}

		// Track false positives by type
		for (const fp of result.falsePositives) {
			const [typeStr, text] = fp.split(":");
			const yourType = typeStr as GuardrailEntityType;
			if (yourType in byYourType) {
				byYourType[yourType].fp++;
			}

			// Collect failure example
			if (failureExamples.length < 50) {
				failureExamples.push({
					type: "false_positive",
					entityType: yourType,
					text: text,
					context: result.originalText.substring(0, 200),
				});
			}
		}

		processed++;
		if (processed % 100 === 0) {
			console.log(`  Processed ${processed}/${samples.length} samples...`);
		}
	}

	// Calculate final metrics
	const overallMetrics = calculateMetrics(totalTP, totalFP, totalFN);

	const byEntityType: Record<string, EntityMetrics> = {};
	for (const [entityType, counts] of Object.entries(byJayGuardType)) {
		byEntityType[entityType] = calculateMetrics(
			counts.tp,
			counts.fp,
			counts.fn,
		);
	}

	const mappedTypes: Record<GuardrailEntityType, EntityMetrics> = {
		RUSSIAN_NAME: calculateMetrics(
			byYourType.RUSSIAN_NAME.tp,
			byYourType.RUSSIAN_NAME.fp,
			byYourType.RUSSIAN_NAME.fn,
		),
		NUMBER: calculateMetrics(
			byYourType.NUMBER.tp,
			byYourType.NUMBER.fp,
			byYourType.NUMBER.fn,
		),
		EMAIL: calculateMetrics(
			byYourType.EMAIL.tp,
			byYourType.EMAIL.fp,
			byYourType.EMAIL.fn,
		),
	};

	return {
		totalSamples: samples.length,
		samplesProcessed: processed,
		overallMetrics,
		byEntityType,
		mappedTypes,
		detailedResults,
		failureExamples,
	};
}

/**
 * Format and print benchmark report
 */
function printReport(results: BenchmarkResults): void {
	console.log(`\n${"=".repeat(80)}`);
	console.log("JAYGUARD BENCHMARK EVALUATION REPORT");
	console.log("=".repeat(80));
	console.log("");

	// Overall performance
	console.log("## Overall Performance");
	console.log(`Total Samples:       ${results.totalSamples}`);
	console.log(`Samples Processed:   ${results.samplesProcessed}`);
	console.log(`True Positives:      ${results.overallMetrics.truePositives}`);
	console.log(`False Positives:     ${results.overallMetrics.falsePositives}`);
	console.log(`False Negatives:     ${results.overallMetrics.falseNegatives}`);
	console.log(
		`Precision:           ${(results.overallMetrics.precision * 100).toFixed(2)}%`,
	);
	console.log(
		`Recall:              ${(results.overallMetrics.recall * 100).toFixed(2)}%`,
	);
	console.log(
		`F1 Score:            ${(results.overallMetrics.f1Score * 100).toFixed(2)}%`,
	);
	console.log("");

	// Performance by your system's entity types
	console.log("## Performance by Your Entity Types");
	console.log(
		`${"Type".padEnd(20)} ${"Precision".padEnd(12)} ${"Recall".padEnd(12)} ${"F1".padEnd(12)} ${"TP/FP/FN"}`,
	);
	console.log("-".repeat(80));

	for (const [entityType, metrics] of Object.entries(results.mappedTypes)) {
		const precision = `${(metrics.precision * 100).toFixed(2)}%`;
		const recall = `${(metrics.recall * 100).toFixed(2)}%`;
		const f1 = `${(metrics.f1Score * 100).toFixed(2)}%`;
		const counts = `${metrics.truePositives}/${metrics.falsePositives}/${metrics.falseNegatives}`;
		console.log(
			`${entityType.padEnd(20)} ${precision.padEnd(12)} ${recall.padEnd(12)} ${f1.padEnd(12)} ${counts}`,
		);
	}
	console.log("");

	// Performance by JayGuard entity types
	console.log("## Performance by JayGuard Entity Types");
	console.log(
		`${"Type".padEnd(20)} ${"Precision".padEnd(12)} ${"Recall".padEnd(12)} ${"F1".padEnd(12)} ${"TP/FP/FN"}`,
	);
	console.log("-".repeat(80));

	const sortedTypes = Object.entries(results.byEntityType).sort(
		(a, b) =>
			b[1].truePositives +
			b[1].falseNegatives -
			(a[1].truePositives + a[1].falseNegatives),
	);

	for (const [entityType, metrics] of sortedTypes) {
		const precision = `${(metrics.precision * 100).toFixed(2)}%`;
		const recall = `${(metrics.recall * 100).toFixed(2)}%`;
		const f1 = `${(metrics.f1Score * 100).toFixed(2)}%`;
		const counts = `${metrics.truePositives}/${metrics.falsePositives}/${metrics.falseNegatives}`;
		const mapped = ENTITY_TYPE_MAPPING[entityType] || "Not mapped";
		console.log(
			`${entityType.padEnd(20)} ${precision.padEnd(12)} ${recall.padEnd(12)} ${f1.padEnd(12)} ${counts}`,
		);
		if (mapped === "Not mapped" || mapped === null) {
			console.log(`  └─ ⚠️  Not covered by your system`);
		} else {
			console.log(`  └─ Mapped to: ${mapped}`);
		}
	}
	console.log("");

	// Baseline comparison
	console.log("## Comparison with Baselines (from JustAI paper)");
	console.log(
		`Your System:         F1 = ${(results.overallMetrics.f1Score * 100).toFixed(2)}%`,
	);
	console.log(`spaCy baseline:      F1 = 73.00%`);
	console.log(`flair baseline:      F1 = 86.00%`);
	console.log(`JustAI final:        F1 = 93.00%`);
	console.log("");

	// Failure examples
	console.log("## Sample Failure Cases");
	console.log("");

	const fnExamples = results.failureExamples
		.filter((e) => e.type === "false_negative")
		.slice(0, 10);
	const fpExamples = results.failureExamples
		.filter((e) => e.type === "false_positive")
		.slice(0, 5);

	if (fnExamples.length > 0) {
		console.log("### False Negatives (Missed Entities)");
		for (let i = 0; i < fnExamples.length; i++) {
			const example = fnExamples[i];
			console.log(`  ${i + 1}. [${example.entityType}] "${example.text}"`);
			console.log(`     Context: "${example.context.substring(0, 100)}..."`);
		}
		console.log("");
	}

	if (fpExamples.length > 0) {
		console.log("### False Positives (Incorrect Detections)");
		for (let i = 0; i < fpExamples.length; i++) {
			const example = fpExamples[i];
			console.log(`  ${i + 1}. [${example.entityType}] "${example.text}"`);
			console.log(`     Context: "${example.context.substring(0, 100)}..."`);
		}
		console.log("");
	}

	console.log("=".repeat(80));
}

/**
 * Provide recommendations based on results
 */
function provideRecommendations(results: BenchmarkResults): void {
	console.log("\n## 📋 Recommendations\n");

	const f1 = results.overallMetrics.f1Score;

	// Overall assessment
	if (f1 >= 0.9) {
		console.log(
			"✅ EXCELLENT: Your system performs at production-grade level!",
		);
	} else if (f1 >= 0.8) {
		console.log(
			"✅ GOOD: Your system shows strong performance, minor improvements needed.",
		);
	} else if (f1 >= 0.7) {
		console.log(
			"⚠️  MODERATE: Your system works but needs significant improvements.",
		);
	} else {
		console.log(
			"❌ NEEDS WORK: Your system requires major improvements before production.",
		);
	}
	console.log("");

	// Specific recommendations
	const missingTypes: string[] = [];
	for (const [jayguardType, metrics] of Object.entries(results.byEntityType)) {
		const mapped = ENTITY_TYPE_MAPPING[jayguardType];
		const totalEntities = metrics.truePositives + metrics.falseNegatives;

		if (!mapped && totalEntities > 50) {
			missingTypes.push(
				`${jayguardType} (${totalEntities} entities, ${((metrics.falseNegatives / totalEntities) * 100).toFixed(0)}% missed)`,
			);
		}
	}

	if (missingTypes.length > 0) {
		console.log("🎯 Priority: Add detection for these entity types:");
		for (const type of missingTypes) {
			console.log(`   - ${type}`);
		}
		console.log("");
	}

	// Type-specific recommendations
	for (const [entityType, metrics] of Object.entries(results.mappedTypes)) {
		if (
			metrics.recall < 0.8 &&
			metrics.truePositives + metrics.falseNegatives > 10
		) {
			console.log(
				`🔍 Low recall for ${entityType}: ${(metrics.recall * 100).toFixed(0)}%`,
			);
			console.log(
				`   Consider: Review detection patterns or add more test cases`,
			);
		}
		if (metrics.precision < 0.9 && metrics.falsePositives > 5) {
			console.log(
				`⚠️  High false positives for ${entityType}: ${metrics.falsePositives} cases`,
			);
			console.log(`   Consider: Tighten detection rules or improve whitelist`);
		}
	}

	console.log("");
}

/**
 * Main execution
 */
async function main() {
	console.log("🚀 JayGuard Benchmark Evaluation\n");

	// Load benchmark data
	const jsonPath = path.join(
		process.cwd(),
		"scripts",
		"jayguard-benchmark.json",
	);

	if (!fs.existsSync(jsonPath)) {
		console.error("❌ Error: jayguard-benchmark.json not found!");
		console.error(
			"   Run: bun run scripts/analyze-jayguard-benchmark.ts first",
		);
		process.exit(1);
	}

	const jsonContent = fs.readFileSync(jsonPath, "utf-8");
	const samples: BenchmarkSample[] = jsonContent
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));

	console.log(`📊 Loaded ${samples.length} benchmark samples`);

	// Run benchmark
	const results = runBenchmark(samples);

	// Print report
	printReport(results);

	// Provide recommendations
	provideRecommendations(results);

	// Save results
	const outputPath = path.join(
		process.cwd(),
		"scripts",
		"jayguard-benchmark-results.json",
	);
	await Bun.write(outputPath, JSON.stringify(results, null, 2));
	console.log(`\n📄 Detailed results saved to: ${outputPath}`);

	console.log("\n✅ Benchmark evaluation complete!\n");
}

if (import.meta.main) {
	main();
}
