import { z } from "zod";
import { chatCompletion } from "./ai-client";
import { logger } from "./logger";
import { runRuleEngine, type ProductInput, type RuleViolation } from "./rule-engine";

export type { ProductInput as ProductData };

export interface ProductAnalysisResult {
  clarityScore: number;
  completenessScore: number;
  trustScore: number;
  tagScore: number;
  overallScore: number;
  aiPerceptionSummary: string;
  suggestedTags: string[];
  detectedCategory: string;
  /** CB-11: indicates whether AI was called, fell back to rules, or used fallback defaults */
  scoringSource: "ai" | "rule" | "fallback";
  issues: Array<{
    category: "clarity" | "completeness" | "trust" | "tags" | "policy" | "consistency";
    severity: "high" | "medium" | "low";
    title: string;
    description: string;
    suggestion: string;
    evidence?: string;
    impactScore?: number;
    effortLevel?: "low" | "medium" | "high";
    ruleId?: string;
  }>;
}

export interface StoreConsistencyResult {
  overallConsistencyScore: number;
  issues: Array<{
    type: "tone" | "structure" | "formatting" | "missing_section";
    description: string;
    affectedProductCount: number;
    examples: string[];
  }>;
  suggestedStructure: string[];
}


export async function analyzeProduct(product: ProductInput): Promise<ProductAnalysisResult> {
  // Step 1: deterministic rule engine — fast, evidence-backed, no AI
  const { ruleScores, violations, detectedCategory } = runRuleEngine(product);

  // Step 2: AI layer — only NLP clarity nuance + perception summary + tag suggestions
  const plain = (product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const descWordCount = plain.split(/\s+/).filter(Boolean).length;

  const aiPrompt = `You are an AI shopping assistant evaluating a Shopify product. Return a JSON object with exactly these three fields:
{
  "clarityScore": <0-100, how naturally a human or voice AI could understand this product from title + description alone>,
  "aiPerceptionSummary": "<2 sentences describing how a voice AI assistant would describe this product to a shopper>",
  "suggestedTags": ["tag1", "tag2", ...up to 8 semantic retrieval tags]
}

Product snapshot:
- Title: ${product.title}
- Description (${descWordCount} words): ${plain.slice(0, 400)}${plain.length > 400 ? "…" : ""}
- Current tags: ${product.tags.slice(0, 10).join(", ") || "(none)"}
- Type: ${product.productType ?? "unknown"} | Vendor: ${product.vendor ?? "unknown"}

Return ONLY valid JSON, no markdown.`;

  let aiClarityScore = ruleScores.clarity; // fallback if AI call fails
  let aiPerceptionSummary = "Limited product information makes it difficult for AI assistants to confidently recommend this product.";
  let suggestedTags: string[] = [];
  // CB-11: track whether AI contributed to scoring
  let scoringSource: "ai" | "rule" | "fallback" = "fallback";

  const aiSchema = z.object({
    clarityScore: z.number().min(0).max(100),
    aiPerceptionSummary: z.string().min(1),
    suggestedTags: z.array(z.string()).max(8),
  });

  try {
    const content = await chatCompletion([{ role: "user", content: aiPrompt }], 800);
    // Use safeParseJson pattern: try direct parse, then strip code fences
    let parsed: unknown = null;
    try { parsed = JSON.parse(content); } catch {
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) { try { parsed = JSON.parse(fenced[1]!.trim()); } catch { /* ignore */ } }
    }
    if (parsed !== null) {
      const result = aiSchema.safeParse(parsed);
      if (result.success) {
        aiClarityScore = result.data.clarityScore;
        aiPerceptionSummary = result.data.aiPerceptionSummary;
        suggestedTags = result.data.suggestedTags;
        scoringSource = "ai";
      } else {
        logger.warn({ issues: result.error.issues, productTitle: product.title }, "AI response validation failed — using rule scores");
        scoringSource = "rule";
      }
    } else {
      logger.warn({ productTitle: product.title }, "AI response JSON parse failed — using rule scores");
      scoringSource = "rule";
    }
  } catch (err) {
    logger.warn({ err, productTitle: product.title }, "AI layer failed — using rule-only scores");
    scoringSource = "rule";
  }

  // Step 3: deterministic score blending (AI only influences clarity)
  const clarityScore  = Math.round(0.4 * aiClarityScore + 0.6 * ruleScores.clarity);
  const completenessScore = ruleScores.completeness;
  const trustScore    = ruleScores.trust;
  const tagScore      = ruleScores.tags;
  // Use category-weighted overall instead of simple average
  const overallScore  = Math.round(
    0.4 * aiClarityScore + 0.6 * ruleScores.weightedOverall,
  );

  // Step 4: rule violations become the canonical issue list
  const issues = violations.map((v: RuleViolation) => ({
    category: v.category,
    severity: v.severity,
    title: v.title,
    description: v.description,
    suggestion: v.suggestion,
    evidence: v.evidence,
    impactScore: v.impactScore,
    effortLevel: v.effortLevel,
    ruleId: v.ruleId,
  }));

  return {
    clarityScore,
    completenessScore,
    trustScore,
    tagScore,
    overallScore,
    aiPerceptionSummary,
    suggestedTags,
    detectedCategory,
    scoringSource,
    issues,
  };
}

export async function analyzeStoreConsistency(
  products: Array<{ title: string; description: string | null; tags: string[] }>
): Promise<StoreConsistencyResult> {
  if (products.length === 0) {
    return {
      overallConsistencyScore: 50,
      issues: [],
      suggestedStructure: ["Product overview", "Key features", "Specifications", "Use cases"],
    };
  }

  const productSample = products.slice(0, 10).map((p) => ({
    title: p.title,
    descriptionLength: p.description?.length ?? 0,
    tags: p.tags.slice(0, 5),
    hasDescription: !!p.description && p.description.length > 50,
  }));

  const prompt = `You are an AI readiness expert. Analyze these Shopify store products for content consistency issues that would affect AI agent recommendations.

Products sample:
${JSON.stringify(productSample, null, 2)}

Return a JSON object with this exact structure:
{
  "overallConsistencyScore": <0-100>,
  "issues": [
    {
      "type": "<one of: tone, structure, formatting, missing_section>",
      "description": "<what the inconsistency is>",
      "affectedProductCount": <estimated number>,
      "examples": ["example1", "example2"]
    }
  ],
  "suggestedStructure": ["section1", "section2", ...]
}

Focus on issues that AI agents would notice when comparing products.
Return ONLY valid JSON, no markdown.`;

  const consistencySchema = z.object({
    overallConsistencyScore: z.number().min(0).max(100),
    issues: z.array(z.object({
      type: z.enum(["tone", "structure", "formatting", "missing_section"]),
      description: z.string().min(1),
      affectedProductCount: z.number(),
      examples: z.array(z.string()),
    })),
    suggestedStructure: z.array(z.string()),
  });

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1500);
    const parsed = JSON.parse(content);
    const result = consistencySchema.safeParse(parsed);
    
    if (result.success) {
      return result.data;
    }
    logger.warn({ issues: result.error.issues }, "Consistency AI response validation failed");
    throw new Error("Invalid AI response");
  } catch (err) {
    logger.error({ err }, "Failed to analyze store consistency");
    return {
      overallConsistencyScore: 60,
      issues: [
        {
          type: "structure",
          description: "Products have inconsistent description structures",
          affectedProductCount: products.length,
          examples: ["Some products have detailed specs while others do not"],
        },
      ],
      suggestedStructure: ["Product overview", "Key features", "Specifications", "Use cases", "Care instructions"],
    };
  }
}

export interface PolicyQualityResult {
  score: number; // 0–100
  breakdown: {
    refund: number;
    shipping: number;
    privacy: number;
    terms: number;
  };
  gaps: string[];
  strengths: string[];
}

export async function analyzePolicyQuality(policies: {
  refund: string | null;
  shipping: string | null;
  privacy: string | null;
  terms: string | null;
}): Promise<PolicyQualityResult> {
  const stripHtml = (s: string | null) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const refundText = stripHtml(policies.refund);
  const shippingText = stripHtml(policies.shipping);
  const privacyText = stripHtml(policies.privacy);
  const termsText = stripHtml(policies.terms);

  // Fast rule-based fallback scores based on length/keyword presence
  function ruleScore(text: string, keywords: string[]): number {
    if (!text || text.length < 30) return 0;
    const lower = text.toLowerCase();
    const kw = keywords.filter((k) => lower.includes(k)).length;
    const lengthScore = Math.min(50, Math.round(text.length / 20));
    const kwScore = Math.round((kw / keywords.length) * 50);
    return Math.min(100, lengthScore + kwScore);
  }

  const fallback: PolicyQualityResult = {
    score: Math.round(
      (ruleScore(refundText, ["return", "refund", "day", "exchange", "condition"]) +
       ruleScore(shippingText, ["delivery", "shipping", "business day", "carrier", "tracking"]) +
       ruleScore(privacyText, ["data", "personal", "collect", "third party", "cookie"]) +
       ruleScore(termsText, ["use", "prohibited", "liability", "agreement", "service"])) / 4,
    ),
    breakdown: {
      refund: ruleScore(refundText, ["return", "refund", "day", "exchange", "condition"]),
      shipping: ruleScore(shippingText, ["delivery", "shipping", "business day", "carrier", "tracking"]),
      privacy: ruleScore(privacyText, ["data", "personal", "collect", "third party", "cookie"]),
      terms: ruleScore(termsText, ["use", "prohibited", "liability", "agreement", "service"]),
    },
    gaps: [
      !refundText ? "No return/refund policy found" : refundText.length < 100 ? "Return policy is too brief — AI agents cannot answer return window or conditions" : null,
      !shippingText ? "No shipping policy found" : shippingText.length < 100 ? "Shipping policy is too brief — AI agents cannot answer delivery time questions" : null,
    ].filter(Boolean) as string[],
    strengths: [
      refundText && refundText.length >= 200 ? "Return policy is detailed" : null,
      shippingText && shippingText.length >= 200 ? "Shipping policy is detailed" : null,
    ].filter(Boolean) as string[],
  };

  // Only call AI if at least one policy has meaningful text
  const hasMeaningfulPolicy = [refundText, shippingText].some((t) => t.length > 100);
  if (!hasMeaningfulPolicy) return fallback;

  const prompt = `You are an AI shopping assistant evaluating an ecommerce store's policy pages for clarity and completeness. Score each policy 0–100 based on how well an AI agent can answer buyer questions from it.

Policies provided:
- Refund/Return (${refundText.length} chars): ${refundText.slice(0, 500)}
- Shipping (${shippingText.length} chars): ${shippingText.slice(0, 500)}
- Privacy (${privacyText.length} chars): ${privacyText.slice(0, 300)}
- Terms (${termsText.length} chars): ${termsText.slice(0, 300)}

Scoring criteria:
- Return policy: Does it state the return window (days), conditions (unused/original packaging), process (how to initiate), and refund method?
- Shipping: Does it specify delivery timeframes, carriers, costs, international options, and tracking?
- Privacy: Does it explain data collection, usage, and third-party sharing clearly?
- Terms: Is it specific enough to set expectations?

Return JSON:
{
  "breakdown": { "refund": 0-100, "shipping": 0-100, "privacy": 0-100, "terms": 0-100 },
  "gaps": ["gap 1", "gap 2"],
  "strengths": ["strength 1"]
}
Return ONLY valid JSON.`;

  try {
    const raw = await chatCompletion([{ role: "user", content: prompt }], 800);
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) { try { parsed = JSON.parse(m[1]!.trim()); } catch { /* ignore */ } }
    }

    const schema = z.object({
      breakdown: z.object({ refund: z.number(), shipping: z.number(), privacy: z.number(), terms: z.number() }),
      gaps: z.array(z.string()),
      strengths: z.array(z.string()),
    });
    const result = schema.safeParse(parsed);
    if (result.success) {
      const { breakdown, gaps, strengths } = result.data;
      const score = Math.round((breakdown.refund + breakdown.shipping + breakdown.privacy + breakdown.terms) / 4);
      return { score, breakdown, gaps, strengths };
    }
  } catch (err) {
    logger.warn({ err }, "Policy quality AI call failed — using rule fallback");
  }

  return fallback;
}

export async function generateFix(
  type: "description" | "tags" | "title" | "structure" | "schema",
  originalContent: string,
  context: { productTitle: string; productType?: string | null; vendor?: string | null; price?: string | null; imageUrl?: string | null; detectedCategory?: string | null; currentScore?: number | null }
): Promise<{ improvedContent: string; explanation: string; estimatedScoreImprovement: number; roiRationale: string }> {
  const typeInstructions: Record<string, string> = {
    description:
      "Rewrite this product description to be clear, complete, and AI-agent-friendly. Include key features, specifications, use cases, and materials. Make it informative without being salesy. IMPORTANT: If the original content contains any <script type=\"application/ld+json\"> blocks, you MUST preserve them exactly as is and append them to your returned description. Do not remove any existing JSON-LD markup.",
    tags: "Improve these product tags to be semantic, relevant, and optimized for AI retrieval. Include category, use case, material, audience, and feature tags.",
    title: "Improve this product title to be clear, specific, and include key identifying information.",
    structure: "Restructure this product description with clear sections: Overview, Features, Specifications, Use Cases.",
    schema: `Generate a complete, valid Product JSON-LD structured data block for this product. Return ONLY the raw JSON object (no <script> tags, no markdown). Use schema.org/Product. Include: @context ("https://schema.org"), @type ("Product"), name, description (plain text, max 200 chars), brand (@type: Brand, name: vendor), offers (@type: Offer, price, priceCurrency "USD", availability "https://schema.org/InStock"), and image (if imageUrl provided). Use actual product values.`,
  };

  const categoryContext = context.detectedCategory ? `Category: ${context.detectedCategory}` : "";
  const scoreContext = context.currentScore != null ? `Current AI readiness score: ${Math.round(context.currentScore)}/100` : "";

  const prompt = `You are an AI readiness expert for Shopify stores. Your job is to improve product content so AI shopping agents (ChatGPT, Perplexity, Gemini) can confidently recommend this product.

Product: ${context.productTitle}
Type: ${context.productType ?? "General"} | Vendor: ${context.vendor ?? "Unknown"}${context.price ? ` | Price: $${context.price}` : ""}
${categoryContext}${scoreContext ? `\n${scoreContext}` : ""}

Task: ${typeInstructions[type]}

Original content:
${originalContent}

Return a JSON object:
{
  "improvedContent": "<the improved content>",
  "explanation": "<1-2 sentences explaining what was improved and why it helps AI agents>",
  "estimatedScoreImprovement": <number 1-25, estimated score points gained>,
  "roiRationale": "<1 sentence connecting this fix to real commercial impact — e.g. 'Products with complete specs appear 3× more in AI comparison queries' or 'Adding size guide reduces returns and helps AI answer fit queries'>"
}

Return ONLY valid JSON, no markdown.`;

  const fixSchema = z.object({
    improvedContent: z.string().min(1),
    explanation: z.string().min(1),
    estimatedScoreImprovement: z.number().min(0).max(100),
    roiRationale: z.string().default(""),
  });

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1500);
    const parsed = JSON.parse(content);
    const result = fixSchema.safeParse(parsed);

    if (result.success) {
      return result.data;
    }
    logger.warn({ issues: result.error.issues }, "Fix AI response validation failed");
    throw new Error("Invalid AI response");
  } catch (err) {
    logger.error({ err }, "Failed to generate fix");
    return {
      improvedContent: originalContent,
      explanation: "Could not generate improvement at this time.",
      estimatedScoreImprovement: 0,
      roiRationale: "",
    };
  }
}

// ─── Image Quality Analysis ──────────────────────────────────────────────────

export interface ImageQualityResult {
  score: number; // 0–100
  productIdentifiable: boolean;
  issues: string[];
  suggestions: string[];
}

export async function analyzeImageQuality(imageUrl: string | null, productTitle: string): Promise<ImageQualityResult> {
  const noImage: ImageQualityResult = {
    score: 0,
    productIdentifiable: false,
    issues: ["No product image provided — AI shopping agents de-prioritize imageless products"],
    suggestions: ["Add at least one high-quality product image showing the item clearly"],
  };
  if (!imageUrl) return noImage;

  const apiKey = process.env.GEMINI_API_KEY;
  // When Gemini key is missing we cannot assess image quality. Return a neutral score (70)
  // with an empty issues array so no gap is written and the score doesn't suppress real issues.
  // This avoids a phantom 50 that would trigger spurious image-quality gap entries.
  if (!apiKey) return { score: 70, productIdentifiable: true, issues: [], suggestions: ["Set GEMINI_API_KEY to enable real image quality analysis."] };

  try {
    // Fetch image as base64 for Gemini Vision
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `You are evaluating a product image for an ecommerce store. The product is: "${productTitle}".

Assess the image quality for AI shopping agent compatibility. AI agents use images to identify products, colors, materials, and form factor.

Score this image 0–100 based on:
- Can you clearly identify what the product is? (30 pts)
- Is the product the main focus without distracting background? (20 pts)
- Can you determine color, material, or key features from the image? (25 pts)
- Is the image high resolution and well-lit? (15 pts)
- Are there multiple angles or usage context shown? (10 pts)

Return JSON only:
{
  "score": 0-100,
  "productIdentifiable": true/false,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1"]
}`;

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: contentType as "image/jpeg", data: base64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { maxOutputTokens: 500 },
    });

    const raw = result.response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) { try { parsed = JSON.parse(m[1]!.trim()); } catch { /* ignore */ } }
    }

    const schema = z.object({
      score: z.number().min(0).max(100),
      productIdentifiable: z.boolean(),
      issues: z.array(z.string()),
      suggestions: z.array(z.string()),
    });
    const r = schema.safeParse(parsed);
    if (r.success) return r.data;
  } catch (err) {
    logger.warn({ err, imageUrl }, "Image quality analysis failed — skipping");
  }

  // Fallback: basic score just for having an image
  return { score: 55, productIdentifiable: true, issues: [], suggestions: ["Consider adding multiple product angles and a lifestyle shot"] };
}

// ─── Agent Query Simulation ───────────────────────────────────────────────────

export interface AgentQueryResult {
  query: string;
  answerable: boolean;
  confidence: "high" | "medium" | "low" | "none";
  gap: string | null; // what's missing to answer confidently
}

export interface AgentSimulationResult {
  answerabilityScore: number; // 0–100
  queriesTested: AgentQueryResult[];
  topGaps: string[];
  summary: string;
}

const CATEGORY_QUERIES: Record<string, string[]> = {
  electronics: [
    "What are the technical specifications of this product?",
    "Is this compatible with [common platform/OS]?",
    "What is the battery life or power consumption?",
    "Does it come with a warranty?",
    "What connectivity options does it support?",
    "What is the weight and dimensions?",
    "Is there a return policy if it doesn't work?",
    "What accessories or cables are included?",
    "Can I use this internationally?",
    "What is the manufacturer/brand reputation?",
  ],
  fashion: [
    "What sizes are available and how does it fit?",
    "What material or fabric is this made from?",
    "How do I care for and wash this item?",
    "Is this true to size or should I size up/down?",
    "What colors are available?",
    "Is this suitable for a specific occasion or season?",
    "Does the brand offer free returns?",
    "How long does shipping take?",
    "Are there customer reviews about the fit?",
    "Is this sustainably or ethically made?",
  ],
  beauty: [
    "What are the key active ingredients?",
    "Is this suitable for sensitive or oily skin?",
    "Is this product cruelty-free or vegan?",
    "How do I use this product and in what order?",
    "What skin concerns does this address?",
    "Are there any known allergens or irritants?",
    "How long does one unit last?",
    "Are there before/after results or customer reviews?",
    "Is this dermatologist tested?",
    "Can I use this while pregnant or breastfeeding?",
  ],
  food: [
    "What are the ingredients and nutritional values?",
    "Does this contain allergens like nuts, dairy, or gluten?",
    "Is this product vegan or vegetarian?",
    "How many servings does one package contain?",
    "What is the shelf life or expiration?",
    "How should this be stored?",
    "Is this organic or non-GMO certified?",
    "What does it taste like?",
    "Where is this product made?",
    "What are the health benefits?",
  ],
  kids: [
    "What age range is this suitable for?",
    "Is this product safe and non-toxic?",
    "Does it meet safety certifications (ASTM, CPSC)?",
    "What are the dimensions and weight?",
    "Does it require batteries or assembly?",
    "Is it durable and easy to clean?",
    "What educational or developmental benefits does it have?",
    "Are there choking hazards for young children?",
    "What materials is it made from?",
    "Does it come with a warranty or guarantee?",
  ],
  sports: [
    "What skill level is this suitable for?",
    "What are the weight and packed dimensions?",
    "What materials is it made from?",
    "Is it waterproof or weather-resistant?",
    "Is this suitable for indoor or outdoor use?",
    "What is the weight capacity or load rating?",
    "Does it come with any accessories?",
    "How does it compare to competing products?",
    "Is there a warranty or guarantee?",
    "What are the care and maintenance instructions?",
  ],
  general: [
    "What exactly does this product do?",
    "Who is this product designed for?",
    "What are the key features and benefits?",
    "What materials or components is it made from?",
    "What are the dimensions and weight?",
    "What is the return and refund policy?",
    "How long does shipping take?",
    "Are there customer reviews available?",
    "Does this come with a warranty?",
    "How does this compare to similar products?",
  ],
};

export async function simulateAgentQueries(
  product: ProductInput,
  category: string,
  storeContext: { policies: { refund: boolean; shipping: boolean }; faqBody: string | null },
): Promise<AgentSimulationResult> {
  const plain = (product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const queries = CATEGORY_QUERIES[category] ?? CATEGORY_QUERIES["general"]!;

  const prompt = `You are an AI shopping assistant. A buyer is asking questions about the following product. For each question, determine if you can answer it confidently based ONLY on the provided product data.

Product data:
- Title: ${product.title}
- Description: ${plain.slice(0, 600)}
- Tags: ${product.tags.slice(0, 15).join(", ") || "(none)"}
- Type: ${product.productType ?? "unknown"} | Vendor: ${product.vendor ?? "unknown"} | Price: $${product.price ?? "unknown"}
- Reviews: ${product.reviewCount} reviews
- Has structured data: ${product.hasStructuredData}
- Refund policy exists: ${storeContext.policies.refund}
- Shipping policy exists: ${storeContext.policies.shipping}
${storeContext.faqBody ? `- FAQ content: ${storeContext.faqBody.slice(0, 300)}` : "- No FAQ page found"}

Buyer questions to evaluate:
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

For each question return whether it is answerable from the data above. Return JSON:
{
  "results": [
    {
      "query": "<question text>",
      "answerable": true/false,
      "confidence": "high" | "medium" | "low" | "none",
      "gap": "<what specific data is missing, or null if answerable>"
    }
  ],
  "summary": "<2 sentence summary of overall AI readiness for buyer questions>"
}
Return ONLY valid JSON.`;

  const fallback: AgentSimulationResult = {
    answerabilityScore: Math.round(
      (queries.length > 0 ? 30 : 0) +
      (plain.length > 200 ? 20 : 0) +
      (product.tags.length > 3 ? 10 : 0) +
      (storeContext.policies.refund ? 10 : 0) +
      (storeContext.policies.shipping ? 10 : 0),
    ),
    queriesTested: queries.map((q) => ({ query: q, answerable: false, confidence: "none" as const, gap: "Insufficient product data to evaluate" })),
    topGaps: ["Product description is too thin for AI agent answering", "Missing policy information"],
    summary: "Limited product data prevents AI agents from confidently answering most buyer questions.",
  };

  try {
    const raw = await chatCompletion([{ role: "user", content: prompt }], 2000);
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) { try { parsed = JSON.parse(m[1]!.trim()); } catch { /* ignore */ } }
    }

    const schema = z.object({
      results: z.array(z.object({
        query: z.string(),
        answerable: z.boolean(),
        confidence: z.enum(["high", "medium", "low", "none"]),
        gap: z.string().nullable(),
      })),
      summary: z.string(),
    });

    const result = schema.safeParse(parsed);
    if (result.success) {
      const { results, summary } = result.data;
      const answerable = results.filter((r) => r.answerable).length;
      const answerabilityScore = Math.round((answerable / results.length) * 100);
      const topGaps = results
        .filter((r) => !r.answerable && r.gap)
        .slice(0, 5)
        .map((r) => r.gap!);
      return { answerabilityScore, queriesTested: results, topGaps, summary };
    }
  } catch (err) {
    logger.warn({ err, productTitle: product.title }, "Agent query simulation failed — using fallback");
  }

  return fallback;
}

// ─── Review / Claim Alignment ─────────────────────────────────────────────────

export interface ReviewAlignmentResult {
  /** 0–100: how well the description claims are backed by review evidence */
  alignmentScore: number;
  unsupportedClaims: string[];
  trustWarnings: string[];
  summary: string;
}

export async function analyzeReviewAlignment(
  product: { title: string; description: string | null; reviewCount: number; reviewRating: number },
): Promise<ReviewAlignmentResult> {
  const plain = (product.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const superlativePattern = /\b(best|top|#1|award.?winning|most popular|best.?seller|highest.?rated|loved by|thousands|millions|proven|guaranteed)\b/gi;
  const matches = plain.match(superlativePattern) ?? [];

  if (matches.length === 0 && plain.length < 80) {
    return { alignmentScore: 60, unsupportedClaims: [], trustWarnings: [], summary: "Description lacks marketing claims — add specifics." };
  }

  try {
    const prompt = `You are a product trust analyst. Review this product description and actual review data to identify unsupported marketing claims.

Product: ${product.title}
Description: ${plain.slice(0, 800)}
Review count: ${product.reviewCount}
Average rating: ${product.reviewRating > 0 ? product.reviewRating.toFixed(1) + "/5" : "none"}

Tasks:
1. Extract all marketing claims (superlatives, promises, social proof statements) from the description
2. For each claim, assess whether the review data supports it
3. List unsupported claims (e.g. "best seller" with 0 reviews)
4. List trust warnings (things that could undermine buyer confidence)
5. Calculate an alignment score 0-100 where 100 = all claims verifiable, 0 = none verifiable

Respond ONLY with valid JSON:
{
  "alignmentScore": <number>,
  "unsupportedClaims": ["claim1", "claim2"],
  "trustWarnings": ["warning1"],
  "summary": "<one sentence>"
}`;

    const raw = await chatCompletion([{ role: "user", content: prompt }], 600);
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) { try { parsed = JSON.parse(m[1]!.trim()); } catch { /* ignore */ } }
    }

    const schema = z.object({
      alignmentScore: z.number(),
      unsupportedClaims: z.array(z.string()),
      trustWarnings: z.array(z.string()),
      summary: z.string(),
    });

    const result = schema.safeParse(parsed);
    if (result.success) {
      return {
        alignmentScore: Math.max(0, Math.min(100, Math.round(result.data.alignmentScore))),
        unsupportedClaims: result.data.unsupportedClaims.slice(0, 5),
        trustWarnings: result.data.trustWarnings.slice(0, 3),
        summary: result.data.summary,
      };
    }
  } catch (err) {
    logger.warn({ err, productTitle: product.title }, "Review alignment analysis failed — using fallback");
  }

  // Rule-based fallback
  const unsupportedClaims: string[] = [];
  const trustWarnings: string[] = [];
  const uniqueMatches = [...new Set(matches.map((m) => m.toLowerCase()))];

  for (const claim of uniqueMatches.slice(0, 5)) {
    if (product.reviewCount === 0) {
      unsupportedClaims.push(`"${claim}" — no reviews to back this up`);
    } else if (product.reviewCount < 5 && (claim.includes("popular") || claim.includes("seller") || claim.includes("thousands"))) {
      unsupportedClaims.push(`"${claim}" — only ${product.reviewCount} review(s) on record`);
    }
  }

  if (product.reviewCount === 0 && matches.length > 0) {
    trustWarnings.push("Product makes marketing claims but has no customer reviews — AI agents may flag as unverifiable.");
  }
  if (product.reviewRating > 0 && product.reviewRating < 3.5) {
    trustWarnings.push(`Low average rating (${product.reviewRating.toFixed(1)}/5) may contradict positive description tone.`);
  }

  const alignmentScore = product.reviewCount === 0 && matches.length > 0
    ? Math.max(20, 60 - matches.length * 5)
    : product.reviewRating >= 4.0
    ? Math.min(90, 65 + product.reviewCount)
    : 55;

  return {
    alignmentScore: Math.round(alignmentScore),
    unsupportedClaims,
    trustWarnings,
    summary: unsupportedClaims.length > 0
      ? `${unsupportedClaims.length} unsupported claim(s) found — reduce unverifiable superlatives.`
      : "Description claims appear reasonably aligned with available review signals.",
  };
}
