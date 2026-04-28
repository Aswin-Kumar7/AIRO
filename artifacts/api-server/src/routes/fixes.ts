import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, fixesTable, productsTable, gapsTable, storeSummariesTable, storesTable, activityTable } from "@workspace/db";
import { updateShopifyProduct, verifyShopifyUpdate } from "../lib/shopify-client";
import { resolveAccessToken } from "../lib/crypto";
import { generateId } from "../lib/id";
import { getOwnedStore } from "../lib/owned-store";

const router: IRouter = Router();

function gapCategoryForFixType(fixType: string): string | null {
  if (fixType === "description" || fixType === "structure") return "completeness";
  if (fixType === "tags") return "tags";
  if (fixType === "title") return "clarity";
  if (fixType === "schema") return "trust";
  return null;
}

/**
 * Shared logic for applying a fix to Shopify and mirroring locally.
 * Refactored for better maintainability (L-4).
 */
async function applyFixToShopify(
  storeId: string,
  fix: typeof fixesTable.$inferSelect,
  contentToApply: string,
  store: typeof storesTable.$inferSelect,
  log: any
): Promise<{ shopifySynced: boolean; shopifyError: string | null }> {
  let shopifySynced = false;
  let shopifyError: string | null = null;
  const supportsSync = ["description", "tags", "title"].includes(fix.type);

  if (!fix.productId) {
    return { shopifySynced, shopifyError };
  }

  if (supportsSync) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, fix.productId));
    if (product) {
      try {
        const result = await updateShopifyProduct(
          store.domain,
          resolveAccessToken(store.accessToken),
          product.shopifyProductId,
          { type: fix.type as "description" | "tags" | "title", content: contentToApply },
        );
        shopifyError = result.error ?? null;

        if (result.success) {
          // Mirror locally
          if (fix.type === "description") {
            await db.update(productsTable)
              .set({ description: contentToApply, hasAppliedFixes: true })
              .where(eq(productsTable.id, fix.productId));
          } else if (fix.type === "tags") {
            const updatedTags = contentToApply.split(",").map((t) => t.trim()).filter(Boolean);
            await db.update(productsTable)
              .set({ tags: updatedTags, hasAppliedFixes: true })
              .where(eq(productsTable.id, fix.productId));
          } else if (fix.type === "title") {
            await db.update(productsTable)
              .set({ title: contentToApply, hasAppliedFixes: true })
              .where(eq(productsTable.id, fix.productId));
          }

          // Verify the write actually landed on Shopify
          try {
            const { verified, reason } = await verifyShopifyUpdate(
              store.domain,
              resolveAccessToken(store.accessToken),
              product.shopifyProductId,
              { type: fix.type as "description" | "tags" | "title", content: contentToApply },
            );
            shopifySynced = verified;
            if (!verified) shopifyError = reason ?? "Update written but Shopify verification failed";
          } catch {
            shopifySynced = false;
            shopifyError = "Verification call failed — please check Shopify manually";
          }
        }
      } catch (err) {
        shopifyError = err instanceof Error ? err.message : "Shopify write failed";
        log.warn({ err, fixId: fix.id, storeId }, "Shopify product update failed");
      }
    }
  } else {
    shopifySynced = false;
    shopifyError = fix.type === "structure" || fix.type === "schema"
      ? "Manual action required: Automation not available for this fix type. Please update your Shopify theme/metafields manually."
      : "Automation not yet supported for this fix type.";
  }

  return { shopifySynced, shopifyError };
}

router.get("/stores/:storeId/fixes", async (req, res): Promise<void> => {
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

  const fixes = await db.select({
    fix: fixesTable,
    productTitle: productsTable.title,
  })
    .from(fixesTable)
    .leftJoin(productsTable, eq(fixesTable.productId, productsTable.id))
    .where(eq(fixesTable.storeId, storeId));

  res.json(fixes.map(({ fix, productTitle }) => ({
    id: fix.id,
    storeId: fix.storeId,
    productId: fix.productId,
    sourceGapId: fix.sourceGapId ?? null,
    productTitle: productTitle ?? null,
    type: fix.type,
    status: fix.status,
    title: fix.title,
    originalContent: fix.originalContent,
    improvedContent: fix.editedContent ?? fix.improvedContent,
    explanation: fix.explanation,
    roiRationale: fix.roiRationale ?? null,
    estimatedScoreImprovement: fix.estimatedScoreImprovement,
    shopifySynced: fix.shopifySynced,
    shopifyError: fix.shopifyError ?? null,
    createdAt: fix.createdAt.toISOString(),
    appliedAt: fix.appliedAt?.toISOString() ?? null,
  })));
});

router.post("/stores/:storeId/fixes/:fixId/apply", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const fixId = Array.isArray(req.params.fixId) ? req.params.fixId[0] : req.params.fixId;
  const { improvedContent } = req.body as { improvedContent?: string };

  const [fix] = await db
    .select()
    .from(fixesTable)
    .where(and(eq(fixesTable.id, fixId), eq(fixesTable.storeId, storeId)));

  if (!fix) {
    res.status(404).json({ error: "Fix not found" });
    return;
  }

  if (fix.status === "applied") {
    res.json({ fixId, success: true, shopifySynced: fix.shopifySynced, shopifyError: fix.shopifyError ?? null, alreadyApplied: true });
    return;
  }

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

  const contentToApply = improvedContent?.trim() || fix.improvedContent;
  const { shopifySynced, shopifyError } = await applyFixToShopify(storeId, fix, contentToApply, store, req.log);

  // Update fix record
  await db.update(fixesTable).set({
    status: "applied",
    appliedAt: new Date(),
    editedContent: improvedContent?.trim() || null,
    shopifySynced,
    shopifyError,
  }).where(eq(fixesTable.id, fixId));

  // Update score + mark gaps fixed
  if (fix.productId) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, fix.productId));
    if (product) {
      const syncableType = ["description", "tags", "title"].includes(fix.type);
      // Only apply estimated score improvement if the change actually landed on Shopify,
      // or if the fix type doesn't require a Shopify write (structure/schema are manual).
      const scoreUpdatable = !syncableType || shopifySynced;
      const newScore = scoreUpdatable
        ? Math.min(100, product.overallScore + fix.estimatedScoreImprovement)
        : product.overallScore;
      await db.update(productsTable).set({ overallScore: newScore, hasAppliedFixes: true })
        .where(eq(productsTable.id, fix.productId));

      // CB-9: precise gap closure — target the exact source gap when known;
      // fall back to category-level closure for older fixes without a sourceGapId.
      const category = gapCategoryForFixType(fix.type);
      if (fix.sourceGapId) {
        await db.update(gapsTable)
          .set({ isFixed: true })
          .where(eq(gapsTable.id, fix.sourceGapId));
      } else if (category) {
        await db.update(gapsTable)
          .set({ isFixed: true })
          .where(
            and(
              eq(gapsTable.productId, fix.productId),
              eq(gapsTable.storeId, storeId),
              eq(gapsTable.category, category),
            ),
          );
      }
    }
  }

  await db.insert(activityTable).values({
    id: generateId(),
    storeId,
    type: "fix_applied",
    message: `Fix applied: ${fix.title}${shopifySynced ? " (synced to Shopify)" : shopifyError ? " (Shopify sync failed)" : ""}`,
    metadata: { fixId, fixType: fix.type, shopifySynced },
  });

  // Refresh summary counts + invalidate stale benchmark (scores changed)
  const allFixes = await db.select().from(fixesTable).where(eq(fixesTable.storeId, storeId));
  const pendingFixesCount = allFixes.filter((f) => f.status === "pending").length;
  const appliedFixesCount = allFixes.filter((f) => f.status === "applied").length;
  await db.update(storeSummariesTable).set({
    pendingFixes: pendingFixesCount,
    appliedFixes: appliedFixesCount,
    benchmarkComputedAt: null,
    updatedAt: new Date(),
  }).where(eq(storeSummariesTable.storeId, storeId));

  res.json({ fixId, success: true, shopifySynced, shopifyError });
});

router.post("/stores/:storeId/fixes/bulk-apply", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const { fixIds } = req.body as { fixIds?: string[] };

  if (!fixIds || !Array.isArray(fixIds)) {
    res.status(400).json({ error: "fixIds array is required" });
    return;
  }

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

  const results: Array<{ fixId: string; success: boolean; shopifySynced: boolean; shopifyError: string | null }> = [];

  for (const fixId of fixIds) {
    const [fix] = await db.select().from(fixesTable)
      .where(and(eq(fixesTable.id, fixId), eq(fixesTable.storeId, storeId)));

    if (!fix || fix.status === "applied") {
      results.push({ fixId, success: false, shopifySynced: false, shopifyError: null });
      continue;
    }

    const contentToApply = fix.editedContent ?? fix.improvedContent;
    const { shopifySynced, shopifyError } = await applyFixToShopify(storeId, fix, contentToApply, store, req.log);

    await db.update(fixesTable).set({ status: "applied", appliedAt: new Date(), shopifySynced, shopifyError })
      .where(eq(fixesTable.id, fixId));

    if (fix.productId) {
      await db.update(productsTable).set({ hasAppliedFixes: true }).where(eq(productsTable.id, fix.productId));
      // CB-9: precise gap closure (same logic as single-apply)
      const category = gapCategoryForFixType(fix.type);
      if (fix.sourceGapId) {
        await db.update(gapsTable).set({ isFixed: true }).where(eq(gapsTable.id, fix.sourceGapId));
      } else if (category) {
        await db.update(gapsTable).set({ isFixed: true })
          .where(
            and(
              eq(gapsTable.productId, fix.productId),
              eq(gapsTable.storeId, storeId),
              eq(gapsTable.category, category),
            ),
          );
      }
    }

    await db.insert(activityTable).values({
      id: generateId(), storeId, type: "fix_applied",
      message: `Fix applied: ${fix.title}${shopifySynced ? " (synced to Shopify)" : ""}`,
      metadata: { fixId, fixType: fix.type, shopifySynced, bulk: true },
    });

    results.push({ fixId, success: true, shopifySynced, shopifyError });
  }

  const allFixes = await db.select().from(fixesTable).where(eq(fixesTable.storeId, storeId));
  const pendingFixesCount = allFixes.filter((f) => f.status === "pending").length;
  const appliedFixCount = allFixes.filter((f) => f.status === "applied").length;
  await db.update(storeSummariesTable).set({
    pendingFixes: pendingFixesCount,
    appliedFixes: appliedFixCount,
    benchmarkComputedAt: null,
    updatedAt: new Date(),
  }).where(eq(storeSummariesTable.storeId, storeId));

  const applied = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  res.json({ applied, failed, results });
});

export default router;
