type TagOptimizerProduct = {
  id: string;
  title: string;
  tags: string[];
  suggestedTags: string[];
  tagScore: number;
};

export type TagOptimizerItem = {
  productId: string;
  title: string;
  currentTags: string[];
  suggestedTags: string[];
  tagScore: number;
  genericTags: string[];
  needsAttention: boolean;
  recommendationSummary: string;
};

const GENERIC_TAGS = new Set([
  "shirt",
  "top",
  "pants",
  "dress",
  "gift",
  "home",
  "decor",
  "bag",
  "sale",
  "new",
]);

function findGenericTags(tags: string[]): string[] {
  return tags.filter((tag) => {
    const normalized = tag.trim().toLowerCase();
    return normalized.split(/[\s-]+/).length <= 1 || GENERIC_TAGS.has(normalized);
  });
}

function buildRecommendationSummary(product: TagOptimizerProduct, genericTags: string[]): string {
  if (product.tags.length === 0) {
    return "This product has no tags today. Add semantic tags so AI retrieval systems can classify it correctly.";
  }

  if (genericTags.length > 0) {
    return `Replace generic tags like ${genericTags.slice(0, 3).join(", ")} with multi-word, intent-rich alternatives.`;
  }

  if (product.suggestedTags.length === 0) {
    return "Current tags are usable, but there are no stronger semantic alternatives yet.";
  }

  return "Current tags are decent, but the suggested set gives AI assistants more context about audience, material, and use case.";
}

export function buildTagOptimizerItems(products: TagOptimizerProduct[]): TagOptimizerItem[] {
  return products
    .map((product) => {
      const genericTags = findGenericTags(product.tags);
      const needsAttention = product.tagScore < 70 || genericTags.length > 0 || product.tags.length === 0;

      return {
        productId: product.id,
        title: product.title,
        currentTags: product.tags,
        suggestedTags: product.suggestedTags,
        tagScore: product.tagScore,
        genericTags,
        needsAttention,
        recommendationSummary: buildRecommendationSummary(product, genericTags),
      };
    })
    .sort((left, right) => {
      if (left.needsAttention !== right.needsAttention) {
        return left.needsAttention ? -1 : 1;
      }
      return left.tagScore - right.tagScore;
    });
}