import { shopifyGraphQL } from "./shopify-client";

interface ShopifyMetafieldNode {
  namespace: string;
  key: string;
  value: string | null;
}

interface ShopifyProductNode {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  productType: string;
  vendor: string;
  tags: string[];
  images: { edges: Array<{ node: { url: string } }> };
  variants: { edges: Array<{ node: { price: string } }> };
  collections: { edges: Array<{ node: { title: string } }> };
  metafields: { edges: Array<{ node: ShopifyMetafieldNode }> };
}

interface ProductsQueryResult {
  products: {
    edges: Array<{ node: ShopifyProductNode; cursor: string }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}

interface PoliciesQueryResult {
  shop: {
    refundPolicy: { body: string } | null;
    shippingPolicy: { body: string } | null;
    privacyPolicy: { body: string } | null;
    termsOfService: { body: string } | null;
  };
}

interface PagesQueryResult {
  pages: {
    edges: Array<{
      node: { handle: string; title: string; body: string };
    }>;
  };
}

const PRODUCTS_QUERY = `
  query FetchProducts($cursor: String) {
    products(first: 100, after: $cursor) {
      edges {
        node {
          id
          handle
          title
          descriptionHtml
          productType
          vendor
          tags
          images(first: 1) {
            edges { node { url } }
          }
          variants(first: 1) {
            edges { node { price } }
          }
          collections(first: 10) {
            edges {
              node { title }
            }
          }
          metafields(first: 25) {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const POLICIES_QUERY = `
  query {
    shop {
      refundPolicy { body }
      shippingPolicy { body }
      privacyPolicy { body }
      termsOfService { body }
    }
  }
`;

const PAGES_QUERY = `
  query {
    pages(first: 30) {
      edges {
        node {
          handle
          title
          body
        }
      }
    }
  }
`;

export interface IngestedProduct {
  shopifyId: string;
  handle: string;
  title: string;
  description: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  collections: string[];
  imageUrl: string | null;
  price: string | null;
  reviewCount: number;
  reviewRating: number;
  hasStructuredData: boolean;
}

export interface PolicyCoverage {
  refund: boolean;
  shipping: boolean;
  privacy: boolean;
  terms: boolean;
}

export interface StoreSnapshot {
  products: IngestedProduct[];
  policies: PolicyCoverage;
  faqPage: { title: string; body: string } | null;
}

function parseNumericValue(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const direct = Number(trimmed);
  if (Number.isFinite(direct)) {
    return direct;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === "number" && Number.isFinite(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      for (const key of ["value", "rating", "average", "count", "review_count", "rating_count"]) {
        const candidate = (parsed as Record<string, unknown>)[key];
        if (typeof candidate === "number" && Number.isFinite(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // Ignore invalid JSON and fall back to regex extraction.
  }

  const match = trimmed.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function extractReviewSignals(metafields: ShopifyMetafieldNode[]): { reviewCount: number; reviewRating: number } {
  const reviewMetafields = metafields.filter((metafield) => {
    const namespace = metafield.namespace.toLowerCase();
    return namespace.includes("review") || namespace === "spr" || namespace.includes("judge");
  });

  let reviewCount = 0;
  let reviewRating = 0;

  for (const metafield of reviewMetafields) {
    const key = metafield.key.toLowerCase();
    const numericValue = parseNumericValue(metafield.value);

    if (key.includes("count") || key.includes("reviews")) {
      reviewCount = Math.max(reviewCount, Math.round(numericValue));
      continue;
    }

    if (key.includes("rating") || key.includes("average")) {
      reviewRating = Math.max(reviewRating, numericValue);
    }
  }

  return {
    reviewCount,
    reviewRating: reviewRating > 5 ? reviewRating / 20 : reviewRating,
  };
}

function detectStructuredData(descriptionHtml: string, metafields: ShopifyMetafieldNode[]): boolean {
  if (/schema\.org\/product/i.test(descriptionHtml) || /application\/ld\+json/i.test(descriptionHtml)) {
    return true;
  }

  return metafields.some((metafield) => {
    const key = metafield.key.toLowerCase();
    const namespace = metafield.namespace.toLowerCase();
    const value = metafield.value?.toLowerCase() ?? "";
    return (
      key.includes("jsonld") ||
      key.includes("schema") ||
      key.includes("structured") ||
      namespace.includes("schema") ||
      value.includes("schema.org/product")
    );
  });
}

interface PageSignals {
  hasStructuredData: boolean;
  reviewCount: number;
  reviewRating: number;
}

async function fetchProductPageSignals(domain: string, handle: string): Promise<PageSignals | null> {
  const url = `https://${domain}/products/${handle}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AI-Readiness-Analyzer/1.0 (product analysis bot)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const html = await res.text();

    // Extract all JSON-LD blocks from the page
    const jsonLdBlocks: Record<string, unknown>[] = [];
    const jsonLdPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = jsonLdPattern.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(match[1] ?? "{}") as unknown;
        if (parsed && typeof parsed === "object") {
          // Handle both single objects and @graph arrays
          const items = Array.isArray((parsed as Record<string, unknown>)["@graph"])
            ? (parsed as Record<string, unknown>)["@graph"] as Record<string, unknown>[]
            : [parsed as Record<string, unknown>];
          jsonLdBlocks.push(...items);
        }
      } catch { /* skip malformed JSON-LD */ }
    }

    // Check for Product schema
    const productSchema = jsonLdBlocks.find(
      b => b["@type"] === "Product" || (Array.isArray(b["@type"]) && (b["@type"] as string[]).includes("Product"))
    );
    const hasStructuredData = !!productSchema;

    // Extract review signals from AggregateRating
    let reviewCount = 0;
    let reviewRating = 0;
    const aggregateRating = productSchema?.["aggregateRating"] as Record<string, unknown> | undefined
      ?? jsonLdBlocks.find(b => b["@type"] === "AggregateRating");

    if (aggregateRating) {
      const count = aggregateRating["reviewCount"] ?? aggregateRating["ratingCount"];
      const rating = aggregateRating["ratingValue"];
      if (typeof count === "number") reviewCount = Math.round(count);
      else if (typeof count === "string") reviewCount = parseInt(count, 10) || 0;
      if (typeof rating === "number") reviewRating = rating;
      else if (typeof rating === "string") reviewRating = parseFloat(rating) || 0;
    }

    return { hasStructuredData, reviewCount, reviewRating };
  } catch {
    return null; // timeout, network error, password-protected store
  }
}

async function enrichWithPageSignals(
  domain: string,
  products: Array<IngestedProduct & { handle: string }>,
): Promise<void> {
  const BATCH = 8;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(p => fetchProductPageSignals(domain, p.handle)));
    for (let j = 0; j < batch.length; j++) {
      const signals = results[j];
      if (!signals) continue;
      const product = batch[j]!;
      // Page HTML is ground truth — override metafield values
      product.hasStructuredData = signals.hasStructuredData;
      // Use page-derived review count only if better than metafield-derived
      if (signals.reviewCount > product.reviewCount) {
        product.reviewCount = signals.reviewCount;
        product.reviewRating = signals.reviewRating;
      }
    }
  }
}

async function fetchAllProducts(domain: string, accessToken: string): Promise<IngestedProduct[]> {
  const products: IngestedProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result: ProductsQueryResult = await shopifyGraphQL<ProductsQueryResult>(
      domain,
      accessToken,
      PRODUCTS_QUERY,
      cursor ? { cursor } : {},
    );

    for (const { node } of result.products.edges) {
      const metafields = node.metafields.edges.map((edge: { node: ShopifyMetafieldNode }) => edge.node);
      const reviewSignals = extractReviewSignals(metafields);

      products.push({
        shopifyId: node.id,
        handle: node.handle,
        title: node.title,
        description: node.descriptionHtml || null,
        productType: node.productType || null,
        vendor: node.vendor || null,
        tags: node.tags,
        collections: node.collections.edges.map((edge: { node: { title: string } }) => edge.node.title),
        imageUrl: node.images.edges[0]?.node.url ?? null,
        price: node.variants.edges[0]?.node.price ?? null,
        reviewCount: reviewSignals.reviewCount,
        reviewRating: reviewSignals.reviewRating,
        hasStructuredData: detectStructuredData(node.descriptionHtml, metafields),
      });
    }

    hasNextPage = result.products.pageInfo.hasNextPage;
    cursor = result.products.pageInfo.endCursor;
  }

  const capped = products.slice(0, 250);
  // Enrich with page HTML signals — ground truth for structured data + review counts
  await enrichWithPageSignals(domain, capped);
  return capped;
}

function isPolicySubstantive(body: string | null | undefined, keywords: string[], minWords = 50): boolean {
  if (!body) return false;
  const text = body.toLowerCase();
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount < minWords) return false;
  return keywords.some((kw) => text.includes(kw));
}

async function fetchPolicyCoverage(domain: string, accessToken: string): Promise<PolicyCoverage> {
  const result = await shopifyGraphQL<PoliciesQueryResult>(domain, accessToken, POLICIES_QUERY);
  return {
    refund: isPolicySubstantive(result.shop.refundPolicy?.body, ["refund", "return", "days", "exchange", "credit"]),
    shipping: isPolicySubstantive(result.shop.shippingPolicy?.body, ["ship", "deliver", "transit", "order", "dispatch"]),
    privacy: isPolicySubstantive(result.shop.privacyPolicy?.body, ["data", "information", "collect", "privacy", "personal"]),
    terms: isPolicySubstantive(result.shop.termsOfService?.body, ["terms", "service", "agreement", "use", "conditions"]),
  };
}

async function fetchFaqPage(
  domain: string,
  accessToken: string,
): Promise<{ title: string; body: string } | null> {
  const result = await shopifyGraphQL<PagesQueryResult>(domain, accessToken, PAGES_QUERY);
  const faqEdge = result.pages.edges.find(({ node }) => {
    const handle = node.handle.toLowerCase();
    const title = node.title.toLowerCase();
    return handle.includes("faq") || handle.includes("frequently") || title.includes("faq");
  });

  return faqEdge ? { title: faqEdge.node.title, body: faqEdge.node.body } : null;
}

export async function ingestStore(domain: string, accessToken: string): Promise<StoreSnapshot> {
  const products = await fetchAllProducts(domain, accessToken);

  let policies: PolicyCoverage = {
    refund: false,
    shipping: false,
    privacy: false,
    terms: false,
  };
  try {
    policies = await fetchPolicyCoverage(domain, accessToken);
  } catch {
    // Policy access varies by store configuration.
  }

  let faqPage: { title: string; body: string } | null = null;
  try {
    faqPage = await fetchFaqPage(domain, accessToken);
  } catch {
    // FAQ pages are optional.
  }

  return { products, policies, faqPage };
}
