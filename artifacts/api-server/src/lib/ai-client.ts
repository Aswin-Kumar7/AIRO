/**
 * Multi-provider AI client with automatic fallback.
 * Order: Gemini (primary) → OpenRouter Gemma 4 31B → Groq (final)
 */
import { performance } from "perf_hooks";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

const _fallbackStats = { gemini: 0, openrouter: 0, groq: 0, failed: 0, total: 0 };

/** Returns a snapshot of AI provider usage since server start. */
export function getAiFallbackStats(): Record<string, number> {
  return { ..._fallbackStats };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

async function callGemini(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Merge system message into the first user message for Gemini
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userParts = messages
    .filter((m) => m.role !== "system")
    .map((m) => m.content)
    .join("\n\n");

  const fullPrompt = systemMsg ? `${systemMsg}\n\n${userParts}` : userParts;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  });

  return result.response.text();
}

/** Call OpenRouter with a specific model. */
async function callOpenRouter(model: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.FRONTEND_URL ?? "http://localhost:3000",
      "X-Title": "Kasparro AI Readiness",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status} ${res.statusText}: ${body}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content ?? "";
}

/**
 * Send a chat completion request, trying providers in order until one succeeds.
 * Returns the text content of the first successful response.
 */
export async function chatCompletion(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  const providers: Array<{ name: string; fn: () => Promise<string> }> = [
    {
      name: "gemini",
      fn: () => callGemini(messages, maxTokens),
    },
    {
      // OpenRouter — Gemma 4 31B (free)
      name: "openrouter",
      fn: () => callOpenRouter("google/gemma-4-31b-it:free", messages, maxTokens),
    },
    {
      // Groq — final fallback
      name: "groq",
      fn: () => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error("GROQ_API_KEY not set");
        return fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages, max_tokens: maxTokens }),
        }).then(async (res) => {
          if (!res.ok) { const b = await res.text().catch(() => ""); throw new Error(`Groq ${res.status}: ${b}`); }
          const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
          return json.choices?.[0]?.message?.content ?? "";
        });
      },
    },
  ];

  _fallbackStats.total++;
  let lastError: unknown;

  for (const provider of providers) {
    try {
      const t0 = performance.now();
      const text = await provider.fn();
      const ms = Math.round(performance.now() - t0);
      if (text) {
        _fallbackStats[provider.name as keyof typeof _fallbackStats]++;
        logger.info(
          { provider: provider.name, durationMs: ms, fallback: provider.name !== "gemini" },
          "AI provider responded",
        );
        return text;
      }
    } catch (err) {
      lastError = err;
      logger.warn({ err, provider: provider.name }, `AI provider ${provider.name} failed, trying next`);
    }
  }

  _fallbackStats.failed++;
  throw new Error(
    `All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

// ─── OpenAI direct client ─────────────────────────────────────────────────────

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Call OpenAI chat completions directly.
 * Used by GEO scan as an independent AI content-quality judge.
 * Throws on missing key or HTTP error — callers should handle gracefully.
 */
export async function callOpenAI(
  messages: ChatMessage[],
  maxTokens = 150,
  model = "gpt-4o-mini",
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.0,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("OpenAI API key invalid or expired — check OPENAI_API_KEY.");
    if (res.status === 429) throw new Error("OpenAI rate limit reached — reduce query frequency.");
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as OpenAIChatResponse;
  return json.choices?.[0]?.message?.content ?? "";
}
