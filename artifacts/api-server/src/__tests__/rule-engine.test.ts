/**
 * CB-4: Deterministic eval suite for the rule engine.
 *
 * Each fixture describes a product with known defects. We verify that:
 * 1. Expected ruleIds ARE present in violations (precision)
 * 2. "Perfect" products produce zero violations in their tested category (recall)
 *
 * Run with: npx tsx src/__tests__/rule-engine.test.ts
 */

import assert from "node:assert/strict";
import { runRuleEngine, type ProductInput } from "../lib/rule-engine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasRule(ruleId: string, violations: ReturnType<typeof runRuleEngine>["violations"]): boolean {
  return violations.some(v => v.ruleId === ruleId);
}

function expectRule(ruleId: string, violations: ReturnType<typeof runRuleEngine>["violations"], label: string): void {
  assert(hasRule(ruleId, violations), `[${label}] Expected ruleId "${ruleId}" in violations but not found.\nGot: ${violations.map(v => v.ruleId).join(", ") || "(none)"}`);
}

function forbidRule(ruleId: string, violations: ReturnType<typeof runRuleEngine>["violations"], label: string): void {
  assert(!hasRule(ruleId, violations), `[${label}] Did NOT expect ruleId "${ruleId}" but it was present.`);
}

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

// ─── Base "perfect" product ────────────────────────────────────────────────────

const PERFECT: ProductInput = {
  title: "Burton Clash 158cm All Mountain Freestyle Snowboard",
  description: `<ul>
    <li>Made from 100% organic cotton and aircraft-grade aluminum</li>
    <li>Dimensions: 158cm × 25cm, weight: 2.4kg</li>
    <li>Designed for intermediate to advanced all-mountain riders</li>
    <li>Compatible with standard bindings; ISO 9001 certified</li>
    <li><strong>You'll love</strong> the smooth edge-to-edge response</li>
  </ul>
  <p>The Burton Clash is perfect for riders who want all-mountain versatility. Meet the board designed for explorers.</p>`,
  tags: ["snowboard", "burton", "all-mountain", "158cm", "outdoor-sports"],
  productType: "All-Mountain Snowboard",
  vendor: "Burton",
  price: "549.99",
  imageUrl: "https://cdn.shopify.com/burton-clash.jpg",
  reviewCount: 47,
  hasStructuredData: true,
};

// ─── Title rules ──────────────────────────────────────────────────────────────

console.log("\nTitle rules:");

test("TITLE_TOO_SHORT fires for 1-word title", () => {
  const { violations } = runRuleEngine({ ...PERFECT, title: "Snowboard" });
  expectRule("TITLE_TOO_SHORT", violations, "TITLE_TOO_SHORT");
});

test("TITLE_SHORT fires for 4-word title", () => {
  const { violations } = runRuleEngine({ ...PERFECT, title: "Burton Clash snowboard blue" });
  expectRule("TITLE_SHORT", violations, "TITLE_SHORT");
});

test("TITLE_ALL_CAPS fires for all-uppercase title", () => {
  const { violations } = runRuleEngine({ ...PERFECT, title: "BURTON CLASH SNOWBOARD ALL MOUNTAIN" });
  expectRule("TITLE_ALL_CAPS", violations, "TITLE_ALL_CAPS");
});

test("No title violations for the perfect product", () => {
  const { violations } = runRuleEngine(PERFECT);
  forbidRule("TITLE_TOO_SHORT", violations, "perfect");
  forbidRule("TITLE_SHORT", violations, "perfect");
  forbidRule("TITLE_ALL_CAPS", violations, "perfect");
});

// ─── Description rules ────────────────────────────────────────────────────────

console.log("\nDescription rules:");

test("DESC_MISSING fires when description is null", () => {
  const { violations } = runRuleEngine({ ...PERFECT, description: null });
  expectRule("DESC_MISSING", violations, "DESC_MISSING");
});

test("DESC_TOO_SHORT fires for very short description", () => {
  // Must be > 4 words (to avoid DESC_MISSING) but < 50 words to hit DESC_TOO_SHORT
  const { violations } = runRuleEngine({ ...PERFECT, description: "Great board. Very fast on the mountain. Handles well in powder and packed snow conditions." });
  expectRule("DESC_TOO_SHORT", violations, "DESC_TOO_SHORT");
});

test("DESC_NO_MATERIAL fires when no material terms present (English text)", () => {
  const { violations } = runRuleEngine({
    ...PERFECT,
    description: "<p>This is a great product for outdoor use. Designed for beginners. Width is 25cm.</p>",
  });
  expectRule("DESC_NO_MATERIAL", violations, "DESC_NO_MATERIAL");
});

test("DESC_NO_MATERIAL does NOT fire for non-English descriptions", () => {
  // Japanese text — no English material terms should be expected
  const { violations } = runRuleEngine({
    ...PERFECT,
    description: "このスノーボードは中級者から上級者向けに設計されています。軽量で操作性が高く、パウダーから圧雪まで幅広いコンディションに対応します。素材はアルミニウムと強化カーボンです。",
  });
  forbidRule("DESC_NO_MATERIAL", violations, "non-English DESC_NO_MATERIAL");
  forbidRule("DESC_NO_USE_CASE", violations, "non-English DESC_NO_USE_CASE");
});

// ─── Tag rules ────────────────────────────────────────────────────────────────

console.log("\nTag rules:");

test("TAGS_MISSING fires when tags array is empty", () => {
  const { violations } = runRuleEngine({ ...PERFECT, tags: [] });
  expectRule("TAGS_MISSING", violations, "TAGS_MISSING");
});

test("TAGS_TOO_FEW fires for only 1 tag", () => {
  const { violations } = runRuleEngine({ ...PERFECT, tags: ["snowboard"] });
  expectRule("TAGS_TOO_FEW", violations, "TAGS_TOO_FEW");
});

test("TAGS_GENERIC fires when tags contain 'new' or 'sale'", () => {
  const { violations } = runRuleEngine({ ...PERFECT, tags: ["snowboard", "burton", "new", "sale"] });
  expectRule("TAGS_GENERIC", violations, "TAGS_GENERIC");
});

test("TAGS_NO_CATEGORY fires when no tag matches productType", () => {
  const { violations } = runRuleEngine({
    ...PERFECT,
    productType: "Kayak Paddle",
    tags: ["outdoor", "water", "sports"],
  });
  expectRule("TAGS_NO_CATEGORY", violations, "TAGS_NO_CATEGORY");
});

// ─── Trust rules ──────────────────────────────────────────────────────────────

console.log("\nTrust rules:");

test("TRUST_NO_IMAGE fires when imageUrl is null", () => {
  const { violations } = runRuleEngine({ ...PERFECT, imageUrl: null });
  expectRule("TRUST_NO_IMAGE", violations, "TRUST_NO_IMAGE");
});

test("TRUST_NO_BRAND fires when vendor is null", () => {
  const { violations } = runRuleEngine({ ...PERFECT, vendor: null });
  expectRule("TRUST_NO_BRAND", violations, "TRUST_NO_BRAND");
});

test("TRUST_NO_REVIEWS fires when reviewCount is 0", () => {
  const { violations } = runRuleEngine({ ...PERFECT, reviewCount: 0 });
  expectRule("TRUST_NO_REVIEWS", violations, "TRUST_NO_REVIEWS");
});

test("TRUST_NO_SCHEMA fires when hasStructuredData is false", () => {
  const { violations } = runRuleEngine({ ...PERFECT, hasStructuredData: false });
  expectRule("TRUST_NO_SCHEMA", violations, "TRUST_NO_SCHEMA");
});

// ─── Brand authority rules (U-6) ─────────────────────────────────────────────

console.log("\nBrand authority rules (U-6):");

test("BRAND_LOW_REVIEW_COVERAGE fires when vendor set + 0 reviews", () => {
  const { violations } = runRuleEngine({ ...PERFECT, reviewCount: 0, vendor: "Burton" });
  expectRule("BRAND_LOW_REVIEW_COVERAGE", violations, "BRAND_LOW_REVIEW_COVERAGE");
});

test("BRAND_INCONSISTENT_VENDOR fires when vendor not in title or description", () => {
  const { violations } = runRuleEngine({
    ...PERFECT,
    vendor: "Nitro",
    title: "All-Mountain Snowboard Pro Series",
    description: "<p>This snowboard is designed for intermediate riders who want all-mountain versatility and cotton fabric.</p>",
  });
  expectRule("BRAND_INCONSISTENT_VENDOR", violations, "BRAND_INCONSISTENT_VENDOR");
});

test("BRAND_INCONSISTENT_VENDOR does NOT fire when vendor appears in description", () => {
  const { violations } = runRuleEngine({
    ...PERFECT,
    vendor: "Burton",
    // PERFECT already has "Burton" in title and description
  });
  forbidRule("BRAND_INCONSISTENT_VENDOR", violations, "vendor in title");
});

// ─── Taxonomy specificity (Upgrade 2) ─────────────────────────────────────────

console.log("\nTaxonomy specificity (Upgrade 2):");

test("TAXONOMY_TOO_GENERIC fires for productType 'accessories'", () => {
  const { violations } = runRuleEngine({ ...PERFECT, productType: "accessories" });
  expectRule("TAXONOMY_TOO_GENERIC", violations, "TAXONOMY_TOO_GENERIC generic type");
});

test("TAXONOMY_TOO_GENERIC does NOT fire for specific productType", () => {
  const { violations } = runRuleEngine({ ...PERFECT, productType: "All-Mountain Snowboard" });
  forbidRule("TAXONOMY_TOO_GENERIC", violations, "specific product type");
});

// ─── Score sanity checks ──────────────────────────────────────────────────────

console.log("\nScore sanity:");

test("Perfect product scores >= 70 in all dimensions", () => {
  const { ruleScores } = runRuleEngine(PERFECT);
  assert(ruleScores.clarity >= 70, `clarity too low: ${ruleScores.clarity}`);
  assert(ruleScores.completeness >= 70, `completeness too low: ${ruleScores.completeness}`);
  assert(ruleScores.trust >= 70, `trust too low: ${ruleScores.trust}`);
  assert(ruleScores.tags >= 70, `tags too low: ${ruleScores.tags}`);
});

test("Product with no description, no tags, no image scores low overall", () => {
  const { ruleScores } = runRuleEngine({
    ...PERFECT,
    description: null,
    tags: [],
    imageUrl: null,
    reviewCount: 0,
    hasStructuredData: false,
  });
  const overall = Math.round((ruleScores.clarity + ruleScores.completeness + ruleScores.trust + ruleScores.tags) / 4);
  assert(overall < 40, `Expected low overall score but got: ${overall}`);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log("\nAll tests passed ✓");
}
