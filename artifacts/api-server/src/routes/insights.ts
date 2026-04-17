import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  perceptionReportsTable,
  productsTable,
  storesTable,
  storeSummariesTable,
} from "@workspace/db";
import { buildTagOptimizerItems } from "../lib/tag-optimizer";

const router: IRouter = Router();

router.get("/stores/:storeId/tag-optimizer", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const items = buildTagOptimizerItems(products.map((product) => ({
    id: product.id,
    title: product.title,
    tags: product.tags,
    suggestedTags: product.suggestedTags,
    tagScore: product.tagScore,
  })));

  res.json({
    storeId,
    productsNeedingAttention: items.filter((item) => item.needsAttention).length,
    items,
  });
});

router.get("/stores/:storeId/perception", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const [report] = await db.select().from(perceptionReportsTable).where(eq(perceptionReportsTable.storeId, storeId));
  const [summary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));
  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const missingStructuredData = products
    .filter((product) => !product.hasStructuredData)
    .map((product) => ({ id: product.id, title: product.title }));

  res.json({
    storeId,
    merchantDesiredPositioning: store.desiredPositioning ?? null,
    agentNarrative: report?.agentNarrative ?? "",
    unansweredQuestions: (report?.unansweredQuestions as string[] | undefined) ?? [],
    ambiguities: (report?.ambiguities as string[] | undefined) ?? [],
    perceivedStrengths: (report?.perceivedStrengths as string[] | undefined) ?? [],
    faqHealth: {
      found: report?.faqPageFound ?? false,
      title: report?.faqPageTitle ?? null,
      questionCount: report?.faqQuestionCount ?? 0,
      unansweredTopics: (report?.faqGaps as string[] | undefined) ?? [],
    },
    structuredData: {
      totalProducts: products.length,
      missingProductCount: missingStructuredData.length,
      missingProducts: missingStructuredData,
    },
    prioritizedActionPlan: Array.isArray(summary?.prioritizedActionPlan)
      ? summary?.prioritizedActionPlan
      : [],
    updatedAt: report?.updatedAt?.toISOString() ?? null,
  });
});

export default router;