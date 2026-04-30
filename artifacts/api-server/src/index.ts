import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { db, jobsTable, storesTable, pool } from "@workspace/db";
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

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void recoverStuckJobs();
  startScheduler();
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
// Railway/Render send SIGTERM before force-killing the container.
// We stop accepting new connections, wait for in-flight requests to drain,
// then close the DB pool so the process exits cleanly (exit code 0).
function shutdown(signal: string): void {
  logger.info({ signal }, "Shutdown signal received — draining connections");
  server.close(async () => {
    try {
      await pool.end();
      logger.info("DB pool closed — exiting cleanly");
    } catch (err) {
      logger.error({ err }, "Error closing DB pool during shutdown");
    }
    process.exit(0);
  });

  // Force-kill after 15 s if drain takes too long
  setTimeout(() => {
    logger.warn("Graceful shutdown timeout — forcing exit");
    process.exit(1);
  }, 15_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Log unhandled rejections instead of crashing silently
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting");
  process.exit(1);
});
