// csrf-service.ts
// Handles CSRF token fetching and caching for API requests

let csrfToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async (): Promise<string> => {
    const res = await fetch("/api/csrf-token", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to fetch CSRF token");
    const data = await res.json();
    if (!data.csrfToken || typeof data.csrfToken !== "string") throw new Error("No CSRF token in response");
    csrfToken = data.csrfToken;
    return data.csrfToken;
  })();
  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

export function clearCsrfToken() {
  csrfToken = null;
}
