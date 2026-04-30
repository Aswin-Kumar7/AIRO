import { Router, type IRouter } from "express";
import { eq, avg as sqlAvg } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { analyzeCompetitor, buildGapInsights } from "../lib/competitor-analyzer";
import { getOwnedStore } from "../lib/owned-store";

const router: IRouter = Router();

// POST /stores/:storeId/competitors/analyze
// Body: { domains: string[] }  — up to 5 competitor domains
router.post("/stores/:storeId/competitors/analyze", async (req, res): Promise<void> => {
  const storeId = req.params.storeId as string;
  const userId = req.session?.userId;
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(404).json({ error: "Store not found." }); return; }

  const { domains } = req.body as { domains?: unknown };
  if (!Array.isArray(domains) || domains.length === 0) {
    res.status(400).json({ error: "Provide an array of competitor domains." });
    return;
  }
  if (domains.length > 5) {
    res.status(400).json({ error: "Maximum 5 competitor domains per request." });
    return;
  }

  // Get user's own average scores from the products table
  const [scoreRow] = await db
    .select({
      overallScore: sqlAvg(productsTable.overallScore),
      clarityScore: sqlAvg(productsTable.clarityScore),
      completenessScore: sqlAvg(productsTable.completenessScore),
      trustScore: sqlAvg(productsTable.trustScore),
      tagScore: sqlAvg(productsTable.tagScore),
    })
    .from(productsTable)
    .where(eq(productsTable.storeId, storeId));

  const yourStore = {
    overallScore: Math.round(Number(scoreRow?.overallScore ?? 0)),
    clarityScore: Math.round(Number(scoreRow?.clarityScore ?? 0)),
    completenessScore: Math.round(Number(scoreRow?.completenessScore ?? 0)),
    trustScore: Math.round(Number(scoreRow?.trustScore ?? 0)),
    tagScore: Math.round(Number(scoreRow?.tagScore ?? 0)),
  };

  // Analyze competitors in parallel (they're independent fetches)
  const competitors = await Promise.all(
    (domains as string[]).map((d) => analyzeCompetitor(d.trim().toLowerCase())),
  );

  const insights = buildGapInsights(yourStore, competitors);

  res.json({ yourStore, competitors, insights });
});

export default router;
