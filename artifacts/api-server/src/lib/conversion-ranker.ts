export type RankedGapInput = {
  id: string;
  title: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
  productId: string | null;
  productTitle: string | null;
  category: string;
};

export type PrioritizedActionPlanItem = {
  gapId: string;
  gap: string;
  severity: "high" | "medium" | "low";
  conversionImpact: string;
  suggestedFix: string;
  productId: string | null;
  productTitle: string | null;
  category: string;
};

const IMPACT_RULES: Array<{
  test: (title: string) => boolean;
  label: string;
  weight: number;
}> = [
  {
    test: (title) => /return policy|refund/i.test(title),
    label: "High - AI agents flag stores without return policies as untrustworthy",
    weight: 3,
  },
  {
    test: (title) => /missing description|insufficient product information/i.test(title),
    label: "High - products with thin descriptions are rarely recommended by AI agents",
    weight: 3,
  },
  {
    test: (title) => /shipping policy/i.test(title),
    label: "High - unclear shipping policy lowers purchase confidence in AI-assisted checkouts",
    weight: 3,
  },
  {
    test: (title) => /faq/i.test(title),
    label: "Medium - common customer questions will go unanswered in AI shopping sessions",
    weight: 2,
  },
  {
    test: (title) => /generic tags|optimize tags|tag/i.test(title),
    label: "Medium - weak tags reduce discoverability in AI-assisted search flows",
    weight: 2,
  },
  {
    test: (title) => /json-ld|structured data/i.test(title),
    label: "Medium - AI systems cannot reliably extract machine-readable product facts",
    weight: 2,
  },
  {
    test: (title) => /review/i.test(title),
    label: "Medium - missing social proof reduces trust in AI-generated product recommendations",
    weight: 2,
  },
];

const SEVERITY_WEIGHT: Record<RankedGapInput["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function getConversionImpact(title: string): { label: string; weight: number } {
  const match = IMPACT_RULES.find((rule) => rule.test(title));
  if (match) {
    return { label: match.label, weight: match.weight };
  }

  return {
    label: "Low - useful cleanup, but unlikely to shift conversion on its own",
    weight: 1,
  };
}

export function buildPrioritizedActionPlan(gaps: RankedGapInput[]): PrioritizedActionPlanItem[] {
  return gaps
    .map((gap) => {
      const conversionImpact = getConversionImpact(gap.title);
      return {
        gapId: gap.id,
        gap: gap.title,
        severity: gap.severity,
        conversionImpact: conversionImpact.label,
        conversionImpactWeight: conversionImpact.weight,
        suggestedFix: gap.suggestion,
        productId: gap.productId,
        productTitle: gap.productTitle,
        category: gap.category,
        severityWeight: SEVERITY_WEIGHT[gap.severity],
      };
    })
    .sort((left, right) => {
      if (right.severityWeight !== left.severityWeight) {
        return right.severityWeight - left.severityWeight;
      }
      if (right.conversionImpactWeight !== left.conversionImpactWeight) {
        return right.conversionImpactWeight - left.conversionImpactWeight;
      }
      return left.gap.localeCompare(right.gap);
    })
    .map(({ conversionImpactWeight: _impact, severityWeight: _severity, ...item }) => item);
}