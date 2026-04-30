/**
 * Shared math helpers and data-shape builders used across the analysis pipeline and route handlers.
 */
import { generateId } from "./id";
import type { StoreSnapshot } from "./shopify-ingestion";

/**
 * Returns the p-th percentile of a sorted (ascending) array of numbers.
 * Returns 0 for an empty array.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(idx, sortedValues.length - 1))]!;
}

/**
 * Builds the DB insert row for a single Shopify product snapshot entry.
 * Used by both the analysis pipeline and the lightweight fetch-products helper
 * so the field list stays in sync automatically.
 */
export function buildProductRow(storeId: string, p: StoreSnapshot["products"][number]) {
  return {
    id: generateId(),
    storeId,
    shopifyProductId: p.shopifyId,
    title: p.title,
    description: p.description,
    productType: p.productType,
    vendor: p.vendor,
    tags: p.tags,
    collections: p.collections,
    imageUrl: p.imageUrl,
    price: p.price,
    reviewCount: p.reviewCount,
    reviewRating: p.reviewRating,
    hasStructuredData: p.hasStructuredData,
  };
}
