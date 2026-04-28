import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  perceptionReportsTable,
  productsTable,
  storesTable,
  storeSummariesTable,
} from "@workspace/db";
import { buildTagOptimizerItems } from "../lib/tag-optimizer";
import { computeListingReadiness } from "../lib/listing-readiness";
import { getOwnedStore } from "../lib/owned-store";

const router: IRouter = Router();

router.get("/stores/:storeId/tag-optimizer", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [store] = await db.select().from(storesTable).where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId)));
  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
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
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const store = await getOwnedStore(storeId, userId);

  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
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

// GET /stores/:storeId/listing-readiness
router.get("/stores/:storeId/listing-readiness", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(404).json({ error: "Store not found." }); return; }

  const [products, summary] = await Promise.all([
    db.select({
      description: productsTable.description,
      imageUrl: productsTable.imageUrl,
      price: productsTable.price,
      productType: productsTable.productType,
      vendor: productsTable.vendor,
      tags: productsTable.tags,
      overallScore: productsTable.overallScore,
      completenessScore: productsTable.completenessScore,
      trustScore: productsTable.trustScore,
      tagScore: productsTable.tagScore,
      imageQualityScore: productsTable.imageQualityScore,
    }).from(productsTable).where(eq(productsTable.storeId, storeId)),
    db.select({ policyScore: storeSummariesTable.policyScore, completenessScore: storeSummariesTable.completenessScore, trustScore: storeSummariesTable.trustScore }).from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId)).then((rows) => rows[0] ?? null),
  ]);

  if (products.length === 0) {
    res.status(404).json({ error: "No products found. Run an analysis first." });
    return;
  }

  const avg = (vals: number[]) => vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;

  const policyScore = summary?.policyScore ?? 0;

  const stripHtml = (html: string | null) =>
    (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const report = computeListingReadiness({
    totalProducts: products.length,
    // Meaningful description: stripped text > 200 chars (~30 words)
    productsWithDescription: products.filter((p) => stripHtml(p.description).length > 200).length,
    // Rich description: stripped text > 500 chars (~80 words) — the AI quality bar
    productsWithRichDescription: products.filter((p) => stripHtml(p.description).length > 500).length,
    productsWithImage: products.filter((p) => !!p.imageUrl).length,
    productsWithPrice: products.filter((p) => !!p.price).length,
    productsWithType: products.filter((p) => !!p.productType).length,
    productsWithVendor: products.filter((p) => !!p.vendor).length,
    // Raised bar: 5+ tags, not 3
    productsWithTags: products.filter((p) => (p.tags ?? []).length >= 5).length,
    avgOverallScore: avg(products.map((p) => p.overallScore ?? 0)),
    avgTagScore: avg(products.map((p) => p.tagScore ?? 0)),
    avgCompletenessScore: avg(products.map((p) => p.completenessScore ?? 0)),
    avgTrustScore: avg(products.map((p) => p.trustScore ?? 0)),
    avgImageQualityScore: avg(products.filter((p) => p.imageQualityScore != null).map((p) => p.imageQualityScore!)),
    // % of products with completenessScore >= 60 (decent quality)
    productsWithDecentCompleteness: products.filter((p) => (p.completenessScore ?? 0) >= 60).length,
    hasRefundPolicy: policyScore > 0,
    hasShippingPolicy: policyScore > 0,
    hasPrivacyPolicy: policyScore > 20,
  });

  res.json(report);
});

export default router;