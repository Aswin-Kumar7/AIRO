import { requestJson } from "./http";

export interface TopicalCluster {
  topic: string;
  productCount: number;
  products: string[];
  coverageScore: number;
  gaps: string[];
  /** Estimated buyer queries this cluster can answer */
  queryCount: number;
  /** 2-3 example queries routed to this cluster */
  topQueries: string[];
  /** Sub-topics with zero product coverage */
  missingSubtopics: string[];
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
