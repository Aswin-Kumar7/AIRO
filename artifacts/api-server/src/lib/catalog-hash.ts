/**
 * CB-6: Content-hash cache invalidation.
 * Compute a stable SHA-256 fingerprint of a product catalog so that
 * feature caches (query simulation, topical authority, internal links)
 * are busted whenever catalog content changes — not just when the 24h TTL expires.
 */

import crypto from "crypto";

type ProductForHash = {
  id: string;
  title: string;
  description: string | null;
  productType: string | null;
  tags: string[];
};

/**
 * Returns a 16-char hex fingerprint of the given products.
 * Sorted by id for stability; covers title, description, productType, and tags.
 */
export function computeCatalogHash(products: ProductForHash[]): string {
  const sorted = [...products].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted
    .map(p => `${p.id}|${p.title}|${(p.description ?? "").slice(0, 200)}|${p.productType ?? ""}|${p.tags.join(",")}`)
    .join("\n");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}
