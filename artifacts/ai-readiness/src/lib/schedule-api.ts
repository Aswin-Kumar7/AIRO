import { getCsrfToken } from "./csrf-service";

export interface ScheduleConfig {
  storeId: string;
  enabled: boolean;
  paused: boolean;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hourUtc: number;
  timezone: string;
  emailRecipients: string;
  emailOnlyOnChange: boolean;
  emailOnlyOnRegression: boolean;
  minDeltaToNotify: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  updatedAt: string | null;
}

export interface ScoreSnapshot {
  id: string;
  storeId: string;
  triggeredBy: "manual" | "scheduled";
  overallScore: number | null;
  clarityScore: number | null;
  completenessScore: number | null;
  trustScore: number | null;
  tagScore: number | null;
  consistencyScore: number | null;
  policyScore: number | null;
  totalProducts: number | null;
  criticalIssues: number | null;
  mediumIssues: number | null;
  lowIssues: number | null;
  error: string | null;
  emailSent: boolean;
  emailSkippedReason: string | null;
  createdAt: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (method !== "GET" && method !== "HEAD") {
    headers["x-csrf-token"] = await getCsrfToken();
    if (init?.body && typeof init.body === "string") {
      headers["content-type"] = "application/json";
    }
  }
  const res = await fetch(url, { credentials: "include", ...init, headers });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const d = (await res.json()) as { error?: string }; if (d.error) message = d.error; } catch { /* ignore */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function getSchedule(storeId: string): Promise<ScheduleConfig> {
  return request(`/api/stores/${storeId}/schedule`);
}

export function saveSchedule(storeId: string, config: Partial<Omit<ScheduleConfig, "storeId" | "nextRunAt" | "lastRunAt" | "updatedAt">>): Promise<ScheduleConfig> {
  return request(`/api/stores/${storeId}/schedule`, {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function toggleSchedule(storeId: string, enabled: boolean): Promise<ScheduleConfig> {
  return request(`/api/stores/${storeId}/schedule/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export function pauseSchedule(storeId: string, paused: boolean): Promise<ScheduleConfig> {
  return request(`/api/stores/${storeId}/schedule/pause`, {
    method: "PATCH",
    body: JSON.stringify({ paused }),
  });
}

export function getSnapshots(storeId: string, limit = 30): Promise<ScoreSnapshot[]> {
  return request(`/api/stores/${storeId}/snapshots?limit=${limit}`);
}

export function sendTestEmail(storeId: string): Promise<{ sent: boolean; error: string | null; recipients: string[] }> {
  return request(`/api/stores/${storeId}/schedule/test-email`, { method: "POST", body: JSON.stringify({}) });
}

export function getSnapshotExportUrl(storeId: string): string {
  return `/api/stores/${storeId}/snapshots/export.csv`;
}
