import { eq } from "drizzle-orm";
import { db, storesTable, activityTable, storeSummariesTable, type Store } from "@workspace/db";
import { generateId } from "./id";
import { isStoredShopifyEnvTokenReference, normalizeShopifyDomain } from "./shopify-client";

export function maskStoredAccessToken(accessToken: string): string {
  return isStoredShopifyEnvTokenReference(accessToken)
    ? "env:SHOPIFY_ADMIN_ACCESS_TOKEN"
    : "********";
}

export function getConnectionMode(accessToken: string): "env-admin-token" | "store-admin-token" {
  return isStoredShopifyEnvTokenReference(accessToken) ? "env-admin-token" : "store-admin-token";
}

type UpsertConnectedStoreInput = {
  domain: string;
  name: string;
  accessToken: string;
  source: "manual" | "oauth";
  userId: string;
};

export async function upsertConnectedStore({
  domain,
  name,
  accessToken,
  source,
  userId,
}: UpsertConnectedStoreInput): Promise<Store> {
  const normalizedDomain = normalizeShopifyDomain(domain);
  const [existingStore] = await db.select().from(storesTable).where(eq(storesTable.domain, normalizedDomain));

  let store: Store;

  if (existingStore) {
    const [updatedStore] = await db.update(storesTable).set({
      name,
      accessToken,
      status: "connected",
    }).where(eq(storesTable.id, existingStore.id)).returning();
    store = updatedStore;
  } else {
    const [createdStore] = await db.insert(storesTable).values({
      id: generateId(),
      domain: normalizedDomain,
      name,
      accessToken,
      status: "connected",
      userId,
    }).returning();
    store = createdStore;
  }

  await db.insert(activityTable).values({
    id: generateId(),
    storeId: store.id,
    type: "store_connected",
    message: existingStore
      ? `Store "${name}" reconnected successfully`
      : `Store "${name}" connected successfully`,
    metadata: {
      domain: normalizedDomain,
      connectionMode: getConnectionMode(accessToken),
      connectionSource: source,
      reauthorized: Boolean(existingStore),
    },
  });

  await db.insert(storeSummariesTable).values({
    storeId: store.id,
  }).onConflictDoNothing();

  return store;
}