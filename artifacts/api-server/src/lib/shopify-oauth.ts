import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { normalizeShopifyDomain } from "./shopify-client";

const SHOPIFY_OAUTH_STATE_COOKIE = "shopify_oauth_state";
const SHOPIFY_OAUTH_SHOP_COOKIE = "shopify_oauth_shop";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured to use Shopify OAuth.`);
  }

  return value;
}

export function getShopifyOAuthConfig() {
  const apiKey = getRequiredEnv("SHOPIFY_API_KEY");
  const apiSecret = getRequiredEnv("SHOPIFY_API_SECRET");
  const appUrl = (process.env.SHOPIFY_APP_URL?.trim() || `http://localhost:${process.env.API_PORT ?? process.env.PORT ?? "4000"}`).replace(/\/$/, "");
  const frontendUrl = getFrontendAppUrl();
  const scopes = (process.env.SHOPIFY_SCOPES?.trim() || "read_products,write_products,read_content").replace(/\s+/g, "");

  return {
    apiKey,
    apiSecret,
    appUrl,
    frontendUrl,
    scopes,
    callbackUrl: `${appUrl}/api/shopify/callback`,
  };
}

export function getFrontendAppUrl(): string {
  return (process.env.FRONTEND_URL?.trim() || `http://localhost:${process.env.FRONTEND_PORT ?? "3000"}`).replace(/\/$/, "");
}

export function createShopifyOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildShopifyInstallUrl(shop: string, state: string): string {
  const { apiKey, scopes, callbackUrl } = getShopifyOAuthConfig();
  const url = new URL(`https://${normalizeShopifyDomain(shop)}/admin/oauth/authorize`);
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

function getHmacMessage(searchParams: URLSearchParams): string {
  return Array.from(searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function verifyShopifyOAuthCallback(searchParams: URLSearchParams): void {
  const { apiSecret } = getShopifyOAuthConfig();
  const receivedHmac = searchParams.get("hmac") ?? "";
  if (!receivedHmac) {
    throw new Error("Missing Shopify OAuth hmac parameter.");
  }

  const message = getHmacMessage(searchParams);
  const expectedHmac = createHmac("sha256", apiSecret).update(message).digest("hex");
  const expectedBuffer = Buffer.from(expectedHmac, "utf8");
  const receivedBuffer = Buffer.from(receivedHmac, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new Error("Invalid Shopify OAuth callback signature.");
  }
}

export async function exchangeShopifyCodeForAccessToken(shop: string, code: string): Promise<string> {
  const { apiKey, apiSecret } = getShopifyOAuthConfig();
  const normalizedShop = normalizeShopifyDomain(shop);
  const response = await fetch(`https://${normalizedShop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Failed to exchange Shopify OAuth code: ${response.status} ${response.statusText}. ${responseBody.slice(0, 400)}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Shopify OAuth response did not include an Admin API access token.");
  }

  return data.access_token;
}

export function isHttpsRequest(req: Request): boolean {
  return req.secure || req.header("x-forwarded-proto") === "https";
}

export function getShopifyOAuthCookieNames() {
  return {
    state: SHOPIFY_OAUTH_STATE_COOKIE,
    shop: SHOPIFY_OAUTH_SHOP_COOKIE,
  };
}