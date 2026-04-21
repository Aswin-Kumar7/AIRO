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
  const { ruleScores, violations } = runRuleEngine(product);

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

  const aiSchema = z.object({
    clarityScore: z.number().min(0).max(100),
    aiPerceptionSummary: z.string().min(1),
    suggestedTags: z.array(z.string()).max(8),
  });

  try {
    const content = await chatCompletion([{ role: "user", content: aiPrompt }], 800);
    const parsed = JSON.parse(content);
    const result = aiSchema.safeParse(parsed);
    
    if (result.success) {
      aiClarityScore = result.data.clarityScore;
      aiPerceptionSummary = result.data.aiPerceptionSummary;
      suggestedTags = result.data.suggestedTags;
    } else {
      logger.warn({ issues: result.error.issues, productTitle: product.title }, "AI response validation failed");
    }
  } catch (err) {
    logger.warn({ err, productTitle: product.title }, "AI layer failed — using rule-only scores");
  }

  // Step 3: deterministic score blending (AI only influences clarity)
  const clarityScore  = Math.round(0.4 * aiClarityScore + 0.6 * ruleScores.clarity);
  const completenessScore = ruleScores.completeness;
  const trustScore    = ruleScores.trust;
  const tagScore      = ruleScores.tags;
  const overallScore  = Math.round((clarityScore + completenessScore + trustScore + tagScore) / 4);

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

export async function generateFix(
  type: "description" | "tags" | "title" | "structure" | "schema",
  originalContent: string,
  context: { productTitle: string; productType?: string | null; vendor?: string | null; price?: string | null; imageUrl?: string | null }
): Promise<{ improvedContent: string; explanation: string; estimatedScoreImprovement: number }> {
  const typeInstructions: Record<string, string> = {
    description:
      "Rewrite this product description to be clear, complete, and AI-agent-friendly. Include key features, specifications, use cases, and materials. Make it informative without being salesy. IMPORTANT: If the original content contains any <script type=\"application/ld+json\"> blocks, you MUST preserve them exactly as is and append them to your returned description. Do not remove any existing JSON-LD markup.",
    tags: "Improve these product tags to be semantic, relevant, and optimized for AI retrieval. Include category, use case, material, audience, and feature tags.",
    title: "Improve this product title to be clear, specific, and include key identifying information.",
    structure: "Restructure this product description with clear sections: Overview, Features, Specifications, Use Cases.",
    schema: `Generate a complete, valid Product JSON-LD structured data block for this product. Return ONLY the raw JSON object (no <script> tags, no markdown). Use schema.org/Product. Include: @context ("https://schema.org"), @type ("Product"), name, description (plain text, max 200 chars), brand (@type: Brand, name: vendor), offers (@type: Offer, price, priceCurrency "USD", availability "https://schema.org/InStock"), and image (if imageUrl provided). Use actual product values.`,
  };

  const prompt = `You are an AI readiness expert for Shopify stores.

Product: ${context.productTitle}
Type: ${context.productType ?? "General"} | Vendor: ${context.vendor ?? "Unknown"}${context.price ? ` | Price: $${context.price}` : ""}${context.imageUrl ? ` | Image: ${context.imageUrl}` : ""}

Task: ${typeInstructions[type]}

Original content:
${originalContent}

Return a JSON object:
{
  "improvedContent": "<the improved content>",
  "explanation": "<1-2 sentences explaining what was improved and why>",
  "estimatedScoreImprovement": <number 1-20, estimated score points gained>
}

Return ONLY valid JSON, no markdown.`;

  const fixSchema = z.object({
    improvedContent: z.string().min(1),
    explanation: z.string().min(1),
    estimatedScoreImprovement: z.number().min(0).max(100),
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
    };
  }
}
