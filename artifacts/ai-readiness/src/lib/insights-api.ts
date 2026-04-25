import { getCsrfToken } from "./csrf-service";
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

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  let headers = { ...(init?.headers || {}) };
  const method = (init?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const csrfToken = await getCsrfToken();
    headers = { ...headers, "x-csrf-token": csrfToken };
  }
  const response = await fetch(input, { credentials: "include", ...init, headers });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) {
        message = data.error;
      }
    } catch {
      // Ignore JSON parsing failures and use the default status-based message.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

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