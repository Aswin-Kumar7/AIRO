/**
 * Zod schema resilience tests — verifies that malformed AI output never crashes
 * the analysis pipeline. All AI response schemas use .catch() fallbacks so
 * partial or invalid JSON always produces a typed result rather than throwing.
 *
 * Run with: npx tsx src/__tests__/ai-schema-resilience.test.ts
 */

import assert from "node:assert/strict";
import { z } from "zod";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
    failed++;
  }
}

/** Mirrors the safeParseJson helper used in ai-features.ts */
function safeParseJson<S extends z.ZodTypeAny>(raw: string, schema: S, fallback: z.infer<S>): z.infer<S> {
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!match) return fallback;
    return schema.parse(JSON.parse(match[0]));
  } catch {
    return fallback;
  }
}

// ─── TopicalCluster schema (mirrors ai-features.ts) ──────────────────────────

const topicalClusterSchema = z.object({
  topic: z.string(),
  productCount: z.number().int().nonnegative().catch(0),
  products: z.array(z.string()).catch([]),
  coverageScore: z.number().min(0).max(100).catch(50),
  gaps: z.array(z.string()).catch([]),
  queryCount: z.number().int().nonnegative().catch(0),
  topQueries: z.array(z.string()).catch([]),
  missingSubtopics: z.array(z.string()).catch([]),
});

const topicalAuthoritySchema = z.array(topicalClusterSchema);

const topicalAuthorityFallback = [] as z.infer<typeof topicalAuthoritySchema>;

// ─── PerceptionResponse schema (mirrors perception-simulator.ts) ──────────────

const perceptionResponseSchema = z.object({
  agentNarrative: z.string().min(1).catch("AI perception data unavailable."),
  perceivedStrengths: z.array(z.string()).catch([]),
  unansweredQuestions: z.array(z.string()).catch([]),
  ambiguities: z.array(z.string()).catch([]),
  overallSentiment: z.enum(["positive", "neutral", "negative"]).catch("neutral"),
});

const perceptionFallback: z.infer<typeof perceptionResponseSchema> = {
  agentNarrative: "AI perception data unavailable.",
  perceivedStrengths: [],
  unansweredQuestions: [],
  ambiguities: [],
  overallSentiment: "neutral",
};

// ─── Tests: TopicalCluster ────────────────────────────────────────────────────

console.log("\nTopicalCluster schema resilience");

test("valid cluster parses correctly", () => {
  const raw = JSON.stringify([{
    topic: "Surfboards",
    productCount: 3,
    products: ["Pro Shortboard", "Longboard Classic"],
    coverageScore: 72,
    gaps: ["No fish boards"],
    queryCount: 450,
    topQueries: ["best beginner surfboard", "shortboard vs longboard"],
    missingSubtopics: ["bodyboards", "foam boards"],
  }]);
  const result = safeParseJson(raw, topicalAuthoritySchema, topicalAuthorityFallback);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.topic, "Surfboards");
  assert.equal(result[0]!.queryCount, 450);
  assert.deepEqual(result[0]!.topQueries, ["best beginner surfboard", "shortboard vs longboard"]);
});

test("missing optional fields fall back to defaults", () => {
  const raw = JSON.stringify([{
    topic: "Wetsuits",
    productCount: 2,
    products: ["Spring Suit"],
    coverageScore: 55,
    gaps: [],
    // queryCount, topQueries, missingSubtopics all missing
  }]);
  const result = safeParseJson(raw, topicalAuthoritySchema, topicalAuthorityFallback);
  assert.equal(result[0]!.queryCount, 0);
  assert.deepEqual(result[0]!.topQueries, []);
  assert.deepEqual(result[0]!.missingSubtopics, []);
});

test("coverageScore clamped to 50 when out of range", () => {
  const raw = JSON.stringify([{
    topic: "Fins",
    productCount: 1,
    products: ["Carbon Fins"],
    coverageScore: 999, // invalid — over 100
    gaps: [],
    queryCount: 10,
    topQueries: [],
    missingSubtopics: [],
  }]);
  const result = safeParseJson(raw, topicalAuthoritySchema, topicalAuthorityFallback);
  assert.equal(result[0]!.coverageScore, 50, "Expected coverageScore to fall back to 50 for out-of-range value");
});

test("empty string returns fallback array", () => {
  const result = safeParseJson("", topicalAuthoritySchema, topicalAuthorityFallback);
  assert.deepEqual(result, []);
});

test("markdown-fenced JSON is unwrapped", () => {
  const raw = "```json\n[{\"topic\":\"Boards\",\"productCount\":1,\"products\":[],\"coverageScore\":60,\"gaps\":[],\"queryCount\":5,\"topQueries\":[],\"missingSubtopics\":[]}]\n```";
  const result = safeParseJson(raw, topicalAuthoritySchema, topicalAuthorityFallback);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.topic, "Boards");
});

test("completely invalid JSON returns fallback", () => {
  const result = safeParseJson("I cannot provide the JSON you requested.", topicalAuthoritySchema, topicalAuthorityFallback);
  assert.deepEqual(result, []);
});

test("array with mixed valid/invalid items: invalid fields fall back", () => {
  const raw = JSON.stringify([
    { topic: "Leashes", productCount: "not-a-number", products: null, coverageScore: 40, gaps: [], queryCount: -5, topQueries: "not-array", missingSubtopics: [] },
  ]);
  const result = safeParseJson(raw, topicalAuthoritySchema, topicalAuthorityFallback);
  // productCount: "not-a-number" fails coercion → catch(0)
  assert.equal(result[0]!.productCount, 0);
  // products: null → catch([])
  assert.deepEqual(result[0]!.products, []);
  // queryCount: -5 is valid (nonnegative fails) → catch(0)
  assert.equal(result[0]!.queryCount, 0);
  // topQueries: "not-array" → catch([])
  assert.deepEqual(result[0]!.topQueries, []);
});

// ─── Tests: PerceptionResponse ────────────────────────────────────────────────

console.log("\nPerceptionResponse schema resilience");

test("valid perception response parses correctly", () => {
  const raw = JSON.stringify({
    agentNarrative: "The store sells quality surfboards.",
    perceivedStrengths: ["Good pricing", "Clear descriptions"],
    unansweredQuestions: ["Do you ship internationally?"],
    ambiguities: ["Return policy unclear"],
    overallSentiment: "positive",
  });
  const result = safeParseJson(raw, perceptionResponseSchema, perceptionFallback);
  assert.equal(result.agentNarrative, "The store sells quality surfboards.");
  assert.equal(result.overallSentiment, "positive");
  assert.equal(result.perceivedStrengths.length, 2);
});

test("invalid sentiment falls back to 'neutral'", () => {
  const raw = JSON.stringify({
    agentNarrative: "Some narrative",
    perceivedStrengths: [],
    unansweredQuestions: [],
    ambiguities: [],
    overallSentiment: "confused", // not in enum
  });
  const result = safeParseJson(raw, perceptionResponseSchema, perceptionFallback);
  assert.equal(result.overallSentiment, "neutral");
});

test("empty agentNarrative (min length 1 fails) falls back to placeholder", () => {
  const raw = JSON.stringify({
    agentNarrative: "", // empty string fails min(1)
    perceivedStrengths: [],
    unansweredQuestions: [],
    ambiguities: [],
    overallSentiment: "neutral",
  });
  const result = safeParseJson(raw, perceptionResponseSchema, perceptionFallback);
  assert.equal(result.agentNarrative, "AI perception data unavailable.");
});

test("missing fields all fall back to defaults", () => {
  const raw = JSON.stringify({ agentNarrative: "Minimal response." });
  const result = safeParseJson(raw, perceptionResponseSchema, perceptionFallback);
  assert.deepEqual(result.perceivedStrengths, []);
  assert.deepEqual(result.unansweredQuestions, []);
  assert.deepEqual(result.ambiguities, []);
  assert.equal(result.overallSentiment, "neutral");
});

test("complete garbage returns full fallback object", () => {
  const result = safeParseJson("Error: context window exceeded", perceptionResponseSchema, perceptionFallback);
  assert.equal(result.agentNarrative, "AI perception data unavailable.");
  assert.equal(result.overallSentiment, "neutral");
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
