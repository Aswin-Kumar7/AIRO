import { Router, type IRouter } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, productsTable, storesTable, activityTable } from "@workspace/db";
import { normalizeShopifyDomain } from "../lib/shopify-client";
import { generateId } from "../lib/id";

const router: IRouter = Router();

interface ShopifyProductWebhookPayload {
  id: number;
  title: string;
  body_html: string;
  handle: string;
  product_type: string;
  vendor: string;
  tags: string;
  images: Array<{ src: string }>;
  variants: Array<{ price: string }>;
}

function verifyWebhookHmac(rawBody: Buffer, hmacHeader: string, secret: string): boolean {
  try {
    const hash = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    const hashBuf = Buffer.from(hash);
    const headerBuf = Buffer.from(hmacHeader);
    if (hashBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, headerBuf);
  } catch {
    return false;
  }
}

function getRawBody(req: import("express").Request): Buffer | null {
  return req.rawBody ?? null;
}

// ─── PRODUCTS_UPDATE ──────────────────────────────────────────────────────────

router.post("/shopify/webhooks/products-update", async (req, res): Promise<void> => {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string | undefined;
  const shopDomain = req.headers["x-shopify-shop-domain"] as string | undefined;
  const secret = process.env.SHOPIFY_API_SECRET ?? "";

  if (!hmacHeader || !shopDomain || !secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawBody = getRawBody(req);
  if (!rawBody) {
    res.status(400).json({ error: "Raw body unavailable" });
    return;
  }

  if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    res.status(401).json({ error: "HMAC verification failed" });
    return;
  }

  // Ack immediately — Shopify retries if no 200 within 5s
  res.status(200).end();

  setImmediate(async () => {
    try {
      const payload = JSON.parse(rawBody.toString()) as ShopifyProductWebhookPayload;
      const shopifyProductId = `gid://shopify/Product/${payload.id}`;

      let normalizedDomain: string;
      try {
        normalizedDomain = normalizeShopifyDomain(shopDomain);
      } catch {
        return;
      }

      // Find the store this webhook belongs to
      const [store] = await db.select().from(storesTable).where(eq(storesTable.domain, normalizedDomain));
      if (!store) return;

      const tags = payload.tags
        ? payload.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const updated = await db
        .update(productsTable)
        .set({
          title: payload.title,
          description: payload.body_html,
          tags,
          productType: payload.product_type ?? null,
          vendor: payload.vendor ?? null,
          imageUrl: payload.images?.[0]?.src ?? null,
          price: payload.variants?.[0]?.price ?? null,
          // Bust ai-qa cache so stale Q&A is re-generated on next request
          aiQaCachedAt: null,
        })
        .where(
          and(
            eq(productsTable.shopifyProductId, shopifyProductId),
            eq(productsTable.storeId, store.id),
          ),
        )
        .returning({ id: productsTable.id });

      if (updated.length > 0) {
        await db.insert(activityTable).values({
          id: generateId(),
          storeId: store.id,
          type: "product_updated",
          message: `Product synced via webhook: ${payload.title}`,
          metadata: { shopifyProductId, source: "webhook" },
        });
      }
    } catch {
      // Non-fatal — webhook processing errors are not retriable here
    }
  });
});

// ─── PRODUCTS_DELETE ──────────────────────────────────────────────────────────

router.post("/shopify/webhooks/products-delete", async (req, res): Promise<void> => {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string | undefined;
  const shopDomain = req.headers["x-shopify-shop-domain"] as string | undefined;
  const secret = process.env.SHOPIFY_API_SECRET ?? "";

  if (!hmacHeader || !shopDomain || !secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const rawBody = getRawBody(req);
  if (!rawBody) {
    res.status(400).json({ error: "Raw body unavailable" });
    return;
  }

  if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    res.status(401).json({ error: "HMAC verification failed" });
    return;
  }

  res.status(200).end();

  setImmediate(async () => {
    try {
      const payload = JSON.parse(rawBody.toString()) as { id: number };
      const shopifyProductId = `gid://shopify/Product/${payload.id}`;

      let normalizedDomain: string;
      try {
        normalizedDomain = normalizeShopifyDomain(shopDomain);
      } catch {
        return;
      }

      const [store] = await db.select().from(storesTable).where(eq(storesTable.domain, normalizedDomain));
      if (!store) return;

      const deleted = await db
        .delete(productsTable)
        .where(
          and(
            eq(productsTable.shopifyProductId, shopifyProductId),
            eq(productsTable.storeId, store.id),
          ),
        )
        .returning({ id: productsTable.id, title: productsTable.title });

      if (deleted.length > 0) {
        await db.insert(activityTable).values({
          id: generateId(),
          storeId: store.id,
          type: "product_deleted",
          message: `Product removed via webhook: ${deleted[0]?.title ?? shopifyProductId}`,
          metadata: { shopifyProductId, source: "webhook" },
        });
      }
    } catch {
      // Non-fatal
    }
  });
});

export default router;
