/**
 * Core analysis pipeline — shared between the HTTP route (user-triggered)
 * and the scheduler (cron-triggered). Job tracking lives in the route handler.
 */
import { performance } from "perf_hooks";
import { eq, ne, and, isNotNull, inArray } from "drizzle-orm";
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
  productScoreHistoryTable,
} from "@workspace/db";
import { analyzeProduct, analyzeStoreConsistency, generateFix, analyzePolicyQuality, simulateAgentQueries, analyzeImageQuality, analyzeReviewAlignment } from "./ai-analyzer";
import { buildPrioritizedActionPlan } from "./conversion-ranker";
import { simulateStorePerception } from "./perception-simulator";
import { ingestStore, type StoreSnapshot } from "./shopify-ingestion";
import { resolveAccessToken } from "./crypto";
import { runTechnicalSeoAudit } from "./technical-seo";
import { getAiFallbackStats } from "./ai-client";
import { logger } from "./logger";
import { generateId } from "./id";

/**
 * Deterministic gap ID — same store+product+rule always produces the same ID.
 * This lets us upsert gaps across analysis runs without losing isFixed state.
 * Format: "gap_{storeId}_{productId|store}_{ruleId|titleSlug}"
 */
function deterministicGapId(storeId: string, productId: string | null, ruleId: string | null, title: string): string {
  const scope = productId ?? "store";
  const rule = ruleId ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
  // Keep the IDs short enough to be readable while still unique
  const storeShort = storeId.slice(-8);
  const scopeShort = scope.slice(-8);
  return `gap_${storeShort}_${scopeShort}_${rule}`;
}

export interface PipelineResult {
  overallScore: number;
  clarityScore: number;
  completenessScore: number;
  trustScore: number;
  tagScore: number;
  consistencyScore: number;
  policyScore: number;
  totalProducts: number;
  criticalIssues: number;
  mediumIssues: number;
  lowIssues: number;
  pendingFixes: number;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(idx, sortedValues.length - 1))]!;
}

export async function executeAnalysisPipeline(
  store: typeof storesTable.$inferSelect,
  correlationId: string,
): Promise<PipelineResult> {
  const storeId = store.id;
  const analysisStart = performance.now();
  const stepTimings: Record<string, number> = {};

  function timeStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    return fn().then(
      (v) => { stepTimings[name] = Math.round(performance.now() - t0); return v; },
      (e) => { stepTimings[name] = Math.round(performance.now() - t0); throw e; },
    );
  }

  const CONCURRENCY = 5;
  let policyScore = 70;
  let snapshot: StoreSnapshot | null = null;
  let ingestFailureMessage: string | null = null;
  let oldGapIds: string[] = [];
  let oldFixIds: string[] = [];
  let oldProductIds: string[] = [];
  let prevScoreMap = new Map<string, { overallScore: number; clarityScore: number; completenessScore: number; trustScore: number; tagScore: number; issueCount: number }>();
  // Track IDs of all gaps upserted in this run — used to prune stale gaps at the end
  const upsertedGapIds = new Set<string>();

  // Helper: upsert a gap using deterministic ID. Preserves isFixed across runs.
  async function upsertGap(gap: {
    storeId: string; productId: string | null; category: string; severity: string;
    title: string; description: string; suggestion: string; evidence?: string | null;
    impactScore?: number; effortLevel?: string; ruleId?: string | null; isFixed?: boolean;
  }) {
    const id = deterministicGapId(gap.storeId, gap.productId, gap.ruleId ?? null, gap.title);
    upsertedGapIds.add(id);
    await db.insert(gapsTable).values({
      id, storeId: gap.storeId, productId: gap.productId ?? null,
      category: gap.category, severity: gap.severity, title: gap.title,
      description: gap.description, suggestion: gap.suggestion,
      evidence: gap.evidence ?? null, impactScore: gap.impactScore ?? 50,
      effortLevel: gap.effortLevel ?? "medium", ruleId: gap.ruleId ?? null,
      isFixed: false,
    }).onConflictDoUpdate({
      target: gapsTable.id,
      set: {
        // Update content fields so they stay fresh — but NEVER reset isFixed
        severity: gap.severity, description: gap.description,
        suggestion: gap.suggestion, evidence: gap.evidence ?? null,
        impactScore: gap.impactScore ?? 50, effortLevel: gap.effortLevel ?? "medium",
        category: gap.category, ruleId: gap.ruleId ?? null,
      },
    });
  }

  try {
    snapshot = await timeStep("ingestion", () =>
      ingestStore(store.domain, resolveAccessToken(store.accessToken)),
    );

    if (snapshot.products.length === 0) {
      throw new Error(
        "Shopify returned zero products. Use the shop's myshopify.com admin domain and an Admin API token with read_products scope.",
      );
    }

    const policyQuality = await analyzePolicyQuality(snapshot.policyBodies ?? { refund: null, shipping: null, privacy: null, terms: null });
    policyScore = policyQuality.score;

    const [preGaps, preFixes, preProducts, preProductScores] = await Promise.all([
      db.select({ id: gapsTable.id }).from(gapsTable).where(eq(gapsTable.storeId, storeId)),
      db.select({ id: fixesTable.id }).from(fixesTable).where(eq(fixesTable.storeId, storeId)),
      db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.storeId, storeId)),
      db.select({ shopifyProductId: productsTable.shopifyProductId, overallScore: productsTable.overallScore, clarityScore: productsTable.clarityScore, completenessScore: productsTable.completenessScore, trustScore: productsTable.trustScore, tagScore: productsTable.tagScore, issueCount: productsTable.issueCount }).from(productsTable).where(eq(productsTable.storeId, storeId)),
    ]);
    oldGapIds = preGaps.map((g) => g.id);
    oldFixIds = preFixes.map((f) => f.id);
    oldProductIds = preProducts.map((p) => p.id);
    prevScoreMap = new Map(preProductScores.map((p) => [p.shopifyProductId, p]));

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

    if (!snapshot.policies.refund) {
      await upsertGap({ storeId, productId: null, category: "policy", severity: "high", title: "Missing return policy", description: "No refund or return policy was found in your Shopify store.", suggestion: "Add a Refund Policy in Shopify Admin → Settings → Policies.", ruleId: "POLICY_REFUND_MISSING" });
    }
    if (!snapshot.policies.shipping) {
      await upsertGap({ storeId, productId: null, category: "policy", severity: "high", title: "Missing shipping policy", description: "No shipping policy was found in your Shopify store.", suggestion: "Add a Shipping Policy in Shopify Admin → Settings → Policies.", ruleId: "POLICY_SHIPPING_MISSING" });
    }
    if (!snapshot.faqPage) {
      await upsertGap({ storeId, productId: null, category: "completeness", severity: "medium", title: "No FAQ page", description: "No FAQ page was found. AI agents cannot answer common customer questions.", suggestion: "Create a page with a handle containing 'faq' to answer common questions.", ruleId: "FAQ_PAGE_MISSING" });
    }

    try {
      const productPageUrls = snapshot.products.slice(0, 5).map((p) => `https://${store.domain}/products/${p.handle}`);
      const seoResult = await runTechnicalSeoAudit(store.domain, productPageUrls);
      for (const gap of seoResult.gaps) {
        await upsertGap({ storeId, productId: null, category: gap.category, severity: gap.severity, title: gap.title, description: gap.description, suggestion: gap.suggestion, evidence: gap.evidence, impactScore: gap.impactScore, effortLevel: gap.effortLevel, ruleId: gap.ruleId });
      }
    } catch (seoErr) {
      logger.warn({ seoErr, storeId, correlationId }, "Technical SEO audit failed — skipping");
    }

    logger.info({ storeId, correlationId, productCount: snapshot.products.length }, "Shopify ingestion completed");
  } catch (ingestErr) {
    ingestFailureMessage = ingestErr instanceof Error ? ingestErr.message : "Unknown Shopify ingestion error";
    logger.warn({ ingestErr, storeId, correlationId }, "Shopify ingestion failed — analyzing existing products");
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

  const analysisResults: Array<{ product: typeof products[number]; analysis: Awaited<ReturnType<typeof analyzeProduct>>; imageQuality: Awaited<ReturnType<typeof analyzeImageQuality>> }> = [];
  const analysisT0 = performance.now();
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (product) => {
        const [analysis, imageQuality] = await Promise.all([
          analyzeProduct({
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
          analyzeImageQuality(product.imageUrl, product.title),
        ]);
        return { product, analysis, imageQuality };
      }),
    );
    analysisResults.push(...batchResults);
  }
  stepTimings["product_analysis"] = Math.round(performance.now() - analysisT0);

  // Run agent query simulation on the 5 lowest-scoring products (cost-efficient)
  const storeContext = {
    policies: {
      refund: Boolean(snapshot?.policies.refund),
      shipping: Boolean(snapshot?.policies.shipping),
    },
    faqBody: snapshot?.faqPage?.body ?? null,
  };
  // Review alignment: run on up to 5 products that have marketing superlatives in their description
  const SUPERLATIVE_RE = /\b(best|top|#1|award.?winning|most popular|best.?seller|highest.?rated|loved by|thousands|proven|guaranteed)\b/i;
  const alignmentCandidates = analysisResults
    .filter(({ product }) => SUPERLATIVE_RE.test(product.description ?? "") || product.reviewCount > 0)
    .slice(0, 5);
  const alignmentMap = new Map<string, Awaited<ReturnType<typeof analyzeReviewAlignment>>>();
  for (const { product } of alignmentCandidates) {
    try {
      const result = await analyzeReviewAlignment({
        title: product.title,
        description: product.description,
        reviewCount: product.reviewCount ?? 0,
        reviewRating: product.reviewRating ?? 0,
      });
      alignmentMap.set(product.id, result);
    } catch { /* non-critical */ }
  }

  const sortedForQa = [...analysisResults].sort((a, b) => a.analysis.overallScore - b.analysis.overallScore).slice(0, 5);
  const qaMap = new Map<string, Awaited<ReturnType<typeof simulateAgentQueries>>>();
  for (let i = 0; i < sortedForQa.length; i += CONCURRENCY) {
    const batch = sortedForQa.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async ({ product, analysis }) => {
      const qaResult = await simulateAgentQueries(
        { title: product.title, description: product.description, tags: product.tags, productType: product.productType, vendor: product.vendor, price: product.price, imageUrl: product.imageUrl, reviewCount: product.reviewCount ?? 0, hasStructuredData: product.hasStructuredData ?? false },
        analysis.detectedCategory,
        storeContext,
      );
      qaMap.set(product.id, qaResult);
    }));
  }

  let totalClarity = 0, totalCompleteness = 0, totalTrust = 0, totalTags = 0, totalOverall = 0;
  for (const { product, analysis, imageQuality } of analysisResults) {
    totalClarity += analysis.clarityScore;
    totalCompleteness += analysis.completenessScore;
    totalTrust += analysis.trustScore;
    totalTags += analysis.tagScore;
    totalOverall += analysis.overallScore;

    const qaResult = qaMap.get(product.id) ?? null;
    await db.update(productsTable).set({
      clarityScore: analysis.clarityScore,
      completenessScore: analysis.completenessScore,
      trustScore: analysis.trustScore,
      tagScore: analysis.tagScore,
      overallScore: analysis.overallScore,
      issueCount: analysis.issues.length,
      aiPerceptionSummary: analysis.aiPerceptionSummary,
      suggestedTags: analysis.suggestedTags,
      detectedCategory: analysis.detectedCategory as "electronics" | "fashion" | "beauty" | "sports" | "food" | "kids" | "home" | "general",
      scoringSource: analysis.scoringSource,
      imageQualityScore: imageQuality.score,
      imageQualityIssues: imageQuality.issues,
      ...(qaResult ? { aiQaResults: qaResult, aiQaCachedAt: new Date() } : {}),
      analyzedAt: new Date(),
    }).where(eq(productsTable.id, product.id));

    for (const issue of analysis.issues) {
      await upsertGap({ storeId, productId: product.id, category: issue.category, severity: issue.severity, title: issue.title, description: issue.description, suggestion: issue.suggestion, evidence: issue.evidence ?? null, impactScore: issue.impactScore ?? 50, effortLevel: issue.effortLevel ?? "medium", ruleId: issue.ruleId ?? null });
    }
    // Add review alignment gaps if score is low
    const alignmentResult = alignmentMap.get(product.id);
    if (alignmentResult && alignmentResult.alignmentScore < 65 && alignmentResult.unsupportedClaims.length > 0) {
      await upsertGap({
        storeId, productId: product.id, category: "trust", severity: alignmentResult.alignmentScore < 35 ? "high" : "medium",
        title: "Marketing claims lack review evidence",
        description: alignmentResult.summary,
        suggestion: "Remove or tone down unverifiable superlatives until backed by real customer reviews.",
        evidence: alignmentResult.unsupportedClaims.slice(0, 3).join("; "),
        impactScore: Math.round(100 - alignmentResult.alignmentScore), effortLevel: "low", ruleId: "REVIEW_ALIGNMENT_LOW",
      });
    }

    // Add image quality gaps if score is low
    if (imageQuality.score < 60 && imageQuality.issues.length > 0) {
      await upsertGap({
        storeId, productId: product.id, category: "trust", severity: imageQuality.score < 30 ? "high" : "medium",
        title: "Product image quality is low for AI agent recognition",
        description: imageQuality.issues.join(". "),
        suggestion: imageQuality.suggestions[0] ?? "Improve product image quality for better AI agent recognition.",
        evidence: `Image quality score: ${imageQuality.score}/100. ${imageQuality.productIdentifiable ? "Product is identifiable" : "Product is NOT clearly identifiable from image"}.`,
        impactScore: Math.round(100 - imageQuality.score), effortLevel: "medium", ruleId: "IMG_QUALITY_LOW",
      });
    }
  }

  // Write per-product score history with deltas
  if (analysisResults.length > 0) {
    const historyRows = analysisResults.map(({ product, analysis, imageQuality }) => {
      const prev = prevScoreMap.get(product.shopifyProductId);
      return {
        id: generateId(),
        storeId,
        productId: product.id,
        shopifyProductId: product.shopifyProductId,
        productTitle: product.title,
        overallScore: analysis.overallScore,
        clarityScore: analysis.clarityScore,
        completenessScore: analysis.completenessScore,
        trustScore: analysis.trustScore,
        tagScore: analysis.tagScore,
        imageQualityScore: imageQuality.score,
        issueCount: analysis.issues.length,
        deltaOverall: prev != null ? Math.round((analysis.overallScore - prev.overallScore) * 10) / 10 : null,
        deltaClarity: prev != null ? Math.round((analysis.clarityScore - prev.clarityScore) * 10) / 10 : null,
        deltaCompleteness: prev != null ? Math.round((analysis.completenessScore - prev.completenessScore) * 10) / 10 : null,
        deltaTrust: prev != null ? Math.round((analysis.trustScore - prev.trustScore) * 10) / 10 : null,
        deltaTags: prev != null ? Math.round((analysis.tagScore - prev.tagScore) * 10) / 10 : null,
        triggeredBy: "manual" as const,
        correlationId,
      };
    });
    await db.insert(productScoreHistoryTable).values(historyRows);
  }

  const allInsertedGaps = await db
    .select({ id: gapsTable.id, productId: gapsTable.productId, category: gapsTable.category, impactScore: gapsTable.impactScore })
    .from(gapsTable).where(eq(gapsTable.storeId, storeId));

  function pickGapId(productId: string, category: string): string | null {
    const matches = allInsertedGaps.filter((g) => g.productId === productId && g.category === category);
    if (matches.length === 0) return null;
    return matches.reduce((best, g) => ((g.impactScore ?? 0) > (best.impactScore ?? 0) ? g : best)).id;
  }

  const fixTasks = analysisResults.flatMap(({ product, analysis }) => {
    const tasks: Array<() => Promise<typeof allFixes[number]>> = [];
    if (analysis.completenessScore < 70) {
      tasks.push(async () => {
        const fix = await generateFix("description", product.description ?? product.title, { productTitle: product.title, productType: product.productType, vendor: product.vendor, detectedCategory: analysis.detectedCategory, currentScore: analysis.overallScore });
        return { id: generateId(), storeId, productId: product.id, sourceGapId: pickGapId(product.id, "completeness"), type: "description", status: "pending", title: `Improve description: ${product.title}`, originalContent: product.description ?? "", improvedContent: fix.improvedContent, explanation: fix.explanation, roiRationale: fix.roiRationale, estimatedScoreImprovement: fix.estimatedScoreImprovement };
      });
    }
    if (analysis.tagScore < 65) {
      tasks.push(async () => {
        const fix = await generateFix("tags", product.tags.join(", ") || product.title, { productTitle: product.title, productType: product.productType, vendor: product.vendor, detectedCategory: analysis.detectedCategory, currentScore: analysis.overallScore });
        return { id: generateId(), storeId, productId: product.id, sourceGapId: pickGapId(product.id, "tags"), type: "tags", status: "pending", title: `Optimize tags: ${product.title}`, originalContent: product.tags.join(", "), improvedContent: fix.improvedContent, explanation: fix.explanation, roiRationale: fix.roiRationale, estimatedScoreImprovement: fix.estimatedScoreImprovement };
      });
    }
    return tasks;
  });

  const allFixes: Array<{ id: string; storeId: string; productId: string | null; sourceGapId: string | null; type: string; status: string; title: string; originalContent: string; improvedContent: string; explanation: string; roiRationale: string; estimatedScoreImprovement: number }> = [];
  const fixT0 = performance.now();
  for (let i = 0; i < fixTasks.length; i += CONCURRENCY) {
    const batch = fixTasks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((task) => task()));
    allFixes.push(...results);
  }
  stepTimings["fix_generation"] = Math.round(performance.now() - fixT0);

  if (allFixes.length > 0) await db.insert(fixesTable).values(allFixes);

  if (snapshot) {
    if (oldFixIds.length > 0) {
      await db.delete(fixesTable).where(inArray(fixesTable.id, oldFixIds));
      // Reset hasAppliedFixes on all products — fix records were deleted.
      // It will be re-set as users re-apply fixes on the new analysis cycle.
      await db.update(productsTable)
        .set({ hasAppliedFixes: false })
        .where(eq(productsTable.storeId, storeId));
    }
    // Delete stale gaps: those that existed before this run AND were NOT re-upserted
    // AND are not fixed (preserve fixed gaps for history even if the rule no longer fires)
    const staleGapIds = oldGapIds.filter((id) => !upsertedGapIds.has(id));
    if (staleGapIds.length > 0) {
      await db.delete(gapsTable).where(
        and(
          inArray(gapsTable.id, staleGapIds),
          eq(gapsTable.isFixed, false),
        ),
      );
    }
    if (oldProductIds.length > 0) await db.delete(productsTable).where(inArray(productsTable.id, oldProductIds));
  }

  const productCount = products.length;
  const avgClarity = productCount > 0 ? totalClarity / productCount : 0;
  const avgCompleteness = productCount > 0 ? totalCompleteness / productCount : 0;
  const avgTrust = productCount > 0 ? totalTrust / productCount : 0;
  const avgTags = productCount > 0 ? totalTags / productCount : 0;
  const avgOverall = productCount > 0 ? totalOverall / productCount : 0;

  const consistency = await timeStep("consistency", () =>
    analyzeStoreConsistency(products.map((p) => ({ title: p.title, description: p.description, tags: p.tags }))),
  );

  await db.insert(consistencyReportsTable).values({
    storeId,
    overallConsistencyScore: consistency.overallConsistencyScore,
    issues: consistency.issues,
    suggestedStructure: consistency.suggestedStructure,
    analyzedAt: new Date(),
  }).onConflictDoUpdate({
    target: consistencyReportsTable.storeId,
    set: { overallConsistencyScore: consistency.overallConsistencyScore, issues: consistency.issues, suggestedStructure: consistency.suggestedStructure, analyzedAt: new Date() },
  });

  const allGaps = await db.select().from(gapsTable).where(eq(gapsTable.storeId, storeId));
  const productTitleMap = new Map(products.map((p) => [p.id, p.title]));
  const prioritizedActionPlan = buildPrioritizedActionPlan(
    allGaps.map((gap) => ({ id: gap.id, title: gap.title, severity: gap.severity as "high" | "medium" | "low", suggestion: gap.suggestion, productId: gap.productId, productTitle: gap.productId ? (productTitleMap.get(gap.productId) ?? null) : null, category: gap.category })),
  );

  const perceptionInputProducts = (snapshot?.products ?? products.map((p) => ({ shopifyId: p.shopifyProductId, title: p.title, description: p.description, productType: p.productType, vendor: p.vendor, tags: p.tags, collections: p.collections, imageUrl: p.imageUrl, price: p.price, reviewCount: p.reviewCount, reviewRating: p.reviewRating, hasStructuredData: p.hasStructuredData })));
  // Build per-product overallScore map so perception gets actual scores for richer narrative
  const productScoreMap = new Map(products.map((p) => [p.id, p.overallScore]));
  const perceptionTopGaps = allGaps
    .filter((g) => g.severity === "high" || g.severity === "medium")
    .slice(0, 12)
    .map((g) => ({ title: g.title, severity: g.severity as "high" | "medium" | "low", category: g.category }));
  const perception = await timeStep("perception", () =>
    simulateStorePerception({
      storeName: store.name,
      domain: store.domain,
      desiredPositioning: store.desiredPositioning ?? null,
      products: perceptionInputProducts.map((p, i) => ({
        title: p.title,
        description: p.description,
        tags: p.tags,
        collections: p.collections,
        reviewCount: p.reviewCount,
        reviewRating: p.reviewRating,
        hasStructuredData: p.hasStructuredData,
        vendor: p.vendor,
        price: p.price,
        overallScore: productScoreMap.get(products[i]?.id ?? "") ?? null,
      })),
      policies: snapshot?.policies ?? { refund: !allGaps.some((g) => /return policy|refund/i.test(g.title)), shipping: !allGaps.some((g) => /shipping policy/i.test(g.title)), privacy: false, terms: false },
      faqPage: snapshot?.faqPage ?? null,
      topGaps: perceptionTopGaps,
    }),
  );

  const storedPolicyBodies = snapshot?.policyBodies ? { refund: snapshot.policyBodies.refund, shipping: snapshot.policyBodies.shipping, privacy: snapshot.policyBodies.privacy, terms: snapshot.policyBodies.terms } : null;
  await db.insert(perceptionReportsTable).values({
    storeId, agentNarrative: perception.agentNarrative, unansweredQuestions: perception.unansweredQuestions, ambiguities: perception.ambiguities, perceivedStrengths: perception.perceivedStrengths, faqPageFound: Boolean(snapshot?.faqPage), faqPageTitle: snapshot?.faqPage?.title ?? null, faqQuestionCount: perception.faqQuestionCount, faqGaps: perception.faqGaps, policyBodies: storedPolicyBodies, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: perceptionReportsTable.storeId,
    set: { agentNarrative: perception.agentNarrative, unansweredQuestions: perception.unansweredQuestions, ambiguities: perception.ambiguities, perceivedStrengths: perception.perceivedStrengths, faqPageFound: Boolean(snapshot?.faqPage), faqPageTitle: snapshot?.faqPage?.title ?? null, faqQuestionCount: perception.faqQuestionCount, faqGaps: perception.faqGaps, policyBodies: storedPolicyBodies, updatedAt: new Date() },
  });

  const criticalIssues = allGaps.filter((g) => g.severity === "high").length;
  const mediumIssues = allGaps.filter((g) => g.severity === "medium").length;
  const lowIssues = allGaps.filter((g) => g.severity === "low").length;
  const pendingFixes = allFixes.length;

  // appliedFixes: old fixes are deleted on re-analysis, so the real applied count is always 0 post-analysis.
  // Fixes.ts increments this again as fixes are applied.
  await db.insert(storeSummariesTable).values({
    storeId, overallScore: avgOverall, clarityScore: avgClarity, completenessScore: avgCompleteness, trustScore: avgTrust, tagScore: avgTags, consistencyScore: consistency.overallConsistencyScore, policyScore, totalProducts: productCount, analyzedProducts: productCount, criticalIssues, mediumIssues, lowIssues, pendingFixes, appliedFixes: 0, prioritizedActionPlan, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: storeSummariesTable.storeId,
    set: { overallScore: avgOverall, clarityScore: avgClarity, completenessScore: avgCompleteness, trustScore: avgTrust, tagScore: avgTags, consistencyScore: consistency.overallConsistencyScore, policyScore, totalProducts: productCount, analyzedProducts: productCount, criticalIssues, mediumIssues, lowIssues, pendingFixes, appliedFixes: 0, prioritizedActionPlan, updatedAt: new Date() },
  });

  // CB-8: Precompute benchmark scores
  try {
    const peerSummaries = await db.select({ clarityScore: storeSummariesTable.clarityScore, completenessScore: storeSummariesTable.completenessScore, trustScore: storeSummariesTable.trustScore, tagScore: storeSummariesTable.tagScore, overallScore: storeSummariesTable.overallScore, consistencyScore: storeSummariesTable.consistencyScore, policyScore: storeSummariesTable.policyScore }).from(storeSummariesTable).where(and(ne(storeSummariesTable.storeId, storeId), isNotNull(storeSummariesTable.updatedAt)));
    const MIN_SAMPLE = 5;
    let bScores: Record<string, number>;
    let bSource: "real-p90" | "aspirational";
    if (peerSummaries.length >= MIN_SAMPLE) {
      const sortedVals = (key: keyof typeof peerSummaries[0]) => peerSummaries.map((s) => (s[key] as number) ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
      bScores = { clarity: Math.round(percentile(sortedVals("clarityScore"), 90)), completeness: Math.round(percentile(sortedVals("completenessScore"), 90)), trust: Math.round(percentile(sortedVals("trustScore"), 90)), tags: Math.round(percentile(sortedVals("tagScore"), 90)), overall: Math.round(percentile(sortedVals("overallScore"), 90)), consistency: Math.round(percentile(sortedVals("consistencyScore"), 90)), policy: Math.round(percentile(sortedVals("policyScore"), 90)) };
      bSource = "real-p90";
    } else {
      bScores = { clarity: 82, completeness: 78, trust: 75, tags: 72, overall: 79, consistency: 80, policy: 85 };
      bSource = "aspirational";
    }
    await db.update(storeSummariesTable).set({ benchmarkScores: bScores, benchmarkSource: bSource, benchmarkSampleSize: peerSummaries.length, benchmarkComputedAt: new Date() }).where(eq(storeSummariesTable.storeId, storeId));
  } catch (benchmarkErr) {
    logger.warn({ benchmarkErr, storeId, correlationId }, "Benchmark precomputation failed");
  }

  await db.update(storesTable).set({ status: "analyzed", lastAnalyzed: new Date(), overallScore: avgOverall, productCount }).where(eq(storesTable.id, storeId));

  const totalMs = Math.round(performance.now() - analysisStart);
  logger.info({ storeId, correlationId, totalDurationMs: totalMs, stepTimings, aiFallbackStats: getAiFallbackStats(), productCount }, "Analysis pipeline completed");

  return { overallScore: avgOverall, clarityScore: avgClarity, completenessScore: avgCompleteness, trustScore: avgTrust, tagScore: avgTags, consistencyScore: consistency.overallConsistencyScore, policyScore, totalProducts: productCount, criticalIssues, mediumIssues, lowIssues, pendingFixes };
}
