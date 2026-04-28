import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, storesTable, productsTable, storeSummariesTable, perceptionReportsTable } from "@workspace/db";
import {
  runQuerySimulation,
  analyzeTopicalAuthority,
  analyzeInternalLinks,
  generateLlmsTxt,
  generateFaqSchema,
  runProductAiQa,
  type PolicyBodies,
} from "../lib/ai-features";
import { computeCatalogHash } from "../lib/catalog-hash";
import { deployLlmsTxtPage } from "../lib/shopify-client";
import { resolveAccessToken } from "../lib/crypto";
import { getOwnedStore } from "../lib/owned-store";

const router: IRouter = Router();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden: Store does not belong to user" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  if (products.length === 0) {
    res.json({ storeId, results: [], message: "No products to simulate" });
    return;
  }

  const [summary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));
  const currentHash = computeCatalogHash(products);
  if (summary?.querySimulationCachedAt && summary.querySimulationResults) {
    const age = Date.now() - summary.querySimulationCachedAt.getTime();
    // CB-6: invalidate if catalog changed OR TTL expired
    const hashMatch = summary.queryCatalogHash === currentHash;
    if (age < CACHE_TTL_MS && hashMatch) {
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
    .set({ querySimulationResults: results, querySimulationCachedAt: new Date(), queryCatalogHash: currentHash })
    .where(eq(storeSummariesTable.storeId, storeId));

  const successCount = results.filter(r => r.wouldRecommend).length;
  res.json({ storeId, results, successCount, totalQueries: results.length, generatedAt: new Date().toISOString(), cached: false });
});

// ─── Topical Authority ────────────────────────────────────────────────────────

router.get("/stores/:storeId/topical-authority", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden: Store does not belong to user" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  if (products.length === 0) {
    res.json({ storeId, clusters: [], totalProducts: 0 });
    return;
  }

  const [storeSummary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));
  const topicalHash = computeCatalogHash(products);
  if (storeSummary?.topicalAuthorityCachedAt && storeSummary.topicalAuthorityResults) {
    const age = Date.now() - storeSummary.topicalAuthorityCachedAt.getTime();
    // CB-6: invalidate on catalog change OR TTL expiry
    const hashMatch = storeSummary.topicalCatalogHash === topicalHash;
    if (age < CACHE_TTL_MS && hashMatch) {
      const cached = storeSummary.topicalAuthorityResults as Array<{ coverageScore: number }>;
      const avgCoverage = cached.length ? Math.round(cached.reduce((s, c) => s + c.coverageScore, 0) / cached.length) : 0;
      res.json({ storeId, clusters: cached, totalProducts: products.length, averageCoverageScore: avgCoverage, generatedAt: storeSummary.topicalAuthorityCachedAt.toISOString(), cached: true });
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
    .set({ topicalAuthorityResults: clusters, topicalAuthorityCachedAt: new Date(), topicalCatalogHash: topicalHash })
    .where(eq(storeSummariesTable.storeId, storeId));

  const avgCoverage = clusters.length
    ? Math.round(clusters.reduce((s, c) => s + c.coverageScore, 0) / clusters.length)
    : 0;

  res.json({ storeId, clusters, totalProducts: products.length, averageCoverageScore: avgCoverage, generatedAt: new Date().toISOString(), cached: false });
});

// ─── Internal Link Audit ──────────────────────────────────────────────────────

router.get("/stores/:storeId/internal-links", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden: Store does not belong to user" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  if (products.length < 2) {
    res.json({ storeId, suggestions: [], message: "Need at least 2 products for link analysis" });
    return;
  }

  const [linksStoreSummary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));
  const linksHash = computeCatalogHash(products);
  if (linksStoreSummary?.internalLinksCachedAt && linksStoreSummary.internalLinksResults) {
    const age = Date.now() - linksStoreSummary.internalLinksCachedAt.getTime();
    // CB-6: invalidate on catalog change OR TTL expiry
    const hashMatch = linksStoreSummary.linksCatalogHash === linksHash;
    if (age < CACHE_TTL_MS && hashMatch) {
      res.json({ storeId, suggestions: linksStoreSummary.internalLinksResults, totalProducts: products.length, generatedAt: linksStoreSummary.internalLinksCachedAt.toISOString(), cached: true });
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
    .set({ internalLinksResults: suggestions, internalLinksCachedAt: new Date(), linksCatalogHash: linksHash })
    .where(eq(storeSummariesTable.storeId, storeId));

  res.json({ storeId, suggestions, totalProducts: products.length, generatedAt: new Date().toISOString(), cached: false });
});

// ─── FAQ Schema Generator ─────────────────────────────────────────────────────

router.get("/stores/:storeId/faq-schema", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden: Store does not belong to user" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const [report] = await db.select().from(perceptionReportsTable).where(eq(perceptionReportsTable.storeId, storeId));

  // Upgrade 3: pass real policy text bodies so FAQ answers are grounded, not hallucinated
  const policyBodies = (report?.policyBodies as PolicyBodies | null | undefined) ?? null;

  req.log.info({ storeId, hasPolicyBodies: Boolean(policyBodies) }, "Generating FAQ schema");
  const result = await generateFaqSchema(
    store.name ?? store.domain,
    products.map(p => ({ title: p.title, description: p.description, productType: p.productType })),
    (report?.faqGaps as string[] | undefined) ?? [],
    policyBodies
  );

  res.json({ storeId, ...result, policyGrounded: Boolean(policyBodies), generatedAt: new Date().toISOString() });
});

// ─── Product AI Q&A Test ──────────────────────────────────────────────────────

router.get("/stores/:storeId/products/:productId/ai-qa", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const productId = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden: Store does not belong to user" }); return; }

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

// ─── llms.txt Deploy to Shopify ───────────────────────────────────────────────

// POST /stores/:storeId/llms-txt/deploy
// Generates the llms.txt content then creates/updates /pages/llms on the store.
router.post("/stores/:storeId/llms-txt/deploy", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const store = await getOwnedStore(storeId, userId);
  if (!store) { res.status(403).json({ error: "Forbidden: Store does not belong to user" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));
  const [report] = await db.select().from(perceptionReportsTable).where(eq(perceptionReportsTable.storeId, storeId));

  const policyInfo = {
    hasFaq: report?.faqPageFound ?? false,
    faqTitle: report?.faqPageTitle ?? null,
    unansweredTopics: (report?.faqGaps as string[] | undefined) ?? [],
  };

  const content = await generateLlmsTxt(
    { name: store.name ?? store.domain, domain: store.domain, desiredPositioning: store.desiredPositioning },
    products.map((p) => ({ title: p.title, productType: p.productType, tags: p.tags, price: p.price })),
    policyInfo,
  );

  const accessToken = resolveAccessToken(store.accessToken);
  const deployResult = await deployLlmsTxtPage(store.domain, accessToken, content);

  res.json({
    storeId,
    domain: store.domain,
    pageUrl: deployResult.pageUrl,
    created: deployResult.created,
    content,
    deployedAt: new Date().toISOString(),
  });
});

export default router;
