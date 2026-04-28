import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, storesTable, visibilityChecksTable, productsTable } from "@workspace/db";
import { generateId } from "../lib/id";
import { runGeoScan } from "../lib/geo-real";
import { getOwnedStore, isDemoStore } from "../lib/owned-store";

const router: IRouter = Router();

/** GET /stores/:storeId/visibility-checks — list all citation checks */
router.get("/stores/:storeId/visibility-checks", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
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
  const store = await getOwnedStore(storeId, userId);
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
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const checks = await db.select().from(visibilityChecksTable)
    .where(eq(visibilityChecksTable.storeId, storeId));

  const total = checks.length;
  const cited = checks.filter(c => c.wasCited).length;
  const citationRate = total > 0 ? Math.round((cited / total) * 100) : null;

  // Compute lastGeoScore from the most recent automated GEO scan batch.
  // Auto-scan records are written with queryType="auto_geo_scan" — find the
  // latest batch by grouping on checkedAt date (same-second writes = one scan).
  const autoScans = checks.filter(c => c.queryType === "auto_geo_scan");
  let lastGeoScore: number | null = null;
  if (autoScans.length > 0) {
    // Find the timestamp of the most recent scan (max checkedAt)
    const latestTs = autoScans.reduce((max, c) =>
      c.checkedAt > max ? c.checkedAt : max, autoScans[0]!.checkedAt);
    // Include all records within 60 seconds of the latest (one scan batch)
    const latestBatch = autoScans.filter(
      c => latestTs.getTime() - c.checkedAt.getTime() < 60_000
    );
    const batchCited = latestBatch.filter(c => c.wasCited).length;
    lastGeoScore = latestBatch.length > 0
      ? Math.round((batchCited / latestBatch.length) * 100)
      : null;
  }

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
    lastGeoScore,  // citation % from the most recent automated GEO scan; null if never scanned
    byEngine: Object.entries(byEngine).map(([engine, stats]) => ({
      engine,
      total: stats.total,
      cited: stats.cited,
      citationRate: Math.round((stats.cited / stats.total) * 100),
    })),
    message: total === 0
      ? "No visibility checks logged yet. Run a GEO scan or use POST /visibility-checks to log manual checks."
      : null,
  });
});

// ─── Real GEO Scan ────────────────────────────────────────────────────────────

/**
 * POST /stores/:storeId/geo/scan
 * Runs a real 3-platform GEO scan:
 *   - Tavily Search (live web citations — checks if store domain appears in results)
 *   - AWS Bedrock Nova Lite (brand knowledge + purchase-intent judge)
 *   - Internal AI (content quality recommendation test via Gemini/OpenRouter/Groq)
 */
router.post("/stores/:storeId/geo/scan", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  if (isDemoStore(storeId)) {
    res.status(403).json({ error: "GEO scan is not available for the demo store — connect your own store first." });
    return;
  }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const products = await db
    .select({
      title: productsTable.title,
      productType: productsTable.productType,
      tags: productsTable.tags,
      price: productsTable.price,
      detectedCategory: productsTable.detectedCategory,
    })
    .from(productsTable)
    .where(eq(productsTable.storeId, storeId))
    .limit(20);

  if (products.length === 0) {
    res.status(400).json({ error: "No products found. Run an analysis first." });
    return;
  }

  // Derive product types and categories from catalog
  const productTypes = [...new Set(
    products.map((p) => p.productType).filter(Boolean) as string[]
  )].slice(0, 3);

  // Fall back to title-derived types if no product types set
  const typesForQuery = productTypes.length > 0
    ? productTypes
    : products.slice(0, 3).map((p) => p.title.split(" ").slice(0, 3).join(" "));

  const categories = [...new Set(
    products.map((p) => p.detectedCategory).filter(Boolean) as string[]
  )];

  // Price range from catalog
  const prices = products
    .map((p) => parseFloat(p.price ?? "0"))
    .filter((p) => p > 0);
  const priceRange = prices.length > 0
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : { min: 10, max: 100 };

  // Build a short product sample description for AI context
  const productSample = products
    .slice(0, 5)
    .map((p) => `• ${p.title}${p.price ? ` ($${p.price})` : ""}${p.productType ? ` — ${p.productType}` : ""}`)
    .join("\n");

  try {
    const report = await runGeoScan({
      storeId,
      storeDomain: store.domain,
      storeName: store.name,
      productTypes: typesForQuery,
      categories,
      priceRange,
      productSample,
    });

    // Persist each result as a visibility check record for history
    if (report.results.length > 0) {
      await db.insert(visibilityChecksTable).values(
        report.results.map((r) => ({
          id: generateId(),
          storeId,
          query: r.query,
          queryType: "auto_geo_scan",
          aiEngine: r.platform,
          wasCited: r.cited,
          citationUrl: r.citationUrl ?? null,
          notes: r.reasoning.slice(0, 500),
        }))
      );
    }

    res.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "GEO scan failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
