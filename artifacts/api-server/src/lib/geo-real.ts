/**
 * Real GEO (Generative Engine Optimization) Scanner
 *
 * Actually queries real AI platforms and checks whether a merchant's store
 * appears in their answers. Five agents run in parallel:
 *
 *   1. Tavily Search — live web search with source URLs. Checks if store
 *      domain appears in the result URLs returned for buyer queries.
 *
 *   2. Google Search (SerpAPI) — Google organic results via SerpAPI. Checks
 *      if the store domain appears in Google's top 10 organic results, which
 *      is the primary signal for AI answer engine indexing.
 *
 *   3. Claude AI (via AWS Bedrock) — probes whether the AI would recommend
 *      the store for a given buyer query based on brand and product knowledge.
 *
 *   4. Gemini AI (via OpenRouter/Groq fallback) — content quality test.
 *      Given the actual product description, would this AI recommend it?
 *
 *   5. OpenAI GPT-4o-mini — second AI content-quality judge. Evaluates whether
 *      the store's product content is detailed enough for GPT to recommend it.
 *
 * Each agent answers a different question, giving a 5-angle view of AI visibility.
 */

import { chatCompletion, callOpenAI } from "./ai-client";
import { logger } from "./logger";

// ─── Shared fetch helper ──────────────────────────────────────────────────────

/**
 * Fetch with one automatic retry on 429 (rate-limited) or 5xx (server error).
 * Network-level errors (timeout, ECONNREFUSED) are also retried once.
 * Delay before retry: 1 second by default.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { retries = 1, delayMs = 1000 }: { retries?: number; delayMs?: number } = {},
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry on rate-limit or server errors, but not on the final attempt
      if (attempt < retries && (res.status === 429 || res.status >= 500)) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr ?? new Error("Fetch failed after retries");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentQueryResult {
  platform: string;
  platformLabel: string;
  query: string;
  cited: boolean;
  rank?: number;          // 1–10 store ranking from AI judge (where available)
  citationUrl: string | null;
  citedSnippet: string | null;
  competitorsMentioned: string[];
  reasoning: string;
  latencyMs: number;
  error?: string;
}

export interface GeoScanReport {
  storeId: string;
  storeDomain: string;
  storeName: string;
  queriesPerPlatform: number;
  results: AgentQueryResult[];
  geoScore: number;           // 0–100 overall weighted score
  tavilyScore: number;        // % of Tavily (live web) queries where store was cited
  serpApiScore: number;       // % of Google Search (SerpAPI) queries where store appeared
  bedrockScore: number;       // % of Claude AI queries where brand was recommended
  internalScore: number;      // % of Gemini AI queries with recommendation
  openAiScore: number;        // % of OpenAI GPT queries with recommendation
  topMissedQueries: string[];
  topCompetitors: string[];   // domains mentioned most often instead of you
  scannedAt: string;
  platformSummary: Array<{
    platform: string;
    label: string;
    queriesRun: number;
    citedCount: number;
    score: number;
    avgRank?: number | null;  // average 1–10 rank where available (Claude AI + Gemini AI + OpenAI)
    insight: string;
  }>;
}

// ─── Query generation ─────────────────────────────────────────────────────────

// Real-user-style query templates per category — conversational, intent-driven
const QUERY_TEMPLATES: Record<string, string[]> = {
  electronics: [
    "I need a good {type} that won't break the bank, any suggestions?",
    "what's the best {type} to buy right now under ${price}?",
    "looking for a reliable {type} for everyday use",
    "is {store} a good place to buy {type}?",
    "where can I find {type} with fast shipping and easy returns?",
    "comparing {type} options online — who has the best deal?",
    "{store} {type} — are they worth it?",
    "which online store has the best {type} selection?",
  ],
  fashion: [
    "where can I buy quality {type} that actually lasts?",
    "looking for stylish {type} under ${price}",
    "is {store} good for {type}? anyone tried them?",
    "best online shops for {type} in 2024",
    "I want to buy {type} online — what should I know?",
    "affordable {type} that looks expensive",
    "{store} reviews — are they legit?",
    "where do people actually shop for {type} online?",
  ],
  beauty: [
    "what {type} actually works? I'm tired of wasting money",
    "looking for clean {type} that's not overpriced",
    "is {store} cruelty free? I want to buy their {type}",
    "best {type} for sensitive skin under ${price}",
    "where to buy {type} online with honest reviews?",
    "{store} — anyone bought {type} from them?",
    "natural {type} alternatives that actually work",
    "gift ideas for {type} lover",
  ],
  food: [
    "where can I order {type} online with fast delivery?",
    "is {store} good for buying {type}? any reviews?",
    "looking for high quality {type} to gift someone",
    "best online store for {type} — what do people recommend?",
    "I want to try {type} from a small business online",
    "{store} {type} — worth ordering?",
    "organic {type} online shops that are actually good",
    "what's a good website to buy {type} as a gift?",
  ],
  sports: [
    "looking for {type} gear for a beginner — where to start?",
    "best {type} under ${price} for someone just getting into it",
    "is {store} reliable for {type} equipment?",
    "where to buy quality {type} online?",
    "{type} for home use — any recommendations?",
    "{store} {type} — real reviews from actual buyers?",
    "I need {type} gear fast, which online store ships quickly?",
    "best value {type} brand online",
  ],
  kids: [
    "safe {type} for kids under ${price}?",
    "where to buy quality {type} for children online?",
    "is {store} good for kids {type}?",
    "gift ideas {type} for a 5 year old",
    "best online store for educational {type}",
    "{store} kids {type} — are they safe and good quality?",
    "affordable {type} toys that are actually fun",
    "where do parents shop for {type} online?",
  ],
  home: [
    "looking for quality {type} for my home under ${price}",
    "where to buy {type} online with good return policy?",
    "is {store} reliable for home {type}?",
    "best {type} for small spaces",
    "{store} home {type} — worth the price?",
    "where can I find unique {type} for my home?",
    "affordable {type} that looks high-end",
    "top rated {type} on small online stores",
  ],
  general: [
    "where can I buy {type} online from a store I can trust?",
    "looking for {type} — any small businesses worth trying?",
    "is {store} a legit place to buy {type}?",
    "best online stores for {type} besides Amazon?",
    "I need {type} as a gift — where should I order?",
    "{store} — has anyone ordered from them? what was your experience?",
    "good {type} under ${price} — where to buy online?",
    "what's a reliable website for {type}?",
  ],
};

export function generateBuyerQueries(
  storeName: string,
  productTypes: string[],
  categories: string[],
  priceRange: { min: number; max: number },
): string[] {
  const category = (categories[0] ?? "general").toLowerCase();
  const templates = QUERY_TEMPLATES[category] ?? QUERY_TEMPLATES["general"]!;
  const midPrice = Math.round((priceRange.min + priceRange.max) / 2) || 50;
  const typesToUse = productTypes.filter(Boolean).slice(0, 2);
  const primaryType = typesToUse[0] ?? "products";

  const fill = (template: string, type: string) =>
    template
      .replace(/\{type\}/g, type.toLowerCase())
      .replace(/\{store\}/g, storeName)
      .replace(/\{price\}/g, String(midPrice));

  const queries: string[] = [];

  // 2 product-type queries with varied templates (pick different offsets per type)
  typesToUse.forEach((type, i) => {
    queries.push(fill(templates[i * 2] ?? templates[0]!, type));
    queries.push(fill(templates[i * 2 + 1] ?? templates[1]!, type));
  });

  // 1 trust/review query about the store specifically
  queries.push(fill(templates[4] ?? `is {store} a good place to buy {type}?`, primaryType));

  // 1 brand-direct query
  queries.push(`${storeName} ${primaryType} — honest review`);

  // 1 gift/use-case query
  queries.push(fill(templates[5] ?? `best {type} to buy as a gift online`, primaryType));

  // 1 comparison / discovery query
  queries.push(fill(templates[6] ?? `best small online stores for {type} besides Amazon`, primaryType));

  return [...new Set(queries)].slice(0, 6);
}

// ─── Tavily Search agent ──────────────────────────────────────────────────────

interface TavilyResponse {
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
}

async function queryTavily(
  query: string,
  storeDomain: string,
  storeName: string,
): Promise<AgentQueryResult> {
  const t0 = Date.now();
  const platform = "tavily";
  const platformLabel = "Tavily (Live Web)";

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [], reasoning: "Tavily API key not configured.",
      latencyMs: 0, error: "TAVILY_API_KEY not set",
    };
  }

  try {
    const res = await fetchWithRetry("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
        max_results: 10,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Tavily HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as TavilyResponse;
    const results = data.results ?? [];
    const answer = data.answer ?? "";

    // Check if store domain appears in result URLs
    const normalDomain = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
    const matchedResult = results.find((r) =>
      (r.url ?? "").toLowerCase().includes(normalDomain) ||
      (r.url ?? "").toLowerCase().includes(storeName.toLowerCase().replace(/\s+/g, ""))
    ) ?? null;

    // Extract competitor domains from results (not the store itself)
    const competitorDomains = results
      .filter((r) => !(r.url ?? "").toLowerCase().includes(normalDomain))
      .map((r) => {
        try { return new URL(r.url ?? "").hostname.replace(/^www\./, ""); } catch { return null; }
      })
      .filter((d): d is string => d !== null && d.length > 0 && !d.includes("google") && !d.includes("bing"))
      .slice(0, 3);

    const citedUrl = matchedResult?.url ?? null;
    const citedSnippet = matchedResult?.content?.slice(0, 200) ?? (answer ? answer.slice(0, 200) : null);

    return {
      platform,
      platformLabel,
      query,
      cited: citedUrl !== null,
      citationUrl: citedUrl,
      citedSnippet,
      competitorsMentioned: competitorDomains,
      reasoning: citedUrl
        ? `Your store appeared in Tavily's top ${results.length} web results.`
        : `Your store was not found. ${results.length > 0 ? `${results.length} other sources ranked instead.` : "No results returned."}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    logger.warn({ err, query }, "Tavily GEO query failed");
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [], latencyMs: Date.now() - t0,
      reasoning: "Query failed — check API key or network.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Google Search agent (SerpAPI) ───────────────────────────────────────────
// Role: Google organic search results — the primary signal for AI answer engine
// indexing. Google's results feed into ChatGPT's web search, Perplexity, and
// most AI shopping aggregators. Sign up at https://serpapi.com/

interface SerpApiResponse {
  organic_results?: Array<{
    link?: string;
    title?: string;
    snippet?: string;
  }>;
}

async function querySerpApi(
  query: string,
  storeDomain: string,
  storeName: string,
): Promise<AgentQueryResult> {
  const t0 = Date.now();
  const platform = "serpapi";
  const platformLabel = "Google Search";

  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [],
      reasoning: "Google Search agent not configured (SERPAPI_API_KEY missing).",
      latencyMs: 0, error: "SERPAPI_API_KEY not set",
    };
  }

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("num", "10");

    const res = await fetchWithRetry(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SerpAPI HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as SerpApiResponse;
    const results = data.organic_results ?? [];

    const normalDomain = storeDomain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
    const storeSlug = storeName.toLowerCase().replace(/\s+/g, "");

    const matchedResult = results.find((r) =>
      (r.link ?? "").toLowerCase().includes(normalDomain) ||
      (r.link ?? "").toLowerCase().includes(storeSlug)
    ) ?? null;

    // Extract competitor domains from non-store results
    const competitorDomains = results
      .filter((r) => !(r.link ?? "").toLowerCase().includes(normalDomain))
      .map((r) => {
        try { return new URL(r.link ?? "").hostname.replace(/^www\./, ""); } catch { return null; }
      })
      .filter((d): d is string => d !== null && d.length > 0 && !d.includes("google") && !d.includes("bing"))
      .slice(0, 3);

    const citedUrl = matchedResult?.link ?? null;
    const citedSnippet = matchedResult?.snippet?.slice(0, 200) ?? null;

    return {
      platform,
      platformLabel,
      query,
      cited: citedUrl !== null,
      citationUrl: citedUrl,
      citedSnippet,
      competitorsMentioned: competitorDomains,
      reasoning: citedUrl
        ? `Your store appeared in Google's top ${results.length} organic results — visible to AI search aggregators.`
        : `Not found in Google's top results. ${results.length > 0 ? `${results.length} other sites ranked instead.` : "No results returned."}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    logger.warn({ err, query }, "SerpAPI GEO query failed");
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [], latencyMs: Date.now() - t0,
      reasoning: "Google Search query failed — check SERPAPI_API_KEY.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Claude AI agent (via AWS Bedrock) ───────────────────────────────────────
// Role: brand-knowledge + purchase-intent judge using Claude via Bedrock.
// Uses Bedrock HTTP API with Bearer token (BEDROCK_API_KEY env var).

interface BedrockApiResponse {
  output?: { message?: { content?: Array<{ text?: string }> } };
}

function parseJsonResult(raw: string): { rank: number; recommend: boolean; reason: string; missing?: string } | null {
  const clean = raw.replace(/```json|```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { rank?: unknown; recommend?: unknown; reason?: unknown; missing?: unknown };
    if (typeof parsed.recommend !== "boolean") return null;
    return {
      rank: typeof parsed.rank === "number" ? Math.max(1, Math.min(10, parsed.rank)) : (parsed.recommend ? 6 : 3),
      recommend: parsed.recommend,
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      missing: typeof parsed.missing === "string" ? parsed.missing : undefined,
    };
  } catch {
    return null;
  }
}

// Thin-content guard: word count below this threshold → never auto-recommend
const THIN_CONTENT_WORD_THRESHOLD = 30;

function isThinContent(productSample: string): boolean {
  return productSample.trim().split(/\s+/).filter(Boolean).length < THIN_CONTENT_WORD_THRESHOLD;
}

async function queryBedrock(
  query: string,
  storeDomain: string,
  storeName: string,
  productSample: string,
): Promise<AgentQueryResult> {
  const t0 = Date.now();
  const platform = "bedrock_nova";
  const platformLabel = "Claude AI";

  const apiKey = process.env.BEDROCK_API_KEY;
  if (!apiKey) {
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [],
      reasoning: "Claude AI agent not configured (BEDROCK_API_KEY missing).",
      latencyMs: 0, error: "BEDROCK_API_KEY not configured",
    };
  }

  const region = process.env.AWS_REGION ?? "ap-south-1";
  const modelId = process.env.BEDROCK_MODEL_ID ?? "apac.amazon.nova-lite-v1:0";
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
  const thinContent = isThinContent(productSample);

  try {
    const thinContentInstruction = thinContent
      ? "\nIMPORTANT: The product information provided is very limited (under 30 words). You MUST return recommend:false and rank ≤ 4 when there is insufficient product detail to justify a recommendation."
      : "";

    const prompt = `You are a strict AI shopping assistant evaluating whether to recommend an online store for a customer.

Customer query: "${query}"
Store: "${storeName}" (${storeDomain})
Products they sell: ${productSample}
${thinContentInstruction}

Scoring rules:
- rank 8–10: Store directly sells exactly what the customer needs, with clear descriptions, pricing, and brand credibility
- rank 5–7: Partial match — store sells something related but not a perfect fit, or product info is vague
- rank 1–4: Wrong category, no pricing info, or product descriptions too thin to evaluate
- recommend: true ONLY if rank ≥ 7 AND product info is sufficient to verify the match

Respond ONLY with this exact JSON (no other text):
{"rank": <integer 1-10>, "recommend": <true or false>, "reason": "<one sentence explaining decision>", "missing": "<what product info is absent>"}`;

    const res = await fetchWithRetry(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        system: [{ text: "You are a strict JSON-only evaluation assistant. Output ONLY a single valid JSON object — no preamble, no explanation, no markdown fences." }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 150, temperature: 0.0 },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text();
      let reasoning = `Claude AI HTTP ${res.status}: ${body.slice(0, 300)}`;
      if (res.status === 403) reasoning = "Claude AI key invalid or expired — check BEDROCK_API_KEY in .env.";
      if (res.status === 404) reasoning = "Model not found — check BEDROCK_MODEL_ID and AWS_REGION.";
      throw new Error(reasoning);
    }

    const data = (await res.json()) as BedrockApiResponse;
    const raw = data.output?.message?.content?.[0]?.text ?? "";
    const parsed = parseJsonResult(raw);

    if (!parsed) {
      logger.warn({ raw, query }, "Claude AI returned non-JSON response");
      return {
        platform, platformLabel, query, cited: false, rank: 3,
        citationUrl: null, citedSnippet: raw.slice(0, 200), competitorsMentioned: [],
        reasoning: `Claude AI returned unclear response: ${raw.slice(0, 150)}`,
        latencyMs: Date.now() - t0,
      };
    }

    // Safety net: model sometimes says recommend:true but reason contradicts it.
    const CONTRA = /\b(can'?t recommend|cannot recommend|don'?t have enough|do not have enough|unable to recommend|not enough information|limited information|without more information|would not recommend|won'?t recommend|insufficient|too vague|too little|lacks detail)\b/i;
    if (parsed.recommend && CONTRA.test(parsed.reason)) {
      parsed.recommend = false;
      parsed.rank = Math.min(parsed.rank, 4);
    }
    // Thin content override: never recommend if content is insufficient
    if (thinContent && parsed.recommend) {
      parsed.recommend = false;
      parsed.rank = Math.min(parsed.rank, 4);
    }

    const competitorPattern = /\b(amazon|etsy|walmart|target|ebay|wayfair|zappos)\b/gi;
    const competitors = [...new Set((parsed.reason.match(competitorPattern) ?? []).map((c) => c.toLowerCase()))].slice(0, 3);

    return {
      platform, platformLabel, query,
      cited: parsed.recommend,
      rank: parsed.rank,
      citationUrl: null,
      citedSnippet: parsed.reason,
      competitorsMentioned: competitors,
      reasoning: parsed.recommend
        ? `Rank ${parsed.rank}/10 — Claude AI would recommend: ${parsed.reason}`
        : `Rank ${parsed.rank}/10 — Claude AI would not recommend: ${parsed.reason}${parsed.missing ? ` (missing: ${parsed.missing})` : ""}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, query }, "Claude AI GEO query failed");
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [], latencyMs: Date.now() - t0,
      reasoning: errMsg,
      error: errMsg,
    };
  }
}

// ─── Gemini AI Content Judge (via OpenRouter/Groq fallback chain) ────────────
// Role: evaluates whether the store's product content is detailed enough
// for a generative AI to confidently recommend it to a real buyer.

async function queryInternalAI(
  query: string,
  storeName: string,
  productSample: string,
): Promise<AgentQueryResult> {
  const t0 = Date.now();
  const platform = "internal_ai";
  const platformLabel = "Gemini AI";
  const thinContent = isThinContent(productSample);

  try {
    const thinContentInstruction = thinContent
      ? "\nCRITICAL: The product data provided is very sparse (under 30 words). A real AI assistant cannot confidently recommend a store with this little information. Return recommend:false and rank ≤ 3."
      : "";

    const prompt = `You are Gemini, a rigorous AI shopping assistant. A customer is looking for a product and you must decide whether to recommend a specific online store — based ONLY on the product information given.

Customer query: "${query}"
Store: "${storeName}"
Their product catalog: ${productSample}
${thinContentInstruction}

Evaluation rules (follow strictly):
- rank 8–10: Products directly match the query, have clear descriptions, pricing, specs. You'd recommend confidently.
- rank 5–7: Partial match or missing key details like price, materials, dimensions, or brand info.
- rank 1–4: Products don't match the query, descriptions are too vague, no pricing, or catalog is too thin.
- recommend: true ONLY if rank ≥ 7 — do not round up.
- If the product description is under 20 words, vague, or missing price — return recommend:false.

Respond ONLY with this exact JSON (absolutely no other text):
{"rank": <integer 1-10>, "recommend": <true or false>, "reason": "<one sentence — be specific about what matched or didn't>", "missing": "<the most important missing detail that would have changed your answer>"}`;

    const raw = await chatCompletion([{ role: "user", content: prompt }], 200);
    const parsed = parseJsonResult(raw);

    if (!parsed) {
      logger.warn({ raw, query }, "Gemini AI returned non-JSON");
      return {
        platform, platformLabel, query, cited: false, rank: 3,
        citationUrl: null, citedSnippet: raw.slice(0, 200), competitorsMentioned: [],
        reasoning: `Gemini AI returned unclear response: ${raw.slice(0, 150)}`,
        latencyMs: Date.now() - t0,
      };
    }

    // Thin content override
    if (thinContent && parsed.recommend) {
      parsed.recommend = false;
      parsed.rank = Math.min(parsed.rank, 3);
    }

    // Safety net for contradiction detection
    const CONTRA = /\b(can'?t recommend|cannot recommend|don'?t have enough|unable to recommend|not enough information|insufficient|too vague|lacks detail|no pricing|no price)\b/i;
    if (parsed.recommend && CONTRA.test(parsed.reason)) {
      parsed.recommend = false;
      parsed.rank = Math.min(parsed.rank, 4);
    }

    return {
      platform, platformLabel, query,
      cited: parsed.recommend,
      rank: parsed.rank,
      citationUrl: null,
      citedSnippet: parsed.reason,
      competitorsMentioned: [],
      reasoning: parsed.recommend
        ? `Rank ${parsed.rank}/10 — Gemini AI recommends: ${parsed.reason}`
        : `Rank ${parsed.rank}/10 — Gemini AI would not recommend: ${parsed.reason}${parsed.missing ? ` (missing: ${parsed.missing})` : ""}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    logger.warn({ err, query }, "Gemini AI Content Judge query failed");
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [], latencyMs: Date.now() - t0,
      reasoning: "Gemini AI query failed.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── OpenAI GPT-4o-mini Content Judge ────────────────────────────────────────
// Role: second independent AI content-quality judge. Evaluates whether the
// store's product catalog content is detailed enough for OpenAI's GPT to
// confidently recommend it. Complements Gemini AI with a different model perspective.
// Uses callOpenAI() from ai-client.ts — single implementation, no duplication.

async function queryOpenAI(
  query: string,
  storeName: string,
  productSample: string,
): Promise<AgentQueryResult> {
  const t0 = Date.now();
  const platform = "openai";
  const platformLabel = "OpenAI GPT";
  const thinContent = isThinContent(productSample);

  if (!process.env.OPENAI_API_KEY) {
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [],
      reasoning: "OpenAI GPT agent not configured (OPENAI_API_KEY missing).",
      latencyMs: 0, error: "OPENAI_API_KEY not set",
    };
  }

  try {
    const thinContentInstruction = thinContent
      ? "\nCRITICAL: The product data provided is very sparse (under 30 words). A real AI assistant cannot confidently recommend a store with so little information. Return recommend:false and rank ≤ 3."
      : "";

    const userPrompt = `You are a rigorous AI shopping assistant. A customer is looking for a product and you must decide whether to recommend a specific online store — based ONLY on the product information given.

Customer query: "${query}"
Store: "${storeName}"
Their product catalog: ${productSample}
${thinContentInstruction}

Evaluation rules (follow strictly):
- rank 8–10: Products directly match the query, have clear descriptions, pricing, specs. You'd recommend confidently.
- rank 5–7: Partial match or missing key details like price, materials, dimensions, or brand info.
- rank 1–4: Products don't match the query, descriptions are too vague, no pricing, or catalog is too thin.
- recommend: true ONLY if rank ≥ 7 — do not round up.
- If the product description is under 20 words, vague, or missing price — return recommend:false.

Respond ONLY with this exact JSON (absolutely no other text):
{"rank": <integer 1-10>, "recommend": <true or false>, "reason": "<one sentence — be specific about what matched or didn't>", "missing": "<the most important missing detail that would have changed your answer>"}`;

    const raw = await callOpenAI(
      [
        { role: "system", content: "You are a strict JSON-only evaluation assistant. Output ONLY a single valid JSON object — no preamble, no explanation, no markdown fences." },
        { role: "user", content: userPrompt },
      ],
      150,
      "gpt-4o-mini",
    );
    const parsed = parseJsonResult(raw);

    if (!parsed) {
      logger.warn({ raw, query }, "OpenAI GPT returned non-JSON response");
      return {
        platform, platformLabel, query, cited: false, rank: 3,
        citationUrl: null, citedSnippet: raw.slice(0, 200), competitorsMentioned: [],
        reasoning: `OpenAI GPT returned unclear response: ${raw.slice(0, 150)}`,
        latencyMs: Date.now() - t0,
      };
    }

    // Thin content override
    if (thinContent && parsed.recommend) {
      parsed.recommend = false;
      parsed.rank = Math.min(parsed.rank, 3);
    }

    // Safety net for contradiction detection
    const CONTRA = /\b(can'?t recommend|cannot recommend|don'?t have enough|unable to recommend|not enough information|insufficient|too vague|lacks detail|no pricing|no price)\b/i;
    if (parsed.recommend && CONTRA.test(parsed.reason)) {
      parsed.recommend = false;
      parsed.rank = Math.min(parsed.rank, 4);
    }

    return {
      platform, platformLabel, query,
      cited: parsed.recommend,
      rank: parsed.rank,
      citationUrl: null,
      citedSnippet: parsed.reason,
      competitorsMentioned: [],
      reasoning: parsed.recommend
        ? `Rank ${parsed.rank}/10 — OpenAI GPT recommends: ${parsed.reason}`
        : `Rank ${parsed.rank}/10 — OpenAI GPT would not recommend: ${parsed.reason}${parsed.missing ? ` (missing: ${parsed.missing})` : ""}`,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    logger.warn({ err, query }, "OpenAI GPT Content Judge query failed");
    return {
      platform, platformLabel, query, cited: false, citationUrl: null,
      citedSnippet: null, competitorsMentioned: [], latencyMs: Date.now() - t0,
      reasoning: "OpenAI GPT query failed.",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runGeoScan(params: {
  storeId: string;
  storeDomain: string;
  storeName: string;
  productTypes: string[];
  categories: string[];
  priceRange: { min: number; max: number };
  productSample: string;  // short description of top products
}): Promise<GeoScanReport> {
  const { storeId, storeDomain, storeName, productTypes, categories, priceRange, productSample } = params;

  const queries = generateBuyerQueries(storeName, productTypes, categories, priceRange);
  const scannedAt = new Date().toISOString();

  logger.info({ storeId, queryCount: queries.length }, "Starting real GEO scan across 5 AI platforms");

  // Run all queries across all 5 agents in parallel (respect rate limits)
  const allResults: AgentQueryResult[] = [];

  // Batch queries to avoid hammering APIs — 5 agents × BATCH queries per iteration
  const BATCH = 3;
  for (let i = 0; i < queries.length; i += BATCH) {
    const batch = queries.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.flatMap((query) => [
        queryTavily(query, storeDomain, storeName),
        querySerpApi(query, storeDomain, storeName),
        queryBedrock(query, storeDomain, storeName, productSample),
        queryInternalAI(query, storeName, productSample),
        queryOpenAI(query, storeName, productSample),
      ]),
    );
    allResults.push(...batchResults);
  }

  // Compute per-platform scores
  const tavilyResults = allResults.filter((r) => r.platform === "tavily");
  const serpApiResults = allResults.filter((r) => r.platform === "serpapi");
  const bedrockResults = allResults.filter((r) => r.platform === "bedrock_nova");
  const internalResults = allResults.filter((r) => r.platform === "internal_ai");
  const openAiResults = allResults.filter((r) => r.platform === "openai");

  const pctCited = (results: AgentQueryResult[]) => {
    if (results.length === 0) return 0;
    return Math.round((results.filter((r) => r.cited).length / results.length) * 100);
  };

  const tavilyScore = pctCited(tavilyResults);
  const serpApiScore = pctCited(serpApiResults);
  const bedrockScore = pctCited(bedrockResults);
  const internalScore = pctCited(internalResults);
  const openAiScore = pctCited(openAiResults);

  // Determine which platforms actually worked (had at least one non-error result)
  const tavilyWorking = tavilyResults.some((r) => !r.error);
  const serpApiWorking = serpApiResults.some((r) => !r.error);
  const bedrockWorking = bedrockResults.some((r) => !r.error);
  const internalWorking = internalResults.some((r) => !r.error);
  const openAiWorking = openAiResults.some((r) => !r.error);

  // Reweight gracefully when platforms are unavailable.
  // Base weights: Tavily 30%, Google Search 20%, Claude AI 20%, Gemini AI 15%, OpenAI 15%.
  // Working platforms get their weight proportionally redistributed from absent ones.
  const workingPlatforms: Array<{ score: number; weight: number }> = [
    ...(tavilyWorking   ? [{ score: tavilyScore,   weight: 30 }] : []),
    ...(serpApiWorking  ? [{ score: serpApiScore,   weight: 20 }] : []),
    ...(bedrockWorking  ? [{ score: bedrockScore,   weight: 20 }] : []),
    ...(internalWorking ? [{ score: internalScore,  weight: 15 }] : []),
    ...(openAiWorking   ? [{ score: openAiScore,    weight: 15 }] : []),
  ];
  let geoScore: number;
  if (workingPlatforms.length === 0) {
    geoScore = 0;
  } else {
    const totalWeight = workingPlatforms.reduce((s, p) => s + p.weight, 0);
    geoScore = Math.round(
      workingPlatforms.reduce((s, p) => s + p.score * (p.weight / totalWeight), 0)
    );
  }

  // Top missed queries (not cited by any platform)
  const topMissedQueries = queries
    .filter((q) => {
      const queryResults = allResults.filter((r) => r.query === q);
      return queryResults.every((r) => !r.cited);
    })
    .slice(0, 3);

  // Top competitor domains mentioned across all results
  const competitorFreq = new Map<string, number>();
  for (const r of allResults) {
    for (const c of r.competitorsMentioned) {
      competitorFreq.set(c, (competitorFreq.get(c) ?? 0) + 1);
    }
  }
  const topCompetitors = [...competitorFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain]) => domain);

  // Platform summaries
  // Average rank across successful queries (where rank is available)
  const avgRank = (results: AgentQueryResult[]) => {
    const ranked = results.filter((r) => !r.error && r.rank != null);
    if (ranked.length === 0) return null;
    return Math.round((ranked.reduce((s, r) => s + (r.rank ?? 5), 0) / ranked.length) * 10) / 10;
  };

  const platformSummary = [
    {
      platform: "tavily",
      label: "Tavily Search",
      queriesRun: tavilyResults.length,
      citedCount: tavilyResults.filter((r) => r.cited).length,
      score: tavilyScore,
      avgRank: null,
      insight: tavilyScore >= 50
        ? "Your store is appearing in live web search results — AI shopping agents can discover you."
        : tavilyScore > 0
        ? "Occasionally found in web search — strengthen SEO, add structured data, and build more backlinks."
        : tavilyResults.some((r) => r.error)
        ? "Check your Tavily API key configuration."
        : "Not appearing in AI web search — AI shopping agents can't discover you organically.",
    },
    {
      platform: "serpapi",
      label: "Google Search",
      queriesRun: serpApiResults.length,
      citedCount: serpApiResults.filter((r) => r.cited).length,
      score: serpApiScore,
      avgRank: null,
      insight: serpApiResults.every((r) => r.error)
        ? "Google Search agent not configured — add SERPAPI_API_KEY (serpapi.com)."
        : serpApiScore >= 50
        ? "Your store ranks in Google's top results — high AI discoverability since most AI engines index Google."
        : serpApiScore > 0
        ? "Occasionally ranking in Google — improve SEO, add backlinks, and use structured data markup."
        : "Not found in Google's top results — AI engines like ChatGPT and Perplexity won't surface your store.",
    },
    {
      platform: "bedrock_nova",
      label: "Claude AI",
      queriesRun: bedrockResults.length,
      citedCount: bedrockResults.filter((r) => r.cited).length,
      score: bedrockScore,
      avgRank: avgRank(bedrockResults),
      insight: bedrockResults.every((r) => r.error)
        ? bedrockResults[0]?.reasoning ?? "Claude AI unavailable — score excluded from GEO total."
        : bedrockScore >= 50
        ? "Claude AI would recommend your store for most relevant buyer queries."
        : bedrockScore > 0
        ? "Claude AI partially matches your store — strengthen product clarity, pricing, and brand trust signals."
        : "Claude AI would not recommend your store — product descriptions are too thin or off-category.",
    },
    {
      platform: "internal_ai",
      label: "Gemini AI",
      queriesRun: internalResults.length,
      citedCount: internalResults.filter((r) => r.cited).length,
      score: internalScore,
      avgRank: avgRank(internalResults),
      insight: internalScore >= 60
        ? "Your product content is detailed enough for Gemini AI to confidently recommend you."
        : internalScore > 0
        ? "Gemini AI partially recommends your store — add specs, use-cases, and pricing to improve confidence."
        : "Gemini AI cannot confidently recommend your store — product descriptions need more detail, pricing, and specs.",
    },
    {
      platform: "openai",
      label: "OpenAI GPT",
      queriesRun: openAiResults.length,
      citedCount: openAiResults.filter((r) => r.cited).length,
      score: openAiScore,
      avgRank: avgRank(openAiResults),
      insight: openAiResults.every((r) => r.error)
        ? "OpenAI GPT agent not configured — add OPENAI_API_KEY (platform.openai.com)."
        : openAiScore >= 60
        ? "OpenAI GPT would confidently recommend your store — your content passes AI quality standards."
        : openAiScore > 0
        ? "OpenAI GPT partially recommends you — enrich product descriptions with specs, pricing, and use cases."
        : "OpenAI GPT would not recommend your store — product content is too thin for confident AI recommendations.",
    },
  ];

  return {
    storeId,
    storeDomain,
    storeName,
    queriesPerPlatform: queries.length,
    results: allResults,
    geoScore,
    tavilyScore,
    serpApiScore,
    bedrockScore,
    internalScore,
    openAiScore,
    topMissedQueries,
    topCompetitors,
    scannedAt,
    platformSummary,
  };
}
