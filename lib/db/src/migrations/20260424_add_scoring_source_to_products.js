import { sql } from "drizzle-orm";

export async function up(db) {
  await db.execute(sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS scoring_source text
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE products
    DROP COLUMN IF EXISTS scoring_source
  `);
}
