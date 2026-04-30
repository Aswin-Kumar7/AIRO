import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, productsTable, gapsTable, fixesTable } from "@workspace/db";
import { generateFix } from "../lib/ai-analyzer";
import { generateAnswerFirstStructure } from "../lib/ai-features";
import { perceptionReportsTable } from "@workspace/db";
import { fetchAndUpsertProducts } from "../lib/fetch-products";
import { generateId } from "../lib/id";
import { logger } from "../lib/logger";
import { getOwnedStore } from "../lib/owned-store";

const router: IRouter = Router();

router.post("/stores/:storeId/fetch-products", async (req, res): Promise<void> => {
  const storeId = req.params.storeId as string;
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

  res.json({ status: "fetching", storeId, message: "Fetching products from Shopify in the background" });

  setImmediate(async () => {
    try {
      await fetchAndUpsertProducts(store);
    } catch (err) {
      logger.error({ err, storeId }, "Background product fetch failed");
    }
  });
});

router.get("/stores/:storeId/products", async (req, res): Promise<void> => {
  const storeId = req.params.storeId as string;
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
  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  res.json(products.map(p => ({
    id: p.id,
    storeId: p.storeId,
    shopifyProductId: p.shopifyProductId,
    title: p.title,
    productType: p.productType,
    vendor: p.vendor,
    tags: p.tags,
    imageUrl: p.imageUrl,
    price: p.price,
    detectedCategory: p.detectedCategory ?? null,
    score: {
      clarity: p.clarityScore,
      completeness: p.completenessScore,
      trust: p.trustScore,
      tags: p.tagScore,
      overall: p.overallScore,
    },
    issueCount: p.issueCount,
    hasAppliedFixes: p.hasAppliedFixes,
    analyzedAt: p.analyzedAt?.toISOString() ?? null,
  })));
});

router.get("/stores/:storeId/products/:productId", async (req, res): Promise<void> => {
  const storeId = req.params.storeId as string;
  const productId = req.params.productId as string;
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

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const issues = await db
    .select()
    .from(gapsTable)
    .where(and(eq(gapsTable.productId, productId), eq(gapsTable.storeId, storeId)));

  const fixes = await db
    .select()
    .from(fixesTable)
    .where(and(eq(fixesTable.productId, productId), eq(fixesTable.storeId, storeId)));

  res.json({
    id: product.id,
    storeId: product.storeId,
    shopifyProductId: product.shopifyProductId,
    title: product.title,
    description: product.description,
    productType: product.productType,
    vendor: product.vendor,
    tags: product.tags,
    imageUrl: product.imageUrl,
    price: product.price,
    score: {
      clarity: product.clarityScore,
      completeness: product.completenessScore,
      trust: product.trustScore,
      tags: product.tagScore,
      overall: product.overallScore,
    },
    issues: issues.map(g => ({
      id: g.id,
      storeId: g.storeId,
      productId: g.productId,
      productTitle: null,
      category: g.category,
      severity: g.severity,
      title: g.title,
      description: g.description,
      suggestion: g.suggestion,
      evidence: g.evidence ?? null,
      impactScore: g.impactScore ?? 50,
      effortLevel: g.effortLevel ?? "medium",
      ruleId: g.ruleId ?? null,
      isFixed: g.isFixed,
    })),
    fixes: fixes.map(f => ({
      id: f.id,
      storeId: f.storeId,
      productId: f.productId,
      productTitle: null,
      type: f.type,
      status: f.status,
      title: f.title,
      originalContent: f.originalContent,
      improvedContent: f.improvedContent,
      explanation: f.explanation,
      estimatedScoreImprovement: f.estimatedScoreImprovement,
      createdAt: f.createdAt.toISOString(),
      appliedAt: f.appliedAt?.toISOString() ?? null,
    })),
    detectedCategory: product.detectedCategory ?? null,
    aiPerceptionSummary: product.aiPerceptionSummary,
    scoringSource: product.scoringSource ?? "rule",
    suggestedTags: product.suggestedTags,
    analyzedAt: product.analyzedAt?.toISOString() ?? null,
  });
});

router.post("/stores/:storeId/products/:productId/generate-fix", async (req, res): Promise<void> => {
  const storeId = req.params.storeId as string;
  const productId = req.params.productId as string;
  const { type } = req.body as { type?: string };
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

  const validTypes = ["description", "tags", "title", "structure", "schema"] as const;
  if (!type || !validTypes.includes(type as typeof validTypes[number])) {
    res.status(400).json({ error: "type must be one of: description, tags, title, structure, schema" });
    return;
  }
  const fixType = type as typeof validTypes[number];

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Return existing pending fix of this type if one exists (avoid duplicate generation)
  const [existing] = await db
    .select()
    .from(fixesTable)
    .where(and(
      eq(fixesTable.productId, productId),
      eq(fixesTable.storeId, storeId),
      eq(fixesTable.type, fixType),
      eq(fixesTable.status, "pending"),
    ));

  if (existing) {
    res.json({
      fix: {
        id: existing.id,
        storeId: existing.storeId,
        productId: existing.productId,
        type: existing.type,
        status: existing.status,
        title: existing.title,
        originalContent: existing.originalContent,
        improvedContent: existing.editedContent ?? existing.improvedContent,
        explanation: existing.explanation,
        roiRationale: existing.roiRationale ?? null,
        estimatedScoreImprovement: existing.estimatedScoreImprovement,
        shopifySynced: existing.shopifySynced,
        shopifyError: existing.shopifyError ?? null,
        createdAt: existing.createdAt.toISOString(),
        appliedAt: existing.appliedAt?.toISOString() ?? null,
      },
      generated: false,
    });
    return;
  }

  const originalContent = fixType === "tags"
    ? product.tags.join(", ")
    : fixType === "schema"
    ? JSON.stringify({ title: product.title, description: product.description, vendor: product.vendor, price: product.price })
    : product.description ?? product.title;

  req.log.info({ storeId, productId, fixType }, "Generating on-demand fix");

  const result = await generateFix(fixType, originalContent, {
    productTitle: product.title,
    productType: product.productType,
    vendor: product.vendor,
    detectedCategory: product.detectedCategory ?? undefined,
    currentScore: product.overallScore,
    price: product.price,
    imageUrl: product.imageUrl,
  });

  const fixId = generateId();
  const [inserted] = await db.insert(fixesTable).values({
    id: fixId,
    storeId,
    productId,
    type: fixType,
    status: "pending",
    title: `Improve ${fixType}: ${product.title}`,
    originalContent,
    improvedContent: result.improvedContent,
    explanation: result.explanation,
    roiRationale: result.roiRationale,
    estimatedScoreImprovement: result.estimatedScoreImprovement,
  }).returning();

  res.json({
    fix: {
      id: inserted.id,
      storeId: inserted.storeId,
      productId: inserted.productId,
      type: inserted.type,
      status: inserted.status,
      title: inserted.title,
      originalContent: inserted.originalContent,
      improvedContent: inserted.improvedContent,
      explanation: inserted.explanation,
      roiRationale: inserted.roiRationale ?? null,
      estimatedScoreImprovement: inserted.estimatedScoreImprovement,
      shopifySynced: inserted.shopifySynced,
      shopifyError: inserted.shopifyError ?? null,
      createdAt: inserted.createdAt.toISOString(),
      appliedAt: null,
    },
    generated: true,
  });
});

// ─── Upgrade 4: Answer-first structure generator ───────────────────────────────

router.get("/stores/:storeId/products/:productId/answer-first", async (req, res): Promise<void> => {
  const storeId = req.params.storeId as string;
  const productId = req.params.productId as string;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden" }); return; }

  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.storeId, storeId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // Fetch policy bodies for grounding (from perceptionReport)
  const [report] = await db.select().from(perceptionReportsTable)
    .where(eq(perceptionReportsTable.storeId, storeId));

  const policyBodies = report?.policyBodies as { shipping?: string | null; refund?: string | null } | null ?? null;

  req.log.info({ storeId, productId }, "Generating answer-first structure");
  const structure = await generateAnswerFirstStructure(
    {
      title: product.title,
      description: product.description,
      tags: product.tags,
      productType: product.productType,
      vendor: product.vendor,
      price: product.price,
    },
    policyBodies ? { shipping: policyBodies.shipping ?? null, refund: policyBodies.refund ?? null } : null
  );

  res.json({
    storeId,
    productId,
    productTitle: product.title,
    structure,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
