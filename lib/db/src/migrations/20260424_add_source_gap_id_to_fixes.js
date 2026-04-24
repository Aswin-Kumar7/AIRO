import { sql } from "drizzle-orm";

export async function up(db) {
  await db.execute(sql`
    ALTER TABLE fixes
    ADD COLUMN IF NOT EXISTS source_gap_id text
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE fixes
    DROP COLUMN IF EXISTS source_gap_id
  `);
}
