async function requestJson<T>(input: string): Promise<T> {
  const res = await fetch(input);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface QuerySimulationResult {
  query: string;
  wouldRecommend: boolean;
  recommendedProduct: string | null;
  reasoning: string;
  missingInfo: string[];
  confidenceScore: number;
}

export interface QuerySimulationResponse {
  storeId: string;
  results: QuerySimulationResult[];
  successCount: number;
  totalQueries: number;
  generatedAt: string;
}

export interface TopicalCluster {
  topic: string;
  productCount: number;
  products: string[];
  coverageScore: number;
  gaps: string[];
}

export interface TopicalAuthorityResponse {
  storeId: string;
  clusters: TopicalCluster[];
  totalProducts: number;
  averageCoverageScore: number;
  generatedAt: string;
}

export interface InternalLinkSuggestion {
  fromProductId: string;
  fromProductTitle: string;
  toProductId: string;
  toProductTitle: string;
  reason: string;
  linkType: "complementary" | "alternative" | "same-category" | "upsell";
}

export interface InternalLinksResponse {
  storeId: string;
  suggestions: InternalLinkSuggestion[];
  totalProducts: number;
  generatedAt: string;
}

export interface LlmsTxtResponse {
  storeId: string;
  domain: string;
  content: string;
  generatedAt: string;
}

export interface FaqQuestion {
  question: string;
  answer: string;
}

export interface FaqSchemaResponse {
  storeId: string;
  jsonLd: string;
  questionCount: number;
  questions: FaqQuestion[];
  generatedAt: string;
}

export interface ProductQaResult {
  question: string;
  canAnswer: boolean;
  answer: string;
  missingInfo: string | null;
}

export interface ProductQaResponse {
  storeId: string;
  productId: string;
  productTitle: string;
  results: ProductQaResult[];
  answerableCount: number;
  totalQuestions: number;
  answerabilityScore: number;
  generatedAt: string;
}

export const getQuerySimulation = (storeId: string) =>
  requestJson<QuerySimulationResponse>(`/api/stores/${storeId}/query-simulation`);

export const getTopicalAuthority = (storeId: string) =>
  requestJson<TopicalAuthorityResponse>(`/api/stores/${storeId}/topical-authority`);

export const getInternalLinks = (storeId: string) =>
  requestJson<InternalLinksResponse>(`/api/stores/${storeId}/internal-links`);

export const getLlmsTxt = (storeId: string) =>
  requestJson<LlmsTxtResponse>(`/api/stores/${storeId}/llms-txt`);

export const getFaqSchema = (storeId: string) =>
  requestJson<FaqSchemaResponse>(`/api/stores/${storeId}/faq-schema`);

export const getProductAiQa = (storeId: string, productId: string) =>
  requestJson<ProductQaResponse>(`/api/stores/${storeId}/products/${productId}/ai-qa`);
