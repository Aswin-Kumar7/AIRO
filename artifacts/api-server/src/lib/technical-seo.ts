/**
 * Technical SEO + Crawlability module — Upgrade 1 (AEO/GEO/SEO)
 *
 * Fetches and evaluates:
 *  - robots.txt (presence + disallow rules blocking products/collections)
 *  - sitemap.xml (presence, references product/collection sitemaps)
 *  - Sampled HTML pages (home + up to 5 product pages):
 *    - <title> tag
 *    - <meta name="description">
 *    - <link rel="canonical">
 *
 * Produces store-level gaps (productId = null) with ruleId, evidence, severity, and fix guidance.
 * These gaps are inserted into gapsTable by the analysis pipeline alongside product-level gaps.
 */

import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SeoGap {
  ruleId: string;
  category: "technical-seo";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  suggestion: string;
  evidence: string;
  impactScore: number;
  effortLevel: "low" | "medium" | "high";
}

export interface TechnicalSeoResult {
  robotsTxtFound: boolean;
  sitemapFound: boolean;
  sitemapHasProducts: boolean;
  sampledPages: number;
  pagesWithMetaDescription: number;
  pagesWithCanonical: number;
  gaps: SeoGap[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000;

async function safeFetch(url: string): Promise<{ ok: boolean; text: string; status: number }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AI-Readiness-Analyzer/1.0 (SEO audit bot)" },
    });
    clearTimeout(timer);
    const text = res.ok ? await res.text() : "";
    return { ok: res.ok, text, status: res.status };
  } catch {
    return { ok: false, text: "", status: 0 };
  }
}

function extractMetaTag(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"));
  return match ? match[1]!.trim() : null;
}

function extractCanonical(html: string): string | null {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return match ? match[1]!.trim() : null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1]!.trim() : null;
}

// ─── Robots.txt analysis ──────────────────────────────────────────────────────

interface RobotsAnalysis {
  found: boolean;
  blocksProducts: boolean;
  blocksCollections: boolean;
  evidence: string;
}

function analyzeRobotsTxt(text: string): RobotsAnalysis {
  const lines = text.split("\n").map(l => l.trim().toLowerCase());
  const disallowLines = lines.filter(l => l.startsWith("disallow:"));

  const blocksProducts = disallowLines.some(l =>
    l.includes("/products") || l === "disallow: /"
  );
  const blocksCollections = disallowLines.some(l =>
    l.includes("/collections") || l === "disallow: /"
  );

  const evidence = disallowLines.slice(0, 5).join("; ") || "No Disallow rules found";

  return { found: true, blocksProducts, blocksCollections, evidence };
}

// ─── Sitemap analysis ─────────────────────────────────────────────────────────

interface SitemapAnalysis {
  found: boolean;
  hasProducts: boolean;
  hasCollections: boolean;
  evidence: string;
}

function analyzeSitemap(text: string): SitemapAnalysis {
  const lower = text.toLowerCase();
  const hasProducts = lower.includes("/products/") || lower.includes("sitemap_products");
  const hasCollections = lower.includes("/collections/") || lower.includes("sitemap_collections");
  const urlCount = (text.match(/<loc>/g) ?? []).length;

  return {
    found: true,
    hasProducts,
    hasCollections,
    evidence: `${urlCount} URLs found; products: ${hasProducts}; collections: ${hasCollections}`,
  };
}

// ─── Main audit function ──────────────────────────────────────────────────────

export async function runTechnicalSeoAudit(
  domain: string,
  /** Up to 5 product page URLs (full https://...) to sample for meta/canonical */
  productUrls: string[]
): Promise<TechnicalSeoResult> {
  const baseUrl = domain.startsWith("http") ? domain : `https://${domain}`;
  const gaps: SeoGap[] = [];

  // ── 1. robots.txt ────────────────────────────────────────────────────────────
  const robotsResponse = await safeFetch(`${baseUrl}/robots.txt`);
  let robotsAnalysis: RobotsAnalysis = { found: false, blocksProducts: false, blocksCollections: false, evidence: "robots.txt not found" };

  if (robotsResponse.ok && robotsResponse.text.length > 0) {
    robotsAnalysis = analyzeRobotsTxt(robotsResponse.text);
  } else {
    logger.warn({ domain }, "robots.txt not found or empty");
  }

  if (!robotsAnalysis.found) {
    gaps.push({
      ruleId: "SEO_ROBOTS_MISSING",
      category: "technical-seo",
      severity: "medium",
      title: "robots.txt not found",
      description: "No robots.txt file was found. Search engines and AI crawlers rely on this file to understand crawl permissions.",
      suggestion: "Create /robots.txt at your store root. Shopify generates one automatically — ensure it's not suppressed by a theme override.",
      evidence: `GET ${baseUrl}/robots.txt returned ${robotsResponse.status}`,
      impactScore: 55,
      effortLevel: "low",
    });
  } else if (robotsAnalysis.blocksProducts) {
    gaps.push({
      ruleId: "SEO_ROBOTS_BLOCKING_PRODUCTS",
      category: "technical-seo",
      severity: "high",
      title: "robots.txt is blocking product pages from crawlers",
      description: "Your robots.txt contains Disallow rules that prevent search engines and AI agents from crawling product pages. This directly harms organic discovery and GEO visibility.",
      suggestion: "Remove or restrict the Disallow: /products rule in robots.txt. Use Shopify's default robots.txt or a carefully scoped override.",
      evidence: `Disallow lines in robots.txt: ${robotsAnalysis.evidence}`,
      impactScore: 90,
      effortLevel: "medium",
    });
  }

  // ── 2. sitemap.xml ───────────────────────────────────────────────────────────
  const sitemapResponse = await safeFetch(`${baseUrl}/sitemap.xml`);
  let sitemapAnalysis: SitemapAnalysis = { found: false, hasProducts: false, hasCollections: false, evidence: "sitemap.xml not found" };

  if (sitemapResponse.ok && sitemapResponse.text.length > 0) {
    sitemapAnalysis = analyzeSitemap(sitemapResponse.text);
  }

  if (!sitemapAnalysis.found) {
    gaps.push({
      ruleId: "SEO_SITEMAP_MISSING",
      category: "technical-seo",
      severity: "high",
      title: "sitemap.xml not found",
      description: "No sitemap was found at /sitemap.xml. Sitemaps are essential for search engines and AI crawlers to discover all product and collection pages.",
      suggestion: "Shopify generates /sitemap.xml automatically. Verify it hasn't been suppressed. Submit it to Google Search Console.",
      evidence: `GET ${baseUrl}/sitemap.xml returned ${sitemapResponse.status}`,
      impactScore: 75,
      effortLevel: "low",
    });
  } else if (!sitemapAnalysis.hasProducts) {
    gaps.push({
      ruleId: "SEO_SITEMAP_NO_PRODUCTS",
      category: "technical-seo",
      severity: "medium",
      title: "Sitemap does not reference product URLs",
      description: "The sitemap.xml was found but doesn't appear to include product page URLs. AI agents and search engines may not discover your catalog.",
      suggestion: "Ensure your Shopify sitemap includes the sitemap_products_1.xml sub-sitemap. Check theme settings that might exclude products.",
      evidence: sitemapAnalysis.evidence,
      impactScore: 65,
      effortLevel: "low",
    });
  }

  // ── 3. Page sampling: home + product pages ───────────────────────────────────
  const pagesToSample = [
    baseUrl,
    ...productUrls.slice(0, 5),
  ];

  let pagesWithMetaDescription = 0;
  let pagesWithCanonical = 0;
  const missingMeta: string[] = [];
  const missingCanonical: string[] = [];

  for (const pageUrl of pagesToSample) {
    const pageRes = await safeFetch(pageUrl);
    if (!pageRes.ok) continue;

    const html = pageRes.text;
    const metaDesc = extractMetaTag(html, "description");
    const canonical = extractCanonical(html);
    const title = extractTitle(html);

    if (metaDesc && metaDesc.length >= 50) {
      pagesWithMetaDescription++;
    } else {
      missingMeta.push(pageUrl);
    }

    if (canonical) {
      pagesWithCanonical++;
    } else {
      missingCanonical.push(pageUrl);
    }

    logger.debug({ pageUrl, hasMetaDesc: Boolean(metaDesc), hasCanonical: Boolean(canonical), title }, "Page sampled");
  }

  const sampledPages = pagesToSample.length;

  if (missingMeta.length > 0) {
    gaps.push({
      ruleId: "SEO_META_DESCRIPTION_MISSING",
      category: "technical-seo",
      severity: missingMeta.length >= sampledPages * 0.5 ? "high" : "medium",
      title: `Meta descriptions missing on ${missingMeta.length} of ${sampledPages} sampled pages`,
      description: "Pages without meta descriptions show auto-generated snippets in search results. AI assistants also use meta descriptions as a primary signal for page relevance.",
      suggestion: "Add unique, descriptive meta descriptions (120–160 chars) to all product and collection pages. In Shopify, use the SEO section on each product/collection edit page.",
      evidence: `Missing meta description on: ${missingMeta.slice(0, 3).join(", ")}${missingMeta.length > 3 ? ` +${missingMeta.length - 3} more` : ""}`,
      impactScore: 60,
      effortLevel: "medium",
    });
  }

  if (missingCanonical.length > 0) {
    gaps.push({
      ruleId: "SEO_CANONICAL_MISSING",
      category: "technical-seo",
      severity: "low",
      title: `Canonical tags missing on ${missingCanonical.length} of ${sampledPages} sampled pages`,
      description: "Missing canonical tags can lead to duplicate content issues when Shopify generates multiple URLs for the same product (e.g., via collections).",
      suggestion: "Shopify themes should include canonical tags by default. Check your theme's layout files (layout/theme.liquid) for {{ canonical_url }} tag inclusion.",
      evidence: `Missing canonical on: ${missingCanonical.slice(0, 3).join(", ")}${missingCanonical.length > 3 ? ` +${missingCanonical.length - 3} more` : ""}`,
      impactScore: 40,
      effortLevel: "low",
    });
  }

  return {
    robotsTxtFound: robotsAnalysis.found,
    sitemapFound: sitemapAnalysis.found,
    sitemapHasProducts: sitemapAnalysis.hasProducts,
    sampledPages,
    pagesWithMetaDescription,
    pagesWithCanonical,
    gaps,
  };
}
