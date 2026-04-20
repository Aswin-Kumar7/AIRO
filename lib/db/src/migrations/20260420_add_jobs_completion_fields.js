import { sql } from "drizzle-orm";

export async function up(db) {
  await db.execute(sql`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS completed_at timestamptz
  `);
  await db.execute(sql`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS error_message text
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE jobs
    DROP COLUMN IF EXISTS completed_at
  `);
  await db.execute(sql`
    ALTER TABLE jobs
    DROP COLUMN IF EXISTS error_message
  `);
}
