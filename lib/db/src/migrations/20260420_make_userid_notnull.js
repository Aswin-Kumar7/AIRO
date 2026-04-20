import { sql } from "drizzle-orm";
import { storesTable } from "../schema/stores";

// Migration: Remove orphaned stores and enforce NOT NULL on user_id
export async function up(db) {
  // Remove stores with null user_id
  await db.execute(sql`DELETE FROM stores WHERE user_id IS NULL`);
  // Alter column to NOT NULL (if not already)
  await db.execute(sql`ALTER TABLE stores ALTER COLUMN user_id SET NOT NULL`);
}

export async function down(db) {
  // Allow user_id to be nullable again (rollback)
  await db.execute(sql`ALTER TABLE stores ALTER COLUMN user_id DROP NOT NULL`);
}
