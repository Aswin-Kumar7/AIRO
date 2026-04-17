import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, fixesTable, productsTable, gapsTable, storeSummariesTable, storesTable, activityTable } from "@workspace/db";
import { updateShopifyProduct } from "../lib/shopify-client";
import { generateId } from "../lib/id";

const router: IRouter = Router();

router.get("/stores/:storeId/fixes", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;

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
    productTitle: productTitle ?? null,
    type: fix.type,
    status: fix.status,
    title: fix.title,
    originalContent: fix.originalContent,
    improvedContent: fix.editedContent ?? fix.improvedContent,
    explanation: fix.explanation,
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

  const contentToApply = improvedContent?.trim() || fix.improvedContent;

  // Shopify write-back
  let shopifySynced = false;
  let shopifyError: string | null = null;

  if (fix.productId && fix.type !== "structure") {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, fix.productId));
    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));

    if (product && store) {
      try {
        const result = await updateShopifyProduct(
          store.domain,
          store.accessToken,
          product.shopifyProductId,
          { type: fix.type as "description" | "tags" | "title", content: contentToApply },
        );
        shopifySynced = result.success;
        shopifyError = result.error ?? null;

        // Mirror the update into our local product record
        if (result.success) {
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
        }
      } catch (err) {
        shopifyError = err instanceof Error ? err.message : "Shopify write failed";
        req.log.warn({ err, fixId, storeId }, "Shopify product update failed");
      }
    }
  }

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
      const newScore = Math.min(100, product.overallScore + fix.estimatedScoreImprovement);
      await db.update(productsTable).set({ overallScore: newScore, hasAppliedFixes: true })
        .where(eq(productsTable.id, fix.productId));

      await db.update(gapsTable)
        .set({ isFixed: true })
        .where(and(eq(gapsTable.productId, fix.productId), eq(gapsTable.storeId, storeId)));
    }
  }

  await db.insert(activityTable).values({
    id: generateId(),
    storeId,
    type: "fix_applied",
    message: `Fix applied: ${fix.title}${shopifySynced ? " (synced to Shopify)" : shopifyError ? " (Shopify sync failed)" : ""}`,
    metadata: { fixId, fixType: fix.type, shopifySynced },
  });

  // Refresh summary counts
  const allFixes = await db.select().from(fixesTable).where(eq(fixesTable.storeId, storeId));
  const pendingFixes = allFixes.filter((f) => f.status === "pending").length;
  const appliedFixes = allFixes.filter((f) => f.status === "applied").length;
  await db.update(storeSummariesTable).set({ pendingFixes, appliedFixes, updatedAt: new Date() })
    .where(eq(storeSummariesTable.storeId, storeId));

  res.json({ fixId, success: true, shopifySynced, shopifyError });
});

router.post("/stores/:storeId/fixes/bulk-apply", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const { fixIds } = req.body as { fixIds?: string[] };

  if (!fixIds || !Array.isArray(fixIds)) {
    res.status(400).json({ error: "fixIds array is required" });
    return;
  }

  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));

  const results: Array<{ fixId: string; success: boolean; shopifySynced: boolean; shopifyError: string | null }> = [];

  for (const fixId of fixIds) {
    const [fix] = await db.select().from(fixesTable)
      .where(and(eq(fixesTable.id, fixId), eq(fixesTable.storeId, storeId)));

    if (!fix || fix.status === "applied") {
      results.push({ fixId, success: false, shopifySynced: false, shopifyError: null });
      continue;
    }

    const contentToApply = fix.editedContent ?? fix.improvedContent;
    let shopifySynced = false;
    let shopifyError: string | null = null;

    if (fix.productId && fix.type !== "structure" && store) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, fix.productId));
      if (product) {
        try {
          const result = await updateShopifyProduct(
            store.domain, store.accessToken, product.shopifyProductId,
            { type: fix.type as "description" | "tags" | "title", content: contentToApply },
          );
          shopifySynced = result.success;
          shopifyError = result.error ?? null;
          if (result.success) {
            if (fix.type === "description") {
              await db.update(productsTable).set({ description: contentToApply, hasAppliedFixes: true }).where(eq(productsTable.id, fix.productId));
            } else if (fix.type === "tags") {
              const updatedTags = contentToApply.split(",").map((t) => t.trim()).filter(Boolean);
              await db.update(productsTable).set({ tags: updatedTags, hasAppliedFixes: true }).where(eq(productsTable.id, fix.productId));
            } else if (fix.type === "title") {
              await db.update(productsTable).set({ title: contentToApply, hasAppliedFixes: true }).where(eq(productsTable.id, fix.productId));
            }
          }
        } catch (err) {
          shopifyError = err instanceof Error ? err.message : "Shopify write failed";
        }
      }
    }

    await db.update(fixesTable).set({ status: "applied", appliedAt: new Date(), shopifySynced, shopifyError })
      .where(eq(fixesTable.id, fixId));

    if (fix.productId) {
      await db.update(productsTable).set({ hasAppliedFixes: true }).where(eq(productsTable.id, fix.productId));
      await db.update(gapsTable).set({ isFixed: true })
        .where(and(eq(gapsTable.productId, fix.productId), eq(gapsTable.storeId, storeId)));
    }

    await db.insert(activityTable).values({
      id: generateId(), storeId, type: "fix_applied",
      message: `Fix applied: ${fix.title}${shopifySynced ? " (synced to Shopify)" : ""}`,
      metadata: { fixId, fixType: fix.type, shopifySynced, bulk: true },
    });

    results.push({ fixId, success: true, shopifySynced, shopifyError });
  }

  const allFixes = await db.select().from(fixesTable).where(eq(fixesTable.storeId, storeId));
  const pendingFixes = allFixes.filter((f) => f.status === "pending").length;
  const appliedFixCount = allFixes.filter((f) => f.status === "applied").length;
  await db.update(storeSummariesTable).set({ pendingFixes, appliedFixes: appliedFixCount, updatedAt: new Date() })
    .where(eq(storeSummariesTable.storeId, storeId));

  const applied = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  res.json({ applied, failed, results });
});

export default router;
