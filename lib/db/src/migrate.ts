/**
 * Run all pending migrations in order.
 * Usage: pnpm --filter @workspace/db run migrate
 *
 * Each migration file under src/migrations/ must export:
 *   export async function up(db): Promise<void>
 */
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, db } from "./index.js";

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".js"))
    .sort();

  if (files.length === 0) {
    console.log("No migrations found.");
    await pool.end();
    return;
  }

  for (const file of files) {
    const mod = await import(`${migrationsDir}/${file}`);
    if (typeof mod.up !== "function") {
      console.warn(`Skipping ${file}: no 'up' export`);
      continue;
    }
    console.log(`Running migration: ${file}`);
    try {
      await mod.up(db);
      console.log(`  ✓ ${file}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${file}: ${message}`);
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`\nAll ${files.length} migration(s) applied.`);
  await pool.end();
}

main().catch((err) => {
  console.error("Migration runner failed:", err);
  process.exit(1);
});
