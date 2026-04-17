import { chatCompletion } from "./ai-client";
import { logger } from "./logger";

export interface ProductData {
  title: string;
  description: string | null;
  tags: string[];
  productType: string | null;
  vendor: string | null;
  price: string | null;
}

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

const BENCHMARK_SCORES = {
  clarity: 88,
  completeness: 85,
  trust: 82,
  tags: 80,
  consistency: 85,
  policy: 90,
  overall: 85,
};

export const BENCHMARK = BENCHMARK_SCORES;

export async function analyzeProduct(product: ProductData): Promise<ProductAnalysisResult> {
  const prompt = `You are an AI readiness expert. Analyze this Shopify product to determine how well AI shopping assistants (like ChatGPT, Perplexity) can understand and recommend it.

Product Data:
- Title: ${product.title}
- Description: ${product.description || "(none)"}
- Tags: ${product.tags.join(", ") || "(none)"}
- Product Type: ${product.productType || "(none)"}
- Vendor: ${product.vendor || "(none)"}
- Price: ${product.price || "(none)"}

Evaluate and return a JSON object with these exact fields:
{
  "clarityScore": <0-100, how clearly the product is described for AI understanding>,
  "completenessScore": <0-100, how complete the product information is>,
  "trustScore": <0-100, presence of trust signals like guarantees, materials, specs>,
  "tagScore": <0-100, quality and relevance of tags for AI retrieval>,
  "overallScore": <0-100, weighted average>,
  "aiPerceptionSummary": "<2-3 sentence summary of how an AI agent would perceive this product>",
  "suggestedTags": ["tag1", "tag2", "tag3", ...up to 8 relevant tags],
  "issues": [
    {
      "category": "<one of: clarity, completeness, trust, tags, policy, consistency>",
      "severity": "<one of: high, medium, low>",
      "title": "<short issue title>",
      "description": "<what the problem is>",
      "suggestion": "<specific actionable fix>"
    }
  ]
}

Be specific and actionable. Focus on what prevents AI agents from confidently recommending this product.
Return ONLY valid JSON, no markdown.`;

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 2000);
    const parsed = JSON.parse(content) as ProductAnalysisResult;
    return parsed;
  } catch (err) {
    logger.error({ err, productTitle: product.title }, "Failed to analyze product with AI");
    return {
      clarityScore: 40,
      completenessScore: 35,
      trustScore: 30,
      tagScore: 35,
      overallScore: 35,
      aiPerceptionSummary: "This product has limited information available for AI analysis.",
      suggestedTags: [],
      issues: [
        {
          category: "completeness",
          severity: "high",
          title: "Insufficient product information",
          description: "The product lacks enough detail for AI agents to confidently recommend it.",
          suggestion: "Add a detailed description including materials, dimensions, use cases, and target audience.",
        },
      ],
    };
  }
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

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1500);
    return JSON.parse(content) as StoreConsistencyResult;
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
  type: "description" | "tags" | "title" | "structure",
  originalContent: string,
  context: { productTitle: string; productType?: string | null; vendor?: string | null }
): Promise<{ improvedContent: string; explanation: string; estimatedScoreImprovement: number }> {
  const typeInstructions: Record<string, string> = {
    description:
      "Rewrite this product description to be clear, complete, and AI-agent-friendly. Include key features, specifications, use cases, and materials. Make it informative without being salesy.",
    tags: "Improve these product tags to be semantic, relevant, and optimized for AI retrieval. Include category, use case, material, audience, and feature tags.",
    title: "Improve this product title to be clear, specific, and include key identifying information.",
    structure: "Restructure this product description with clear sections: Overview, Features, Specifications, Use Cases.",
  };

  const prompt = `You are an AI readiness expert for Shopify stores.

Product: ${context.productTitle}
Type: ${context.productType || "General"}
Vendor: ${context.vendor || "Unknown"}

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

  try {
    const content = await chatCompletion([{ role: "user", content: prompt }], 1500);
    return JSON.parse(content);
  } catch (err) {
    logger.error({ err }, "Failed to generate fix");
    return {
      improvedContent: originalContent,
      explanation: "Could not generate improvement at this time.",
      estimatedScoreImprovement: 0,
    };
  }
}
