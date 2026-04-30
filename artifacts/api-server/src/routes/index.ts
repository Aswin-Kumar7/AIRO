import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import storesRouter from "./stores";
import analysisRouter from "./analysis";
import productsRouter from "./products";
import fixesRouter from "./fixes";
import insightsRouter from "./insights";
import shopifyRouter from "./shopify";
import featuresRouter from "./features";
import webhooksRouter from "./webhooks";
import visibilityRouter from "./visibility";
import scheduleRouter from "./schedule";
import competitorsRouter from "./competitors";

import { db, storesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { DEMO_STORE_ID } from "../lib/demo";

const router: IRouter = Router();

// Globally enforce authentication + per-user store isolation (H-3).
// app.ts already applies a global requireAuth middleware, so the param handler
// only needs the ownership SELECT — but still returns 401 for unauthenticated
// requests (not 404) by checking userId before querying the DB.
// The verified store is attached to res.locals.ownedStore so route handlers can
// read it directly without a second SELECT — halving DB round-trips per request.
router.param("storeId", async (req, res, next, storeId) => {
  if (!storeId || storeId === "new" || storeId === "bulk-apply") return next();

  // Authenticate first — emit 401 before attempting any DB lookup
  const userId = req.session?.userId;
  if (!userId && storeId !== DEMO_STORE_ID) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.locals.userId = userId;

  if (storeId === DEMO_STORE_ID) return next();

  try {
    const [store] = await db
      .select()
      .from(storesTable)
      .where(and(eq(storesTable.id, storeId), eq(storesTable.userId, userId!)));

    if (!store) {
      res.status(404).json({ error: "Store not found or access denied." });
      return;
    }

    // Attach for handler reuse — avoids a second getOwnedStore() SELECT in every handler
    res.locals.ownedStore = store;
    next();
  } catch (err) {
    next(err);
  }
});

router.use(healthRouter);
router.use(authRouter);
router.use(storesRouter);
router.use(analysisRouter);
router.use(productsRouter);
router.use(fixesRouter);
router.use(insightsRouter);
router.use(shopifyRouter);
router.use(featuresRouter);
router.use(webhooksRouter);
router.use(visibilityRouter);
router.use(scheduleRouter);
router.use(competitorsRouter);

export default router;
