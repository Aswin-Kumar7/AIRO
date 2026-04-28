import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { db, jobsTable, storesTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";

/**
 * On startup, mark any jobs that were left in "running" state from a previous
 * server process as "failed". The in-process queue has no persistence, so a
 * restart drops all queued and in-flight work.
 *
 * Threshold: jobs running for > 10 minutes are almost certainly stuck.
 */
async function recoverStuckJobs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);
    const stuck = await db
      .select({ id: jobsTable.id, storeId: jobsTable.storeId })
      .from(jobsTable)
      .where(and(eq(jobsTable.status, "running"), lt(jobsTable.startedAt, cutoff)));

    if (stuck.length === 0) return;

    for (const job of stuck) {
      await db
        .update(jobsTable)
        .set({ status: "failed", completedAt: new Date(), errorMessage: "Server restarted — job was lost" })
        .where(eq(jobsTable.id, job.id));
      await db
        .update(storesTable)
        .set({ status: "error" })
        .where(eq(storesTable.id, job.storeId));
    }

    logger.warn({ count: stuck.length }, "Recovered stuck analysis jobs on startup");
  } catch (err) {
    logger.error({ err }, "Failed to recover stuck jobs on startup");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void recoverStuckJobs();
  startScheduler();
});
