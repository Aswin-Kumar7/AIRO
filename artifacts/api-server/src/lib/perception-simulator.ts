import { z } from "zod";
import { chatCompletion } from "./ai-client";
import { logger } from "./logger";

export type PerceptionProductInput = {
  title: string;
  description: string | null;
  tags: string[];
  collections: string[];
  reviewCount: number;
  reviewRating: number;
  hasStructuredData: boolean;
  vendor: string | null;
  price: string | null;
  /** Optional: overall AI readiness score for this product (0–100) */
  overallScore?: number | null;
};

export type PerceptionInput = {
  storeName: string;
  domain: string;
  desiredPositioning: string | null;
  products: PerceptionProductInput[];
  policies: {
    refund: boolean;
    shipping: boolean;
    privacy: boolean;
    terms: boolean;
  };
  faqPage: { title: string; body: string } | null;
  /** Top detected gaps from the most recent analysis run */
  topGaps?: Array<{ title: string; severity: "high" | "medium" | "low"; category: string }>;
};

export type StorePerceptionResult = {
  agentNarrative: string;
  unansweredQuestions: string[];
  ambiguities: string[];
  perceivedStrengths: string[];
  faqQuestionCount: number;
  faqGaps: string[];
};

// ─── Zod schema ───────────────────────────────────────────────────────────────

const perceptionResponseSchema = z.object({
  agentNarrative: z.string().min(20),
  unansweredQuestions: z.array(z.string()).catch([]),
  ambiguities: z.array(z.string()).catch([]),
  perceivedStrengths: z.array(z.string()).catch([]),
});

// ─── FAQ helpers ──────────────────────────────────────────────────────────────

const FAQ_TOPICS = [
  { label: "shipping timelines", patterns: [/shipping/i, /delivery/i, /dispatch/i] },
  { label: "returns and refunds", patterns: [/return/i, /refund/i, /exchange/i] },
  { label: "materials and ingredients", patterns: [/material/i, /ingredient/i, /fabric/i, /made of/i] },
  { label: "sizing and dimensions", patterns: [/size/i, /fit/i, /dimension/i, /measurement/i] },
  { label: "care instructions", patterns: [/care/i, /wash/i, /clean/i, /maintenance/i] },
];

function stripHtml(value: string | null | undefined): string {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function summarizeFaq(faqPage: { title: string; body: string } | null): {
  questionCount: number;
  missingTopics: string[];
} {
  if (!faqPage) {
    return {
      questionCount: 0,
      missingTopics: FAQ_TOPICS.map((topic) => topic.label),
    };
  }

  const faqText = stripHtml(faqPage.body).toLowerCase();
  const explicitQuestions = faqText.match(/\?/g)?.length ?? 0;
  const headingQuestions = faqText
    .split(/\s{2,}|\n+/)
    .filter((line) => /^(how|what|when|where|can|do|is)\b/i.test(line)).length;
  const questionCount = Math.max(explicitQuestions, headingQuestions);
  const missingTopics = FAQ_TOPICS
    .filter((topic) => !topic.patterns.some((pattern) => pattern.test(faqText)))
    .map((topic) => topic.label);

  return { questionCount, missingTopics };
}

function buildFallbackNarrative(
  input: PerceptionInput,
  faqSummary: { questionCount: number; missingTopics: string[] },
): StorePerceptionResult {
  const describedProducts = input.products.filter((product) => stripHtml(product.description).length > 80).length;
  const productsWithReviews = input.products.filter((product) => product.reviewCount > 0).length;
  const productsWithStructuredData = input.products.filter((product) => product.hasStructuredData).length;

  const perceivedStrengths = [
    input.policies.refund ? "Return policy is present, which increases AI confidence." : null,
    input.policies.shipping ? "Shipping policy exists, so fulfillment expectations are clearer." : null,
    productsWithReviews > 0 ? `${productsWithReviews} products contain review signals.` : null,
    productsWithStructuredData > 0 ? `${productsWithStructuredData} products expose structured-data clues.` : null,
  ].filter((item): item is string => Boolean(item));

  const unansweredQuestions = [
    !input.policies.refund ? "What is the return or refund policy for this store?" : null,
    !input.policies.shipping ? "How long does shipping take and what does it cost?" : null,
    faqSummary.questionCount === 0 ? "Where can I find a store FAQ that answers common buyer questions?" : null,
    faqSummary.missingTopics.includes("sizing and dimensions") ? "How should shoppers choose the right size or dimensions?" : null,
    input.products.some((product) => product.reviewCount === 0)
      ? "Which products have verified customer feedback or social proof?"
      : null,
  ].filter((item): item is string => Boolean(item));

  const ambiguities = [
    describedProducts < input.products.length ? "Some products still have thin descriptions, so the catalog feels uneven." : null,
    productsWithStructuredData < input.products.length ? "Machine-readable product facts are inconsistent across the catalog." : null,
    faqSummary.missingTopics.length > 0
      ? `FAQ coverage misses topics like ${faqSummary.missingTopics.slice(0, 2).join(" and ")}.`
      : null,
  ].filter((item): item is string => Boolean(item));

  const desiredPositioning = input.desiredPositioning
    ? ` The merchant wants the store to be perceived as: ${input.desiredPositioning}.`
    : "";
  const criticalGapSummary = (() => {
    const criticalGaps = (input.topGaps ?? []).filter(g => g.severity === "high").slice(0, 3);
    if (criticalGaps.length === 0) return "";
    return ` Top content issues include: ${criticalGaps.map(g => g.title).join("; ")}.`;
  })();
  const agentNarrative = `${input.storeName} has ${input.products.length} analyzed products. An AI shopping agent can describe the catalog at a high level, but confidence improves when product details, trust signals, and FAQ coverage are more consistent.${criticalGapSummary}${desiredPositioning}`;

  return {
    agentNarrative,
    unansweredQuestions,
    ambiguities,
    perceivedStrengths,
    faqQuestionCount: faqSummary.questionCount,
    faqGaps: faqSummary.missingTopics,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function simulateStorePerception(input: PerceptionInput): Promise<StorePerceptionResult> {
  const faqSummary = summarizeFaq(input.faqPage);

  // Build a richer product snapshot: include actual description excerpts and per-product signals
  const productSample = input.products.slice(0, 10).map((p) => {
    const plain = stripHtml(p.description);
    return {
      title: p.title,
      descriptionExcerpt: plain.slice(0, 250) || "(no description)",
      descWordCount: plain.split(/\s+/).filter(Boolean).length,
      tags: p.tags.slice(0, 8),
      price: p.price ? `$${p.price}` : null,
      vendor: p.vendor ?? null,
      reviewCount: p.reviewCount,
      reviewRating: p.reviewRating > 0 ? p.reviewRating : null,
      hasStructuredData: p.hasStructuredData,
      overallScore: p.overallScore != null ? Math.round(p.overallScore) : null,
    };
  });

  // Calculate catalog-level stats for the prompt
  const totalProducts = input.products.length;
  const avgScore = input.products.filter(p => p.overallScore != null).length > 0
    ? Math.round(input.products.reduce((s, p) => s + (p.overallScore ?? 0), 0) / totalProducts)
    : null;
  const thinContentCount = input.products.filter(p => stripHtml(p.description).split(/\s+/).filter(Boolean).length < 50).length;
  const noReviewCount = input.products.filter(p => p.reviewCount === 0).length;
  const withStructuredDataCount = input.products.filter(p => p.hasStructuredData).length;
  const priceRange = (() => {
    const prices = input.products.map(p => parseFloat(p.price ?? "0")).filter(p => p > 0);
    if (!prices.length) return null;
    return `$${Math.min(...prices).toFixed(0)}–$${Math.max(...prices).toFixed(0)}`;
  })();

  // Top critical gaps (to ground the narrative in real analysis findings)
  const criticalGapTitles = (input.topGaps ?? [])
    .filter(g => g.severity === "high")
    .slice(0, 6)
    .map(g => `[${g.category}] ${g.title}`);
  const mediumGapTitles = (input.topGaps ?? [])
    .filter(g => g.severity === "medium")
    .slice(0, 4)
    .map(g => g.title);

  const prompt = `You are simulating how a sophisticated AI shopping assistant (like ChatGPT Shopping or Google Gemini) perceives a Shopify store after crawling it. Your output will be shown to the merchant to help them improve.

Store:
- Name: ${input.storeName}
- Domain: ${input.domain}
- Merchant desired positioning: ${input.desiredPositioning ?? "(not specified)"}
- Price range: ${priceRange ?? "unknown"}
- Total products: ${totalProducts}${avgScore != null ? ` | Avg AI readiness score: ${avgScore}/100` : ""}

Catalog signals:
- Thin descriptions (<50 words): ${thinContentCount}/${totalProducts} products
- No reviews: ${noReviewCount}/${totalProducts} products
- Has structured data: ${withStructuredDataCount}/${totalProducts} products
- Return policy: ${input.policies.refund ? "Yes" : "Missing"}
- Shipping policy: ${input.policies.shipping ? "Yes" : "Missing"}
- FAQ page: ${input.faqPage ? `"${input.faqPage.title}" (${faqSummary.questionCount} questions)` : "Not found"}
- FAQ content gaps: ${faqSummary.missingTopics.join(", ") || "none"}
${criticalGapTitles.length ? `\nCritical analysis issues:\n${criticalGapTitles.map(g => `  - ${g}`).join("\n")}` : ""}
${mediumGapTitles.length ? `\nOther detected issues:\n${mediumGapTitles.map(g => `  - ${g}`).join("\n")}` : ""}

Product sample (first ${productSample.length} of ${totalProducts}):
${JSON.stringify(productSample, null, 2)}

Return valid JSON with these EXACT keys:
{
  "agentNarrative": "<3-5 specific sentences describing how an AI assistant would currently describe this store — mention actual product names, specific content weaknesses, and any positioning gap between how the merchant wants to be perceived vs how the catalog reads today>",
  "unansweredQuestions": ["<specific question an AI assistant could NOT answer from available data, max 5>"],
  "ambiguities": ["<specific ambiguity in product data that would cause an AI to hedge or avoid recommending, max 4>"],
  "perceivedStrengths": ["<concrete strength visible to AI agents from actual data, max 3>"]
}

Rules:
- agentNarrative MUST reference specific products by name from the sample
- All fields must reflect the actual data above — do not invent facts not present
- Be critical where warranted — vague praise is not useful
Return ONLY valid JSON.`;

  try {
    const raw = await chatCompletion([{ role: "user", content: prompt }], 2000);

    // Try direct parse, then strip code fences
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch {
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) { try { parsed = JSON.parse(fenced[1]!.trim()); } catch { /* ignore */ } }
    }

    if (parsed === null) {
      logger.warn({ domain: input.domain }, "Perception simulator: JSON parse failed — using fallback");
      return buildFallbackNarrative(input, faqSummary);
    }

    const result = perceptionResponseSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues, domain: input.domain }, "Perception simulator: Zod validation failed — using fallback");
      return buildFallbackNarrative(input, faqSummary);
    }

    return {
      agentNarrative: result.data.agentNarrative,
      unansweredQuestions: result.data.unansweredQuestions.slice(0, 5),
      ambiguities: result.data.ambiguities.slice(0, 4),
      perceivedStrengths: result.data.perceivedStrengths.slice(0, 3),
      faqQuestionCount: faqSummary.questionCount,
      faqGaps: faqSummary.missingTopics,
    };
  } catch (err) {
    logger.error({ err, domain: input.domain }, "Failed to simulate store perception");
    return buildFallbackNarrative(input, faqSummary);
  }
}
