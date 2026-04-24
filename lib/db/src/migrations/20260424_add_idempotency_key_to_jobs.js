import { sql } from "drizzle-orm";

export async function up(db) {
  await db.execute(sql`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS idempotency_key text
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE jobs
    DROP COLUMN IF EXISTS idempotency_key
  `);
}
