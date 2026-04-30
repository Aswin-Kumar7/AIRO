import { Router, type IRouter, Request, Response } from "express";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import {
  db,
  storesTable,
  productsTable,
  storeSummariesTable,
  consistencyReportsTable,
  activityTable,
  jobsTable,
  gapsTable,
  scoreSnapshotsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { generateId } from "../lib/id";
import { analysisQueue } from "../lib/analysis-queue";
import { executeAnalysisPipeline, ASPIRATIONAL_BENCHMARK } from "../lib/analysis-pipeline";
import { getOwnedStore } from "../lib/owned-store";
import { getAiFallbackStats } from "../lib/ai-client";
import { percentile } from "../lib/math-utils";

const router: IRouter = Router();

const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Analysis rate limit exceeded. Please try again in an hour." },
  keyGenerator: (req) => req.session?.userId ?? ipKeyGenerator(req.ip ?? "127.0.0.1"),
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/stores/:storeId/analyze", analysisLimiter, async (req: Request, res: Response): Promise<void> => {
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
    try {
      const snapshotId = generateId();
      const result = await executeAnalysisPipeline(store, jobId);

      await db.insert(scoreSnapshotsTable).values({
        id: snapshotId,
        storeId,
        triggeredBy: "manual",
        overallScore: result.overallScore,
        clarityScore: result.clarityScore,
        completenessScore: result.completenessScore,
        trustScore: result.trustScore,
        tagScore: result.tagScore,
        consistencyScore: result.consistencyScore,
        policyScore: result.policyScore,
        totalProducts: result.totalProducts,
        analyzedProducts: result.totalProducts,
        criticalIssues: result.criticalIssues,
        mediumIssues: result.mediumIssues,
        lowIssues: result.lowIssues,
        emailSent: false,
        metadata: { jobId },
      });

      await db.insert(activityTable).values({
        id: generateId(),
        storeId,
        type: "analysis_completed",
        message: `Analysis complete — overall score: ${Math.round(result.overallScore)}/100`,
        metadata: { overallScore: result.overallScore, productCount: result.totalProducts, criticalIssues: result.criticalIssues, snapshotId },
      });

      await db.update(jobsTable).set({ status: "completed", completedAt: new Date(), errorMessage: null }).where(eq(jobsTable.id, jobId));
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
      await db.update(jobsTable).set({ status: "failed", completedAt: new Date(), errorMessage }).where(eq(jobsTable.id, jobId));
      await db.insert(scoreSnapshotsTable).values({
        id: generateId(),
        storeId,
        triggeredBy: "manual",
        error: errorMessage,
        emailSent: false,
        metadata: { jobId },
      });
    }
  });
});

router.get("/jobs/:jobId", async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.jobId as string;
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
  const store = await getOwnedStore(job.storeId, userId);
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

  const [report] = await db.select().from(consistencyReportsTable).where(eq(consistencyReportsTable.storeId, storeId));

  res.json({
    storeId,
    overallConsistencyScore: report?.overallConsistencyScore ?? 0,
    issues: (report?.issues as unknown[]) ?? [],
    suggestedStructure: report?.suggestedStructure ?? [],
    analyzedAt: report?.analyzedAt?.toISOString() ?? null,
  });
});

// ASPIRATIONAL_BENCHMARK and percentile() are imported — single source of truth

router.get("/stores/:storeId/benchmark", async (req: Request, res: Response): Promise<void> => {
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

  const [summary] = await db.select().from(storeSummariesTable).where(eq(storeSummariesTable.storeId, storeId));

  const cachedBenchmark = summary?.benchmarkScores as Record<string, number> | null;
  const cachedSource = (summary?.benchmarkSource as "real-p90" | "aspirational" | null) ?? null;
  const cachedSampleSize = summary?.benchmarkSampleSize ?? 0;

  let benchmarkScores: Record<keyof typeof ASPIRATIONAL_BENCHMARK, number>;
  let benchmarkSource: "real-p90" | "aspirational";
  let benchmarkSampleSize: number;

  if (cachedBenchmark && cachedSource) {
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
        allProducts.map((p) => p[key] ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
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
  ].map((d) => ({
    ...d,
    gap: d.benchmarkScore - d.storeScore,
    priority: (d.benchmarkScore - d.storeScore > 20 ? "high" : d.benchmarkScore - d.storeScore > 10 ? "medium" : "low") as "high" | "medium" | "low",
  }));

  const overallStoreScore = summary?.overallScore ?? 0;
  const topImprovements = [...dimensions]
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .filter((d) => d.gap > 0)
    .map((d) => `Improve ${d.name} by ${Math.round(d.gap)} points to match top AI-ready stores`);

  res.json({
    storeId,
    overallStoreScore,
    overallBenchmarkScore: benchmarkSource === "real-p90" ? benchmarkScores.overall : null,
    overallGap: benchmarkSource === "real-p90" ? benchmarkScores.overall - overallStoreScore : null,
    dimensions: dimensions.map((d) => ({
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

/**
 * GET /admin/ai-stats
 * Returns live AI provider fallback counts since server start.
 * Useful for monitoring which model (Gemini/OpenRouter/Groq) is serving requests
 * and how often the chain falls back — surfaced here for demo visibility.
 * Requires authentication; no store-level auth since it's global to the process.
 */
router.get("/admin/ai-stats", (req: Request, res: Response): void => {
  const userId = req.session?.userId;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }
  const stats = getAiFallbackStats();
  res.json({
    providers: stats,
    queueStatus: {
      running: analysisQueue.runningCount,
      queued: analysisQueue.queueLength,
    },
    note: "Counts reset on server restart. Use this endpoint to verify multi-model fallback is working.",
  });
});

export default router;
