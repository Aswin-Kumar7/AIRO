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
};

export type StorePerceptionResult = {
  agentNarrative: string;
  unansweredQuestions: string[];
  ambiguities: string[];
  perceivedStrengths: string[];
  faqQuestionCount: number;
  faqGaps: string[];
};

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
    productsWithStructuredData > 0 ? `${productsWithStructuredData} products expose some structured-data clues.` : null,
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
  const agentNarrative = `${input.storeName} has ${input.products.length} analyzed products. An AI shopping agent can describe the catalog at a high level, but confidence improves when product details, trust signals, and FAQ coverage are more consistent.${desiredPositioning}`;

  return {
    agentNarrative,
    unansweredQuestions,
    ambiguities,
    perceivedStrengths,
    faqQuestionCount: faqSummary.questionCount,
    faqGaps: faqSummary.missingTopics,
  };
}

export async function simulateStorePerception(input: PerceptionInput): Promise<StorePerceptionResult> {
  const faqSummary = summarizeFaq(input.faqPage);
  const productSample = input.products.slice(0, 8).map((product) => ({
    title: product.title,
    description: stripHtml(product.description).slice(0, 320),
    tags: product.tags,
    collections: product.collections,
    reviewCount: product.reviewCount,
    reviewRating: product.reviewRating,
    hasStructuredData: product.hasStructuredData,
    vendor: product.vendor,
    price: product.price,
  }));

  const prompt = `You are simulating how an AI shopping assistant perceives a Shopify store.

Store:
- Name: ${input.storeName}
- Domain: ${input.domain}
- Merchant desired positioning: ${input.desiredPositioning ?? "(not provided)"}

Signals:
- Policies: ${JSON.stringify(input.policies)}
- FAQ page: ${input.faqPage ? `${input.faqPage.title} (${faqSummary.questionCount} likely questions found)` : "not found"}
- FAQ gaps: ${faqSummary.missingTopics.join(", ") || "none"}

Products sample:
${JSON.stringify(productSample, null, 2)}

Return valid JSON with these exact keys:
{
  "agentNarrative": "<2-4 sentence narrative of how an AI assistant would currently describe the store>",
  "unansweredQuestions": ["question 1"],
  "ambiguities": ["ambiguity 1"],
  "perceivedStrengths": ["strength 1"]
}

Be concrete. Focus on what an AI shopping assistant can and cannot confidently say today.
Return only JSON.`;

  try {
    const raw = await chatCompletion([{ role: "user", content: prompt }], 1800);

    const parsed = JSON.parse(raw) as Omit<
      StorePerceptionResult,
      "faqQuestionCount" | "faqGaps"
    >;
    return {
      agentNarrative: parsed.agentNarrative ?? buildFallbackNarrative(input, faqSummary).agentNarrative,
      unansweredQuestions: Array.isArray(parsed.unansweredQuestions) ? parsed.unansweredQuestions : [],
      ambiguities: Array.isArray(parsed.ambiguities) ? parsed.ambiguities : [],
      perceivedStrengths: Array.isArray(parsed.perceivedStrengths) ? parsed.perceivedStrengths : [],
      faqQuestionCount: faqSummary.questionCount,
      faqGaps: faqSummary.missingTopics,
    };
  } catch (err) {
    logger.error({ err, domain: input.domain }, "Failed to simulate store perception");
    return buildFallbackNarrative(input, faqSummary);
  }
}