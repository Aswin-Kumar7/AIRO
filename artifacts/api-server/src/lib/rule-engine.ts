/**
 * Deterministic rule-based analysis engine.
 * Runs fast checks on product data before the AI layer.
 * Each rule produces evidence-backed violations with impact scores.
 */

export interface ProductInput {
  title: string;
  description: string | null;
  tags: string[];
  productType: string | null;
  vendor: string | null;
  price: string | null;
  imageUrl: string | null;
  reviewCount: number;
  hasStructuredData: boolean;
}

export interface RuleViolation {
  ruleId: string;
  category: "clarity" | "completeness" | "trust" | "tags" | "policy" | "consistency";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  suggestion: string;
  evidence: string;
  impactScore: number;   // 0–100: how much this hurts AI discoverability
  effortLevel: "low" | "medium" | "high";
}

export type ProductCategory =
  | "electronics"
  | "fashion"
  | "beauty"
  | "sports"
  | "food"
  | "kids"
  | "home"
  | "general";

export interface RuleEngineResult {
  ruleScores: {
    clarity: number;
    completeness: number;
    trust: number;
    tags: number;
    weightedOverall: number;
  };
  violations: RuleViolation[];
  detectedCategory: ProductCategory;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string | null | undefined): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function hasKeyword(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

const GENERIC_TAGS = new Set([
  "new", "sale", "hot", "featured", "best", "top", "popular",
  "special", "offer", "deal", "trending", "latest",
]);

const MATERIAL_TERMS = [
  "cotton", "polyester", "leather", "wood", "metal", "steel", "aluminum",
  "plastic", "rubber", "wool", "silk", "nylon", "ceramic", "glass",
  "carbon", "bamboo", "material", "fabric", "made of", "made from",
  "ingredient", "composition",
];

const DIMENSION_TERMS = [
  "cm", "mm", "inch", "inches", "feet", "ft", "meter", "kg", "g ",
  "lb", "oz", "liter", "ml", "size", "dimension", "weight", "length",
  "width", "height", "depth", "volume", "capacity",
];

const USE_CASE_TERMS = [
  "for ", "designed for", "ideal for", "perfect for", "suitable for",
  "best for", "great for", "use it", "works for", "intended for",
  "recommended for", "made for",
];

const SPEC_TERMS = [
  "compatible with", "compatibility", "works with", "fits",
  "certified", "certification", "rated", "capacity",
  "wattage", "voltage", "frequency", "resolution", "processor",
  "memory", "storage", "battery", "waterproof", "warranty",
  "certification", "iso ", "ul listed", "fda", "reach",
  "gtin", "mpn", "sku", "model number", "model no",
];

// ─── CB-7: Locale / language detection ────────────────────────────────────────

function detectIsEnglish(text: string): boolean {
  const plain = stripHtml(text);
  if (plain.length < 10) return true;
  // Count word characters outside the Latin extended block (code points > 591)
  const wordChars = plain.match(/\S/g) ?? [];
  if (wordChars.length === 0) return true;
  const nonLatinCount = wordChars.filter((ch) => ch.codePointAt(0)! > 591).length;
  return nonLatinCount / wordChars.length <= 0.2;
}

const CONVERSATIONAL_TERMS = [
  "you ", "your ", "you'll ", "you're ", "you've ",
  "we ", "our ", "we've ", "discover", "meet the", "introducing",
];
const MODEL_NUMBER_PATTERN = /^[A-Z0-9\-]{4,}(?:\s|$)/;

// ─── Title rules ──────────────────────────────────────────────────────────────

function analyzeTitle(title: string, violations: RuleViolation[]): number {
  let score = 100;
  const words = wordCount(title);

  if (words < 3) {
    violations.push({
      ruleId: "TITLE_TOO_SHORT",
      category: "clarity",
      severity: "high",
      title: "Title too short",
      description: "Very short titles give AI assistants almost no signal to match search queries.",
      suggestion: "Expand the title to include the product type, key feature, and brand (e.g. 'Burton Clash 158cm All-Mountain Snowboard').",
      evidence: `Title has only ${words} word${words === 1 ? "" : "s"} — minimum 6 recommended for AI discoverability.`,
      impactScore: 85,
      effortLevel: "low",
    });
    score -= 55;
  } else if (words < 6) {
    violations.push({
      ruleId: "TITLE_SHORT",
      category: "clarity",
      severity: "medium",
      title: "Title could be more descriptive",
      description: "Short titles limit an AI assistant's ability to match this product to specific queries.",
      suggestion: "Add at least one key attribute: material, size, color, or use case.",
      evidence: `Title has ${words} words — 6–12 words is optimal for AI retrieval.`,
      impactScore: 45,
      effortLevel: "low",
    });
    score -= 25;
  }

  if (words > 15) {
    violations.push({
      ruleId: "TITLE_TOO_LONG",
      category: "clarity",
      severity: "low",
      title: "Title may be too long",
      description: "Overly long titles can dilute keyword relevance and confuse AI parsers.",
      suggestion: "Trim to the most important attributes: brand + product name + key spec.",
      evidence: `Title has ${words} words — over 15 words can reduce AI clarity.`,
      impactScore: 20,
      effortLevel: "low",
    });
    score -= 10;
  }

  if (title === title.toUpperCase() && title.length > 5) {
    violations.push({
      ruleId: "TITLE_ALL_CAPS",
      category: "clarity",
      severity: "low",
      title: "Title is all uppercase",
      description: "All-caps titles are harder for NLP models to parse correctly.",
      suggestion: "Use title case instead (capitalize first letter of each major word).",
      evidence: "Title uses all capital letters.",
      impactScore: 15,
      effortLevel: "low",
    });
    score -= 8;
  }

  return Math.max(0, score);
}

// ─── Description rules ────────────────────────────────────────────────────────

function analyzeDescription(description: string | null, violations: RuleViolation[]): number {
  let score = 100;
  const plain = stripHtml(description);
  const words = wordCount(plain);

  if (!plain || words < 5) {
    violations.push({
      ruleId: "DESC_MISSING",
      category: "completeness",
      severity: "high",
      title: "No product description",
      description: "Missing descriptions are the single biggest barrier to AI shopping assistant recommendations.",
      suggestion: "Write at least 80 words covering: what the product is, who it's for, key features, and materials.",
      evidence: "No description found.",
      impactScore: 95,
      effortLevel: "medium",
    });
    return 0;
  }

  if (words < 50) {
    violations.push({
      ruleId: "DESC_TOO_SHORT",
      category: "completeness",
      severity: "high",
      title: "Description too short",
      description: "AI assistants need at least 80 words to confidently describe and recommend a product.",
      suggestion: "Expand to cover: key features, materials, dimensions, use cases, and target audience.",
      evidence: `Description has ${words} words — minimum 80 recommended for AI confidence.`,
      impactScore: 75,
      effortLevel: "medium",
    });
    score -= 50;
  } else if (words < 80) {
    violations.push({
      ruleId: "DESC_BRIEF",
      category: "completeness",
      severity: "medium",
      title: "Description is brief",
      description: "More detail helps AI assistants answer specific buyer questions confidently.",
      suggestion: "Add material information, dimensions, and at least one use case.",
      evidence: `Description has ${words} words — 80+ is recommended.`,
      impactScore: 40,
      effortLevel: "medium",
    });
    score -= 25;
  }

  const html = description ?? "";
  const hasStructure = /<(ul|ol|li|h[1-6]|strong|b)\b/i.test(html);
  if (!hasStructure && words > 40) {
    violations.push({
      ruleId: "DESC_NO_STRUCTURE",
      category: "completeness",
      severity: "low",
      title: "Description lacks structure",
      description: "Unstructured text blocks are harder for AI to parse key facts from.",
      suggestion: "Add bullet points for features and a short intro paragraph.",
      evidence: "Description is plain text with no headings or bullet points.",
      impactScore: 30,
      effortLevel: "low",
    });
    score -= 15;
  }

  if (detectIsEnglish(plain)) {
    if (!hasKeyword(plain, MATERIAL_TERMS)) {
      violations.push({
        ruleId: "DESC_NO_MATERIAL",
        category: "completeness",
        severity: "medium",
        title: "No material or composition mentioned",
        description: "Material information is one of the top attributes AI assistants use for product matching.",
        suggestion: "Mention what the product is made from (e.g. '100% organic cotton', 'aircraft-grade aluminum').",
        evidence: "No material, fabric, or ingredient terms detected in description.",
        impactScore: 45,
        effortLevel: "medium",
      });
      score -= 20;
    }

    if (!hasKeyword(plain, DIMENSION_TERMS)) {
      violations.push({
        ruleId: "DESC_NO_DIMENSIONS",
        category: "completeness",
        severity: "low",
        title: "No size or dimension information",
        description: "Dimensions and sizing help AI filter products for size-specific queries.",
        suggestion: "Add measurements, weight, or sizing guide information.",
        evidence: "No size, weight, or dimension terms found in description.",
        impactScore: 30,
        effortLevel: "medium",
      });
      score -= 10;
    }

    if (!hasKeyword(plain, USE_CASE_TERMS)) {
      violations.push({
        ruleId: "DESC_NO_USE_CASE",
        category: "completeness",
        severity: "low",
        title: "No use case or target audience",
        description: "Without a clear use case, AI assistants cannot confidently recommend this product for specific needs.",
        suggestion: "Add a sentence like: 'Designed for intermediate riders who want all-mountain versatility.'",
        evidence: "No use case, target audience, or 'designed for' language detected.",
        impactScore: 25,
        effortLevel: "low",
      });
      score -= 10;
    }
  }

  return Math.max(0, score);
}

// ─── Tag rules ────────────────────────────────────────────────────────────────

function analyzeTags(tags: string[], productType: string | null, violations: RuleViolation[]): number {
  let score = 100;

  if (tags.length === 0) {
    violations.push({
      ruleId: "TAGS_MISSING",
      category: "tags",
      severity: "high",
      title: "No tags assigned",
      description: "Tags are the primary retrieval signal AI shopping assistants use for category and attribute matching.",
      suggestion: "Add 5–10 semantic tags covering: category, material, use case, audience, and key features.",
      evidence: "Product has zero tags.",
      impactScore: 90,
      effortLevel: "low",
    });
    return 0;
  }

  if (tags.length < 3) {
    violations.push({
      ruleId: "TAGS_TOO_FEW",
      category: "tags",
      severity: "medium",
      title: "Too few tags",
      description: "Fewer than 3 tags severely limits AI retrieval across different query types.",
      suggestion: "Add tags for: product category, primary material, intended use, and target audience.",
      evidence: `Product has ${tags.length} tag${tags.length === 1 ? "" : "s"} — 5–10 is recommended.`,
      impactScore: 60,
      effortLevel: "low",
    });
    score -= 40;
  }

  const genericFound = tags.filter((t) => GENERIC_TAGS.has(t.toLowerCase().trim()));
  if (genericFound.length > 0) {
    violations.push({
      ruleId: "TAGS_GENERIC",
      category: "tags",
      severity: "medium",
      title: "Generic tags reduce retrieval precision",
      description: "Tags like 'new', 'sale', or 'hot' add noise that dilutes semantic search quality.",
      suggestion: "Replace generic tags with specific attributes: material, style, use case, or product sub-type.",
      evidence: `Generic tags found: ${genericFound.map((t) => `"${t}"`).join(", ")}.`,
      impactScore: 40,
      effortLevel: "low",
    });
    score -= 20;
  }

  const tagLower = tags.map((t) => t.toLowerCase());
  const hasProductTypeTag = productType
    ? tagLower.some((t) => t.includes(productType.toLowerCase()) || productType.toLowerCase().includes(t))
    : false;

  if (productType && !hasProductTypeTag) {
    violations.push({
      ruleId: "TAGS_NO_CATEGORY",
      category: "tags",
      severity: "medium",
      title: "No category tag matching product type",
      description: "AI assistants match products to categories primarily via tags. Missing category tags cause misclassification.",
      suggestion: `Add a tag that matches the product type: "${productType}".`,
      evidence: `Product type is "${productType}" but no matching tag found.`,
      impactScore: 45,
      effortLevel: "low",
    });
    score -= 20;
  }

  return Math.max(0, score);
}

// ─── Trust rules ──────────────────────────────────────────────────────────────

function analyzeTrust(
  product: ProductInput,
  violations: RuleViolation[],
): number {
  let score = 100;

  if (!product.imageUrl) {
    violations.push({
      ruleId: "TRUST_NO_IMAGE",
      category: "trust",
      severity: "high",
      title: "No product image",
      description: "Products without images are rarely recommended by AI shopping assistants.",
      suggestion: "Add at least one high-quality product photo.",
      evidence: "No product image URL found.",
      impactScore: 80,
      effortLevel: "medium",
    });
    score -= 50;
  }

  if (!product.vendor) {
    violations.push({
      ruleId: "TRUST_NO_BRAND",
      category: "trust",
      severity: "medium",
      title: "No brand or vendor set",
      description: "Brand information is critical for AI attribution. Shoppers frequently search by brand.",
      suggestion: "Set the Vendor field in Shopify to your brand name.",
      evidence: "Vendor/brand field is empty.",
      impactScore: 40,
      effortLevel: "low",
    });
    score -= 25;
  }

  if (!product.hasStructuredData) {
    violations.push({
      ruleId: "TRUST_NO_SCHEMA",
      category: "trust",
      severity: "medium",
      title: "No JSON-LD structured data",
      description: "Schema.org Product markup lets AI systems parse price, brand, and availability directly from your store.",
      suggestion: "Add Product JSON-LD markup — use the Quick Fix sheet to auto-generate it.",
      evidence: "No schema.org/Product markup found in product HTML or metafields.",
      impactScore: 65,
      effortLevel: "medium",
    });
    score -= 30;
  }

  if (product.reviewCount === 0) {
    violations.push({
      ruleId: "TRUST_NO_REVIEWS",
      category: "trust",
      severity: "medium",
      title: "No customer reviews",
      description: "AI shopping assistants factor social proof into recommendations. Zero reviews reduces confidence.",
      suggestion: "Encourage post-purchase reviews via email. Even 3–5 reviews significantly improve AI confidence.",
      evidence: "Review count is 0.",
      impactScore: 50,
      effortLevel: "high",
    });
    score -= 20;
  }

  return Math.max(0, score);
}

// ─── Voice query readiness rules ─────────────────────────────────────────────

function analyzeVoiceReadiness(title: string, description: string | null, violations: RuleViolation[]): void {
  const words = wordCount(title);
  const plain = stripHtml(description);

  if (words > 8) {
    violations.push({
      ruleId: "VOICE_TITLE_LONG",
      category: "clarity",
      severity: "low",
      title: "Title too long for voice assistants",
      description: "Voice AI reads product titles aloud. Titles over 8 words become awkward and hard to follow in spoken responses.",
      suggestion: "Trim the title to the core product name + 1–2 key attributes (e.g. 'Nike Air Max 90 White Men's').",
      evidence: `Title is ${words} words — voice assistants prefer ≤8 words for natural speech.`,
      impactScore: 28,
      effortLevel: "low",
    });
  }

  if (MODEL_NUMBER_PATTERN.test(title)) {
    violations.push({
      ruleId: "VOICE_TITLE_MODEL_START",
      category: "clarity",
      severity: "low",
      title: "Title starts with a model number",
      description: "Titles that begin with alphanumeric codes (e.g. 'XB900N-BLK Headphones') are confusing when read aloud by voice AI.",
      suggestion: "Lead with the product category or brand name, then add the model reference.",
      evidence: `Title begins with a model/SKU-style code: "${title.split(/\s/)[0]}"`,
      impactScore: 20,
      effortLevel: "low",
    });
  }

  if (plain && detectIsEnglish(plain) && !hasKeyword(plain, CONVERSATIONAL_TERMS)) {
    violations.push({
      ruleId: "VOICE_NOT_CONVERSATIONAL",
      category: "clarity",
      severity: "low",
      title: "Description lacks conversational language",
      description: "Voice AI converts product descriptions into spoken answers. Descriptions with no natural language ('you', 'your', 'we') sound robotic when read aloud.",
      suggestion: "Add a conversational opening sentence like 'Meet the [product]' or 'Designed for...' to help voice AI bridge naturally to the customer.",
      evidence: "No second-person or conversational language detected in description.",
      impactScore: 22,
      effortLevel: "low",
    });
  }
}

// ─── Comparison readiness rules ───────────────────────────────────────────────

function analyzeComparisonReadiness(description: string | null, _tags: string[], violations: RuleViolation[]): void {
  const plain = stripHtml(description);
  if (!plain || wordCount(plain) < 30) return; // already flagged by DESC_TOO_SHORT

  if (!detectIsEnglish(plain)) { return; }

  const hasSpecs = hasKeyword(plain, SPEC_TERMS);
  const hasDimensions = hasKeyword(plain, DIMENSION_TERMS);
  const hasMaterials = hasKeyword(plain, MATERIAL_TERMS);

  const specCoverage = [hasSpecs, hasDimensions, hasMaterials].filter(Boolean).length;

  if (specCoverage < 2) {
    violations.push({
      ruleId: "COMPARE_INSUFFICIENT_SPECS",
      category: "completeness",
      severity: "medium",
      title: "Insufficient spec data for AI comparison",
      description: "AI chatbots frequently answer 'Product A vs Product B' queries. Without structured specs (dimensions, materials, compatibility), this product cannot be compared.",
      suggestion: "Add a specifications section with at least: dimensions/weight, material/composition, and compatibility or certifications.",
      evidence: `Spec coverage: ${specCoverage}/3 — missing: ${[!hasDimensions && "dimensions", !hasMaterials && "materials", !hasSpecs && "compatibility/specs"].filter(Boolean).join(", ")}.`,
      impactScore: 55,
      effortLevel: "medium",
    });
  }
}

// ─── Structured data check (Upgrade 5: field-level auditing) ─────────────────

const GENERIC_PRODUCT_TYPES = new Set([
  "accessories", "footwear", "clothing", "apparel", "shoes",
  "bags", "jewelry", "electronics", "home", "other", "misc",
  "product", "item", "goods", "stuff",
]);

function checkStructuredData(description: string | null, violations: RuleViolation[]): void {
  // hasStructuredData is already computed during ingestion; trust violations cover this
  // This function checks for JSON-LD completeness if markup IS present
  const html = description ?? "";
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);

  if (!jsonLdMatch) return;

  try {
    const schema = JSON.parse(jsonLdMatch[1] ?? "{}") as Record<string, unknown>;
    const missing: string[] = [];
    if (!schema.name) missing.push("name");
    if (!schema.description) missing.push("description");
    if (!schema.brand) missing.push("brand");
    if (!schema.image) missing.push("image");

    // Upgrade 5: Offers completeness (price/currency/availability)
    if (!schema.offers) {
      missing.push("offers (price + availability)");
    } else {
      const offers = schema.offers as Record<string, unknown>;
      const offersMissing: string[] = [];
      if (!offers.price && !offers.lowPrice) offersMissing.push("price");
      if (!offers.priceCurrency) offersMissing.push("priceCurrency");
      if (!offers.availability) offersMissing.push("availability");
      if (offersMissing.length > 0) {
        violations.push({
          ruleId: "SCHEMA_OFFERS_INCOMPLETE",
          category: "trust",
          severity: "medium",
          title: "Schema.org Offers block missing required fields",
          description: "Google's Product rich results and AI shopping require offers.price, offers.priceCurrency, and offers.availability to show pricing eligibility.",
          suggestion: `Add missing Offers fields: ${offersMissing.join(", ")}. Use schema values like "https://schema.org/InStock" for availability.`,
          evidence: `Offers found but missing: ${offersMissing.join(", ")}.`,
          impactScore: 50,
          effortLevel: "low",
        });
      }
    }

    if (missing.length > 0) {
      violations.push({
        ruleId: "SCHEMA_INCOMPLETE",
        category: "trust",
        severity: "low",
        title: "Structured data is incomplete",
        description: "Incomplete JSON-LD limits what AI systems can parse about this product.",
        suggestion: `Add missing schema fields: ${missing.join(", ")}.`,
        evidence: `JSON-LD found but missing: ${missing.join(", ")}.`,
        impactScore: 25,
        effortLevel: "low",
      });
    }

    // Upgrade 5: Missing brand entity in schema
    if (!schema.brand) {
      violations.push({
        ruleId: "SCHEMA_MISSING_BRAND",
        category: "trust",
        severity: "low",
        title: "Schema.org Product missing brand entity",
        description: "The brand field helps AI agents attribute products to manufacturers and match brand-specific queries.",
        suggestion: 'Add "brand": { "@type": "Brand", "name": "Your Brand Name" } to your Product JSON-LD.',
        evidence: 'JSON-LD Product schema present but "brand" is missing.',
        impactScore: 30,
        effortLevel: "low",
      });
    }
  } catch {
    // malformed JSON-LD
    violations.push({
      ruleId: "SCHEMA_MALFORMED",
      category: "trust",
      severity: "medium",
      title: "Malformed JSON-LD structured data",
      description: "Invalid JSON-LD markup cannot be parsed by AI or search engines.",
      suggestion: "Validate and fix the JSON-LD markup using schema.org validator.",
      evidence: "JSON-LD script found but contains invalid JSON.",
      impactScore: 40,
      effortLevel: "medium",
    });
  }
}

// ─── Taxonomy specificity check (Upgrade 2) ───────────────────────────────────

function checkTaxonomySpecificity(productType: string | null, violations: RuleViolation[]): void {
  if (!productType) return;
  const lower = productType.toLowerCase().trim();
  if (GENERIC_PRODUCT_TYPES.has(lower) || lower.length < 5) {
    violations.push({
      ruleId: "TAXONOMY_TOO_GENERIC",
      category: "completeness",
      severity: "low",
      title: "Product type/taxonomy is too generic",
      description: "Vague product types like 'Accessories' or 'Footwear' reduce AI classification accuracy. AI agents match products to specific queries better when types are precise.",
      suggestion: `Replace "${productType}" with a specific product type (e.g. "Women's Waterproof Hiking Boots" instead of "Footwear").`,
      evidence: `productType is "${productType}" — too vague for precise AI category matching.`,
      impactScore: 25,
      effortLevel: "low",
    });
  }
}

// ─── U-6: Brand authority signal rules ───────────────────────────────────────

function analyzeBrandAuthority(product: ProductInput, violations: RuleViolation[]): void {
  // BRAND_LOW_REVIEW_COVERAGE: brand is set but no reviews (brand authority undermined)
  if (product.vendor && product.reviewCount === 0) {
    violations.push({
      ruleId: "BRAND_LOW_REVIEW_COVERAGE",
      category: "trust",
      severity: "medium",
      title: "Brand has no review coverage",
      description: `"${product.vendor}" products appear in AI brand queries, but zero reviews undermine brand authority signals.`,
      suggestion: `Send a post-purchase review request to customers who bought ${product.vendor} products. Even 3–5 reviews significantly improve brand authority in AI recommendations.`,
      evidence: `Vendor/brand "${product.vendor}" is set but reviewCount is 0.`,
      impactScore: 35,
      effortLevel: "high",
    });
  }

  // BRAND_INCONSISTENT_VENDOR: vendor set but not mentioned in title or description
  if (product.vendor) {
    const vendorLower = product.vendor.toLowerCase();
    const titleLower = product.title.toLowerCase();
    const descPlain = stripHtml(product.description).toLowerCase();
    const mentionedInTitle = titleLower.includes(vendorLower);
    const mentionedInDesc = descPlain.includes(vendorLower);
    if (!mentionedInTitle && !mentionedInDesc) {
      violations.push({
        ruleId: "BRAND_INCONSISTENT_VENDOR",
        category: "trust",
        severity: "low",
        title: "Brand name absent from product content",
        description: "AI agents attribute products to brands by reading titles and descriptions. If the vendor name never appears in content, AI cannot associate this product with your brand.",
        suggestion: `Mention "${product.vendor}" in the product title or first paragraph of the description so AI assistants can attribute this product to your brand.`,
        evidence: `Vendor is "${product.vendor}" but it does not appear in the title or description text.`,
        impactScore: 20,
        effortLevel: "low",
      });
    }
  }
}

// ─── Category detection ───────────────────────────────────────────────────────

const CATEGORY_SIGNALS: Record<ProductCategory, string[]> = {
  electronics: [
    "laptop", "phone", "camera", "headphone", "speaker", "tablet", "monitor",
    "keyboard", "mouse", "charger", "cable", "battery", "drone", "smartwatch",
    "earbuds", "gaming", "router", "printer", "projector", "tv", "television",
    "electronic", "tech", "digital", "wireless", "bluetooth",
  ],
  fashion: [
    "shirt", "dress", "pants", "shoes", "sneakers", "boots", "jacket", "coat",
    "jeans", "skirt", "hoodie", "sweater", "sock", "underwear", "bra", "hat",
    "cap", "scarf", "gloves", "handbag", "wallet", "belt", "watch", "ring",
    "necklace", "earring", "bracelet", "clothing", "apparel", "fashion", "wear",
  ],
  beauty: [
    "serum", "moisturizer", "cleanser", "toner", "sunscreen", "foundation",
    "lipstick", "mascara", "eyeliner", "blush", "concealer", "perfume", "cologne",
    "shampoo", "conditioner", "body wash", "lotion", "cream", "supplement",
    "vitamin", "collagen", "skincare", "makeup", "beauty", "hair care",
  ],
  sports: [
    "yoga mat", "dumbbell", "kettlebell", "resistance band", "running", "cycling",
    "hiking", "camping", "tent", "sleeping bag", "backpack", "bike", "kayak",
    "fitness", "gym", "workout", "sports", "outdoor", "athletic", "training",
    "snowboard", "surf", "swim", "golf", "tennis", "football", "basketball",
  ],
  food: [
    "coffee", "tea", "protein powder", "snack", "chocolate", "candy", "cookie",
    "sauce", "oil", "vinegar", "spice", "organic", "vegan", "gluten-free",
    "supplement", "probiotics", "food", "drink", "beverage", "nutrition",
  ],
  kids: [
    "toy", "lego", "puzzle", "doll", "action figure", "board game", "baby",
    "toddler", "children", "kids", "infant", "stroller", "diaper", "pacifier",
    "educational", "playmat", "stuffed animal",
  ],
  home: [
    "sofa", "chair", "table", "desk", "bed", "mattress", "pillow", "blanket",
    "lamp", "curtain", "rug", "shelf", "cabinet", "kitchen", "cookware", "pan",
    "pot", "blender", "coffee maker", "vacuum", "mop", "candle", "plant",
    "garden", "tool", "home", "furniture", "decor",
  ],
  general: [],
};

export function detectProductCategory(product: ProductInput): ProductCategory {
  const corpus = [
    product.title,
    product.productType ?? "",
    product.tags.join(" "),
    stripHtml(product.description).slice(0, 200),
  ].join(" ").toLowerCase();

  const scores: Partial<Record<ProductCategory, number>> = {};
  for (const [cat, signals] of Object.entries(CATEGORY_SIGNALS) as [ProductCategory, string[]][]) {
    if (cat === "general") continue;
    const hits = signals.filter((s) => corpus.includes(s)).length;
    if (hits > 0) scores[cat] = hits;
  }

  if (Object.keys(scores).length === 0) return "general";
  return (Object.entries(scores).sort(([, a], [, b]) => b - a)[0]![0]) as ProductCategory;
}

// ─── Category-specific rules ──────────────────────────────────────────────────

const INGREDIENT_TERMS = [
  "ingredient", "active ingredient", "contains", "formula", "compound",
  "extract", "acid", "vitamin", "mineral", "protein", "enzyme",
];
const ALLERGEN_TERMS = ["allergen", "allergy", "gluten", "nut", "dairy", "soy", "wheat", "vegan", "vegetarian"];
const SAFETY_CERT_TERMS = ["ce certified", "fda", "cpsc", "astm", "ul listed", "rohs", "reach", "bpa free", "non-toxic", "cruelty-free"];
const SIZING_TERMS = ["size guide", "sizing", "fits", "waist", "chest", "hip", "inseam", "eu size", "uk size", "us size", "small", "medium", "large", "xl", "xxl"];
const CARE_TERMS = ["machine wash", "hand wash", "dry clean", "tumble dry", "iron", "bleach", "care instruction"];
const NUTRITION_TERMS = ["calories", "serving size", "nutrition", "carbohydrate", "fat", "sodium", "sugar", "protein", "dietary fiber"];
const AGE_TERMS = ["ages", "age range", "suitable for age", "years old", "months old", "for kids", "for children", "for toddlers"];
const TECH_SPEC_TERMS = ["ghz", "mhz", "gb", "tb", "mb", "ram", "cpu", "gpu", "mah", "watt", "volt", "amp", "hz", "fps", "mp megapixel", "resolution", "processor", "compatible with", "connectivity", "os ", "operating system"];

function analyzeCategorySpecificRules(
  product: ProductInput,
  category: ProductCategory,
  violations: RuleViolation[],
): void {
  const plain = stripHtml(product.description).toLowerCase();
  if (!plain || wordCount(plain) < 20) return; // already flagged by desc rules

  switch (category) {
    case "electronics": {
      const techSpecCount = TECH_SPEC_TERMS.filter((t) => plain.includes(t)).length;
      if (techSpecCount < 2) {
        violations.push({
          ruleId: "CAT_ELECTRONICS_NO_SPECS",
          category: "completeness",
          severity: "high",
          title: "Electronics product missing technical specifications",
          description: "AI assistants answering 'What are the specs of X?' need processor, memory, connectivity, and compatibility data. Without specs, this product loses all AI comparison queries.",
          suggestion: "Add a specifications section: processor/chip, memory/storage, connectivity (WiFi/Bluetooth version), compatibility, power requirements, and certifications.",
          evidence: `Only ${techSpecCount}/2 required spec types detected (processor, memory, connectivity, wattage, resolution).`,
          impactScore: 80,
          effortLevel: "medium",
        });
      }
      if (!hasKeyword(plain, ["compatible with", "works with", "compatibility", "requires"])) {
        violations.push({
          ruleId: "CAT_ELECTRONICS_NO_COMPAT",
          category: "completeness",
          severity: "medium",
          title: "No compatibility information",
          description: "Compatibility is the #1 buyer question for electronics. AI agents cannot answer 'Will this work with my X?' without it.",
          suggestion: "Add a compatibility statement: 'Compatible with iOS 14+, Android 10+, Windows 10/11, macOS 12+'.",
          evidence: "No compatibility or 'works with' language found in description.",
          impactScore: 60,
          effortLevel: "low",
        });
      }
      break;
    }

    case "fashion": {
      if (!hasKeyword(plain, SIZING_TERMS)) {
        violations.push({
          ruleId: "CAT_FASHION_NO_SIZING",
          category: "completeness",
          severity: "high",
          title: "Fashion product missing sizing information",
          description: "Size is the #1 reason shoppers abandon fashion products. AI agents cannot recommend apparel for 'fit' queries without sizing data.",
          suggestion: "Add a size guide or measurement chart: chest, waist, hip in both cm and inches across sizes S–XXL.",
          evidence: "No sizing terms (small/medium/large, measurements, size guide) found.",
          impactScore: 85,
          effortLevel: "medium",
        });
      }
      if (!hasKeyword(plain, MATERIAL_TERMS)) {
        violations.push({
          ruleId: "CAT_FASHION_NO_MATERIAL",
          category: "completeness",
          severity: "high",
          title: "Fashion product missing fabric/material information",
          description: "Material is critical for AI answering 'What is this made of?' or 'Is this breathable/waterproof?' queries.",
          suggestion: "Add fabric composition: '100% organic cotton' or '60% polyester, 40% nylon — quick-dry, moisture-wicking'.",
          evidence: "No fabric or material composition terms found.",
          impactScore: 75,
          effortLevel: "low",
        });
      }
      if (!hasKeyword(plain, CARE_TERMS)) {
        violations.push({
          ruleId: "CAT_FASHION_NO_CARE",
          category: "completeness",
          severity: "low",
          title: "Missing care instructions",
          description: "Care instructions are a common buyer question AI agents cannot answer without them.",
          suggestion: "Add a short care section: 'Machine wash cold, tumble dry low, do not bleach'.",
          evidence: "No wash, care, or cleaning instructions detected.",
          impactScore: 25,
          effortLevel: "low",
        });
      }
      break;
    }

    case "beauty": {
      if (!hasKeyword(plain, INGREDIENT_TERMS)) {
        violations.push({
          ruleId: "CAT_BEAUTY_NO_INGREDIENTS",
          category: "completeness",
          severity: "high",
          title: "Beauty product missing ingredient information",
          description: "Shoppers and AI agents increasingly filter beauty products by ingredients (retinol, hyaluronic acid, SPF). Without them, this product is invisible in ingredient-specific queries.",
          suggestion: "List key active ingredients with percentages: 'Contains 2% niacinamide, 1% hyaluronic acid, SPF 30'.",
          evidence: "No ingredient, formula, or active compound terms found.",
          impactScore: 88,
          effortLevel: "medium",
        });
      }
      if (!hasKeyword(plain, ["skin type", "for oily", "for dry", "for sensitive", "all skin", "suitable for", "for combination"])) {
        violations.push({
          ruleId: "CAT_BEAUTY_NO_SKIN_TYPE",
          category: "completeness",
          severity: "medium",
          title: "No skin/hair type suitability specified",
          description: "AI agents answering 'best moisturizer for dry skin' cannot include this product without skin type targeting.",
          suggestion: "Add suitability: 'Suitable for dry, normal, and combination skin. Avoid if sensitive to retinoids.'",
          evidence: "No skin type, hair type, or suitability language detected.",
          impactScore: 55,
          effortLevel: "low",
        });
      }
      break;
    }

    case "food": {
      if (!hasKeyword(plain, NUTRITION_TERMS)) {
        violations.push({
          ruleId: "CAT_FOOD_NO_NUTRITION",
          category: "completeness",
          severity: "high",
          title: "Food product missing nutritional information",
          description: "AI agents answering health or diet queries (calories, macros, allergens) cannot surface this product without nutritional data.",
          suggestion: "Add serving size, calories, protein, carbs, fat, and key allergen statements.",
          evidence: "No nutritional information or serving size found.",
          impactScore: 78,
          effortLevel: "medium",
        });
      }
      if (!hasKeyword(plain, ALLERGEN_TERMS)) {
        violations.push({
          ruleId: "CAT_FOOD_NO_ALLERGENS",
          category: "trust",
          severity: "medium",
          title: "No allergen information",
          description: "Allergen queries are high-intent and safety-critical. AI agents cannot safely recommend food products without allergen declarations.",
          suggestion: "Add allergen statement: 'Contains: Milk, Soy. May contain traces of nuts and wheat.'",
          evidence: "No allergen, gluten, dairy, or nut content declarations found.",
          impactScore: 60,
          effortLevel: "low",
        });
      }
      break;
    }

    case "kids": {
      if (!hasKeyword(plain, AGE_TERMS)) {
        violations.push({
          ruleId: "CAT_KIDS_NO_AGE",
          category: "completeness",
          severity: "high",
          title: "Kids product missing age range",
          description: "Age suitability is the #1 filter parents use. AI assistants cannot answer 'toys for 3-year-olds' without age range data.",
          suggestion: "Add age suitability: 'Recommended for ages 3–8 years. Adult supervision required for children under 3.'",
          evidence: "No age range, 'suitable for ages', or 'years old' language found.",
          impactScore: 85,
          effortLevel: "low",
        });
      }
      if (!hasKeyword(plain, SAFETY_CERT_TERMS)) {
        violations.push({
          ruleId: "CAT_KIDS_NO_SAFETY",
          category: "trust",
          severity: "medium",
          title: "No safety certifications mentioned",
          description: "Parents buying for children prioritize safety certifications. AI agents boost trust signals when certifications are present.",
          suggestion: "Add relevant certifications: 'ASTM F963 certified, CPSC compliant, BPA-free, non-toxic materials'.",
          evidence: "No safety certification terms (ASTM, CPSC, BPA-free, non-toxic) found.",
          impactScore: 55,
          effortLevel: "medium",
        });
      }
      break;
    }

    case "sports": {
      if (!hasKeyword(plain, DIMENSION_TERMS)) {
        violations.push({
          ruleId: "CAT_SPORTS_NO_DIMENSIONS",
          category: "completeness",
          severity: "high",
          title: "Sports product missing dimensions or weight",
          description: "For sports and outdoor gear, dimensions and weight are critical buying criteria. AI cannot answer 'How heavy is it?' or 'Will it fit in my bag?' without them.",
          suggestion: "Add weight, packed dimensions, and deployed dimensions if applicable.",
          evidence: "No weight, dimension, or measurement terms found for a sports/outdoor product.",
          impactScore: 70,
          effortLevel: "medium",
        });
      }
      break;
    }

    default:
      break;
  }
}

// ─── Category score weight profiles ──────────────────────────────────────────

const CATEGORY_WEIGHTS: Record<ProductCategory, { clarity: number; completeness: number; trust: number; tags: number }> = {
  electronics: { clarity: 0.20, completeness: 0.45, trust: 0.25, tags: 0.10 },
  fashion:     { clarity: 0.25, completeness: 0.40, trust: 0.20, tags: 0.15 },
  beauty:      { clarity: 0.20, completeness: 0.45, trust: 0.25, tags: 0.10 },
  food:        { clarity: 0.15, completeness: 0.45, trust: 0.30, tags: 0.10 },
  kids:        { clarity: 0.20, completeness: 0.35, trust: 0.35, tags: 0.10 },
  sports:      { clarity: 0.25, completeness: 0.40, trust: 0.20, tags: 0.15 },
  home:        { clarity: 0.25, completeness: 0.40, trust: 0.20, tags: 0.15 },
  general:     { clarity: 0.25, completeness: 0.35, trust: 0.25, tags: 0.15 },
};

// ─── Score from violations ────────────────────────────────────────────────────

function computeScore(violations: RuleViolation[], category: string): number {
  const relevant = violations.filter((v) => v.category === category);
  if (relevant.length === 0) return 100;
  const totalPenalty = relevant.reduce((sum, v) => sum + v.impactScore * 0.8, 0);
  return Math.max(0, Math.round(100 - totalPenalty));
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function runRuleEngine(product: ProductInput): RuleEngineResult {
  const violations: RuleViolation[] = [];

  const detectedCategory = detectProductCategory(product);

  const clarityFromTitle = analyzeTitle(product.title, violations);
  const completenessFromDesc = analyzeDescription(product.description, violations);
  const tagsScore = analyzeTags(product.tags, product.productType, violations);
  const trustScore = analyzeTrust(product, violations);
  analyzeBrandAuthority(product, violations);
  checkStructuredData(product.description, violations);
  checkTaxonomySpecificity(product.productType, violations);
  analyzeVoiceReadiness(product.title, product.description, violations);
  analyzeComparisonReadiness(product.description, product.tags, violations);
  analyzeCategorySpecificRules(product, detectedCategory, violations);

  const w = CATEGORY_WEIGHTS[detectedCategory];

  // Base scores from rules
  const baseClarity = Math.round((clarityFromTitle + computeScore(violations, "clarity")) / 2);
  const baseCompleteness = Math.round((completenessFromDesc + computeScore(violations, "completeness")) / 2);
  const baseTrust = Math.round((trustScore + computeScore(violations, "trust")) / 2);
  const baseTags = tagsScore;

  // Category-weighted overall (used externally by ai-analyzer to blend with AI clarity)
  const weightedOverall = Math.round(
    baseClarity * w.clarity +
    baseCompleteness * w.completeness +
    baseTrust * w.trust +
    baseTags * w.tags,
  );

  const ruleScores = {
    clarity: baseClarity,
    completeness: baseCompleteness,
    trust: baseTrust,
    tags: baseTags,
    weightedOverall,
  };

  return { ruleScores, violations, detectedCategory };
}
