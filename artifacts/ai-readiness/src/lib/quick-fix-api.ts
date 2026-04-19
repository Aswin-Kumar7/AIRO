export function deleteStore(storeId: string): Promise<{ success: boolean }> {
  return requestJson(`/api/stores/${storeId}`, { method: "DELETE" });
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
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

export type FixType = "description" | "tags" | "title" | "structure" | "schema";

export interface QuickFix {
  id: string;
  storeId: string;
  productId: string | null;
  type: string;
  status: string;
  title: string;
  originalContent: string;
  improvedContent: string;
  explanation: string;
  estimatedScoreImprovement: number;
  shopifySynced: boolean;
  shopifyError: string | null;
  createdAt: string;
  appliedAt: string | null;
}

export interface ApplyResult {
  fixId: string;
  success: boolean;
  shopifySynced: boolean;
  shopifyError: string | null;
}

export function generateProductFix(
  storeId: string,
  productId: string,
  type: FixType,
): Promise<{ fix: QuickFix; generated: boolean }> {
  return requestJson(`/api/stores/${storeId}/products/${productId}/generate-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  });
}

export function applyFix(
  storeId: string,
  fixId: string,
  improvedContent?: string,
): Promise<ApplyResult> {
  return requestJson(`/api/stores/${storeId}/fixes/${fixId}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ improvedContent }),
  });
}
