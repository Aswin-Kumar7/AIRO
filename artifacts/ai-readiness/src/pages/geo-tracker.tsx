import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2, Globe, CheckCircle2, XCircle, Plus, Trash2,
  Info, TrendingUp, BarChart3, Search, Sparkles, ChevronDown,
} from "lucide-react";
import { getCsrfToken } from "@/lib/csrf-service";
import { useToast } from "@/hooks/use-toast";

// ─── API helpers ──────────────────────────────────────────────────────────────

interface VisibilityCheck {
  id: string;
  storeId: string;
  query: string;
  queryType: string;
  aiEngine: string | null;
  wasCited: boolean;
  citationUrl: string | null;
  notes: string | null;
  checkedAt: string;
}

interface VisibilitySummary {
  storeId: string;
  totalChecks: number;
  citedCount: number;
  citationRate: number | null;
  byEngine: Array<{
    engine: string;
    total: number;
    cited: number;
    citationRate: number;
  }>;
  message: string | null;
}

async function getVisibilityChecks(storeId: string): Promise<VisibilityCheck[]> {
  const res = await fetch(`/api/stores/${storeId}/visibility-checks`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch visibility checks");
  return res.json();
}

async function getVisibilitySummary(storeId: string): Promise<VisibilitySummary> {
  const res = await fetch(`/api/stores/${storeId}/visibility-summary`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch visibility summary");
  return res.json();
}

async function postVisibilityCheck(storeId: string, payload: {
  query: string;
  queryType?: string;
  aiEngine?: string;
  wasCited: boolean;
  citationUrl?: string;
  notes?: string;
}): Promise<VisibilityCheck> {
  const csrfToken = await getCsrfToken();
  const res = await fetch(`/api/stores/${storeId}/visibility-checks`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Engine config ─────────────────────────────────────────────────────────────

const AI_ENGINES = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "perplexity", label: "Perplexity" },
  { id: "gemini", label: "Gemini" },
  { id: "claude", label: "Claude" },
  { id: "copilot", label: "Copilot" },
  { id: "searchgpt", label: "SearchGPT" },
  { id: "other", label: "Other" },
];

const ENGINE_COLORS: Record<string, string> = {
  chatgpt: "#10a37f",
  perplexity: "#20b8cd",
  gemini: "#4285f4",
  claude: "#d97706",
  copilot: "#0078d4",
  searchgpt: "#1a73e8",
  other: "#64748b",
  unknown: "#94a3b8",
};

// ─── Citation rate gauge ───────────────────────────────────────────────────────

function CitationGauge({ rate }: { rate: number }) {
  const color = rate >= 50 ? "#10b981" : rate >= 25 ? "#f59e0b" : "#f43f5e";
  const label = rate >= 50 ? "Good" : rate >= 25 ? "Fair" : "Low";
  const labelColor = rate >= 50 ? "text-emerald-700 dark:text-emerald-400" : rate >= 25 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400";
  const circ = 2 * Math.PI * 44;
  const dash = (rate / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <circle cx="54" cy="54" r="44" fill="none" stroke="currentColor" className="text-slate-100 dark:text-white/5" strokeWidth="7" />
        <circle
          cx="54" cy="54" r="44"
          fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 54 54)"
          style={{ transition: "stroke-dasharray 0.9s ease-out" }}
        />
        <text x="54" y="52" textAnchor="middle" fontSize="24" fontWeight="800" fill="currentColor" className="text-slate-900 dark:text-white tracking-tight">{rate}%</text>
        <text x="54" y="68" textAnchor="middle" fontSize="11" fill="currentColor" className="text-slate-400 dark:text-zinc-400 font-medium">citation rate</text>
      </svg>
      <span className={`text-[12px] font-bold ${labelColor}`}>{label}</span>
    </div>
  );
}

// ─── Per-engine card ──────────────────────────────────────────────────────────

function EngineBar({ engine, total, cited, citationRate }: {
  engine: string;
  total: number;
  cited: number;
  citationRate: number;
}) {
  const color = ENGINE_COLORS[engine] ?? ENGINE_COLORS["unknown"];
  const label = AI_ENGINES.find((e) => e.id === engine)?.label ?? engine;
  return (
    <div className="flex items-center gap-4">
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 w-24 truncate">{label}</span>
      <div className="flex-1 h-2.5 bg-slate-100 dark:bg-[#111214] border dark:border-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${citationRate}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200 w-12 text-right">{citationRate}%</span>
      <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-400 w-16 text-right">{cited}/{total} cited</span>
    </div>
  );
}

// ─── Log check form ────────────────────────────────────────────────────────────

function LogCheckForm({
  storeId,
  onSuccess,
}: {
  storeId: string;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState("chatgpt");
  const [wasCited, setWasCited] = useState<boolean | null>(null);
  const [citationUrl, setCitationUrl] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      postVisibilityCheck(storeId, {
        query: query.trim(),
        aiEngine: engine,
        wasCited: wasCited ?? false,
        citationUrl: citationUrl.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Check logged", description: `Recorded as ${wasCited ? "cited ✓" : "not cited ✗"}` });
      setQuery("");
      setWasCited(null);
      setCitationUrl("");
      setNotes("");
      onSuccess();
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 shadow-md rounded-[16px] overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
        <h3 className="text-[14px] font-bold flex items-center gap-2 text-slate-900 dark:text-white">
          <Plus className="w-4 h-4 text-emerald-500" />
          Log a new citation check
        </h3>
      </div>
      <div className="p-6 space-y-5">
        <div>
          <label className="text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1.5 block">Query you searched</label>
          <Input
            placeholder="e.g. best ergonomic office chair under $500"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-[14px] h-10 rounded-[8px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1.5 block">AI Engine</label>
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="w-full text-[14px] border border-slate-200 dark:border-white/10 rounded-[8px] h-10 px-3 bg-white dark:bg-[#080808] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-shadow"
            >
              {AI_ENGINES.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1.5 block">Was your store cited?</label>
            <div className="flex gap-2 h-10">
              <button
                type="button"
                onClick={() => setWasCited(true)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-semibold border transition-all ${
                  wasCited === true
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30 ring-1 ring-emerald-200/50 dark:ring-emerald-500/20 shadow-sm"
                    : "bg-white dark:bg-[#080808] text-slate-600 dark:text-zinc-200 border-slate-200 dark:border-white/10 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-white/5"
                }`}
              >
                <CheckCircle2 className="w-4 h-4" /> Yes
              </button>
              <button
                type="button"
                onClick={() => setWasCited(false)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-semibold border transition-all ${
                  wasCited === false
                    ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-300 dark:border-red-500/30 ring-1 ring-red-200/50 dark:ring-red-500/20 shadow-sm"
                    : "bg-white dark:bg-[#080808] text-slate-600 dark:text-zinc-200 border-slate-200 dark:border-white/10 hover:border-red-300 hover:bg-slate-50 dark:hover:bg-white/5"
                }`}
              >
                <XCircle className="w-4 h-4" /> No
              </button>
            </div>
          </div>
        </div>

        {wasCited && (
          <div>
            <label className="text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1.5 block">Citation URL (optional)</label>
            <Input
              placeholder="https://..."
              value={citationUrl}
              onChange={(e) => setCitationUrl(e.target.value)}
              className="text-[14px] h-10 rounded-[8px]"
            />
          </div>
        )}

        <div>
          <label className="text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1.5 block">Notes (optional)</label>
          <Input
            placeholder="What context was shown? Which product was mentioned?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-[14px] h-10 rounded-[8px]"
          />
        </div>

        <div className="pt-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={!query.trim() || wasCited === null || mutation.isPending}
            className="w-full bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white gap-2 rounded-[10px] h-10 shadow-sm text-[13px] font-semibold"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 text-emerald-400" />}
            Log check
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Check history row ────────────────────────────────────────────────────────

function CheckRow({ check }: { check: VisibilityCheck }) {
  const engineLabel = AI_ENGINES.find((e) => e.id === check.aiEngine)?.label ?? check.aiEngine ?? "Unknown";
  const engineColor = ENGINE_COLORS[check.aiEngine ?? "unknown"] ?? ENGINE_COLORS["unknown"];
  const date = new Date(check.checkedAt);

  return (
    <div className="flex items-start gap-3 py-3 px-4 border-b border-slate-100 dark:border-white/5 last:border-0">
      {check.wasCited
        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate">"{check.query}"</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
            style={{ backgroundColor: engineColor }}
          >
            {engineLabel}
          </span>
          {check.wasCited
            ? <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Cited ✓</span>
            : <span className="text-[10px] text-red-400 dark:text-red-400 font-medium">Not cited</span>
          }
          {check.citationUrl && (
            <a
              href={check.citationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline truncate max-w-[180px]"
            >
              {check.citationUrl}
            </a>
          )}
        </div>
        {check.notes && <p className="text-[11px] text-slate-400 dark:text-zinc-400 mt-0.5">{check.notes}</p>}
      </div>
      <span className="text-[10px] text-slate-400 dark:text-zinc-400 flex-shrink-0 whitespace-nowrap">
        {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function GeoTrackerPage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["visibility-summary", activeStoreId],
    queryFn: () => getVisibilitySummary(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const { data: checks, isLoading: checksLoading } = useQuery({
    queryKey: ["visibility-checks", activeStoreId],
    queryFn: () => getVisibilityChecks(activeStoreId!),
    enabled: !!activeStoreId,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["visibility-summary", activeStoreId] });
    queryClient.invalidateQueries({ queryKey: ["visibility-checks", activeStoreId] });
  }

  if (!activeStoreId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
          <Globe className="w-10 h-10 text-slate-300" />
          <p className="text-slate-500 dark:text-zinc-300 text-sm">Connect a store to track GEO visibility</p>
          <Button size="sm" onClick={() => navigate("/connect")}>Connect store</Button>
        </div>
      </AppLayout>
    );
  }

  const isLoading = summaryLoading || checksLoading;

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-amber-500" />
              GEO Tracker
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-300 mt-0.5">
              Track how often AI engines cite your store in recommendations
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowForm((p) => !p)}
            className="gap-1.5 bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white rounded-[10px] h-9 px-4 shadow-sm flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {showForm ? "Cancel" : "Log check"}
          </Button>
        </div>

        {/* Info banner */}
        <div className="bg-amber-50/50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-[16px] p-5 flex gap-4 mb-8">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-[13px] text-amber-900 dark:text-amber-200 space-y-1.5 leading-relaxed">
            <p className="font-bold text-[14px]">What is GEO (Generative Engine Optimization)?</p>
            <p className="text-amber-800 dark:text-amber-300">GEO measures how often AI engines like ChatGPT, Perplexity, and Gemini cite or recommend your store when users ask relevant product questions. Log each check manually after testing queries in AI chatbots.</p>
          </div>
        </div>

        {/* Log form */}
        {showForm && activeStoreId && (
          <div className="mb-6">
            <LogCheckForm
              storeId={activeStoreId}
              onSuccess={() => {
                setShowForm(false);
                invalidate();
              }}
            />
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        )}

        {!isLoading && summary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 shadow-sm rounded-[16px] p-5 text-center col-span-2 md:col-span-1 flex flex-col items-center justify-center">
                {summary.citationRate !== null
                  ? <CitationGauge rate={summary.citationRate} />
                  : (
                    <div className="flex flex-col items-center gap-2">
                      <Globe className="w-8 h-8 text-slate-200" />
                      <p className="text-[10px] text-slate-400 dark:text-zinc-400">No data yet</p>
                    </div>
                  )
                }
              </div>
              {[
                { label: "Total checks", value: summary.totalChecks, color: "text-slate-900 dark:text-white" },
                { label: "Times cited", value: summary.citedCount, color: "text-emerald-600" },
                { label: "AI engines", value: summary.byEngine.length, color: "text-amber-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 shadow-sm rounded-[16px] p-5 text-center flex flex-col items-center justify-center">
                  <div className={`text-3xl font-bold tabular-nums tracking-tight leading-none ${color}`}>{value}</div>
                  <div className="text-[13px] font-medium text-slate-500 dark:text-zinc-300 mt-2">{label}</div>
                </div>
              ))}
            </div>

            {/* By engine */}
            {summary.byEngine.length > 0 && (
              <div className="mb-8 bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 shadow-sm rounded-[16px] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                  <h3 className="text-[13px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                    Citation rate by AI engine
                  </h3>
                </div>
                <div className="p-5 space-y-4">
                  {summary.byEngine
                    .sort((a, b) => b.citationRate - a.citationRate)
                    .map((e) => (
                      <EngineBar key={e.engine} {...e} />
                    ))}
                </div>
              </div>
            )}

            {/* How to improve */}
            {summary.totalChecks > 0 && summary.citationRate !== null && summary.citationRate < 50 && (
              <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 mb-6">
                <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> How to improve your citation rate
                </h4>
                <ul className="space-y-1.5">
                  {[
                    "Fix AEO Score issues — clarity and completeness drive AI recommendations",
                    "Add an llms.txt file to help AI crawlers understand your catalog",
                    "Generate FAQ schema so AI can cite your policies directly",
                    "Improve structured data (JSON-LD) so products appear in rich results",
                    "Add more specific product tags so AI can match to relevant queries",
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-zinc-200">
                      <span className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Empty state */}
            {summary.totalChecks === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-sm font-semibold text-slate-600 dark:text-zinc-200 mb-1">No checks logged yet</p>
                <p className="text-xs text-slate-400 dark:text-zinc-400 mb-4 max-w-xs">
                  Search for your products in ChatGPT, Perplexity, or Gemini, then log whether your store was cited.
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowForm(true)}
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-3.5 h-3.5" /> Log your first check
                </Button>
              </div>
            )}

            {/* History */}
            {(checks ?? []).length > 0 && (
              <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 shadow-sm rounded-[16px] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                  <h3 className="text-[13px] font-bold text-slate-900 dark:text-white">Check history</h3>
                  <Badge variant="secondary" className="ml-auto text-[10px] font-semibold bg-white dark:bg-[#111214] shadow-sm">
                    {checks?.length} entries
                  </Badge>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-white/5">
                  {(checks ?? []).map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
