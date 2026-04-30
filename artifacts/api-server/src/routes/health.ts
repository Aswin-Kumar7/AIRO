import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// Shallow health check — always fast, used by load-balancer pings.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Deep readiness probe — verifies DB connectivity.
// Used by Railway/Render startup & liveness checks.
router.get("/healthz/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({
      status: "error",
      db: "unreachable",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
