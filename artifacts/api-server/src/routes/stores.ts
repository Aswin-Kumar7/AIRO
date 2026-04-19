import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, storesTable, activityTable } from "@workspace/db";
import {
  hasConfiguredShopifyAdminAccessToken,
  normalizeShopifyDomain,
  SHOPIFY_ENV_ACCESS_TOKEN_SENTINEL,
  validateShopifyToken,
  registerStoreWebhooks,
} from "../lib/shopify-client";
import { getConnectionMode, maskStoredAccessToken, upsertConnectedStore } from "../lib/store-connection";
import { fetchAndUpsertProducts } from "../lib/fetch-products";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/stores", async (req, res): Promise<void> => {
  req.log.info("Listing stores");
  const stores = await db.select().from(storesTable).orderBy(desc(storesTable.createdAt));
  res.json(stores.map(s => ({
    id: s.id,
    domain: s.domain,
    name: s.name,
    accessToken: maskStoredAccessToken(s.accessToken),
    accessTokenConfigured: true,
    connectionMode: getConnectionMode(s.accessToken),
    desiredPositioning: s.desiredPositioning ?? null,
    status: s.status,
    productsFetched: s.productsFetched,
    lastAnalyzed: s.lastAnalyzed?.toISOString() ?? null,
    overallScore: s.overallScore,
    productCount: s.productCount,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/stores", async (req, res): Promise<void> => {
  const { domain, accessToken } = req.body as { domain?: string; accessToken?: string };
  if (!domain) {
    res.status(400).json({ error: "domain is required" });
    return;
  }

  let normalizedDomain: string;
  try {
    normalizedDomain = normalizeShopifyDomain(domain);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid Shopify domain" });
    return;
  }

  const normalizedAccessToken = accessToken?.trim() ?? "";
  const accessTokenToStore = normalizedAccessToken || SHOPIFY_ENV_ACCESS_TOKEN_SENTINEL;

  if (!normalizedAccessToken && !hasConfiguredShopifyAdminAccessToken()) {
    res.status(400).json({
      error: "Provide a Shopify Admin API access token. Get one from your store admin: Settings → Apps → Develop apps.",
    });
    return;
  }

  // Validate token and fetch shop name directly from Shopify
  let verifiedName: string;
  try {
    verifiedName = await validateShopifyToken(normalizedDomain, accessTokenToStore);
  } catch (err) {
    req.log.warn({ err, domain }, "Shopify token validation failed");
    res.status(400).json({
      error: err instanceof Error
        ? err.message
        : "Could not connect to Shopify store. Check the domain and access token.",
    });
    return;
  }

  const store = await upsertConnectedStore({
    domain: normalizedDomain,
    name: verifiedName,
    accessToken: accessTokenToStore,
    source: "manual",
  });

  req.log.info({ storeId: store.id }, "Store connected");
  res.status(201).json({
    id: store.id,
    domain: store.domain,
    name: store.name,
    accessToken: maskStoredAccessToken(store.accessToken),
    accessTokenConfigured: true,
    connectionMode: getConnectionMode(store.accessToken),
    desiredPositioning: store.desiredPositioning ?? null,
    status: store.status,
    lastAnalyzed: null,
    overallScore: null,
    productCount: null,
    createdAt: store.createdAt.toISOString(),
  });

  // Auto-fetch products + register webhooks in background
  setImmediate(async () => {
    try {
      await fetchAndUpsertProducts(store);
    } catch (err) {
      logger.warn({ err, storeId: store.id }, "Auto product fetch after manual connect failed");
    }

    const appBaseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "";
    if (appBaseUrl) {
      try {
        await registerStoreWebhooks(store.domain, store.accessToken, appBaseUrl);
      } catch (err) {
        logger.warn({ err, storeId: store.id }, "Webhook registration after manual connect failed");
      }
    }
  });
});

router.get("/stores/:storeId", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json({
    id: store.id,
    domain: store.domain,
    name: store.name,
    accessToken: maskStoredAccessToken(store.accessToken),
    accessTokenConfigured: true,
    connectionMode: getConnectionMode(store.accessToken),
    desiredPositioning: store.desiredPositioning ?? null,
    status: store.status,
    productsFetched: store.productsFetched,
    lastAnalyzed: store.lastAnalyzed?.toISOString() ?? null,
    overallScore: store.overallScore,
    productCount: store.productCount,
    createdAt: store.createdAt.toISOString(),
  });
});

router.patch("/stores/:storeId/positioning", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const { desiredPositioning } = req.body as { desiredPositioning?: string };

  if (typeof desiredPositioning !== "string") {
    res.status(400).json({ error: "desiredPositioning must be a string" });
    return;
  }

  const normalizedPositioning = desiredPositioning.trim();
  const [store] = await db.update(storesTable).set({
    desiredPositioning: normalizedPositioning || null,
  }).where(eq(storesTable.id, storeId)).returning();

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  res.json({
    storeId: store.id,
    desiredPositioning: store.desiredPositioning ?? null,
  });
});

router.delete("/stores/:storeId", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const [store] = await db.delete(storesTable).where(eq(storesTable.id, storeId)).returning();
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  req.log.info({ storeId }, "Store disconnected");
  res.json({ success: true, message: "Store disconnected successfully" });
});

router.get("/stores/:storeId/activity", async (req, res): Promise<void> => {
  const storeId = Array.isArray(req.params.storeId) ? req.params.storeId[0] : req.params.storeId;
  const activity = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.storeId, storeId))
    .orderBy(desc(activityTable.createdAt))
    .limit(20);
  res.json(activity.map(a => ({
    id: a.id,
    type: a.type,
    message: a.message,
    timestamp: a.createdAt.toISOString(),
    metadata: a.metadata ?? {},
  })));
});

export default router;
