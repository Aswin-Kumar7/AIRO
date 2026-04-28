/**
 * Tests for generateBuyerQueries — the pure query-generation function in geo-real.ts.
 *
 * Run with: npx tsx src/__tests__/geo-queries.test.ts
 *
 * Tests verify:
 * 1. Returns exactly 6 unique queries
 * 2. Placeholders ({type}, {store}, {price}) are all replaced
 * 3. Store name and product type appear in generated queries
 * 4. Works for every supported category
 * 5. Handles empty / missing inputs gracefully
 */

import assert from "node:assert/strict";
import { generateBuyerQueries } from "../lib/geo-real";

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

// ─── generateBuyerQueries ────────────────────────────────────────────────────

console.log("\ngenerateBuyerQueries");

const CATEGORIES = ["electronics", "fashion", "beauty", "food", "sports", "kids", "home", "general", "unknown_category"];

test("returns exactly 6 queries", () => {
  const queries = generateBuyerQueries("Kasparro", ["snowboard"], ["sports"], { min: 200, max: 800 });
  assert.equal(queries.length, 6, `Expected 6 queries, got ${queries.length}: ${JSON.stringify(queries)}`);
});

test("returns unique queries (no duplicates)", () => {
  const queries = generateBuyerQueries("Kasparro", ["snowboard"], ["sports"], { min: 200, max: 800 });
  const unique = new Set(queries);
  assert.equal(unique.size, queries.length, `Duplicate queries found: ${JSON.stringify(queries)}`);
});

test("no unreplaced placeholders in any query", () => {
  const queries = generateBuyerQueries("Surf Shack", ["surfboard", "wetsuit"], ["sports"], { min: 100, max: 500 });
  for (const q of queries) {
    assert(!q.includes("{type}"), `Placeholder {type} not replaced in: "${q}"`);
    assert(!q.includes("{store}"), `Placeholder {store} not replaced in: "${q}"`);
    assert(!q.includes("{price}"), `Placeholder {price} not replaced in: "${q}"`);
  }
});

test("store name appears in at least one query", () => {
  const storeName = "CoastalDrip";
  const queries = generateBuyerQueries(storeName, ["coffee"], ["food"], { min: 20, max: 60 });
  const hasStore = queries.some((q) => q.toLowerCase().includes(storeName.toLowerCase()));
  assert(hasStore, `Store name "${storeName}" not found in any query:\n${queries.join("\n")}`);
});

test("product type appears in at least one query", () => {
  const queries = generateBuyerQueries("ToyBarn", ["wooden toys"], ["kids"], { min: 15, max: 80 });
  const hasType = queries.some((q) => q.toLowerCase().includes("wooden toys"));
  assert(hasType, `Product type "wooden toys" not found in any query:\n${queries.join("\n")}`);
});

test("mid-price is derived from min/max range", () => {
  // min=100, max=300 → midPrice = 200
  const queries = generateBuyerQueries("GearHub", ["bike"], ["sports"], { min: 100, max: 300 });
  const hasMidPrice = queries.some((q) => q.includes("200"));
  assert(hasMidPrice, `Expected mid-price 200 in at least one query:\n${queries.join("\n")}`);
});

test("all supported categories produce 6 queries without throwing", () => {
  for (const cat of CATEGORIES) {
    const queries = generateBuyerQueries("TestStore", ["widget"], [cat], { min: 10, max: 100 });
    assert.equal(queries.length, 6, `Category "${cat}" produced ${queries.length} queries instead of 6`);
  }
});

test("falls back gracefully with empty productTypes", () => {
  const queries = generateBuyerQueries("EmptyStore", [], ["general"], { min: 0, max: 0 });
  assert.equal(queries.length, 6);
  // With no product types, primaryType defaults to "products" — should still replace
  for (const q of queries) {
    assert(!q.includes("{type}"), `Placeholder not replaced: "${q}"`);
  }
});

test("falls back to midPrice=50 when both min and max are 0", () => {
  const queries = generateBuyerQueries("ZeroStore", ["gadget"], ["electronics"], { min: 0, max: 0 });
  // midPrice defaults to 50 when computed value is 0
  const has50 = queries.some((q) => q.includes("50"));
  assert(has50, `Expected fallback mid-price 50:\n${queries.join("\n")}`);
});

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
