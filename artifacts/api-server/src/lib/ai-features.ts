/**
 * AI-powered features beyond basic analysis:
 * query simulation, topical authority, internal links, llms.txt, FAQ schema, product Q&A.
 *
 * All AI responses are Zod-validated (CB-3). Each function falls back to a typed empty
 * result rather than crashing or silently returning malformed data.
 */

import { z } from "zod";
import { chatCompletion } from "./ai-client";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuerySimulationResult {
  query: string;
  wouldRecommend: boolean;
  recommendedProduct: string | null;
  reasoning: string;
  missingInfo: string[];
  confidenceScore: number;
}

export interface TopicalCluster {
  topic: string;
  productCount: number;
  products: string[];
  coverageScore: number; // 0-100: how well this topic is covered
  gaps: string[];
  /** Estimated number of common buyer search queries this cluster can answer */
  queryCount: number;
  /** 2-3 example queries an AI agent would route to products in this cluster */
  topQueries: string[];
  /** Sub-topics within this theme that have zero product coverage */
  missingSubtopics: string[];
}

export interface InternalLinkSuggestion {
  fromProductId: string;
  fromProductTitle: string;
  toProductId: string;
  toProductTitle: string;
  reason: string;
  linkType: "complementary" | "alternative" | "same-category" | "upsell";
}

export interface FaqSchemaResult {
  jsonLd: string;
  questionCount: number;
  questions: Array<{ question: string; answer: string }>;
}

export interface ProductQaResult {
  question: string;
  canAnswer: boolean;
  answer: string;
  missingInfo: string | null;
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const querySimResultSchema = z.object({
  query: z.string(),
  wouldRecommend: z.boolean(),
  recommendedProduct: z.string().nullable().catch(null),
  reasoning: z.string(),
  missingInfo: z.array(z.string()).catch([]),
  confidenceScore: z.number().min(0).max(100).catch(50),
});
const querySimSchema = z.array(querySimResultSchema);

const topicalClusterSchema = z.object({
  topic: z.string(),
  productCount: z.number().int().nonnegative().catch(0),
  products: z.array(z.string()).catch([]),
  coverageScore: z.number().min(0).max(100).catch(50),
  gaps: z.array(z.string()).catch([]),
  queryCount: z.number().int().nonnegative().catch(0),
  topQueries: z.array(z.string()).catch([]),
  missingSubtopics: z.array(z.string()).catch([]),
});
const topicalAuthoritySchema = z.array(topicalClusterSchema);

const internalLinkSuggestionSchema = z.object({
  fromProductId: z.string(),
  fromProductTitle: z.string(),
  toProductId: z.string(),
  toProductTitle: z.string(),
  reason: z.string(),
  linkType: z.enum(["complementary", "alternative", "same-category", "upsell"]).catch("complementary"),
});
const internalLinksSchema = z.array(internalLinkSuggestionSchema);

const faqQaItemSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
const faqResponseSchema = z.object({
  questions: z.array(faqQaItemSchema).catch([]),
});

const productQaItemSchema = z.object({
  question: z.string(),
  canAnswer: z.boolean(),
  answer: z.string(),
  missingInfo: z.string().nullable().catch(null),
});
const productQaSchema = z.array(productQaItemSchema);

// ─── Helper: safe JSON parse ──────────────────────────────────────────────────

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some models wrap output in ```json ... ``` — strip fences and retry
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]!.trim());
      } catch {
        // fall through
      }
    }
    return null;
  }
}

// ─── Live AI Query Simulation ─────────────────────────────────────────────────

export async function runQuerySimulation(
  storeName: string,
  _storeDescription: string,
  products: Array<{ id: string; title: string; description: string | null; productType: string | null; tags: string[]; price: string | null }>
): Promise<QuerySimulationResult[]> {
  const catalogSnapshot = products.slice(0, 15).map(p => ({
    title: p.title,
    type: p.productType ?? "unknown",
    tags: p.tags.slice(0, 6).join(", "),
    price: p.price ? `$${p.price}` : "price unknown",
    descWords: (p.description ?? "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
  }));

  const prompt = `You are simulating a customer using an AI shopping assistant (like ChatGPT Shopping or Google AI Mode) to find products.

Store: "${storeName}"
Catalog sample (${products.length} total products):
${JSON.stringify(catalogSnapshot, null, 2)}

Generate 6 realistic buyer queries someone might ask an AI assistant for this type of store, then evaluate whether this store's product catalog could answer each query confidently.

Return a JSON array of exactly 6 objects:
[
  {
    "query": "<natural language customer query>",
    "wouldRecommend": <true if catalog has a good match, false if not>,
    "recommendedProduct": "<product title if wouldRecommend, else null>",
    "reasoning": "<1 sentence: why this product matches or why the catalog falls short>",
    "missingInfo": ["<specific info missing from the product page that prevents confident recommendation>"],
    "confidenceScore": <0-100, how confidently the AI could answer this query from available data>
  }
]

Make queries realistic and specific (e.g. "yoga mat for bad knees under $50" not "buy yoga mat").
Be honest — flag where product data is missing material info, specs, or use cases that would prevent recommendation.
Return ONLY valid JSON array, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 2000);
    const parsed = safeParseJson(content);
    if (parsed === null) {
      logger.warn("Query simulation: JSON parse failed");
      return [];
    }
    const result = querySimSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues }, "Query simulation: Zod validation failed");
      return [];
    }
    return result.data;
  } catch (err) {
    logger.error({ err }, "Query simulation failed");
    return [];
  }
}

// ─── Topical Authority Map ────────────────────────────────────────────────────

export async function analyzeTopicalAuthority(
  products: Array<{ id: string; title: string; description: string | null; productType: string | null; tags: string[] }>
): Promise<TopicalCluster[]> {
  if (products.length === 0) return [];

  const productData = products.map(p => ({
    title: p.title,
    type: p.productType ?? "",
    tags: p.tags.slice(0, 8),
    descLength: (p.description ?? "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
    hasSpecs: /(\d+\s*(cm|mm|kg|g|lb|oz|inch|liter|ml|watt))|material|compatible|dimension/i.test(p.description ?? ""),
  }));

  const prompt = `You are a content strategy expert analyzing an e-commerce store's topical authority for AI search engines (ChatGPT Shopping, Google Gemini, Perplexity).

Product catalog (${products.length} products):
${JSON.stringify(productData, null, 2)}

Cluster these products into topical themes. For each cluster evaluate:
1. How well this theme is covered today (coverageScore)
2. How many common buyer search queries this cluster could answer (queryCount)
3. Example queries AI agents would route to this cluster (topQueries)
4. Sub-topics within the theme that have ZERO product coverage (missingSubtopics)
5. Specific content gaps hurting AI discoverability (gaps)

A high-coverage cluster (score 70+) has: descriptions 80+ words, specs, use cases, comparison signals.
A low-coverage cluster (<40) has: thin descriptions, no specs, no use cases.

Return a JSON array of clusters:
[
  {
    "topic": "<theme name, e.g. 'Yoga & Meditation', 'Men's Athletic Footwear'>",
    "productCount": <number of products in this cluster>,
    "products": ["<product title 1>", "<product title 2>"],
    "coverageScore": <0-100, how well AI agents can navigate and recommend products in this topic>,
    "gaps": ["<specific content gap, e.g. 'No size guides on footwear products', 'Missing material specs across all 4 items'>"],
    "queryCount": <estimated number of common search queries this cluster answers, e.g. 8>,
    "topQueries": ["<real buyer query 1>", "<real buyer query 2>", "<real buyer query 3>"],
    "missingSubtopics": ["<sub-topic with zero products, e.g. 'Running shoes for flat feet'>", "<another missing sub-topic>"]
  }
]

Rules:
- topQueries must be specific realistic buyer queries (e.g. "yoga mat for bad knees under $50" not "yoga mat")
- missingSubtopics are gaps in the CATALOG — important sub-categories where AI cannot recommend because there are no products
- gaps are content quality issues within existing products
- queryCount reflects how many of the typical 10-15 queries for this category this cluster can actually answer
Return ONLY valid JSON array, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 2000);
    const parsed = safeParseJson(content);
    if (parsed === null) {
      logger.warn("Topical authority: JSON parse failed");
      return [];
    }
    const result = topicalAuthoritySchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues }, "Topical authority: Zod validation failed");
      return [];
    }
    return result.data;
  } catch (err) {
    logger.error({ err }, "Topical authority analysis failed");
    return [];
  }
}

// ─── Internal Link Audit ──────────────────────────────────────────────────────

export async function analyzeInternalLinks(
  products: Array<{ id: string; title: string; productType: string | null; tags: string[]; description: string | null }>
): Promise<InternalLinkSuggestion[]> {
  if (products.length < 2) return [];

  const productData = products.slice(0, 20).map(p => ({
    id: p.id,
    title: p.title,
    type: p.productType ?? "",
    tags: p.tags.slice(0, 6),
  }));

  const prompt = `You are analyzing an e-commerce product catalog to find missing internal links that would help AI agents understand the store's catalog structure.

Products:
${JSON.stringify(productData, null, 2)}

Identify the most valuable internal link opportunities — products that SHOULD link to each other but likely don't.
Focus on links that help AI understand: complementary products (buy together), alternatives (similar options), upsells (premium version), and same-category navigation.

Return a JSON array of up to 12 link suggestions:
[
  {
    "fromProductId": "<id>",
    "fromProductTitle": "<title>",
    "toProductId": "<id>",
    "toProductTitle": "<title>",
    "reason": "<why this link helps AI navigation and customer discovery>",
    "linkType": "<one of: complementary, alternative, same-category, upsell>"
  }
]

Only suggest high-confidence links where the relationship is clear.
Return ONLY valid JSON array, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 2000);
    const parsed = safeParseJson(content);
    if (parsed === null) {
      logger.warn("Internal links: JSON parse failed");
      return [];
    }
    const result = internalLinksSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues }, "Internal links: Zod validation failed");
      return [];
    }
    return result.data;
  } catch (err) {
    logger.error({ err }, "Internal link analysis failed");
    return [];
  }
}

// ─── LLMs.txt Generator ───────────────────────────────────────────────────────

export async function generateLlmsTxt(
  store: { name: string; domain: string; desiredPositioning?: string | null },
  products: Array<{ title: string; productType: string | null; tags: string[]; price: string | null }>,
  policyInfo: { hasFaq: boolean; faqTitle: string | null; unansweredTopics: string[] }
): Promise<string> {
  const categories = [...new Set(products.map(p => p.productType).filter(Boolean))].slice(0, 10);
  const priceRange = (() => {
    const prices = products.map(p => parseFloat(p.price ?? "0")).filter(p => p > 0);
    if (prices.length === 0) return null;
    return `$${Math.min(...prices).toFixed(0)}–$${Math.max(...prices).toFixed(0)}`;
  })();

  const prompt = `Generate a well-structured llms.txt file for this Shopify store. llms.txt is the emerging standard (like robots.txt but for LLM crawlers) that helps AI models understand a store's brand, catalog, and capabilities.

Store details:
- Name: ${store.name}
- Domain: ${store.domain}
- Desired positioning: ${store.desiredPositioning ?? "not specified"}
- Product categories: ${categories.join(", ") || "general merchandise"}
- Price range: ${priceRange ?? "varies"}
- Total products: ${products.length}
- FAQ page: ${policyInfo.hasFaq ? `Yes (${policyInfo.faqTitle ?? "FAQ"})` : "No"}

Format the llms.txt using markdown with these sections:
# [Store Name]
> [One-line brand description]

## Store Overview
[What this store sells, brand identity, customer promise]

## Product Catalog
[Categories, price ranges, key product lines]

## Shipping & Fulfillment
[What AI agents should know about delivery]

## Returns & Policies
[Key policy info AI needs to answer purchase questions]

## Content Permissions
[What AI agents are allowed to do with this content]

## Contact
[How to get support]

Keep it factual, concise, and written so an AI model can extract key facts in one pass. 2–3 sentences per section max.
Return ONLY the raw llms.txt markdown content, no code blocks.`;

  const fallback = `# ${store.name}\n> AI-ready Shopify store.\n\n## Store Overview\n${store.name} is a Shopify store at ${store.domain}.\n\n## Content Permissions\nAI models may index and reference this store's product catalog for shopping recommendations.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1500);
    // llms.txt is free-text markdown; validate it is a non-empty string
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }
    logger.warn("LLMs.txt generation returned empty content; using fallback");
    return fallback;
  } catch (err) {
    logger.error({ err }, "LLMs.txt generation failed");
    return fallback;
  }
}

// ─── FAQ Schema Generator ─────────────────────────────────────────────────────

export interface PolicyBodies {
  refund: string | null;
  shipping: string | null;
  privacy: string | null;
  terms: string | null;
}

export async function generateFaqSchema(
  storeName: string,
  products: Array<{ title: string; description: string | null; productType: string | null }>,
  unansweredTopics: string[],
  /** Upgrade 3: real policy text so answers are grounded, not hallucinated */
  policies?: PolicyBodies | null
): Promise<FaqSchemaResult> {
  const productSample = products.slice(0, 8).map(p => ({
    title: p.title,
    type: p.productType ?? "product",
    descSnippet: (p.description ?? "").replace(/<[^>]+>/g, " ").slice(0, 150),
  }));

  const emptyResult: FaqSchemaResult = { jsonLd: "{}", questionCount: 0, questions: [] };

  // Build policy context block for grounding
  const policyBlock = policies
    ? [
        policies.refund ? `REFUND POLICY:\n${policies.refund.slice(0, 600)}` : "REFUND POLICY: Not provided",
        policies.shipping ? `SHIPPING POLICY:\n${policies.shipping.slice(0, 600)}` : "SHIPPING POLICY: Not provided",
        policies.privacy ? `PRIVACY POLICY: Provided (not shown for brevity)` : "PRIVACY POLICY: Not provided",
        policies.terms ? `TERMS OF SERVICE: Provided (not shown for brevity)` : "TERMS OF SERVICE: Not provided",
      ].join("\n\n")
    : null;

  const prompt = `You are generating an FAQ schema for a Shopify store to help AI assistants answer common customer questions.

Store: ${storeName}
Product sample: ${JSON.stringify(productSample, null, 2)}
Known unanswered customer topics: ${unansweredTopics.join(", ") || "general shopping questions"}
${policyBlock ? `\n--- STORE POLICY TEXT (authoritative — answers MUST be grounded in this) ---\n${policyBlock}\n---` : "\nNote: No store policy text provided; indicate when policy specifics are unknown."}

Generate 8–10 realistic customer Q&A pairs that:
1. Cover the most common pre-purchase questions for this type of store
2. Answer questions AI assistants would be asked (shipping, returns, sizing, materials, compatibility)
3. Are grounded in the policy text above — if a policy is missing, answer must say "Not specified by this store"
4. Never invent policy specifics not present in the provided text

Return a JSON object:
{
  "questions": [
    {
      "question": "<realistic customer question>",
      "answer": "<clear, helpful answer grounded in the policy text above>"
    }
  ]
}

Write answers as if responding to a real customer. Be specific, not generic.
Return ONLY valid JSON, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 2000);
    const parsed = safeParseJson(content);
    if (parsed === null) {
      logger.warn("FAQ schema: JSON parse failed");
      return emptyResult;
    }
    const result = faqResponseSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues }, "FAQ schema: Zod validation failed");
      return emptyResult;
    }
    const questions = result.data.questions;

    const faqItems = questions.map(qa => ({
      "@type": "Question",
      "name": qa.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": qa.answer,
      },
    }));

    const schema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqItems,
    };

    return {
      jsonLd: JSON.stringify(schema, null, 2),
      questionCount: questions.length,
      questions,
    };
  } catch (err) {
    logger.error({ err }, "FAQ schema generation failed");
    return emptyResult;
  }
}

// ─── Answer-First Structure Fix Generator (Upgrade 4) ─────────────────────────

export interface AnswerFirstStructure {
  tldr: string;
  bestFor: string[];
  specsTable: Array<{ attribute: string; value: string }>;
  policySnippet: string | null;
}

const answerFirstStructureSchema = z.object({
  tldr: z.string(),
  bestFor: z.array(z.string()).catch([]),
  specsTable: z.array(z.object({ attribute: z.string(), value: z.string() })).catch([]),
  policySnippet: z.string().nullable().catch(null),
});

export async function generateAnswerFirstStructure(
  product: {
    title: string;
    description: string | null;
    tags: string[];
    productType: string | null;
    vendor: string | null;
    price: string | null;
  },
  policies?: { shipping: string | null; refund: string | null } | null
): Promise<AnswerFirstStructure> {
  const plain = (product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const fallback: AnswerFirstStructure = {
    tldr: `${product.title} — ${product.productType ?? "product"} by ${product.vendor ?? "this store"}`,
    bestFor: [],
    specsTable: [],
    policySnippet: null,
  };

  const prompt = `You are helping a Shopify merchant optimize a product page for AI search engines and answer engines.
AI agents favor pages with a clear TL;DR, "best for" use-cases, and a scannable specs table.

Product: ${product.title}
Vendor: ${product.vendor ?? "unknown"}
Type: ${product.productType ?? "unknown"}
Price: ${product.price ? `$${product.price}` : "not listed"}
Tags: ${product.tags.join(", ") || "none"}
Current description: ${plain.slice(0, 500) || "(none)"}
${policies?.shipping ? `Shipping policy snippet: ${policies.shipping.slice(0, 200)}` : ""}
${policies?.refund ? `Return policy snippet: ${policies.refund.slice(0, 200)}` : ""}

Generate an answer-first structure for this product page:

Return a JSON object:
{
  "tldr": "<1-2 sentence summary: what it is + who it's for>",
  "bestFor": ["<use case 1>", "<use case 2>", "<use case 3>"],
  "specsTable": [
    { "attribute": "<spec name e.g. Material>", "value": "<spec value, or 'Not specified' if unknown>" },
    { "attribute": "Dimensions", "value": "<value or 'Not specified'>" },
    { "attribute": "Weight", "value": "<value or 'Not specified'>" }
  ],
  "policySnippet": "<brief shipping/return info grounded in the policy above, or null if no policy provided>"
}

Rules:
- TL;DR must be 1-2 sentences, crystal clear
- bestFor: 2-4 specific use cases (not generic)
- specsTable: 3-6 rows covering material, dimensions, compatibility, care — mark "Not specified" honestly
- policySnippet: only include if policy text is provided above
Return ONLY valid JSON, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1200);
    const parsed = safeParseJson(content);
    if (parsed === null) {
      logger.warn({ product: product.title }, "Answer-first structure: JSON parse failed");
      return fallback;
    }
    const result = answerFirstStructureSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues }, "Answer-first structure: Zod validation failed");
      return fallback;
    }
    return result.data;
  } catch (err) {
    logger.error({ err }, "Answer-first structure generation failed");
    return fallback;
  }
}

// ─── Product AI Q&A Test ──────────────────────────────────────────────────────

const STANDARD_BUYER_QUESTIONS = [
  "What is this product made from?",
  "Who is this product best suited for?",
  "What sizes or variants are available?",
  "How does this compare to similar products?",
  "Is this compatible with [common accessories or use cases]?",
];

export async function runProductAiQa(product: {
  title: string;
  description: string | null;
  tags: string[];
  productType: string | null;
  vendor: string | null;
  price: string | null;
}): Promise<ProductQaResult[]> {
  const plain = (product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const fallbackResults: ProductQaResult[] = STANDARD_BUYER_QUESTIONS.map(q => ({
    question: q,
    canAnswer: false,
    answer: "Could not evaluate at this time.",
    missingInfo: null,
  }));

  const prompt = `You are an AI shopping assistant. A customer is asking about a product. Answer ONLY from the product information provided — do not make up facts.

Product: ${product.title}
Vendor: ${product.vendor ?? "unknown"}
Type: ${product.productType ?? "unknown"}
Price: ${product.price ? `$${product.price}` : "not listed"}
Tags: ${product.tags.join(", ") || "none"}
Description: ${plain.slice(0, 600) || "(no description provided)"}

Answer these 5 standard buyer questions using ONLY the product info above:
${STANDARD_BUYER_QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Return a JSON array of 5 objects:
[
  {
    "question": "<the question>",
    "canAnswer": <true if you can answer confidently from the product info, false if info is missing>,
    "answer": "<your answer if canAnswer, or 'Not enough information to answer.' if not>",
    "missingInfo": "<what specific info is missing from the product page that prevents answering, or null if canAnswer>"
  }
]

Be strict: if the description doesn't mention materials, say you can't answer the materials question.
Return ONLY valid JSON array, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1500);
    const parsed = safeParseJson(content);
    if (parsed === null) {
      logger.warn({ product: product.title }, "Product AI Q&A: JSON parse failed");
      return fallbackResults;
    }
    const result = productQaSchema.safeParse(parsed);
    if (!result.success) {
      logger.warn({ issues: result.error.issues, product: product.title }, "Product AI Q&A: Zod validation failed");
      return fallbackResults;
    }
    return result.data;
  } catch (err) {
    logger.error({ err }, "Product AI Q&A failed");
    return fallbackResults;
  }
}
