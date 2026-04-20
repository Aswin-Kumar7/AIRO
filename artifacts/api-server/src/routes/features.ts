import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, storesTable, productsTable, storeSummariesTable, perceptionReportsTable } from "@workspace/db";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
import {
  runQuerySimulation,
  analyzeTopicalAuthority,
  analyzeInternalLinks,
  generateLlmsTxt,
  generateFaqSchema,
  runProductAiQa,
} from "../lib/ai-features";

const router: IRouter = Router();

// ─── LLMs.txt Generator ───────────────────────────────────────────────────────

router.get("/stores/:storeId/llms-txt", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [store] = await db.select().from(storesTable).where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId)));
  if (!store) { res.status(403).json({ error: "Forbidden: Store does not belong to user" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const [report] = await db.select().from(perceptionReportsTable).where(eq(perceptionReportsTable.storeId, storeId));

  const policyInfo = {
    hasFaq: report?.faqPageFound ?? false,
    faqTitle: report?.faqPageTitle ?? null,
    unansweredTopics: (report?.faqGaps as string[] | undefined) ?? [],
  };

  req.log.info({ storeId }, "Generating llms.txt");
  const content = await generateLlmsTxt(
    { name: store.name ?? store.domain, domain: store.domain, desiredPositioning: store.desiredPositioning },
    products.map(p => ({ title: p.title, productType: p.productType, tags: p.tags, price: p.price })),
    policyInfo
  );

  res.json({ storeId, domain: store.domain, content, generatedAt: new Date().toISOString() });
});

// ─── Live AI Query Simulation ─────────────────────────────────────────────────

router.get("/stores/:storeId/query-simulation", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  if (products.length === 0) {
    res.json({ storeId, results: [], message: "No products to simulate" });
    return;
  }

  const [summary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));
  if (summary?.querySimulationCachedAt && summary.querySimulationResults) {
    const age = Date.now() - summary.querySimulationCachedAt.getTime();
    if (age < CACHE_TTL_MS) {
      const cached = summary.querySimulationResults as Array<{ wouldRecommend: boolean }>;
      const successCount = cached.filter(r => r.wouldRecommend).length;
      res.json({ storeId, results: cached, successCount, totalQueries: cached.length, generatedAt: summary.querySimulationCachedAt.toISOString(), cached: true });
      return;
    }
  }

  req.log.info({ storeId, productCount: products.length }, "Running query simulation");
  const results = await runQuerySimulation(
    store.name ?? store.domain,
    store.desiredPositioning ?? "",
    products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      productType: p.productType,
      tags: p.tags,
      price: p.price,
    }))
  );

  await db.update(storeSummariesTable)
    .set({ querySimulationResults: results, querySimulationCachedAt: new Date() })
    .where(eq(storeSummariesTable.storeId, storeId));

  const successCount = results.filter(r => r.wouldRecommend).length;
  res.json({ storeId, results, successCount, totalQueries: results.length, generatedAt: new Date().toISOString(), cached: false });
});

// ─── Topical Authority ────────────────────────────────────────────────────────

router.get("/stores/:storeId/topical-authority", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  if (products.length === 0) {
    res.json({ storeId, clusters: [], totalProducts: 0 });
    return;
  }

  const [summary2] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));
  if (summary2?.topicalAuthorityCachedAt && summary2.topicalAuthorityResults) {
    const age = Date.now() - summary2.topicalAuthorityCachedAt.getTime();
    if (age < CACHE_TTL_MS) {
      const cached = summary2.topicalAuthorityResults as Array<{ coverageScore: number }>;
      const avgCoverage = cached.length ? Math.round(cached.reduce((s, c) => s + c.coverageScore, 0) / cached.length) : 0;
      res.json({ storeId, clusters: cached, totalProducts: products.length, averageCoverageScore: avgCoverage, generatedAt: summary2.topicalAuthorityCachedAt.toISOString(), cached: true });
      return;
    }
  }

  req.log.info({ storeId, productCount: products.length }, "Analyzing topical authority");
  const clusters = await analyzeTopicalAuthority(
    products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      productType: p.productType,
      tags: p.tags,
    }))
  );

  await db.update(storeSummariesTable)
    .set({ topicalAuthorityResults: clusters, topicalAuthorityCachedAt: new Date() })
    .where(eq(storeSummariesTable.storeId, storeId));

  const avgCoverage = clusters.length
    ? Math.round(clusters.reduce((s, c) => s + c.coverageScore, 0) / clusters.length)
    : 0;

  res.json({ storeId, clusters, totalProducts: products.length, averageCoverageScore: avgCoverage, generatedAt: new Date().toISOString(), cached: false });
});

// ─── Internal Link Audit ──────────────────────────────────────────────────────

router.get("/stores/:storeId/internal-links", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  if (products.length < 2) {
    res.json({ storeId, suggestions: [], message: "Need at least 2 products for link analysis" });
    return;
  }

  const [summary3] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));
  if (summary3?.internalLinksCachedAt && summary3.internalLinksResults) {
    const age = Date.now() - summary3.internalLinksCachedAt.getTime();
    if (age < CACHE_TTL_MS) {
      res.json({ storeId, suggestions: summary3.internalLinksResults, totalProducts: products.length, generatedAt: summary3.internalLinksCachedAt.toISOString(), cached: true });
      return;
    }
  }

  req.log.info({ storeId, productCount: products.length }, "Analyzing internal links");
  const suggestions = await analyzeInternalLinks(
    products.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      productType: p.productType,
      tags: p.tags,
    }))
  );

  await db.update(storeSummariesTable)
    .set({ internalLinksResults: suggestions, internalLinksCachedAt: new Date() })
    .where(eq(storeSummariesTable.storeId, storeId));

  res.json({ storeId, suggestions, totalProducts: products.length, generatedAt: new Date().toISOString(), cached: false });
});

// ─── FAQ Schema Generator ─────────────────────────────────────────────────────

router.get("/stores/:storeId/faq-schema", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const [report] = await db.select().from(perceptionReportsTable).where(eq(perceptionReportsTable.storeId, storeId));

  req.log.info({ storeId }, "Generating FAQ schema");
  const result = await generateFaqSchema(
    store.name ?? store.domain,
    products.map(p => ({ title: p.title, description: p.description, productType: p.productType })),
    (report?.faqGaps as string[] | undefined) ?? []
  );

  res.json({ storeId, ...result, generatedAt: new Date().toISOString() });
});

// ─── Product AI Q&A Test ──────────────────────────────────────────────────────

router.get("/stores/:storeId/products/:productId/ai-qa", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const productId = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!product || product.storeId !== storeId) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Serve from cache if fresh
  if (product.aiQaCachedAt && product.aiQaResults) {
    const age = Date.now() - product.aiQaCachedAt.getTime();
    if (age < CACHE_TTL_MS) {
      const cached = product.aiQaResults as Array<{ canAnswer: boolean }>;
      const answerable = cached.filter(r => r.canAnswer).length;
      res.json({
        storeId, productId, productTitle: product.title,
        results: cached, answerableCount: answerable, totalQuestions: cached.length,
        answerabilityScore: Math.round((answerable / cached.length) * 100),
        generatedAt: product.aiQaCachedAt.toISOString(), cached: true,
      });
      return;
    }
  }

  req.log.info({ storeId, productId }, "Running product AI Q&A test");
  const results = await runProductAiQa({
    title: product.title,
    description: product.description,
    tags: product.tags,
    productType: product.productType,
    vendor: product.vendor,
    price: product.price,
  });

  await db.update(productsTable)
    .set({ aiQaResults: results, aiQaCachedAt: new Date() })
    .where(eq(productsTable.id, productId));

  const answerable = results.filter(r => r.canAnswer).length;
  res.json({
    storeId,
    productId,
    productTitle: product.title,
    results,
    answerableCount: answerable,
    totalQuestions: results.length,
    answerabilityScore: Math.round((answerable / results.length) * 100),
    generatedAt: new Date().toISOString(),
    cached: false,
  });
});

export default router;
