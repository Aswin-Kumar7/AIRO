interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
}

export const SHOPIFY_ENV_ACCESS_TOKEN_SENTINEL = "__SHOPIFY_ENV_ADMIN_TOKEN__";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2026-01";
const SHOPIFY_ACCESS_TOKEN_ENV_KEYS = ["SHOPIFY_ADMIN_ACCESS_TOKEN", "SHOPIFY_ACCESS_TOKEN"] as const;
const SHOPIFY_STORE_DOMAIN_ENV_KEYS = ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_SHOP_DOMAIN"] as const;

function getConfiguredEnvValue(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

export function normalizeShopifyDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Shopify store domain is required.");
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const host = withoutProtocol.split("/")[0]?.split("?")[0]?.split("#")[0] ?? "";

  if (!host) {
    throw new Error("Shopify store domain is required.");
  }

  if (!host.endsWith(".myshopify.com")) {
    throw new Error(
      "Use the Shopify admin domain in the form your-shop.myshopify.com, not the public storefront URL.",
    );
  }

  return host;
}

function getConfiguredShopifyStoreDomain(): string | null {
  const domain = getConfiguredEnvValue(SHOPIFY_STORE_DOMAIN_ENV_KEYS);
  return domain ? normalizeShopifyDomain(domain) : null;
}

function getConfiguredShopifyAdminAccessToken(): string | null {
  return getConfiguredEnvValue(SHOPIFY_ACCESS_TOKEN_ENV_KEYS);
}

export function hasConfiguredShopifyAdminAccessToken(): boolean {
  return Boolean(getConfiguredShopifyAdminAccessToken());
}

export function isStoredShopifyEnvTokenReference(accessToken: string | null | undefined): boolean {
  return (accessToken ?? "").trim() === SHOPIFY_ENV_ACCESS_TOKEN_SENTINEL;
}

export function resolveShopifyAdminAccessToken(
  domain: string,
  accessToken?: string | null,
): string {
  const explicitToken = accessToken?.trim() ?? "";
  if (explicitToken && explicitToken !== SHOPIFY_ENV_ACCESS_TOKEN_SENTINEL) {
    return explicitToken;
  }

  const configuredToken = getConfiguredShopifyAdminAccessToken();
  if (!configuredToken) {
    throw new Error(
      "No Shopify Admin API token is available. Provide one when connecting the store or set SHOPIFY_ADMIN_ACCESS_TOKEN in .env.local.",
    );
  }

  const normalizedDomain = normalizeShopifyDomain(domain);
  const configuredDomain = getConfiguredShopifyStoreDomain();
  if (configuredDomain && configuredDomain !== normalizedDomain) {
    throw new Error(
      `Configured SHOPIFY_ADMIN_ACCESS_TOKEN is restricted to ${configuredDomain}. Connect that shop or provide a per-store Admin API token.`,
    );
  }

  return configuredToken;
}

/**
 * Execute a Shopify Admin API GraphQL query.
 * Uses Node's native fetch (available since Node 18+).
 */
export async function shopifyGraphQL<T>(
  domain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const normalizedDomain = normalizeShopifyDomain(domain);
  const resolvedAccessToken = resolveShopifyAdminAccessToken(normalizedDomain, accessToken);
  const url = `https://${normalizedDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": resolvedAccessToken,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Shopify API request failed: ${response.status} ${response.statusText} for ${normalizedDomain}. ${responseBody.slice(0, 400)}`,
    );
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }

  if (!json.data) {
    throw new Error("Shopify API returned no data");
  }

  return json.data;
}

/**
 * Write a product update back to Shopify via the productUpdate mutation.
 * Maps fix type → Shopify ProductInput field.
 */
export async function updateShopifyProduct(
  domain: string,
  accessToken: string,
  shopifyProductId: string,
  update: { type: "description" | "tags" | "title"; content: string },
): Promise<{ success: boolean; error?: string }> {
  const input: Record<string, unknown> = { id: shopifyProductId };

  switch (update.type) {
    case "description":
      input.descriptionHtml = update.content;
      break;
    case "tags":
      input.tags = update.content
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      break;
    case "title":
      input.title = update.content;
      break;
  }

  const result = await shopifyGraphQL<{
    productUpdate: {
      product: { id: string } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    domain,
    accessToken,
    `mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }`,
    { input },
  );

  const userErrors = result.productUpdate.userErrors;
  if (userErrors.length > 0) {
    return { success: false, error: userErrors.map((e) => e.message).join("; ") };
  }
  return { success: true };
}

/**
 * Validate a Shopify Admin API access token by fetching the shop name.
 * Returns the shop name on success, throws on failure.
 */
export async function validateShopifyToken(
  domain: string,
  accessToken?: string | null,
): Promise<string> {
  const result = await shopifyGraphQL<{ shop: { name: string } }>(
    domain,
    accessToken ?? SHOPIFY_ENV_ACCESS_TOKEN_SENTINEL,
    `query { shop { name } }`,
  );
  return result.shop.name;
}
