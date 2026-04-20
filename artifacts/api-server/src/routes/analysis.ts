import { Router, type IRouter } from "express";
import { eq, avg, count, and, isNotNull, ne } from "drizzle-orm";
import {
  db,
  storesTable,
  productsTable,
  gapsTable,
  fixesTable,
  activityTable,
  storeSummariesTable,
  consistencyReportsTable,
  perceptionReportsTable,
  jobsTable,
} from "@workspace/db";
import { analyzeProduct, analyzeStoreConsistency, generateFix, BENCHMARK } from "../lib/ai-analyzer";
import { buildPrioritizedActionPlan } from "../lib/conversion-ranker";
import { simulateStorePerception } from "../lib/perception-simulator";
import { ingestStore, type StoreSnapshot } from "../lib/shopify-ingestion";
import { logger } from "../lib/logger";
import { generateId } from "../lib/id";

const router: IRouter = Router();

router.post("/stores/:storeId/analyze", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const jobId = generateId();
  const startedAt = new Date().toISOString();

  await db.update(storesTable).set({ status: "analyzing" }).where(eq(storesTable.id, storeId));
  await db.insert(activityTable).values({
    id: generateId(),
    storeId,
    type: "analysis_started",
    message: "AI readiness analysis started",
    metadata: { jobId },
  });

  await db.insert(jobsTable).values({
    id: jobId,
    storeId,
    status: "running",
    startedAt: new Date(startedAt),
  });

  res.json({
    jobId,
    storeId,
    status: "running",
    startedAt,
    message: "Analysis started — analyzing your store with AI",
  });

  setImmediate(async () => {
    try {
      let policyScore = 70; // default when ingestion is unavailable
      let snapshot: StoreSnapshot | null = null;
      let ingestFailureMessage: string | null = null;

      try {
        snapshot = await ingestStore(store.domain, store.accessToken);

        if (snapshot.products.length === 0) {
          throw new Error(
            "Shopify returned zero products. Use the shop's myshopify.com admin domain and an Admin API token with read_products scope.",
          );
        }

        // Determine policy score from real data
        const policiesPresent = Object.values(snapshot.policies).filter(Boolean).length;
        policyScore = Math.round((policiesPresent / 4) * 100);

        // Delete old fixes and gaps before re-ingestion so scores are fresh
        await db.delete(fixesTable).where(eq(fixesTable.storeId, storeId));
        await db.delete(gapsTable).where(eq(gapsTable.storeId, storeId));
        await db.delete(productsTable).where(eq(productsTable.storeId, storeId));

        // Insert freshly ingested products
        if (snapshot.products.length > 0) {
          await db.insert(productsTable).values(
            snapshot.products.map((p) => ({
              id: generateId(),
              storeId,
              shopifyProductId: p.shopifyId,
              title: p.title,
              description: p.description,
              productType: p.productType,
              vendor: p.vendor,
              tags: p.tags,
              collections: p.collections,
              imageUrl: p.imageUrl,
              price: p.price,
              reviewCount: p.reviewCount,
              reviewRating: p.reviewRating,
              hasStructuredData: p.hasStructuredData,
            })),
          );
        }

        // Insert store-level policy gaps
        if (!snapshot.policies.refund) {
          await db.insert(gapsTable).values({
            id: generateId(),
            storeId,
            productId: null,
            category: "policy",
            severity: "high",
            title: "Missing return policy",
            description: "No refund or return policy was found in your Shopify store.",
            suggestion: "Add a Refund Policy in Shopify Admin → Settings → Policies.",
            isFixed: false,
          });
        }
        if (!snapshot.policies.shipping) {
          await db.insert(gapsTable).values({
            id: generateId(),
            storeId,
            productId: null,
            category: "policy",
            severity: "high",
            title: "Missing shipping policy",
            description: "No shipping policy was found in your Shopify store.",
            suggestion: "Add a Shipping Policy in Shopify Admin → Settings → Policies.",
            isFixed: false,
          });
        }
        if (!snapshot.faqPage) {
          await db.insert(gapsTable).values({
            id: generateId(),
            storeId,
            productId: null,
            category: "completeness",
            severity: "medium",
            title: "No FAQ page",
            description: "No FAQ page was found. AI agents cannot answer common customer questions.",
            suggestion: "Create a page with a handle containing 'faq' to answer common questions.",
            isFixed: false,
          });
        }

        logger.info(
          { storeId, productCount: snapshot.products.length },
          "Shopify ingestion completed",
        );
      } catch (ingestErr) {
        ingestFailureMessage = ingestErr instanceof Error ? ingestErr.message : "Unknown Shopify ingestion error";
        logger.warn(
          { ingestErr, storeId },
          "Shopify ingestion failed — analyzing existing products in database",
        );
        await db.delete(fixesTable).where(eq(fixesTable.storeId, storeId));
        await db.delete(gapsTable).where(eq(gapsTable.storeId, storeId));
      }

      const products = await db.select().from(productsTable).where(eq(productsTable.storeId, storeId));

      if (products.length === 0) {
        throw new Error(
          ingestFailureMessage
            ? `Shopify Admin fetch failed and there are no cached products to analyze. ${ingestFailureMessage}`
            : "No Shopify products are available to analyze.",
        );
      }

      // Analyze all products in parallel (capped at 5 concurrent AI calls)
      const CONCURRENCY = 5;
      const analysisResults: Array<{
        product: typeof products[number];
        analysis: Awaited<ReturnType<typeof analyzeProduct>>;
      }> = [];

      for (let i = 0; i < products.length; i += CONCURRENCY) {
        const batch = products.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (product) => ({
            product,
            analysis: await analyzeProduct({
              title: product.title,
              description: product.description,
              tags: product.tags,
              productType: product.productType,
              vendor: product.vendor,
              price: product.price,
              imageUrl: product.imageUrl,
              reviewCount: product.reviewCount ?? 0,
              hasStructuredData: product.hasStructuredData ?? false,
            }),
          }))
        );
        analysisResults.push(...batchResults);
      }

      // Flush scores and gaps to DB
      let totalClarity = 0;
      let totalCompleteness = 0;
      let totalTrust = 0;
      let totalTags = 0;
      let totalOverall = 0;

      for (const { product, analysis } of analysisResults) {
        totalClarity += analysis.clarityScore;
        totalCompleteness += analysis.completenessScore;
        totalTrust += analysis.trustScore;
        totalTags += analysis.tagScore;
        totalOverall += analysis.overallScore;

        await db.update(productsTable).set({
          clarityScore: analysis.clarityScore,
          completenessScore: analysis.completenessScore,
          trustScore: analysis.trustScore,
          tagScore: analysis.tagScore,
          overallScore: analysis.overallScore,
          issueCount: analysis.issues.length,
          aiPerceptionSummary: analysis.aiPerceptionSummary,
          suggestedTags: analysis.suggestedTags,
          analyzedAt: new Date(),
        }).where(eq(productsTable.id, product.id));

        for (const issue of analysis.issues) {
          await db.insert(gapsTable).values({
            id: generateId(),
            storeId,
            productId: product.id,
            category: issue.category,
            severity: issue.severity,
            title: issue.title,
            description: issue.description,
            suggestion: issue.suggestion,
            evidence: issue.evidence ?? null,
            impactScore: issue.impactScore ?? 50,
            effortLevel: issue.effortLevel ?? "medium",
            ruleId: issue.ruleId ?? null,
            isFixed: false,
          });
        }
      }

      // Generate fixes in parallel for products that need them
      const fixTasks = analysisResults.flatMap(({ product, analysis }) => {
        const tasks: Array<() => Promise<typeof allFixes[number]>> = [];
        if (analysis.completenessScore < 70) {
          tasks.push(async () => {
            const fix = await generateFix("description", product.description ?? product.title, {
              productTitle: product.title,
              productType: product.productType,
              vendor: product.vendor,
            });
            return {
              id: generateId(),
              storeId,
              productId: product.id,
              type: "description",
              status: "pending",
              title: `Improve description: ${product.title}`,
              originalContent: product.description ?? "",
              improvedContent: fix.improvedContent,
              explanation: fix.explanation,
              estimatedScoreImprovement: fix.estimatedScoreImprovement,
            };
          });
        }
        if (analysis.tagScore < 65) {
          tasks.push(async () => {
            const fix = await generateFix("tags", product.tags.join(", ") || product.title, {
              productTitle: product.title,
              productType: product.productType,
              vendor: product.vendor,
            });
            return {
              id: generateId(),
              storeId,
              productId: product.id,
              type: "tags",
              status: "pending",
              title: `Optimize tags: ${product.title}`,
              originalContent: product.tags.join(", "),
              improvedContent: fix.improvedContent,
              explanation: fix.explanation,
              estimatedScoreImprovement: fix.estimatedScoreImprovement,
            };
          });
        }
        return tasks;
      });

      const allFixes: Array<{
        id: string;
        storeId: string;
        productId: string | null;
        type: string;
        status: string;
        title: string;
        originalContent: string;
        improvedContent: string;
        explanation: string;
        estimatedScoreImprovement: number;
      }> = [];

      // Run fix generation in parallel batches
      for (let i = 0; i < fixTasks.length; i += CONCURRENCY) {
        const batch = fixTasks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((task) => task()));
        allFixes.push(...results);
      }

      if (allFixes.length > 0) {
        await db.insert(fixesTable).values(allFixes);
      }

      const productCount = products.length;
      const avgClarity = productCount > 0 ? totalClarity / productCount : 0;
      const avgCompleteness = productCount > 0 ? totalCompleteness / productCount : 0;
      const avgTrust = productCount > 0 ? totalTrust / productCount : 0;
      const avgTags = productCount > 0 ? totalTags / productCount : 0;
      const avgOverall = productCount > 0 ? totalOverall / productCount : 0;

      const consistency = await analyzeStoreConsistency(products.map(p => ({
        title: p.title,
        description: p.description,
        tags: p.tags,
      })));

      await db.insert(consistencyReportsTable).values({
        storeId,
        overallConsistencyScore: consistency.overallConsistencyScore,
        issues: consistency.issues,
        suggestedStructure: consistency.suggestedStructure,
        analyzedAt: new Date(),
      }).onConflictDoUpdate({
        target: consistencyReportsTable.storeId,
        set: {
          overallConsistencyScore: consistency.overallConsistencyScore,
          issues: consistency.issues,
          suggestedStructure: consistency.suggestedStructure,
          analyzedAt: new Date(),
        },
      });

      const allGaps = await db.select().from(gapsTable).where(eq(gapsTable.storeId, storeId));
      const productTitleMap = new Map(products.map((product) => [product.id, product.title]));
      const prioritizedActionPlan = buildPrioritizedActionPlan(
        allGaps.map((gap) => ({
          id: gap.id,
          title: gap.title,
          severity: gap.severity as "high" | "medium" | "low",
          suggestion: gap.suggestion,
          productId: gap.productId,
          productTitle: gap.productId ? productTitleMap.get(gap.productId) ?? null : null,
          category: gap.category,
        })),
      );

      const perceptionInputProducts = (snapshot?.products ?? products.map((product) => ({
        shopifyId: product.shopifyProductId,
        title: product.title,
        description: product.description,
        productType: product.productType,
        vendor: product.vendor,
        tags: product.tags,
        collections: product.collections,
        imageUrl: product.imageUrl,
        price: product.price,
        reviewCount: product.reviewCount,
        reviewRating: product.reviewRating,
        hasStructuredData: product.hasStructuredData,
      })));
      const perception = await simulateStorePerception({
        storeName: store.name,
        domain: store.domain,
        desiredPositioning: store.desiredPositioning ?? null,
        products: perceptionInputProducts.map((product) => ({
          title: product.title,
          description: product.description,
          tags: product.tags,
          collections: product.collections,
          reviewCount: product.reviewCount,
          reviewRating: product.reviewRating,
          hasStructuredData: product.hasStructuredData,
          vendor: product.vendor,
          price: product.price,
        })),
        policies: snapshot?.policies ?? {
          refund: !allGaps.some((gap) => /return policy|refund/i.test(gap.title)),
          shipping: !allGaps.some((gap) => /shipping policy/i.test(gap.title)),
          privacy: false,
          terms: false,
        },
        faqPage: snapshot?.faqPage ?? null,
      });

      await db.insert(perceptionReportsTable).values({
        storeId,
        agentNarrative: perception.agentNarrative,
        unansweredQuestions: perception.unansweredQuestions,
        ambiguities: perception.ambiguities,
        perceivedStrengths: perception.perceivedStrengths,
        faqPageFound: Boolean(snapshot?.faqPage),
        faqPageTitle: snapshot?.faqPage?.title ?? null,
        faqQuestionCount: perception.faqQuestionCount,
        faqGaps: perception.faqGaps,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: perceptionReportsTable.storeId,
        set: {
          agentNarrative: perception.agentNarrative,
          unansweredQuestions: perception.unansweredQuestions,
          ambiguities: perception.ambiguities,
          perceivedStrengths: perception.perceivedStrengths,
          faqPageFound: Boolean(snapshot?.faqPage),
          faqPageTitle: snapshot?.faqPage?.title ?? null,
          faqQuestionCount: perception.faqQuestionCount,
          faqGaps: perception.faqGaps,
          updatedAt: new Date(),
        },
      });

      const criticalIssues = allGaps.filter(g => g.severity === "high").length;
      const mediumIssues = allGaps.filter(g => g.severity === "medium").length;
      const lowIssues = allGaps.filter(g => g.severity === "low").length;
      const pendingFixes = allFixes.length;

      await db.insert(storeSummariesTable).values({
        storeId,
        overallScore: avgOverall,
        clarityScore: avgClarity,
        completenessScore: avgCompleteness,
        trustScore: avgTrust,
        tagScore: avgTags,
        consistencyScore: consistency.overallConsistencyScore,
        policyScore,
        totalProducts: productCount,
        analyzedProducts: productCount,
        criticalIssues,
        mediumIssues,
        lowIssues,
        pendingFixes,
        appliedFixes: 0,
        prioritizedActionPlan,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: storeSummariesTable.storeId,
        set: {
          overallScore: avgOverall,
          clarityScore: avgClarity,
          completenessScore: avgCompleteness,
          trustScore: avgTrust,
          tagScore: avgTags,
          consistencyScore: consistency.overallConsistencyScore,
          policyScore,
          totalProducts: productCount,
          analyzedProducts: productCount,
          criticalIssues,
          mediumIssues,
          lowIssues,
          pendingFixes,
          prioritizedActionPlan,
          updatedAt: new Date(),
        },
      });

      await db.update(storesTable).set({
        status: "analyzed",
        lastAnalyzed: new Date(),
        overallScore: avgOverall,
        productCount,
      }).where(eq(storesTable.id, storeId));

      await db.insert(activityTable).values({
        id: generateId(),
        storeId,
        type: "analysis_completed",
        message: `Analysis complete — overall score: ${Math.round(avgOverall)}/100`,
        metadata: { overallScore: avgOverall, productCount, criticalIssues },
      });

      logger.info({ storeId, avgOverall, productCount }, "Store analysis completed");
      await db.update(jobsTable).set({ status: "completed" }).where(eq(jobsTable.id, jobId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown analysis error";
      logger.error({ err, storeId }, "Store analysis failed");
      await db.update(storesTable).set({ status: "error" }).where(eq(storesTable.id, storeId));
      await db.insert(activityTable).values({
        id: generateId(),
        storeId,
        type: "analysis_failed",
        message: `Analysis failed — ${errorMessage}`,
        metadata: { error: errorMessage },
      });
      await db.update(jobsTable).set({ status: "failed" }).where(eq(jobsTable.id, jobId));
    }
  });
});

router.get("/jobs/:jobId", async (req, res): Promise<void> => {
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, req.params.jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({
    id: job.id,
    storeId: job.storeId,
    status: job.status,
    startedAt: job.startedAt.toISOString(),
  });
});

router.get("/stores/:storeId/summary", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const [summary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));

  res.json({
    storeId,
    storeName: store.name,
    overallScore: summary?.overallScore ?? 0,
    clarityScore: summary?.clarityScore ?? 0,
    completenessScore: summary?.completenessScore ?? 0,
    trustScore: summary?.trustScore ?? 0,
    tagScore: summary?.tagScore ?? 0,
    consistencyScore: summary?.consistencyScore ?? 0,
    policyScore: summary?.policyScore ?? 0,
    totalProducts: summary?.totalProducts ?? 0,
    analyzedProducts: summary?.analyzedProducts ?? 0,
    criticalIssues: summary?.criticalIssues ?? 0,
    mediumIssues: summary?.mediumIssues ?? 0,
    lowIssues: summary?.lowIssues ?? 0,
    pendingFixes: summary?.pendingFixes ?? 0,
    appliedFixes: summary?.appliedFixes ?? 0,
    lastAnalyzed: store.lastAnalyzed?.toISOString() ?? null,
  });
});

router.get("/stores/:storeId/gaps", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const gaps = await db.select({
    gap: gapsTable,
    productTitle: productsTable.title,
  })
    .from(gapsTable)
    .leftJoin(productsTable, eq(gapsTable.productId, productsTable.id))
    .where(eq(gapsTable.storeId, storeId))
    .orderBy(gapsTable.severity);

  res.json(gaps.map(({ gap, productTitle }) => ({
    id: gap.id,
    storeId: gap.storeId,
    productId: gap.productId,
    productTitle: productTitle ?? null,
    category: gap.category,
    severity: gap.severity,
    title: gap.title,
    description: gap.description,
    suggestion: gap.suggestion,
    evidence: gap.evidence ?? null,
    impactScore: gap.impactScore ?? 50,
    effortLevel: gap.effortLevel ?? "medium",
    ruleId: gap.ruleId ?? null,
    isFixed: gap.isFixed,
  })));
});

router.get("/stores/:storeId/consistency", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const [report] = await db.select().from(consistencyReportsTable).where(eq(consistencyReportsTable.storeId, storeId));

  res.json({
    storeId,
    overallConsistencyScore: report?.overallConsistencyScore ?? 0,
    issues: (report?.issues as unknown[]) ?? [],
    suggestedStructure: report?.suggestedStructure ?? [],
    analyzedAt: report?.analyzedAt?.toISOString() ?? null,
  });
});

// Aspirational targets used when not enough real data exists yet
const ASPIRATIONAL_BENCHMARK = {
  clarity: 82, completeness: 78, trust: 75, tags: 72, consistency: 80, policy: 85, overall: 79,
};

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(idx, sortedValues.length - 1))]!;
}

router.get("/stores/:storeId/benchmark", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const [summary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));

  // Fetch all analyzed products EXCEPT from this store to compute a real benchmark
  const allProducts = await db
    .select({
      clarityScore: productsTable.clarityScore,
      completenessScore: productsTable.completenessScore,
      trustScore: productsTable.trustScore,
      tagScore: productsTable.tagScore,
      overallScore: productsTable.overallScore,
    })
    .from(productsTable)
    .where(and(ne(productsTable.storeId, storeId), isNotNull(productsTable.analyzedAt)));

  // Compute P90 benchmarks from real data; fall back to aspirational if too few samples
  const MIN_SAMPLE = 10;
  let benchmarkScores: typeof ASPIRATIONAL_BENCHMARK;
  let benchmarkSource: "real-p90" | "aspirational";

  if (allProducts.length >= MIN_SAMPLE) {
    const sorted = (key: keyof typeof allProducts[0]) =>
      allProducts.map(p => p[key] ?? 0).filter(v => v > 0).sort((a, b) => a - b);

    benchmarkScores = {
      clarity:      Math.round(percentile(sorted("clarityScore"),      90)),
      completeness: Math.round(percentile(sorted("completenessScore"), 90)),
      trust:        Math.round(percentile(sorted("trustScore"),        90)),
      tags:         Math.round(percentile(sorted("tagScore"),          90)),
      overall:      Math.round(percentile(sorted("overallScore"),      90)),
      // Consistency and policy come from store-level, not per-product — use aspirational
      consistency:  ASPIRATIONAL_BENCHMARK.consistency,
      policy:       ASPIRATIONAL_BENCHMARK.policy,
    };
    benchmarkSource = "real-p90";
  } else {
    benchmarkScores = ASPIRATIONAL_BENCHMARK;
    benchmarkSource = "aspirational";
  }

  const storeScores = {
    clarity:      summary?.clarityScore ?? 0,
    completeness: summary?.completenessScore ?? 0,
    trust:        summary?.trustScore ?? 0,
    tags:         summary?.tagScore ?? 0,
    consistency:  summary?.consistencyScore ?? 0,
    policy:       summary?.policyScore ?? 0,
  };

  const dimensions = [
    { name: "Product Clarity",   storeScore: storeScores.clarity,      benchmarkScore: benchmarkScores.clarity },
    { name: "Completeness",      storeScore: storeScores.completeness,  benchmarkScore: benchmarkScores.completeness },
    { name: "Trust Signals",     storeScore: storeScores.trust,         benchmarkScore: benchmarkScores.trust },
    { name: "Tag Quality",       storeScore: storeScores.tags,          benchmarkScore: benchmarkScores.tags },
    { name: "Consistency",       storeScore: storeScores.consistency,   benchmarkScore: benchmarkScores.consistency },
    { name: "Policy Coverage",   storeScore: storeScores.policy,        benchmarkScore: benchmarkScores.policy },
  ].map(d => ({
    ...d,
    gap: d.benchmarkScore - d.storeScore,
    priority: (d.benchmarkScore - d.storeScore > 20 ? "high" : d.benchmarkScore - d.storeScore > 10 ? "medium" : "low") as "high" | "medium" | "low",
  }));

  const overallStoreScore = summary?.overallScore ?? 0;
  const topImprovements = [...dimensions]
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .filter(d => d.gap > 0)
    .map(d => `Improve ${d.name} by ${Math.round(d.gap)} points to match top AI-ready stores`);

  res.json({
    storeId,
    overallStoreScore,
    overallBenchmarkScore: benchmarkScores.overall,
    overallGap: benchmarkScores.overall - overallStoreScore,
    dimensions,
    topImprovements,
    benchmarkSource,
    benchmarkSampleSize: allProducts.length,
  });
});

export default router;
