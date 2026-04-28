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

// Globally enforce H-3: per-user store isolation at the query level
router.param("storeId", async (req, res, next, storeId) => {
  if (!storeId || storeId === "new" || storeId === "bulk-apply") return next();
  if (storeId === DEMO_STORE_ID) return next();
  
  try {
    const [store] = await db.select().from(storesTable)
      .where(and(eq(storesTable.id, storeId), eq(storesTable.userId, req.session?.userId ?? "")));
    
    if (!store) {
      res.status(404).json({ error: "Store not found or access denied." });
      return;
    }
    // We can also attach the verified store to `req.locals` or similar if needed, but the primary goal is authorization.
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
