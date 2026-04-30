/**
 * Shared HTTP client for all frontend API calls.
 *
 * Replaces the four copy-pasted `requestJson` helpers that existed in
 * quick-fix-api.ts, insights-api.ts, features-api.ts, and schedule-api.ts.
 * All of them had the same behavior: inject CSRF token for non-GET requests,
 * parse the JSON response, and throw on non-OK status.
 */

import { getCsrfToken } from "./csrf-service";

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const method = ((init?.method ?? "GET") as string).toUpperCase();
  const baseHeaders: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (method !== "GET" && method !== "HEAD") {
    baseHeaders["x-csrf-token"] = await getCsrfToken();
    if (!baseHeaders["Content-Type"] && init?.body) {
      baseHeaders["Content-Type"] = "application/json";
    }
  }

  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: baseHeaders,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch { /* ignore parse failure */ }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}
