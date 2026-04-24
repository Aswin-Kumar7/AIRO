import { sql } from "drizzle-orm";

export async function up(db) {
  // Upgrade 3: store policy text bodies in perception_reports for FAQ grounding
  await db.execute(sql`
    ALTER TABLE perception_reports
    ADD COLUMN IF NOT EXISTS policy_bodies jsonb
  `);
  // CB-9 migration: source_gap_id on fixes (in case the 20260424 migration runs later)
  await db.execute(sql`
    ALTER TABLE fixes
    ADD COLUMN IF NOT EXISTS source_gap_id text
  `);
}

export async function down(db) {
  await db.execute(sql`
    ALTER TABLE perception_reports
    DROP COLUMN IF EXISTS policy_bodies
  `);
  await db.execute(sql`
    ALTER TABLE fixes
    DROP COLUMN IF EXISTS source_gap_id
  `);
}
