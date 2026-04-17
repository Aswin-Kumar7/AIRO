/**
 * Multi-provider AI client with automatic fallback.
 * Order: Gemini (primary) → Groq → Cerebras
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

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

/** Call an OpenAI-compatible chat completions endpoint via raw fetch. */
async function callOpenAICompatible(
  baseURL: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
): Promise<string> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content ?? "";
}

async function callGroq(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  return callOpenAICompatible(
    "https://api.groq.com/openai/v1",
    apiKey,
    "llama-3.3-70b-versatile",
    messages,
    maxTokens,
  );
}

async function callCerebras(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error("CEREBRAS_API_KEY not set");

  return callOpenAICompatible(
    "https://api.cerebras.ai/v1",
    apiKey,
    "llama-3.3-70b",
    messages,
    maxTokens,
  );
}

/**
 * Send a chat completion request, trying providers in order until one succeeds.
 * Returns the text content of the first successful response.
 */
export async function chatCompletion(messages: ChatMessage[], maxTokens = 2000): Promise<string> {
  const providers: Array<{ name: string; fn: () => Promise<string> }> = [
    { name: "gemini", fn: () => callGemini(messages, maxTokens) },
    { name: "groq", fn: () => callGroq(messages, maxTokens) },
    { name: "cerebras", fn: () => callCerebras(messages, maxTokens) },
  ];

  let lastError: unknown;
  for (const provider of providers) {
    try {
      const text = await provider.fn();
      if (text) {
        if (provider.name !== "gemini") {
          logger.info({ provider: provider.name }, "Used fallback AI provider");
        }
        return text;
      }
    } catch (err) {
      lastError = err;
      logger.warn({ err, provider: provider.name }, `AI provider ${provider.name} failed, trying next`);
    }
  }

  throw new Error(
    `All AI providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
