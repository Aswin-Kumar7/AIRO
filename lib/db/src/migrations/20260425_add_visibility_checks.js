export async function up(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS visibility_checks (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      query_type TEXT NOT NULL DEFAULT 'manual',
      ai_engine TEXT,
      was_cited BOOLEAN NOT NULL DEFAULT FALSE,
      citation_url TEXT,
      notes TEXT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_visibility_checks_store_id ON visibility_checks(store_id);
    CREATE INDEX IF NOT EXISTS idx_visibility_checks_checked_at ON visibility_checks(store_id, checked_at DESC);
  `);
}

export async function down(db) {
  await db.execute(`DROP TABLE IF EXISTS visibility_checks;`);
}
