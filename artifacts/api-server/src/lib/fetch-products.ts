/**
 * Lightweight product fetch — ingest Shopify products into the DB without running analysis.
 * Called after store connect and available as an explicit endpoint.
 */
import { eq } from "drizzle-orm";
import { db, storesTable, productsTable, activityTable, type Store } from "@workspace/db";
import { ingestStore } from "./shopify-ingestion";
import { resolveAccessToken } from "./crypto";
import { generateId } from "./id";
import { logger } from "./logger";

export async function fetchAndUpsertProducts(store: Store): Promise<{ productCount: number }> {
  logger.info({ storeId: store.id }, "Fetching products from Shopify");

  const snapshot = await ingestStore(store.domain, resolveAccessToken(store.accessToken));

  if (snapshot.products.length === 0) {
    logger.warn({ storeId: store.id }, "Shopify returned zero products during fetch");
    return { productCount: 0 };
  }

  // Replace products — analysis scores start fresh (analyzedAt: null)
  await db.delete(productsTable).where(eq(productsTable.storeId, store.id));
  await db.insert(productsTable).values(
    snapshot.products.map((p) => ({
      id: generateId(),
      storeId: store.id,
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
    })),
  );

  await db.update(storesTable).set({
    productsFetched: true,
    productCount: snapshot.products.length,
    status: "connected",
  }).where(eq(storesTable.id, store.id));

  await db.insert(activityTable).values({
    id: generateId(),
    storeId: store.id,
    type: "products_fetched",
    message: `${snapshot.products.length} products loaded from Shopify`,
    metadata: { productCount: snapshot.products.length },
  });

  logger.info({ storeId: store.id, productCount: snapshot.products.length }, "Products fetched successfully");
  return { productCount: snapshot.products.length };
}
