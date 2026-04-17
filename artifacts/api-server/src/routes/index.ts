import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storesRouter from "./stores";
import analysisRouter from "./analysis";
import productsRouter from "./products";
import fixesRouter from "./fixes";
import insightsRouter from "./insights";
import shopifyRouter from "./shopify";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storesRouter);
router.use(analysisRouter);
router.use(productsRouter);
router.use(fixesRouter);
router.use(insightsRouter);
router.use(shopifyRouter);

export default router;
