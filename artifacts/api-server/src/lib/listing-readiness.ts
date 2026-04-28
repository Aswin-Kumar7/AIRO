/**
 * Marketplace / AI listing readiness scorer.
 *
 * Measures whether a merchant's catalog meets the quality bar expected by
 * AI shopping agents, Google Shopping, Meta Catalog, Shopify Collective,
 * and affiliate networks.
 *
 * Scoring philosophy: strict by default. A product with a 60-char description
 * or no material info should fail, not pass.
 */

export interface ListingCheckResult {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  score: number;    // contribution earned (0 = failed, max = weight)
  weight: number;
  recommendation: string;
}

export interface ListingReadinessReport {
  overallScore: number;            // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  checks: ListingCheckResult[];
  summary: string;
  topRecommendations: string[];    // top 3 action items
}

interface CatalogStats {
  totalProducts: number;
  /** Products with stripped description > 200 chars (~30+ words) */
  productsWithDescription: number;
  /** Products with stripped description > 500 chars (~80+ words, richness bar) */
  productsWithRichDescription: number;
  productsWithImage: number;
  productsWithPrice: number;
  productsWithType: number;
  productsWithVendor: number;
  /** Products with ≥ 5 tags (raised from 3) */
  productsWithTags: number;
  avgOverallScore: number;
  avgTagScore: number;
  avgCompletenessScore: number;
  avgTrustScore: number;
  avgImageQualityScore: number;
  /** % of products with completenessScore >= 60 */
  productsWithDecentCompleteness: number;
  hasRefundPolicy: boolean;
  hasShippingPolicy: boolean;
  hasPrivacyPolicy: boolean;
}

export function computeListingReadiness(stats: CatalogStats): ListingReadinessReport {
  const checks: ListingCheckResult[] = [];

  function pct(numerator: number): number {
    if (stats.totalProducts === 0) return 0;
    return Math.round((numerator / stats.totalProducts) * 100);
  }

  // ── 1. Description coverage — requires >200 chars (~30 words) (weight: 18) ──
  const descPct = pct(stats.productsWithDescription);
  checks.push({
    id: "description_coverage",
    label: "Product description coverage",
    description: `${descPct}% of products have a meaningful description (30+ words).`,
    passed: descPct >= 85,
    score: descPct >= 85 ? 18 : descPct >= 65 ? 11 : descPct >= 40 ? 5 : 0,
    weight: 18,
    recommendation: "Every product needs at least 80 words of descriptive copy — what it is, who it's for, key materials, and use case.",
  });

  // ── 2. Description richness — requires >500 chars (~80 words) (weight: 14) ──
  const richPct = pct(stats.productsWithRichDescription);
  checks.push({
    id: "description_richness",
    label: "Description depth & richness (80+ words)",
    description: `${richPct}% of products have in-depth descriptions (80+ words with substance).`,
    passed: richPct >= 60,
    score: richPct >= 60 ? 14 : richPct >= 40 ? 9 : richPct >= 20 ? 4 : 0,
    weight: 14,
    recommendation: "Expand descriptions to cover: materials, dimensions, use cases, target audience, and key differentiators. Thin copy is the #1 cause of AI shopping agent rejection.",
  });

  // ── 3. AI completeness quality — avgCompletenessScore (weight: 14) ──────────
  const avgComp = Math.round(stats.avgCompletenessScore);
  checks.push({
    id: "completeness_score",
    label: "AI completeness score (catalog average)",
    description: `Catalog average completeness: ${avgComp}/100. AI agents need ≥65 to answer buyer questions confidently.`,
    passed: avgComp >= 65,
    score: avgComp >= 65 ? 14 : avgComp >= 50 ? 9 : avgComp >= 35 ? 4 : 0,
    weight: 14,
    recommendation: "Add materials, dimensions, compatibility, and use-case details across your catalog — these are the attributes AI agents parse to match buyer queries.",
  });

  // ── 4. Product image coverage (weight: 12) ──────────────────────────────────
  const imgPct = pct(stats.productsWithImage);
  checks.push({
    id: "image_coverage",
    label: "Product image coverage",
    description: `${imgPct}% of products have at least one image.`,
    passed: imgPct >= 95,
    score: imgPct >= 95 ? 12 : imgPct >= 80 ? 8 : imgPct >= 60 ? 4 : 0,
    weight: 12,
    recommendation: "Every product must have at least one high-quality image. AI vision models require clear product photos to generate recommendations.",
  });

  // ── 5. Policy completeness (weight: 12) ─────────────────────────────────────
  const policyCount = [stats.hasRefundPolicy, stats.hasShippingPolicy, stats.hasPrivacyPolicy].filter(Boolean).length;
  checks.push({
    id: "policies",
    label: "Store policy completeness",
    description: `${policyCount}/3 policies present (refund, shipping, privacy).`,
    passed: policyCount === 3,
    score: policyCount === 3 ? 12 : policyCount === 2 ? 7 : policyCount === 1 ? 3 : 0,
    weight: 12,
    recommendation: "Publish all 3 policies: refund, shipping, and privacy. Marketplaces and AI agents require these before recommending your store.",
  });

  // ── 6. Tag richness — ≥5 tags per product (raised bar) (weight: 10) ─────────
  const tagPct = pct(stats.productsWithTags);
  checks.push({
    id: "tag_richness",
    label: "Tag richness (≥5 descriptive tags per product)",
    description: `${tagPct}% of products have 5 or more descriptive tags.`,
    passed: tagPct >= 65,
    score: tagPct >= 65 ? 10 : tagPct >= 40 ? 6 : tagPct >= 20 ? 2 : 0,
    weight: 10,
    recommendation: "Add 5–10 semantic tags per product: category, material, use case, audience, and key attributes. Tags are the primary retrieval signal for AI shopping agents.",
  });

  // ── 7. Trust score (weight: 10) ──────────────────────────────────────────────
  const avgTrust = Math.round(stats.avgTrustScore);
  checks.push({
    id: "trust_score",
    label: "Average trust score",
    description: `Catalog average trust: ${avgTrust}/100.`,
    passed: avgTrust >= 60,
    score: avgTrust >= 60 ? 10 : avgTrust >= 40 ? 6 : avgTrust >= 20 ? 2 : 0,
    weight: 10,
    recommendation: "Add customer reviews, product certifications, and vendor/brand information to every product to build AI trust signals.",
  });

  // ── 8. Product type classification (weight: 8) ───────────────────────────────
  const typePct = pct(stats.productsWithType);
  checks.push({
    id: "product_type",
    label: "Product type classification",
    description: `${typePct}% of products have a specific product type assigned.`,
    passed: typePct >= 85,
    score: typePct >= 85 ? 8 : typePct >= 60 ? 5 : typePct >= 30 ? 2 : 0,
    weight: 8,
    recommendation: "Set a precise product type for every product — avoid generic types like 'Accessories'. Use specifics like 'Women's Waterproof Hiking Boots'.",
  });

  // ── 9. Image quality score (weight: 2) ──────────────────────────────────────
  const avgImgQ = Math.round(stats.avgImageQualityScore);
  checks.push({
    id: "image_quality",
    label: "Product image quality",
    description: `Average image quality score: ${avgImgQ}/100.`,
    passed: avgImgQ >= 60,
    score: avgImgQ >= 60 ? 2 : avgImgQ >= 40 ? 1 : 0,
    weight: 2,
    recommendation: "Use white-background, high-resolution images with multiple angles for AI vision scanning.",
  });

  const totalScore = checks.reduce((s, c) => s + c.score, 0);
  const maxScore = checks.reduce((s, c) => s + c.weight, 0);
  const overallScore = Math.round((totalScore / maxScore) * 100);

  // Strict grade thresholds — a catalog needs real quality to earn a B+
  const grade: ListingReadinessReport["grade"] =
    overallScore >= 88 ? "A"
    : overallScore >= 73 ? "B"
    : overallScore >= 58 ? "C"
    : overallScore >= 42 ? "D"
    : "F";

  const failed = checks.filter((c) => !c.passed).sort((a, b) => b.weight - a.weight);
  const topRecommendations = failed.slice(0, 3).map((c) => c.recommendation);

  const summary =
    overallScore >= 80
      ? "Your catalog meets AI marketplace listing standards. Focus on polish and edge cases."
      : overallScore >= 60
      ? "Your catalog is partially ready. Address the gaps below to unlock AI recommendation eligibility."
      : overallScore >= 40
      ? "Significant content and data gaps. Most AI agents would skip your catalog at this quality level."
      : "Catalog not ready for AI marketplaces. Product descriptions, tags, and trust signals need a complete overhaul.";

  return { overallScore, grade, checks, summary, topRecommendations };
}
