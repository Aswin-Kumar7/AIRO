import { Router, type IRouter } from "express";
import {
  buildShopifyInstallUrl,
  createShopifyOAuthState,
  exchangeShopifyCodeForAccessToken,
  getFrontendAppUrl,
  getShopifyOAuthCookieNames,
  isHttpsRequest,
  verifyShopifyOAuthCallback,
} from "../lib/shopify-oauth";
import { normalizeShopifyDomain, validateShopifyToken, registerStoreWebhooks } from "../lib/shopify-client";
import { upsertConnectedStore } from "../lib/store-connection";
import { resolveAccessToken } from "../lib/crypto";
import { fetchAndUpsertProducts } from "../lib/fetch-products";

const router: IRouter = Router();

function buildFrontendRedirectUrl(params: { status: "success" | "error"; storeId?: string; message?: string }): string {
  const frontendUrl = getFrontendAppUrl();
  const url = new URL("/", `${frontendUrl}/`);
  url.searchParams.set("shopify", params.status);
  if (params.storeId) {
    url.searchParams.set("storeId", params.storeId);
  }
  if (params.message) {
    url.searchParams.set("message", params.message);
  }
  return url.toString();
}

router.get("/shopify/install", async (req, res): Promise<void> => {
  const rawShop = Array.isArray(req.query.shop) ? req.query.shop[0] : req.query.shop;

  if (typeof rawShop !== "string" || !rawShop.trim()) {
    res.redirect(buildFrontendRedirectUrl({
      status: "error",
      message: "Enter a Shopify myshopify.com domain before starting installation.",
    }));
    return;
  }

  try {
    const normalizedShop = normalizeShopifyDomain(rawShop);
    const state = createShopifyOAuthState();
    const cookieNames = getShopifyOAuthCookieNames();
    const secure = isHttpsRequest(req);

    res.cookie(cookieNames.state, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 10 * 60 * 1000,
      path: "/api/shopify",
    });
    res.cookie(cookieNames.shop, normalizedShop, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 10 * 60 * 1000,
      path: "/api/shopify",
    });

    res.redirect(buildShopifyInstallUrl(normalizedShop, state));
  } catch (err) {
    req.log.warn({ err, shop: rawShop }, "Failed to start Shopify OAuth install");
    res.redirect(buildFrontendRedirectUrl({
      status: "error",
      message: err instanceof Error ? err.message : "Could not start Shopify install flow.",
    }));
  }
});

router.get("/shopify/callback", async (req, res): Promise<void> => {
  const cookieNames = getShopifyOAuthCookieNames();
  const secure = isHttpsRequest(req);

  try {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        const firstValue = value[0];
        if (typeof firstValue === "string") {
          searchParams.set(key, firstValue);
        }
      } else if (typeof value === "string") {
        searchParams.set(key, value);
      }
    }

    verifyShopifyOAuthCallback(searchParams);

    const shop = normalizeShopifyDomain(searchParams.get("shop") ?? "");
    const code = searchParams.get("code") ?? "";
    const state = searchParams.get("state") ?? "";

    const cookieState = req.cookies?.[cookieNames.state] as string | undefined;
    const cookieShop = req.cookies?.[cookieNames.shop] as string | undefined;

    if (!state || !cookieState || state !== cookieState) {
      throw new Error("Invalid Shopify OAuth state. Restart the install flow and try again.");
    }

    if (!cookieShop || cookieShop !== shop) {
      throw new Error("Shop mismatch during Shopify OAuth callback.");
    }

    if (!code) {
      throw new Error("Missing Shopify OAuth code parameter.");
    }

    if (!req.session?.userId) {
      throw new Error("Must be logged in to connect a store.");
    }

    const accessToken = await exchangeShopifyCodeForAccessToken(shop, code);
    const verifiedName = await validateShopifyToken(shop, accessToken);
    const store = await upsertConnectedStore({
      domain: shop,
      name: verifiedName,
      accessToken,
      source: "oauth",
      userId: req.session.userId,
    });

    res.clearCookie(cookieNames.state, { path: "/api/shopify", httpOnly: true, sameSite: "lax", secure });
    res.clearCookie(cookieNames.shop, { path: "/api/shopify", httpOnly: true, sameSite: "lax", secure });
    res.redirect(buildFrontendRedirectUrl({ status: "success", storeId: store.id }));

    // Auto-fetch products + register webhooks so the dashboard shows them immediately after OAuth
    setImmediate(async () => {
      try {
        await fetchAndUpsertProducts(store);
      } catch (err) {
        req.log.error({ err, storeId: store.id }, "Background product fetch failed after OAuth");
      }

      const appBaseUrl = process.env.APP_BASE_URL ?? "";
      if (appBaseUrl) {
        try {
          await registerStoreWebhooks(store.domain, resolveAccessToken(store.accessToken), appBaseUrl);
        } catch (err) {
          req.log.warn({ err, storeId: store.id }, "Background webhook registration failed after OAuth");
        }
      }
    });
  } catch (err) {
    req.log.error({ err }, "Shopify OAuth callback failed");
    res.clearCookie(cookieNames.state, { path: "/api/shopify", httpOnly: true, sameSite: "lax", secure });
    res.clearCookie(cookieNames.shop, { path: "/api/shopify", httpOnly: true, sameSite: "lax", secure });
    res.redirect(buildFrontendRedirectUrl({
      status: "error",
      message: err instanceof Error ? err.message : "Shopify OAuth install failed.",
    }));
  }
});

export default router;