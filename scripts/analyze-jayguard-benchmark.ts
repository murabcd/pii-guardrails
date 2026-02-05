#!/usr/bin/env bun

/**
 * Analyze JayGuard NER Benchmark Dataset
 *
 * This script analyzes the just-ai/jayguard-ner-benchmark dataset to:
 * - Understand entity types and distribution
 * - Extract examples for each entity type
 * - Generate test cases for our PII detection system
 */

import * as fs from "node:fs";
import * as path from "node:path";

// For reading parquet files in Bun, we'll use a Python script
// or convert to JSON first. Let's create a helper.

interface BenchmarkSample {
	tokens: string[];
	ner_tags: string[];
}

interface EntityExample {
	text: string;
	entity_type: string;
	tokens: string[];
	context: string;
}

interface BenchmarkAnalysis {
	totalSamples: number;
	totalTokens: number;
	entityTypes: Record<string, number>;
	examples: Record<string, EntityExample[]>;
	statistics: {
		avgTokensPerSample: number;
		avgEntitiesPerSample: number;
		entityCoverage: number;
	};
}

/**
 * Convert BIO tags to readable entity types
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
): Array<{
	text: string;
	entityType: string;
	startIdx: number;
	endIdx: number;
}> {
	const entities: Array<{
		text: string;
		entityType: string;
		startIdx: number;
		endIdx: number;
	}> = [];
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
				// Save previous entity
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
 * Analyze the benchmark dataset
 */
async function analyzeBenchmark(): Promise<BenchmarkAnalysis> {
	console.log("📊 Analyzing JayGuard NER Benchmark Dataset...\n");

	// First, we need to convert parquet to JSON
	// Let's use a Python subprocess for this
	const parquetPath = path.join(
		process.cwd(),
		"scripts",
		"train-00000-of-00001.parquet",
	);
	const jsonPath = path.join(
		process.cwd(),
		"scripts",
		"jayguard-benchmark.json",
	);

	// Check if JSON already exists
	if (!fs.existsSync(jsonPath)) {
		console.log("Converting Parquet to JSON using Python...");
		const pythonScript = `
import pandas as pd
import json

df = pd.read_parquet("${parquetPath}")
df.to_json("${jsonPath}", orient="records", lines=True)
print(f"Converted {len(df)} samples")
`;

		const tmpPython = path.join(process.cwd(), "scripts", "convert_parquet.py");
		fs.writeFileSync(tmpPython, pythonScript);

		try {
			const proc = Bun.spawn(["python3", tmpPython], {
				stdout: "inherit",
				stderr: "inherit",
			});
			await proc.exited;
			fs.unlinkSync(tmpPython);
		} catch (_error) {
			console.error("Failed to convert parquet. Installing pandas...");
			// Try with pip install
			const installProc = Bun.spawn(["pip3", "install", "pandas", "pyarrow"], {
				stdout: "inherit",
				stderr: "inherit",
			});
			await installProc.exited;

			const proc = Bun.spawn(["python3", tmpPython], {
				stdout: "inherit",
				stderr: "inherit",
			});
			await proc.exited;
			fs.unlinkSync(tmpPython);
		}
	}

	// Read JSON lines
	const jsonContent = fs.readFileSync(jsonPath, "utf-8");
	const samples: BenchmarkSample[] = jsonContent
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));

	console.log(`Loaded ${samples.length} samples\n`);

	// Analyze
	const analysis: BenchmarkAnalysis = {
		totalSamples: samples.length,
		totalTokens: 0,
		entityTypes: {},
		examples: {},
		statistics: {
			avgTokensPerSample: 0,
			avgEntitiesPerSample: 0,
			entityCoverage: 0,
		},
	};

	let totalEntities = 0;
	let samplesWithEntities = 0;

	for (const sample of samples) {
		analysis.totalTokens += sample.tokens.length;

		// Extract entities
		const entities = extractEntities(sample.tokens, sample.ner_tags);

		if (entities.length > 0) {
			samplesWithEntities++;
			totalEntities += entities.length;
		}

		// Count entity types and collect examples
		for (const entity of entities) {
			const entityType = entity.entityType;

			// Count
			if (!analysis.entityTypes[entityType]) {
				analysis.entityTypes[entityType] = 0;
				analysis.examples[entityType] = [];
			}
			analysis.entityTypes[entityType]++;

			// Save examples (first 5 per type)
			if (analysis.examples[entityType].length < 5) {
				const contextStart = Math.max(0, entity.startIdx - 3);
				const contextEnd = Math.min(sample.tokens.length, entity.endIdx + 4);
				const context = sample.tokens.slice(contextStart, contextEnd).join(" ");

				analysis.examples[entityType].push({
					text: entity.text,
					entity_type: entityType,
					tokens: entity.text.split(" "),
					context: context,
				});
			}
		}
	}

	// Calculate statistics
	analysis.statistics.avgTokensPerSample =
		analysis.totalTokens / samples.length;
	analysis.statistics.avgEntitiesPerSample = totalEntities / samples.length;
	analysis.statistics.entityCoverage = samplesWithEntities / samples.length;

	return analysis;
}

/**
 * Format and print analysis report
 */
function printReport(analysis: BenchmarkAnalysis): void {
	console.log("=".repeat(80));
	console.log("JAYGUARD NER BENCHMARK ANALYSIS REPORT");
	console.log("=".repeat(80));
	console.log("");

	// Overall statistics
	console.log("## Dataset Overview");
	console.log(`Total Samples:           ${analysis.totalSamples}`);
	console.log(`Total Tokens:            ${analysis.totalTokens}`);
	console.log(
		`Avg Tokens/Sample:       ${analysis.statistics.avgTokensPerSample.toFixed(2)}`,
	);
	console.log(
		`Avg Entities/Sample:     ${analysis.statistics.avgEntitiesPerSample.toFixed(2)}`,
	);
	console.log(
		`Entity Coverage:         ${(analysis.statistics.entityCoverage * 100).toFixed(2)}%`,
	);
	console.log("");

	// Entity types distribution
	console.log("## Entity Types Distribution");
	const sortedTypes = Object.entries(analysis.entityTypes).sort(
		(a, b) => b[1] - a[1],
	);

	console.log(
		`${"Entity Type".padEnd(30)} ${"Count".padEnd(10)} ${"Percentage".padEnd(10)}`,
	);
	console.log("-".repeat(80));

	const totalEntities = Object.values(analysis.entityTypes).reduce(
		(sum, count) => sum + count,
		0,
	);

	for (const [entityType, count] of sortedTypes) {
		const percentage = ((count / totalEntities) * 100).toFixed(2);
		console.log(
			`${entityType.padEnd(30)} ${count.toString().padEnd(10)} ${percentage.padEnd(10)}%`,
		);
	}
	console.log("");

	// Examples for each entity type
	console.log("## Examples by Entity Type");
	console.log("");

	for (const [entityType, examples] of Object.entries(analysis.examples)) {
		console.log(`### ${entityType}`);
		console.log(`Total occurrences: ${analysis.entityTypes[entityType]}`);
		console.log("");

		for (let i = 0; i < Math.min(3, examples.length); i++) {
			const example = examples[i];
			console.log(`  ${i + 1}. Entity: "${example.text}"`);
			console.log(`     Context: "${example.context}"`);
			console.log("");
		}
	}

	console.log("=".repeat(80));
}

/**
 * Generate test cases from benchmark
 */
function generateTestCases(analysis: BenchmarkAnalysis): void {
	console.log("\n## Mapping to Your PII Detection System\n");

	// Map JayGuard entity types to your system's types
	const typeMapping: Record<string, string> = {
		PERSON: "RUSSIAN_NAME",
		"B-PERSON": "RUSSIAN_NAME",
		"I-PERSON": "RUSSIAN_NAME",
		PHONE: "NUMBER",
		"B-PHONE": "NUMBER",
		"I-PHONE": "NUMBER",
		EMAIL: "EMAIL",
		"B-EMAIL": "EMAIL",
		"I-EMAIL": "EMAIL",
		STREET_ADDRESS: "Not covered (ADDRESS)",
		"B-STREET_ADDRESS": "Not covered (ADDRESS)",
		"I-STREET_ADDRESS": "Not covered (ADDRESS)",
		GPE: "Not covered (LOCATION)",
		"B-GPE": "Not covered (LOCATION)",
		"I-GPE": "Not covered (LOCATION)",
	};

	console.log("Entity Type Mapping:");
	console.log(`${"JayGuard Type".padEnd(30)} -> ${"Your System".padEnd(30)}`);
	console.log("-".repeat(70));

	for (const jayguardType of Object.keys(analysis.entityTypes)) {
		const yourType = typeMapping[jayguardType] || "Unknown";
		console.log(`${jayguardType.padEnd(30)} -> ${yourType.padEnd(30)}`);
	}

	console.log("\n");
	console.log("⚠️  Entity Types NOT Covered by Your System:");

	const notCovered = Object.keys(analysis.entityTypes).filter(
		(type) => !typeMapping[type] || typeMapping[type].startsWith("Not covered"),
	);

	for (const type of notCovered) {
		const count = analysis.entityTypes[type];
		console.log(`  - ${type}: ${count} occurrences`);
		if (analysis.examples[type] && analysis.examples[type].length > 0) {
			console.log(`    Example: "${analysis.examples[type][0].text}"`);
		}
	}

	console.log("\n");
}

/**
 * Save analysis to JSON
 */
async function saveAnalysis(
	analysis: BenchmarkAnalysis,
	filename: string = "jayguard-analysis.json",
): Promise<void> {
	const outputPath = path.join(process.cwd(), "scripts", filename);
	await Bun.write(outputPath, JSON.stringify(analysis, null, 2));
	console.log(`\n📄 Analysis saved to: ${outputPath}`);
}

/**
 * Main execution
 */
async function main() {
	try {
		const analysis = await analyzeBenchmark();
		printReport(analysis);
		generateTestCases(analysis);
		await saveAnalysis(analysis);

		console.log("\n✅ Analysis complete!");
		console.log("\nNext steps:");
		console.log(
			"1. Review entity types your system doesn't cover (STREET_ADDRESS, GPE, etc.)",
		);
		console.log("2. Decide which types to add to your PII detection");
		console.log(
			"3. Extract test cases from this benchmark to expand your evaluation",
		);
		console.log(
			"4. Run your detector against this dataset to measure real-world performance",
		);
	} catch (error) {
		console.error("Error during analysis:", error);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
