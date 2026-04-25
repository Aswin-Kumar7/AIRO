import { performance } from "perf_hooks";
import { Router, type IRouter, Request, Response } from "express";
import { eq, avg, count, and, isNotNull, ne, inArray } from "drizzle-orm";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
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
import { analyzeProduct, analyzeStoreConsistency, generateFix } from "../lib/ai-analyzer";
import { getAiFallbackStats } from "../lib/ai-client";
import { buildPrioritizedActionPlan } from "../lib/conversion-ranker";
import { simulateStorePerception } from "../lib/perception-simulator";
import { ingestStore, type StoreSnapshot } from "../lib/shopify-ingestion";
import { resolveAccessToken } from "../lib/crypto";
import { runTechnicalSeoAudit } from "../lib/technical-seo";
import { logger } from "../lib/logger";
import { generateId } from "../lib/id";
import { analysisQueue } from "../lib/analysis-queue";

const router: IRouter = Router();

async function requireOwnedStore(storeId: string, userId: string | undefined) {
  if (!userId) {
    return null;
  }
  const [store] = await db
    .select()
    .from(storesTable)
    .where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId)));
  return store ?? null;
}

const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each user to 5 analysis runs per hour
  message: { error: "Analysis rate limit exceeded. Please try again in an hour." },
  keyGenerator: (req) => req.session?.userId ?? ipKeyGenerator(req.ip ?? "127.0.0.1"),
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/stores/:storeId/analyze", analysisLimiter, async (req: Request, res: Response): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
    return;
  }

  // CB-12: Idempotency key — if the client retries with the same key, return the existing job
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
  if (idempotencyKey) {
    const [existingJob] = await db
      .select()
      .from(jobsTable)
      .where(and(eq(jobsTable.storeId, storeId), eq(jobsTable.idempotencyKey, idempotencyKey)));
    if (existingJob) {
      res.json({
        jobId: existingJob.id,
        storeId,
        status: existingJob.status,
        startedAt: existingJob.startedAt.toISOString(),
        idempotent: true,
        message: "Returning existing job for this idempotency key",
      });
      return;
    }
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
    idempotencyKey: idempotencyKey ?? null,
  });

  res.json({
    jobId,
    storeId,
    status: "running",
    startedAt,
    message: "Analysis started — analyzing your store with AI",
  });

  analysisQueue.enqueue(jobId, async () => {
    const analysisStart = performance.now();
    const stepTimings: Record<string, number> = {};

    function timeStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const t0 = performance.now();
      return fn().then(
        (v) => { stepTimings[name] = Math.round(performance.now() - t0); return v; },
        (e) => { stepTimings[name] = Math.round(performance.now() - t0); throw e; }
      );
    }

    try {
      let policyScore = 70; // default when ingestion is unavailable
      let snapshot: StoreSnapshot | null = null;
      let ingestFailureMessage: string | null = null;
      // CB-2: Track old row IDs so we can do an atomic swap after new data is fully written
      let oldGapIds: string[] = [];
      let oldFixIds: string[] = [];
      let oldProductIds: string[] = [];

      try {
        snapshot = await timeStep("ingestion", () => ingestStore(store.domain, resolveAccessToken(store.accessToken)));

        if (snapshot.products.length === 0) {
          throw new Error(
            "Shopify returned zero products. Use the shop's myshopify.com admin domain and an Admin API token with read_products scope.",
          );
        }

        // Determine policy score from real data
        const policiesPresent = Object.values(snapshot.policies).filter(Boolean).length;
        policyScore = Math.round((policiesPresent / 4) * 100);

        // CB-2: Record existing IDs *before* inserting new data.
        // New data will be written alongside old data; once everything is in DB
        // we delete old rows via their IDs — eliminating the 30-60s empty window.
        const [preGaps, preFixes, preProducts] = await Promise.all([
          db.select({ id: gapsTable.id }).from(gapsTable).where(eq(gapsTable.storeId, storeId)),
          db.select({ id: fixesTable.id }).from(fixesTable).where(eq(fixesTable.storeId, storeId)),
          db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.storeId, storeId)),
        ]);
        oldGapIds = preGaps.map(g => g.id);
        oldFixIds = preFixes.map(f => f.id);
        oldProductIds = preProducts.map(p => p.id);

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

        // Upgrade 1: Technical SEO + crawlability audit (store-level gaps)
        try {
          // Use product handle for clean Shopify URLs (e.g. /products/my-product-slug)
          const productPageUrls = snapshot.products.slice(0, 5).map(p =>
            `https://${store.domain}/products/${p.handle}`
          );
          const seoResult = await runTechnicalSeoAudit(store.domain, productPageUrls);
          if (seoResult.gaps.length > 0) {
            await db.insert(gapsTable).values(
              seoResult.gaps.map(gap => ({
                id: generateId(),
                storeId,
                productId: null,
                category: gap.category,
                severity: gap.severity,
                title: gap.title,
                description: gap.description,
                suggestion: gap.suggestion,
                evidence: gap.evidence,
                impactScore: gap.impactScore,
                effortLevel: gap.effortLevel,
                ruleId: gap.ruleId,
                isFixed: false,
              }))
            );
          }
          logger.info(
            { storeId, jobId, correlationId: jobId, seoGaps: seoResult.gaps.length, robotsTxtFound: seoResult.robotsTxtFound, sitemapFound: seoResult.sitemapFound },
            "Technical SEO audit completed",
          );
        } catch (seoErr) {
          // Non-fatal: SEO audit failure should not block the rest of analysis
          logger.warn({ seoErr, storeId, correlationId: jobId }, "Technical SEO audit failed — skipping store-level SEO gaps");
        }

        logger.info(
          { storeId, jobId, correlationId: jobId, productCount: snapshot.products.length },
          "Shopify ingestion completed",
        );
      } catch (ingestErr) {
        ingestFailureMessage = ingestErr instanceof Error ? ingestErr.message : "Unknown Shopify ingestion error";
        logger.warn(
          { ingestErr, storeId, correlationId: jobId },
          "Shopify ingestion failed — analyzing existing products in database",
        );
        // Ingestion failed: existing products stay in DB (no empty window).
        // Clear old gaps and fixes so re-analysis can insert fresh ones without duplicates.
        // Product rows are unchanged, so we scope deletes by storeId (safe here — no new
        // products are being inserted concurrently on this path).
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

      const analysisT0 = performance.now();
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
      stepTimings["product_analysis"] = Math.round(performance.now() - analysisT0);

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
          scoringSource: analysis.scoringSource, // CB-11: provenance
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

      // Build a gap-lookup map keyed by (productId + category) → highest-impact gapId
      // Used to link each generated fix to its source gap (CB-9 precise closure)
      const allInsertedGaps = await db
        .select({ id: gapsTable.id, productId: gapsTable.productId, category: gapsTable.category, impactScore: gapsTable.impactScore })
        .from(gapsTable)
        .where(eq(gapsTable.storeId, storeId));

      function pickGapId(productId: string, category: string): string | null {
        const matches = allInsertedGaps.filter(g => g.productId === productId && g.category === category);
        if (matches.length === 0) return null;
        return matches.reduce((best, g) => ((g.impactScore ?? 0) > (best.impactScore ?? 0) ? g : best)).id;
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
              sourceGapId: pickGapId(product.id, "completeness"),
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
              sourceGapId: pickGapId(product.id, "tags"),
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
        sourceGapId: string | null;
        type: string;
        status: string;
        title: string;
        originalContent: string;
        improvedContent: string;
        explanation: string;
        estimatedScoreImprovement: number;
      }> = [];

      // Run fix generation in parallel batches
      const fixT0 = performance.now();
      for (let i = 0; i < fixTasks.length; i += CONCURRENCY) {
        const batch = fixTasks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((task) => task()));
        allFixes.push(...results);
      }
      stepTimings["fix_generation"] = Math.round(performance.now() - fixT0);

      if (allFixes.length > 0) {
        await db.insert(fixesTable).values(allFixes);
      }

      // CB-2: Atomic swap — all new products/gaps/fixes are now in DB.
      // Delete the old rows by their pre-recorded IDs so the UI never sees an empty store.
      if (snapshot) {
        if (oldFixIds.length > 0) {
          await db.delete(fixesTable).where(inArray(fixesTable.id, oldFixIds));
        }
        if (oldGapIds.length > 0) {
          await db.delete(gapsTable).where(inArray(gapsTable.id, oldGapIds));
        }
        if (oldProductIds.length > 0) {
          await db.delete(productsTable).where(inArray(productsTable.id, oldProductIds));
        }
      }

      const productCount = products.length;
      const avgClarity = productCount > 0 ? totalClarity / productCount : 0;
      const avgCompleteness = productCount > 0 ? totalCompleteness / productCount : 0;
      const avgTrust = productCount > 0 ? totalTrust / productCount : 0;
      const avgTags = productCount > 0 ? totalTags / productCount : 0;
      const avgOverall = productCount > 0 ? totalOverall / productCount : 0;

      const consistency = await timeStep("consistency", () => analyzeStoreConsistency(products.map(p => ({
        title: p.title,
        description: p.description,
        tags: p.tags,
      }))));

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
      const perception = await timeStep("perception", () => simulateStorePerception({
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
      }));

      // Upgrade 3: persist policy bodies for FAQ schema grounding
      const storedPolicyBodies = snapshot?.policyBodies
        ? {
            refund: snapshot.policyBodies.refund,
            shipping: snapshot.policyBodies.shipping,
            privacy: snapshot.policyBodies.privacy,
            terms: snapshot.policyBodies.terms,
          }
        : null;

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
        policyBodies: storedPolicyBodies,
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
          policyBodies: storedPolicyBodies,
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

      // CB-8: Compute and cache benchmark scores from peer store summaries (O(stores) not O(products)).
      // This runs once per analysis rather than on every benchmark request.
      try {
        const peerSummaries = await db
          .select({
            clarityScore: storeSummariesTable.clarityScore,
            completenessScore: storeSummariesTable.completenessScore,
            trustScore: storeSummariesTable.trustScore,
            tagScore: storeSummariesTable.tagScore,
            overallScore: storeSummariesTable.overallScore,
            consistencyScore: storeSummariesTable.consistencyScore,
            policyScore: storeSummariesTable.policyScore,
          })
          .from(storeSummariesTable)
          .where(and(ne(storeSummariesTable.storeId, storeId), isNotNull(storeSummariesTable.updatedAt)));

        const MIN_SAMPLE = 5; // lower threshold for store-level P90 vs product-level
        let bScores: Record<string, number>;
        let bSource: "real-p90" | "aspirational";

        if (peerSummaries.length >= MIN_SAMPLE) {
          const sortedVals = (key: keyof typeof peerSummaries[0]) =>
            peerSummaries.map(s => (s[key] as number) ?? 0).filter(v => v > 0).sort((a, b) => a - b);
          bScores = {
            clarity:      Math.round(percentile(sortedVals("clarityScore"),      90)),
            completeness: Math.round(percentile(sortedVals("completenessScore"), 90)),
            trust:        Math.round(percentile(sortedVals("trustScore"),        90)),
            tags:         Math.round(percentile(sortedVals("tagScore"),          90)),
            overall:      Math.round(percentile(sortedVals("overallScore"),      90)),
            consistency:  Math.round(percentile(sortedVals("consistencyScore"),  90)),
            policy:       Math.round(percentile(sortedVals("policyScore"),       90)),
          };
          bSource = "real-p90";
        } else {
          bScores = { clarity: 82, completeness: 78, trust: 75, tags: 72, overall: 79, consistency: 80, policy: 85 };
          bSource = "aspirational";
        }

        await db.update(storeSummariesTable).set({
          benchmarkScores: bScores,
          benchmarkSource: bSource,
          benchmarkSampleSize: peerSummaries.length,
          benchmarkComputedAt: new Date(),
        }).where(eq(storeSummariesTable.storeId, storeId));

        logger.info({ storeId, jobId, benchmarkSource: bSource, benchmarkSampleSize: peerSummaries.length }, "Benchmark scores precomputed");
      } catch (benchmarkErr) {
        logger.warn({ benchmarkErr, storeId, jobId }, "Benchmark precomputation failed — will fall back to on-demand O(N) query");
      }

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

      const totalMs = Math.round(performance.now() - analysisStart);
      logger.info(
        { storeId, jobId, totalDurationMs: totalMs, stepTimings, aiFallbackStats: getAiFallbackStats(), productCount },
        "Analysis pipeline completed — timing breakdown",
      );
      logger.info({ storeId, jobId, avgOverall, productCount }, "Store analysis completed");
      await db
        .update(jobsTable)
        .set({ status: "completed", completedAt: new Date(), errorMessage: null })
        .where(eq(jobsTable.id, jobId));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown analysis error";
      logger.error({ err, storeId, correlationId: jobId }, "Store analysis failed");
      await db.update(storesTable).set({ status: "error" }).where(eq(storesTable.id, storeId));
      await db.insert(activityTable).values({
        id: generateId(),
        storeId,
        type: "analysis_failed",
        message: `Analysis failed — ${errorMessage}`,
        metadata: { error: errorMessage },
      });
      await db
        .update(jobsTable)
        .set({ status: "failed", completedAt: new Date(), errorMessage })
        .where(eq(jobsTable.id, jobId));
    }
  });
});


router.get("/jobs/:jobId", async (req: Request, res: Response): Promise<void> => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const store = await requireOwnedStore(job.storeId, userId);
  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
    return;
  }
  res.json({
    id: job.id,
    storeId: job.storeId,
    status: job.status,
    startedAt: job.startedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    errorMessage: job.errorMessage ?? null,
  });
});

router.get("/stores/:storeId/summary", async (req: Request, res: Response): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
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

router.get("/stores/:storeId/gaps", async (req: Request, res: Response): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
    return;
  }
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

router.get("/stores/:storeId/consistency", async (req: Request, res: Response): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
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

router.get("/stores/:storeId/benchmark", async (req: Request, res: Response): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const store = await requireOwnedStore(storeId, userId);
  if (!store) {
    res.status(403).json({ error: "Forbidden: Store does not belong to user" });
    return;
  }

  const [summary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));

  // CB-8: Read precomputed benchmark from store_summaries (O(1)) instead of scanning all products (O(N))
  const cachedBenchmark = summary?.benchmarkScores as Record<string, number> | null;
  const cachedSource = (summary?.benchmarkSource as "real-p90" | "aspirational" | null) ?? null;
  const cachedSampleSize = summary?.benchmarkSampleSize ?? 0;

  let benchmarkScores: typeof ASPIRATIONAL_BENCHMARK;
  let benchmarkSource: "real-p90" | "aspirational";
  let benchmarkSampleSize: number;

  if (cachedBenchmark && cachedSource) {
    // Use precomputed data
    benchmarkScores = {
      clarity:      cachedBenchmark.clarity      ?? ASPIRATIONAL_BENCHMARK.clarity,
      completeness: cachedBenchmark.completeness ?? ASPIRATIONAL_BENCHMARK.completeness,
      trust:        cachedBenchmark.trust        ?? ASPIRATIONAL_BENCHMARK.trust,
      tags:         cachedBenchmark.tags         ?? ASPIRATIONAL_BENCHMARK.tags,
      overall:      cachedBenchmark.overall      ?? ASPIRATIONAL_BENCHMARK.overall,
      consistency:  cachedBenchmark.consistency  ?? ASPIRATIONAL_BENCHMARK.consistency,
      policy:       cachedBenchmark.policy       ?? ASPIRATIONAL_BENCHMARK.policy,
    };
    benchmarkSource = cachedSource;
    benchmarkSampleSize = cachedSampleSize;
  } else {
    // Fallback: on-demand O(N) scan (only if benchmark was never precomputed)
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

    const MIN_SAMPLE = 10;
    if (allProducts.length >= MIN_SAMPLE) {
      const sorted = (key: keyof typeof allProducts[0]) =>
        allProducts.map(p => p[key] ?? 0).filter(v => v > 0).sort((a, b) => a - b);
      benchmarkScores = {
        clarity:      Math.round(percentile(sorted("clarityScore"),      90)),
        completeness: Math.round(percentile(sorted("completenessScore"), 90)),
        trust:        Math.round(percentile(sorted("trustScore"),        90)),
        tags:         Math.round(percentile(sorted("tagScore"),          90)),
        overall:      Math.round(percentile(sorted("overallScore"),      90)),
        consistency:  ASPIRATIONAL_BENCHMARK.consistency,
        policy:       ASPIRATIONAL_BENCHMARK.policy,
      };
      benchmarkSource = "real-p90";
    } else {
      benchmarkScores = ASPIRATIONAL_BENCHMARK;
      benchmarkSource = "aspirational";
    }
    benchmarkSampleSize = allProducts.length;
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
    overallBenchmarkScore: benchmarkSource === "real-p90" ? benchmarkScores.overall : null,
    overallGap: benchmarkSource === "real-p90" ? benchmarkScores.overall - overallStoreScore : null,
    dimensions: dimensions.map(d => ({
      ...d,
      benchmarkScore: benchmarkSource === "real-p90" ? d.benchmarkScore : null,
      gap: benchmarkSource === "real-p90" ? d.gap : null,
      priority: benchmarkSource === "real-p90" ? d.priority : "low",
    })),
    topImprovements: benchmarkSource === "real-p90" ? topImprovements : [],
    benchmarkSource,
    benchmarkSampleSize,
  });
});

export default router;

