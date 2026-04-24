import { sql } from "drizzle-orm";

export async function up(db) {
  await db.execute(sql`
    ALTER TABLE store_summaries
    ADD COLUMN IF NOT EXISTS query_catalog_hash text,
    ADD COLUMN IF NOT EXISTS topical_catalog_hash text,
    ADD COLUMN IF NOT EXISTS links_catalog_hash text
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE store_summaries
    DROP COLUMN IF EXISTS query_catalog_hash,
    DROP COLUMN IF EXISTS topical_catalog_hash,
    DROP COLUMN IF EXISTS links_catalog_hash
  `);
}
