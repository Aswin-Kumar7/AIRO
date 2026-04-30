import { requestJson } from "./http";
export type ActionPlanItem = {
  gapId: string;
  gap: string;
  severity: "high" | "medium" | "low";
  conversionImpact: string;
  suggestedFix: string;
  productId: string | null;
  productTitle: string | null;
  category: string;
};

export type StorePerceptionResponse = {
  storeId: string;
  merchantDesiredPositioning: string | null;
  agentNarrative: string;
  unansweredQuestions: string[];
  ambiguities: string[];
  perceivedStrengths: string[];
  faqHealth: {
    found: boolean;
    title: string | null;
    questionCount: number;
    unansweredTopics: string[];
  };
  structuredData: {
    totalProducts: number;
    missingProductCount: number;
    missingProducts: Array<{ id: string; title: string }>;
  };
  prioritizedActionPlan: ActionPlanItem[];
  updatedAt: string | null;
};


export function getStorePerception(storeId: string): Promise<StorePerceptionResponse> {
  return requestJson<StorePerceptionResponse>(`/api/stores/${storeId}/perception`);
}

export function updateStorePositioning(
  storeId: string,
  desiredPositioning: string,
): Promise<{ storeId: string; desiredPositioning: string | null }> {
  return requestJson(`/api/stores/${storeId}/positioning`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ desiredPositioning }),
  });
}