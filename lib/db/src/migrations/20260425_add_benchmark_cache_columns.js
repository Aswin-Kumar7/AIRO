export async function up(db) {
  await db.execute(`
    ALTER TABLE store_summaries
      ADD COLUMN IF NOT EXISTS benchmark_scores JSONB,
      ADD COLUMN IF NOT EXISTS benchmark_source TEXT,
      ADD COLUMN IF NOT EXISTS benchmark_sample_size INTEGER,
      ADD COLUMN IF NOT EXISTS benchmark_computed_at TIMESTAMPTZ;
  `);
}

export async function down(db) {
  await db.execute(`
    ALTER TABLE store_summaries
      DROP COLUMN IF EXISTS benchmark_scores,
      DROP COLUMN IF EXISTS benchmark_source,
      DROP COLUMN IF EXISTS benchmark_sample_size,
      DROP COLUMN IF EXISTS benchmark_computed_at;
  `);
}
