/**
 * AI-powered features beyond basic analysis:
 * query simulation, topical authority, internal links, llms.txt, FAQ schema, product Q&A.
 */

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

// ─── Live AI Query Simulation ─────────────────────────────────────────────────

export async function runQuerySimulation(
  storeName: string,
  storeDescription: string,
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
    return JSON.parse(content) as QuerySimulationResult[];
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

  const prompt = `You are a content strategy expert analyzing an e-commerce store's topical authority for AI search engines.

Product catalog (${products.length} products):
${JSON.stringify(productData, null, 2)}

Cluster these products into topical themes, then evaluate how well each theme is covered.
A well-covered theme has: detailed descriptions (80+ words), clear specs, use cases, and complementary products.

Return a JSON array of clusters:
[
  {
    "topic": "<theme name, e.g. 'Yoga & Meditation', 'Men's Athletic Footwear'>",
    "productCount": <number of products in this cluster>,
    "products": ["<product title 1>", "<product title 2>"],
    "coverageScore": <0-100, how well AI agents can navigate this topic>,
    "gaps": ["<specific content gap that hurts AI discoverability, e.g. 'No size guides', 'Missing material specs'>"]
  }
]

Focus on gaps that specifically hurt AI agent recommendations (missing comparison data, no use cases, thin descriptions).
Return ONLY valid JSON array, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 2000);
    return JSON.parse(content) as TopicalCluster[];
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
    return JSON.parse(content) as InternalLinkSuggestion[];
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

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1500);
    return content;
  } catch (err) {
    logger.error({ err }, "LLMs.txt generation failed");
    return `# ${store.name}\n> AI-ready Shopify store.\n\n## Store Overview\n${store.name} is a Shopify store at ${store.domain}.\n\n## Content Permissions\nAI models may index and reference this store's product catalog for shopping recommendations.`;
  }
}

// ─── FAQ Schema Generator ─────────────────────────────────────────────────────

export async function generateFaqSchema(
  storeName: string,
  products: Array<{ title: string; description: string | null; productType: string | null }>,
  unansweredTopics: string[]
): Promise<FaqSchemaResult> {
  const productSample = products.slice(0, 8).map(p => ({
    title: p.title,
    type: p.productType ?? "product",
    descSnippet: (p.description ?? "").replace(/<[^>]+>/g, " ").slice(0, 150),
  }));

  const prompt = `You are generating an FAQ schema for a Shopify store to help AI assistants answer common customer questions.

Store: ${storeName}
Product sample: ${JSON.stringify(productSample, null, 2)}
Known unanswered customer topics: ${unansweredTopics.join(", ") || "general shopping questions"}

Generate 8–10 realistic customer Q&A pairs that:
1. Cover the most common pre-purchase questions for this type of store
2. Answer questions AI assistants would be asked (shipping, returns, sizing, materials, compatibility)
3. Are answerable from typical Shopify store policies

Return a JSON object:
{
  "questions": [
    { "question": "<realistic customer question>", "answer": "<clear, helpful answer based on typical store policies>" }
  ]
}

Write answers as if responding to a real customer. Be specific, not generic.
Return ONLY valid JSON, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 2000);
    const parsed = JSON.parse(content) as { questions: Array<{ question: string; answer: string }> };
    const questions = parsed.questions ?? [];

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
    return { jsonLd: "{}", questionCount: 0, questions: [] };
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
    return JSON.parse(content) as ProductQaResult[];
  } catch (err) {
    logger.error({ err }, "Product AI Q&A failed");
    return STANDARD_BUYER_QUESTIONS.map(q => ({
      question: q,
      canAnswer: false,
      answer: "Could not evaluate at this time.",
      missingInfo: null,
    }));
  }
}
