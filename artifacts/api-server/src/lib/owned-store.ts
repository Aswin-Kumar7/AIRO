/**
 * Shared store ownership helper.
 *
 * The `router.param("storeId", ...)` middleware in routes/index.ts already
 * enforces per-user isolation at the DB level, so this function's auth check
 * is a defence-in-depth layer (belt-and-suspenders). The primary job here
 * is to fetch the store record so callers have access to fields like domain
 * and accessToken without an extra query.
 *
 * Why a single shared function instead of copy-pasting across every route:
 * Any future changes (e.g., org-level ownership, IP allow-lists) need to
 * be made in exactly one place.
 */

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
 * Demo store is always readable by any authenticated user.
 */
export async function getOwnedStore(
  storeId: string,
  userId: string | undefined,
): Promise<OwnedStore | null> {
  if (!userId) return null;

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
