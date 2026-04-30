/**
 * Shared store ownership helper.
 *
 * The `router.param("storeId", ...)` middleware in routes/index.ts already
 * enforces per-user isolation at the DB level AND attaches the verified store
 * to res.locals.ownedStore. getOwnedStore() checks that cache first so most
 * handlers pay zero extra DB round-trips.
 *
 * Why a single shared function instead of copy-pasting across every route:
 * Any future changes (e.g., org-level ownership, IP allow-lists) need to
 * be made in exactly one place.
 */

import type { Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, storesTable } from "@workspace/db";
import { DEMO_STORE_ID } from "./demo";

export type OwnedStore = typeof storesTable.$inferSelect;

/**
 * Returns true when storeId refers to the shared demo store.
 * Use this before any write operation to prevent mutations on demo data.
 */
export function isDemoStore(storeId: string): boolean {
  return storeId === DEMO_STORE_ID;
}

/**
 * Returns the store if it belongs to `userId`, or null otherwise.
 *
 * Fast path: if the router.param middleware already verified ownership and
 * attached the store to res.locals.ownedStore, we return it immediately
 * (zero extra DB queries). Only falls through to a fresh SELECT for routes
 * that are called without a :storeId param context (e.g. demo store, direct
 * API calls that bypass the param middleware).
 */
export async function getOwnedStore(
  storeId: string,
  userId: string | undefined,
  res?: Response,
): Promise<OwnedStore | null> {
  if (!userId) return null;

  // Fast path — param middleware already verified + attached the store
  if (res?.locals.ownedStore && (res.locals.ownedStore as OwnedStore).id === storeId) {
    return res.locals.ownedStore as OwnedStore;
  }

  if (storeId === DEMO_STORE_ID) {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(eq(storesTable.id, storeId));
    return store ?? null;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId)));
  return store ?? null;
}
