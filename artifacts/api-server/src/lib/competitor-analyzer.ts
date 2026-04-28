/**
 * Competitor gap analysis — fetches public Shopify /products.json, runs the
 * rule engine on each product, and returns dimension-level score averages
 * so the dashboard can render a gap chart.
 */

import { runRuleEngine, detectProductCategory, type ProductInput } from "./rule-engine";

export interface CompetitorProductScore {
  title: string;
  overallScore: number;
  clarityScore: number;
  completenessScore: number;
  trustScore: number;
  tagScore: number;
  issueCount: number;
  category: string;
}

export interface CompetitorStoreResult {
  domain: string;
  storeName: string | null;
  productCount: number;
  avgOverall: number;
  avgClarity: number;
  avgCompleteness: number;
  avgTrust: number;
  avgTags: number;
  topProducts: CompetitorProductScore[]; // top 5 by score
  weakProducts: CompetitorProductScore[]; // bottom 5 by score
  fetchedAt: string;
  error?: string;
}

export interface CompetitorGapReport {
  yourStore: {
    overallScore: number;
    clarityScore: number;
    completenessScore: number;
    trustScore: number;
    tagScore: number;
  };
  competitors: CompetitorStoreResult[];
  insights: string[];
}

interface ShopifyPublicProduct {
  id: number;
  title: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string;
  images: Array<{ src: string }>;
  variants: Array<{ price: string }>;
}

async function fetchPublicProducts(domain: string): Promise<ShopifyPublicProduct[]> {
  const normalised = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url = `https://${normalised}/products.json?limit=50`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; KasparroBot/1.0)" },
    signal: AbortSignal.timeout(12_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }

  const data = (await res.json()) as { products?: ShopifyPublicProduct[] };
  return data.products ?? [];
}

function scorePublicProduct(p: ShopifyPublicProduct): CompetitorProductScore {
  const tags = p.tags
    ? p.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const input: ProductInput = {
    title: p.title ?? "",
    description: p.body_html ? p.body_html.replace(/<[^>]+>/g, " ").trim() : null,
    productType: p.product_type || null,
    vendor: p.vendor || null,
    tags,
    price: p.variants?.[0]?.price ?? null,
    imageUrl: p.images?.[0]?.src ?? null,
    reviewCount: 0,
    hasStructuredData: false,
  };

  const { ruleScores, violations } = runRuleEngine(input);
  const category = detectProductCategory(input);

  // Simple overall: average of the four dimensions (no AI layer)
  const overall = Math.round(
    (ruleScores.clarity + ruleScores.completeness + ruleScores.trust + ruleScores.tags) / 4,
  );

  return {
    title: p.title,
    overallScore: overall,
    clarityScore: Math.round(ruleScores.clarity),
    completenessScore: Math.round(ruleScores.completeness),
    trustScore: Math.round(ruleScores.trust),
    tagScore: Math.round(ruleScores.tags),
    issueCount: violations.length,
    category,
  };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export async function analyzeCompetitor(domain: string): Promise<CompetitorStoreResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const raw = await fetchPublicProducts(domain);
    if (raw.length === 0) {
      return {
        domain,
        storeName: null,
        productCount: 0,
        avgOverall: 0,
        avgClarity: 0,
        avgCompleteness: 0,
        avgTrust: 0,
        avgTags: 0,
        topProducts: [],
        weakProducts: [],
        fetchedAt,
        error: "No public products found. Store may be password-protected.",
      };
    }

    const scored = raw.map(scorePublicProduct);
    const sorted = [...scored].sort((a, b) => b.overallScore - a.overallScore);

    // Try to extract store name from vendor field if consistent
    const vendors = raw.map((p) => p.vendor).filter(Boolean);
    const vendorFreq = new Map<string, number>();
    for (const v of vendors) vendorFreq.set(v, (vendorFreq.get(v) ?? 0) + 1);
    let storeName: string | null = null;
    let maxFreq = 0;
    for (const [v, c] of vendorFreq) {
      if (c > maxFreq) { maxFreq = c; storeName = v; }
    }

    return {
      domain,
      storeName,
      productCount: scored.length,
      avgOverall: avg(scored.map((s) => s.overallScore)),
      avgClarity: avg(scored.map((s) => s.clarityScore)),
      avgCompleteness: avg(scored.map((s) => s.completenessScore)),
      avgTrust: avg(scored.map((s) => s.trustScore)),
      avgTags: avg(scored.map((s) => s.tagScore)),
      topProducts: sorted.slice(0, 5),
      weakProducts: sorted.slice(-5).reverse(),
      fetchedAt,
    };
  } catch (err) {
    return {
      domain,
      storeName: null,
      productCount: 0,
      avgOverall: 0,
      avgClarity: 0,
      avgCompleteness: 0,
      avgTrust: 0,
      avgTags: 0,
      topProducts: [],
      weakProducts: [],
      fetchedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function buildGapInsights(
  yours: CompetitorGapReport["yourStore"],
  competitors: CompetitorStoreResult[],
): string[] {
  const valid = competitors.filter((c) => !c.error && c.productCount > 0);
  if (valid.length === 0) return [];

  const avgCompOverall = avg(valid.map((c) => c.avgOverall));
  const avgCompClarity = avg(valid.map((c) => c.avgClarity));
  const avgCompCompleteness = avg(valid.map((c) => c.avgCompleteness));
  const avgCompTrust = avg(valid.map((c) => c.avgTrust));
  const avgCompTags = avg(valid.map((c) => c.avgTags));

  const insights: string[] = [];

  if (yours.overallScore > avgCompOverall + 5) {
    insights.push(`Your overall AI readiness score (${yours.overallScore}) is ${yours.overallScore - avgCompOverall} points above the competitor average — a meaningful edge.`);
  } else if (avgCompOverall > yours.overallScore + 5) {
    insights.push(`Competitors average ${avgCompOverall} overall vs your ${yours.overallScore} — closing this gap could improve AI citation rates.`);
  }

  const dims: Array<[string, number, number]> = [
    ["clarity", yours.clarityScore, avgCompClarity],
    ["completeness", yours.completenessScore, avgCompCompleteness],
    ["trust", yours.trustScore, avgCompTrust],
    ["tag coverage", yours.tagScore, avgCompTags],
  ];

  for (const [dim, yours_, compAvg] of dims) {
    if (compAvg > yours_ + 10) {
      insights.push(`Your ${dim} score (${yours_}) trails competitor average (${compAvg}) by ${compAvg - yours_} points — a priority improvement area.`);
    } else if (yours_ > compAvg + 10) {
      insights.push(`Your ${dim} score (${yours_}) leads competitors (${compAvg}) by ${yours_ - compAvg} points — maintain this advantage.`);
    }
  }

  const bestComp = valid.reduce((a, b) => (b.avgOverall > a.avgOverall ? b : a));
  if (bestComp.avgOverall > yours.overallScore) {
    insights.push(`${bestComp.storeName ?? bestComp.domain} is the strongest competitor at ${bestComp.avgOverall} overall — study their top products for content patterns.`);
  }

  if (insights.length === 0) {
    insights.push("Your scores are competitive across all dimensions. Continue improving to stay ahead.");
  }

  return insights;
}
