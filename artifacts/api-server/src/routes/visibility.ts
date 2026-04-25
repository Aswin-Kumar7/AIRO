import { Router, type IRouter } from "express";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { db, storesTable, visibilityChecksTable } from "@workspace/db";
import { generateId } from "../lib/id";

const router: IRouter = Router();

async function requireOwnedStore(storeId: string, userId: string | undefined) {
  if (!userId) return null;
  const [store] = await db.select().from(storesTable)
    .where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId)));
  return store ?? null;
}

/** GET /stores/:storeId/visibility-checks — list all citation checks */
router.get("/stores/:storeId/visibility-checks", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const checks = await db.select().from(visibilityChecksTable)
    .where(eq(visibilityChecksTable.storeId, storeId))
    .orderBy(desc(visibilityChecksTable.checkedAt));

  res.json(checks.map(c => ({
    id: c.id,
    storeId: c.storeId,
    query: c.query,
    queryType: c.queryType,
    aiEngine: c.aiEngine ?? null,
    wasCited: c.wasCited,
    citationUrl: c.citationUrl ?? null,
    notes: c.notes ?? null,
    checkedAt: c.checkedAt.toISOString(),
  })));
});

/** POST /stores/:storeId/visibility-checks — log a new citation check */
router.post("/stores/:storeId/visibility-checks", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const { query, queryType, aiEngine, wasCited, citationUrl, notes } = req.body as {
    query?: string;
    queryType?: string;
    aiEngine?: string;
    wasCited?: boolean;
    citationUrl?: string;
    notes?: string;
  };

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const [inserted] = await db.insert(visibilityChecksTable).values({
    id: generateId(),
    storeId,
    query: query.trim(),
    queryType: queryType ?? "manual",
    aiEngine: aiEngine ?? null,
    wasCited: Boolean(wasCited),
    citationUrl: citationUrl ?? null,
    notes: notes ?? null,
  }).returning();

  res.status(201).json({
    id: inserted!.id,
    storeId: inserted!.storeId,
    query: inserted!.query,
    queryType: inserted!.queryType,
    aiEngine: inserted!.aiEngine ?? null,
    wasCited: inserted!.wasCited,
    citationUrl: inserted!.citationUrl ?? null,
    notes: inserted!.notes ?? null,
    checkedAt: inserted!.checkedAt.toISOString(),
  });
});

/** GET /stores/:storeId/visibility-summary — citation rate & trend */
router.get("/stores/:storeId/visibility-summary", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const checks = await db.select().from(visibilityChecksTable)
    .where(eq(visibilityChecksTable.storeId, storeId));

  const total = checks.length;
  const cited = checks.filter(c => c.wasCited).length;
  const citationRate = total > 0 ? Math.round((cited / total) * 100) : null;

  // Group by AI engine
  const byEngine: Record<string, { total: number; cited: number }> = {};
  for (const c of checks) {
    const engine = c.aiEngine ?? "unknown";
    if (!byEngine[engine]) byEngine[engine] = { total: 0, cited: 0 };
    byEngine[engine].total++;
    if (c.wasCited) byEngine[engine].cited++;
  }

  res.json({
    storeId,
    totalChecks: total,
    citedCount: cited,
    citationRate,
    byEngine: Object.entries(byEngine).map(([engine, stats]) => ({
      engine,
      total: stats.total,
      cited: stats.cited,
      citationRate: Math.round((stats.cited / stats.total) * 100),
    })),
    message: total === 0
      ? "No visibility checks logged yet. Use POST /visibility-checks to log when you search for your store in AI engines."
      : null,
  });
});

export default router;
