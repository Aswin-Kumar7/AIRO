import { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { getCsrfToken } from "@/lib/csrf-service";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, CheckCircle2, XCircle, AlertCircle,
  Zap, TrendingDown, Search, BarChart3,
  ChevronDown, ChevronUp, Sparkles, Radio,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentQueryResult {
  platform: string;
  platformLabel: string;
  query: string;
  cited: boolean;
  rank?: number;
  citationUrl: string | null;
  citedSnippet: string | null;
  competitorsMentioned: string[];
  reasoning: string;
  latencyMs: number;
  error?: string;
}

interface PlatformSummary {
  platform: string;
  label: string;
  queriesRun: number;
  citedCount: number;
  score: number;
  avgRank?: number | null;
  insight: string;
}

interface GeoScanReport {
  storeId: string;
  storeDomain: string;
  storeName: string;
  queriesPerPlatform: number;
  results: AgentQueryResult[];
  geoScore: number;
  tavilyScore: number;
  serpApiScore: number;
  bedrockScore: number;
  internalScore: number;
  openAiScore: number;
  topMissedQueries: string[];
  topCompetitors: string[];
  scannedAt: string;
  platformSummary: PlatformSummary[];
}

// ─── Platform config ──────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<string, { color: string; bg: string; border: string; logo: string; displayName: string }> = {
  tavily:       { color: "#20B2AA", bg: "bg-teal-50 dark:bg-teal-900/20",     border: "border-teal-200 dark:border-teal-800",     logo: "🔍", displayName: "Tavily Search" },
  serpapi:      { color: "#4285F4", bg: "bg-blue-50 dark:bg-blue-900/20",     border: "border-blue-200 dark:border-blue-800",     logo: "🌐", displayName: "Google Search" },
  bedrock_nova: { color: "#8B5CF6", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-200 dark:border-violet-800", logo: "✦", displayName: "Claude AI" },
  internal_ai:  { color: "#0EA5E9", bg: "bg-sky-50 dark:bg-sky-900/20",       border: "border-sky-200 dark:border-sky-800",       logo: "◆", displayName: "Gemini AI" },
  openai:       { color: "#10A37F", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-800", logo: "⬡", displayName: "OpenAI GPT" },
};

// ─── Score arc ────────────────────────────────────────────────────────────────

function ScoreArc({ score, color, size = 80 }: { score: number; color: string; size?: number }) {
  const sw = 7;
  const r = (size - sw * 2) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} className="dark:stroke-zinc-800" />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease-out" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-extrabold tabular-nums text-slate-900 dark:text-white leading-none">{score}</span>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">/ 100</span>
      </div>
    </div>
  );
}

// ─── Query result row ─────────────────────────────────────────────────────────

function QueryRow({ result }: { result: AgentQueryResult }) {
  const [open, setOpen] = useState(false);
  const cfg = PLATFORM_CONFIG[result.platform] ?? PLATFORM_CONFIG["internal_ai"]!;
  return (
    <div className={`rounded-[8px] border ${result.cited ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-slate-200 dark:border-zinc-800"} overflow-hidden`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="text-[13px]">{cfg.logo}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cfg.bg}`} style={{ color: cfg.color }}>
          {result.platformLabel.split(" ")[0]}
        </span>
        <span className="text-[12px] text-slate-700 dark:text-zinc-300 flex-1 truncate">
          "{result.query}"
        </span>
        {result.rank != null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${result.rank >= 7 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : result.rank >= 4 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
            {result.rank}/10
          </span>
        )}
        <span className="shrink-0">
          {result.cited
            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            : result.error
            ? <AlertCircle className="w-4 h-4 text-slate-400" />
            : <XCircle className="w-4 h-4 text-red-400" />}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-slate-100 dark:border-zinc-800 pt-2">
          <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">{result.reasoning}</p>
          {result.citedSnippet && (
            <p className="text-[11px] italic text-slate-500 dark:text-zinc-500 bg-slate-50 dark:bg-zinc-900 p-2 rounded-[6px]">
              "{result.citedSnippet.slice(0, 180)}"
            </p>
          )}
          {result.citationUrl && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              <span className="font-bold">Cited URL: </span>
              <a href={result.citationUrl} target="_blank" rel="noreferrer" className="underline break-all">
                {result.citationUrl.slice(0, 80)}
              </a>
            </p>
          )}
          {result.competitorsMentioned.length > 0 && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              <span className="font-bold">Competitors cited instead: </span>
              {result.competitorsMentioned.join(", ")}
            </p>
          )}
          {result.latencyMs > 0 && (
            <p className="text-[10px] text-slate-400">{result.latencyMs}ms</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const GEO_CACHE_KEY = (storeId: string) => `geo_report_${storeId}`;

export default function GeoTrackerPage() {
  const { activeStoreId } = useStore();
  const [scanning, setScanning] = useState(false);
  const [report, setReport] = useState<GeoScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  // Restore cached report from sessionStorage on mount / store change
  useEffect(() => {
    if (!activeStoreId) return;
    try {
      const cached = sessionStorage.getItem(GEO_CACHE_KEY(activeStoreId));
      if (cached) {
        setReport(JSON.parse(cached) as GeoScanReport);
      } else {
        setReport(null);
      }
    } catch {
      setReport(null);
    }
    setSelectedPlatform(null);
  }, [activeStoreId]);

  function persistReport(data: GeoScanReport) {
    setReport(data);
    if (activeStoreId) {
      try {
        sessionStorage.setItem(GEO_CACHE_KEY(activeStoreId), JSON.stringify(data));
      } catch {
        // sessionStorage may be unavailable in some browser configs — fail silently
      }
    }
  }

  async function runScan() {
    if (!activeStoreId) return;
    setScanning(true);
    setError(null);
    setReport(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(`/api/stores/${activeStoreId}/geo/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as GeoScanReport;
      persistReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  const filteredResults = report?.results.filter((r) =>
    selectedPlatform ? r.platform === selectedPlatform : true
  ) ?? [];

  const geoColor = (score: number) =>
    score >= 60 ? "#10b981" : score >= 35 ? "#f59e0b" : "#ef4444";

  if (!activeStoreId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-slate-500">Connect a store to run AI visibility scans.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-5 h-5 text-emerald-600" />
            <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">
              Real AI Visibility Scanner
            </h1>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-bold px-2">
              LIVE
            </Badge>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-zinc-500">
            Runs buyer queries across 5 real AI platforms and checks whether your store is cited. Not simulated — real API calls.
          </p>
        </div>

        {/* Platform legend */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: "tavily",       label: "Tavily Search",    desc: "Live web search & citations",      logo: "🔍", color: "#20B2AA" },
            { key: "serpapi",      label: "Google Search",    desc: "Google organic results via SerpAPI", logo: "🌐", color: "#4285F4" },
            { key: "bedrock_nova", label: "Claude AI",         desc: "Brand & purchase intent scoring",   logo: "✦",  color: "#8B5CF6" },
            { key: "internal_ai",  label: "Gemini AI",         desc: "Product content quality scoring",   logo: "◆",  color: "#0EA5E9" },
            { key: "openai",       label: "OpenAI GPT",        desc: "GPT-4o-mini content quality judge", logo: "⬡",  color: "#10A37F" },
          ].map((p) => (
            <div key={p.key} className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
              <span className="text-[12px]">{p.logo}</span>
              <div>
                <p className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">{p.label}</p>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        {!report && (
          <Card className="border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10">
            <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Zap className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-[18px] font-extrabold text-slate-900 dark:text-white mb-1">
                  Test your store across 5 AI agents now
                </h2>
                <p className="text-[13px] text-slate-500 dark:text-zinc-500 max-w-md">
                  We'll generate buyer queries from your product catalog and run them through Tavily, Google Search, Claude AI, Gemini AI, and OpenAI GPT — showing exactly where you're visible and where competitors win.
                </p>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              <Button
                onClick={runScan}
                disabled={scanning}
                className="h-11 px-8 rounded-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[14px] gap-2"
              >
                {scanning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Scanning across 5 AI agents…</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Run Live AI Visibility Scan</>
                )}
              </Button>
              {scanning && (
                <p className="text-[11px] text-slate-400 animate-pulse">
                  Querying Tavily, Google Search, Claude AI, Gemini AI, and OpenAI GPT in parallel… this takes ~25–40 seconds
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {report && (
          <>
            {/* Cached result notice */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-zinc-800 rounded-[10px] px-4 py-2.5 text-[12px] text-slate-500 dark:text-zinc-400">
              <span>
                Results from <span className="font-semibold text-slate-700 dark:text-zinc-200">{new Date(report.scannedAt).toLocaleString()}</span>
                {" "}— navigation won't clear these results.
              </span>
              <button
                onClick={() => {
                  if (activeStoreId) {
                    try { sessionStorage.removeItem(GEO_CACHE_KEY(activeStoreId)); } catch {}
                  }
                  setReport(null);
                  setError(null);
                }}
                className="text-[11px] font-bold text-red-500 hover:text-red-700 dark:text-red-400 hover:underline ml-4"
              >
                Clear results
              </button>
            </div>

            {/* GEO Score hero */}
            <Card className="border-slate-200 dark:border-zinc-800 overflow-hidden">
              <div className="p-6">
                <div className="flex items-start gap-6 flex-wrap">
                  <div className="flex flex-col items-center gap-1">
                    <ScoreArc score={report.geoScore} color={geoColor(report.geoScore)} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">GEO Score</span>
                  </div>

                  <div className="flex-1 min-w-0 space-y-3">
                    <div>
                      <h2 className="text-[20px] font-extrabold text-slate-900 dark:text-white leading-tight">
                        {report.geoScore >= 60
                          ? "Strong AI Visibility"
                          : report.geoScore >= 35
                          ? "Moderate AI Visibility"
                          : "Low AI Visibility"}
                      </h2>
                      <p className="text-[13px] text-slate-500 dark:text-zinc-500 mt-0.5">
                        {report.queriesPerPlatform} buyer queries × 5 platforms — scanned {new Date(report.scannedAt).toLocaleTimeString()}
                      </p>
                    </div>

                    {/* Per-platform bars */}
                    <div className="space-y-2">
                      {report.platformSummary.map((p) => {
                        const cfg = PLATFORM_CONFIG[p.platform] ?? PLATFORM_CONFIG["internal_ai"]!;
                        return (
                          <div key={p.platform} className="flex items-center gap-3">
                            <span className="text-[11px] text-slate-500 dark:text-zinc-500 w-32 shrink-0">{p.label.split(" (")[0]}</span>
                            <div className="flex-1 h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${p.score}%`, backgroundColor: cfg.color }}
                              />
                            </div>
                            <span className="text-[12px] font-bold tabular-nums w-8 text-right" style={{ color: cfg.color }}>{p.score}</span>
                            <span className="text-[10px] text-slate-400">({p.citedCount}/{p.queriesRun})</span>
                            {p.avgRank != null && (
                              <span className="text-[10px] text-slate-400 shrink-0">avg {p.avgRank}/10</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Insights row */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {report.platformSummary.map((p) => {
                    const cfg = PLATFORM_CONFIG[p.platform] ?? PLATFORM_CONFIG["internal_ai"]!;
                    return (
                      <div key={p.platform} className={`p-3 rounded-[8px] ${cfg.bg} ${cfg.border} border`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: cfg.color }}>
                          {p.label}
                        </p>
                        <p className="text-[11px] text-slate-700 dark:text-zinc-300 leading-relaxed">{p.insight}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Button
                    onClick={() => {
                      if (activeStoreId) {
                        try { sessionStorage.removeItem(GEO_CACHE_KEY(activeStoreId)); } catch {}
                      }
                      void runScan();
                    }}
                    disabled={scanning}
                    variant="outline"
                    className="h-8 px-4 text-[12px] font-bold rounded-[8px]"
                  >
                    {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Search className="w-3.5 h-3.5 mr-1.5" />Re-scan</>}
                  </Button>
                  {report.topCompetitors.length > 0 && (
                    <p className="text-[12px] text-slate-500 dark:text-zinc-500">
                      Competitors beating you: <span className="font-bold text-red-500">{report.topCompetitors.join(", ")}</span>
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Missed queries */}
            {report.topMissedQueries.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <TrendingDown className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] font-bold text-slate-800 dark:text-zinc-200 mb-1.5">
                        Invisible to all 5 agents for these queries — your biggest opportunity:
                      </p>
                      <div className="space-y-1">
                        {report.topMissedQueries.map((q, i) => (
                          <div key={i} className="flex items-center gap-2 text-[12px] text-amber-800 dark:text-amber-300">
                            <span className="font-bold text-amber-500">{i + 1}.</span>
                            <span>"{q}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Query-level results */}
            <Card className="border-slate-200 dark:border-zinc-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-[14px] font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-600" />
                    Query Results by Agent
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {[null, "tavily", "serpapi", "bedrock_nova", "internal_ai", "openai"].map((p) => (
                      <button
                        key={p ?? "all"}
                        onClick={() => setSelectedPlatform(p)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${selectedPlatform === p ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:bg-slate-200"}`}
                      >
                        {p === null ? "All" : (PLATFORM_CONFIG[p]?.logo ?? "?") + " " + (PLATFORM_CONFIG[p]?.displayName ?? p)}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {filteredResults.map((result, i) => (
                  <QueryRow key={i} result={result} />
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
