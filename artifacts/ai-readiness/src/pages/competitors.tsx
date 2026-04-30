import { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Plus, Trash2, BarChart3, TrendingUp,
  AlertCircle, CheckCircle2, Globe, Lightbulb, Search, Wifi,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorProductScore {
  title: string;
  overallScore: number;
  clarityScore: number;
  completenessScore: number;
  trustScore: number;
  tagScore: number;
  issueCount: number;
  category: string;
}

interface CompetitorResult {
  domain: string;
  storeName: string | null;
  productCount: number;
  avgOverall: number;
  avgClarity: number;
  avgCompleteness: number;
  avgTrust: number;
  avgTags: number;
  topProducts: CompetitorProductScore[];
  weakProducts: CompetitorProductScore[];
  fetchedAt: string;
  error?: string;
}

interface GapReport {
  yourStore: {
    overallScore: number;
    clarityScore: number;
    completenessScore: number;
    trustScore: number;
    tagScore: number;
  };
  competitors: CompetitorResult[];
  insights: string[];
}

// ─── Dimension config ─────────────────────────────────────────────────────────

const DIMS = [
  { key: "overall" as const, label: "Overall", color: "#10b981", yourKey: "overallScore" as const, compKey: "avgOverall" as const },
  { key: "clarity" as const, label: "Clarity", color: "#14b8a6", yourKey: "clarityScore" as const, compKey: "avgClarity" as const },
  { key: "completeness" as const, label: "Completeness", color: "#8b5cf6", yourKey: "completenessScore" as const, compKey: "avgCompleteness" as const },
  { key: "trust" as const, label: "Trust", color: "#f59e0b", yourKey: "trustScore" as const, compKey: "avgTrust" as const },
  { key: "tags" as const, label: "Tags", color: "#3b82f6", yourKey: "tagScore" as const, compKey: "avgTags" as const },
];

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, color, max = 100 }: { score: number; color: string; max?: number }) {
  const pct = Math.min(100, Math.max(0, (score / max) * 100));
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[12px] font-bold tabular-nums text-slate-700 dark:text-zinc-300 w-8 text-right">{score}</span>
    </div>
  );
}

// ─── Comparison row ───────────────────────────────────────────────────────────

function DimRow({
  label,
  color,
  yourScore,
  competitors,
}: {
  label: string;
  color: string;
  yourScore: number;
  competitors: { label: string; score: number }[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400 w-20 shrink-0">Your Store</span>
        <ScoreBar score={yourScore} color={color} />
      </div>
      {competitors.map((c) => {
        const delta = c.score - yourScore;
        return (
          <div key={c.label} className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 dark:text-zinc-500 w-20 shrink-0 truncate" title={c.label}>{c.label}</span>
            <ScoreBar score={c.score} color="#94a3b8" />
            <span className={`text-[10px] font-bold w-10 text-right shrink-0 ${delta > 0 ? "text-red-500" : delta < 0 ? "text-emerald-600" : "text-slate-400"}`}>
              {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "="}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CompetitorsPage() {
  const { activeStoreId } = useStore();
  const [domains, setDomains] = useState<string[]>(["", ""]);
  const [report, setReport] = useState<GapReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedComp, setExpandedComp] = useState<string | null>(null);
  const [geoSuggestions, setGeoSuggestions] = useState<string[]>([]);

  const storeId = activeStoreId;

  // On mount, check sessionStorage for GEO scan competitors and offer to pre-fill
  useEffect(() => {
    if (!activeStoreId) return;
    try {
      const cached = sessionStorage.getItem(`geo_report_${activeStoreId}`);
      if (cached) {
        const geoReport = JSON.parse(cached) as { topCompetitors?: string[] };
        const competitors = (geoReport.topCompetitors ?? []).filter(Boolean);
        if (competitors.length > 0) setGeoSuggestions(competitors);
      }
    } catch {
      // ignore
    }
  }, [activeStoreId]);

  function updateDomain(i: number, value: string) {
    setDomains((prev) => prev.map((d, idx) => (idx === i ? value : d)));
  }

  function addDomain() {
    if (domains.length < 5) setDomains((prev) => [...prev, ""]);
  }

  function removeDomain(i: number) {
    setDomains((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function runAnalysis() {
    const filled = domains.map((d) => d.trim()).filter(Boolean);
    if (!storeId || filled.length === 0) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/stores/${storeId}/competitors/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: filled }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as GapReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!storeId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-slate-500">Connect a store to use competitor analysis.</p>
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
            <BarChart3 className="w-5 h-5 text-emerald-600" />
            <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">
              Competitor Gap Analysis
            </h1>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-zinc-500">
            Enter competitor Shopify store domains. We'll score their public products and show you where you lead or lag.
          </p>
        </div>

        {/* GEO scan suggestions banner */}
        {geoSuggestions.length > 0 && (
          <div className="flex items-start gap-3 bg-teal-50/70 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-[12px] px-4 py-3">
            <Wifi className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-teal-800 dark:text-teal-300 mb-1">
                Competitors found in your GEO scan — these domains were cited when you weren't:
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {geoSuggestions.map((d) => (
                  <span key={d} className="text-[11px] bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-700 font-medium">
                    {d}
                  </span>
                ))}
              </div>
              <button
                onClick={() => {
                  const filled = geoSuggestions.slice(0, 5);
                  setDomains(filled.length < 5 ? [...filled, ""] : filled);
                  setGeoSuggestions([]);
                }}
                className="text-[11px] font-bold text-teal-700 dark:text-teal-400 hover:underline"
              >
                Use these domains →
              </button>
            </div>
            <button
              onClick={() => setGeoSuggestions([])}
              className="text-teal-400 hover:text-teal-600 text-[13px] font-bold shrink-0"
            >
              ×
            </button>
          </div>
        )}

        {/* Input form */}
        <Card className="border-slate-200 dark:border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-[14px] font-bold text-slate-800 dark:text-zinc-200">
              Competitor Domains
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {domains.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 h-10 px-3 rounded-[8px] border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus-within:ring-2 focus-within:ring-emerald-500/30">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={d}
                    onChange={(e) => updateDomain(i, e.target.value)}
                    placeholder={`e.g. competitor-store.myshopify.com`}
                    className="flex-1 text-[13px] bg-transparent outline-none text-slate-800 dark:text-zinc-200 placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                    onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
                  />
                </div>
                {domains.length > 1 && (
                  <button
                    onClick={() => removeDomain(i)}
                    className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              {domains.length < 5 ? (
                <button
                  onClick={addDomain}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add another
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">Max 5 competitors</span>
              )}

              <Button
                onClick={runAnalysis}
                disabled={loading || domains.every((d) => !d.trim())}
                className="h-9 px-5 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13px]"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing…</>
                ) : (
                  <><Search className="w-4 h-4 mr-2" /> Analyze</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-[8px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-[13px]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {report && (
          <>
            {/* Dimension comparison chart */}
            <Card className="border-slate-200 dark:border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-[14px] font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  Score Comparison by Dimension
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {DIMS.map((dim) => (
                  <DimRow
                    key={dim.key}
                    label={dim.label}
                    color={dim.color}
                    yourScore={report.yourStore[dim.yourKey]}
                    competitors={report.competitors
                      .filter((c) => !c.error && c.productCount > 0)
                      .map((c) => ({
                        label: c.storeName ?? c.domain,
                        score: c[dim.compKey],
                      }))}
                  />
                ))}
                <p className="text-[10px] text-slate-400 dark:text-zinc-600 pt-1">
                  Delta column: positive (red) = competitor leads you; negative (green) = you lead.
                </p>
              </CardContent>
            </Card>

            {/* Insights */}
            {report.insights.length > 0 && (
              <Card className="border-slate-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[14px] font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    AI Gap Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.insights.map((insight, i) => {
                    const isLead = insight.includes("leads") || insight.includes("above") || insight.includes("advantage") || insight.includes("competitive");
                    const isLag = insight.includes("trails") || insight.includes("priority") || insight.includes("closing");
                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 p-3 rounded-[8px] text-[13px] leading-relaxed ${
                          isLead
                            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300"
                            : isLag
                            ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
                            : "bg-slate-50 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300"
                        }`}
                      >
                        {isLead ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                        ) : isLag ? (
                          <TrendingUp className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                        )}
                        {insight}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Competitor cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.competitors.map((comp) => (
                <Card key={comp.domain} className="border-slate-200 dark:border-zinc-800">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-[14px] font-bold text-slate-900 dark:text-white truncate max-w-[180px]">
                          {comp.storeName ?? comp.domain}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{comp.domain}</p>
                      </div>
                      {comp.error ? (
                        <Badge className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-[10px] shrink-0">
                          Error
                        </Badge>
                      ) : (
                        <div className="text-center shrink-0">
                          <p className="text-[22px] font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">{comp.avgOverall}</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">overall</p>
                        </div>
                      )}
                    </div>

                    {comp.error ? (
                      <p className="text-[12px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-[6px]">{comp.error}</p>
                    ) : (
                      <>
                        <p className="text-[11px] text-slate-400 mb-2">{comp.productCount} public products scanned</p>
                        <div className="space-y-1.5">
                          {[
                            { label: "Clarity", score: comp.avgClarity, color: "#14b8a6" },
                            { label: "Completeness", score: comp.avgCompleteness, color: "#8b5cf6" },
                            { label: "Trust", score: comp.avgTrust, color: "#f59e0b" },
                            { label: "Tags", score: comp.avgTags, color: "#3b82f6" },
                          ].map((d) => (
                            <div key={d.label} className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 dark:text-zinc-500 w-20 shrink-0">{d.label}</span>
                              <ScoreBar score={d.score} color={d.color} />
                            </div>
                          ))}
                        </div>

                        {/* Top products toggle */}
                        {comp.topProducts.length > 0 && (
                          <button
                            onClick={() => setExpandedComp(expandedComp === comp.domain ? null : comp.domain)}
                            className="mt-3 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors flex items-center gap-1"
                          >
                            {expandedComp === comp.domain ? "Hide" : "Show"} top products
                          </button>
                        )}

                        {expandedComp === comp.domain && (
                          <div className="mt-2 space-y-1.5">
                            {comp.topProducts.slice(0, 3).map((p, i) => (
                              <div key={i} className="flex items-center justify-between text-[11px] p-1.5 rounded-[6px] bg-slate-50 dark:bg-zinc-900">
                                <span className="text-slate-700 dark:text-zinc-300 truncate mr-2 flex-1">{p.title}</span>
                                <span className="font-bold text-emerald-600 tabular-nums shrink-0">{p.overallScore}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
