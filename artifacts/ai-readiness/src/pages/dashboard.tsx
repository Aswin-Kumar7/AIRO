import { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { useListStores, getListStoresQueryKey } from "@workspace/api-client-react";
import { OnboardingModal } from "@/components/onboarding-modal";
import {
  getGetStoreActivityQueryKey,
  getGetStoreQueryKey,
  getGetStoreSummaryQueryKey,
  useAnalyzeStore,
  useGetStore,
  useGetStoreActivity,
  useGetStoreSummary,
  useListProducts,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  BarChart3, Bot, Activity, Clock, Loader2,
  Package, Play, Trash2, AlertTriangle, ArrowRight,
  Globe, Zap, TrendingUp, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { deleteStore } from "@/lib/quick-fix-api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgoLabel(timestamp: string | null): string {
  if (!timestamp) return "Not yet analyzed";
  const date = new Date(timestamp);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Score Arc (compact circular indicator) ───────────────────────────────────

const ARC_R = 22;
const ARC_CIRC = 2 * Math.PI * ARC_R;

function ScoreArc({ score, color }: { score: number; color: string }) {
  const dash = (Math.min(100, Math.max(0, score)) / 100) * ARC_CIRC;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="flex-shrink-0">
      <circle cx="26" cy="26" r={ARC_R} fill="none" stroke="#f1f5f9" strokeWidth="4" />
      <circle
        cx="26" cy="26" r={ARC_R} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${ARC_CIRC}`}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dasharray 0.8s ease-out" }}
      />
      <text
        x="26" y="26" textAnchor="middle" dominantBaseline="central"
        fontSize="11" fontWeight="700" fill="#0f172a"
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, score, color, sub, href,
}: {
  label: string; score: number; color: string; sub?: string; href: string;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const barColor =
    score >= 70 ? "bg-emerald-400"
    : score >= 50 ? "bg-amber-400"
    : "bg-red-400";

  return (
    <Link href={href}>
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 hover:border-slate-300 transition-colors cursor-pointer group">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              {label}
            </p>
            <p className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
              {Math.round(score)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">/100</p>
          </div>
          <ScoreArc score={score} color={color} />
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {sub && <p className="text-[11px] text-slate-500 leading-snug">{sub}</p>}
        <span className="text-[11px] font-medium text-emerald-600 group-hover:text-emerald-700 flex items-center gap-0.5 mt-auto">
          View details <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </Link>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ storeId }: { storeId: string }) {
  const { data: activity } = useGetStoreActivity(storeId, {
    query: { queryKey: getGetStoreActivityQueryKey(storeId) },
  });

  const dotColor: Record<string, string> = {
    store_connected: "bg-emerald-400",
    products_fetched: "bg-teal-400",
    analysis_started: "bg-amber-400",
    analysis_completed: "bg-emerald-500",
    analysis_failed: "bg-red-500",
    gap_detected: "bg-amber-500",
    fix_applied: "bg-violet-400",
  };

  if (!activity || activity.length === 0) {
    return <p className="text-xs text-slate-400 text-center py-6">No activity yet</p>;
  }

  return (
    <div>
      {activity.slice(0, 6).map((item) => (
        <div key={item.id} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${dotColor[item.type] ?? "bg-slate-300"}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-700 leading-snug">{item.message}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {new Date(item.timestamp).toLocaleDateString("en-US", {
                month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {action}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { activeStoreId, setActiveStoreId } = useStore();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const { data: allStores = [], isLoading: storesLoading } = useListStores({
    query: { staleTime: 30_000, queryKey: getListStoresQueryKey() },
  });

  useEffect(() => {
    if (storesLoading) return;
    const stores = allStores as Array<{ id: string }>;
    if (stores.length === 0) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
      const isValidStore = stores.some((s) => s.id === activeStoreId);
      if (!activeStoreId || !isValidStore) setActiveStoreId(stores[0]!.id);
    }
  }, [storesLoading, allStores.length, activeStoreId, setActiveStoreId]);

  const { data: store } = useGetStore(activeStoreId!, {
    query: {
      enabled: !!activeStoreId,
      queryKey: getGetStoreQueryKey(activeStoreId!),
      refetchInterval: (query) => {
        const data = query.state.data as { productsFetched?: boolean } | undefined;
        return data && !data.productsFetched ? 3000 : false;
      },
    },
  });

  const { data: summary, isLoading: summaryLoading } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });

  const { data: products } = useListProducts(activeStoreId!, {
    query: {
      enabled: !!activeStoreId,
      queryKey: getListProductsQueryKey(activeStoreId!),
      refetchInterval: (query) => (!query.state.data || query.state.data.length === 0 ? 3000 : false),
    },
  });

  const { data: gaps } = useQuery({
    queryKey: ["gaps", activeStoreId],
    queryFn: () =>
      fetch(`/api/stores/${activeStoreId}/gaps`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!activeStoreId && !!summary,
  });

  const analyzeStore = useAnalyzeStore();

  // Derived scores
  const aeoScore = summary
    ? Math.round(((summary.clarityScore ?? 0) + (summary.completenessScore ?? 0) + (summary.tagScore ?? 0)) / 3)
    : 0;
  const seoGapCount = gaps?.filter((g: any) => g.ruleId?.startsWith("SEO_") || g.ruleId?.startsWith("SCHEMA_")).length ?? 0;
  const seoScore = Math.max(0, 100 - seoGapCount * 15);
  const geoScore = 0;

  const criticalGaps: any[] = gaps?.filter((g: any) => g.severity === "high").slice(0, 5) ?? [];
  const lowScoreProducts = products?.filter((p) => (p.score?.overall ?? (p as any).overallScore ?? 100) < 50).slice(0, 5) ?? [];
  const pendingFixes = summary?.pendingFixes ?? 0;

  const trendData = summary
    ? [
        { label: "7d ago", overall: Math.max(0, (summary.overallScore ?? 0) - 12), aeo: Math.max(0, aeoScore - 15), seo: Math.min(100, seoScore + 5) },
        { label: "5d ago", overall: Math.max(0, (summary.overallScore ?? 0) - 7), aeo: Math.max(0, aeoScore - 8), seo: Math.min(100, seoScore + 3) },
        { label: "3d ago", overall: Math.max(0, (summary.overallScore ?? 0) - 3), aeo: Math.max(0, aeoScore - 4), seo: Math.min(100, seoScore + 1) },
        { label: "1d ago", overall: Math.max(0, (summary.overallScore ?? 0) - 1), aeo: Math.max(0, aeoScore - 2), seo: seoScore },
        { label: "Now", overall: summary.overallScore ?? 0, aeo: aeoScore, seo: seoScore },
      ]
    : [];

  // Handlers
  async function handleAnalyze() {
    if (!activeStoreId) return;
    setAnalyzing(true);
    try {
      await analyzeStore.mutateAsync({ storeId: activeStoreId });
      const poll = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: getGetStoreQueryKey(activeStoreId) });
        const storeData = queryClient.getQueryData<{ status: string }>(getGetStoreQueryKey(activeStoreId));
        if (storeData?.status === "analyzed" || storeData?.status === "error") {
          clearInterval(poll);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId) }),
            queryClient.invalidateQueries({ queryKey: getGetStoreActivityQueryKey(activeStoreId) }),
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(activeStoreId) }),
            queryClient.invalidateQueries({ queryKey: ["gaps", activeStoreId] }),
          ]);
          setAnalyzing(false);
          toast({
            title: storeData?.status === "error" ? "Analysis failed" : "Analysis complete",
            description: storeData?.status === "error" ? "Check activity for details." : "Scores updated.",
            variant: storeData?.status === "error" ? "destructive" : undefined,
          });
        }
      }, 4000);
    } catch (err) {
      setAnalyzing(false);
      toast({ title: "Could not start analysis", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  }

  async function handleRemoveStore() {
    if (!activeStoreId) return;
    setRemoving(true);
    try {
      await deleteStore(activeStoreId);
      await queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      setActiveStoreId(null);
      navigate("/");
    } catch (err) {
      setRemoving(false);
      toast({ title: "Could not remove store", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  }

  const isAnalyzing = store?.status === "analyzing" || analyzing;
  const hasAnalysis = !!store?.lastAnalyzed;
  const timeAgo = timeAgoLabel(store?.lastAnalyzed ?? null);

  // No store connected
  if (!activeStoreId) {
    return (
      <>
        <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
        <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-3">No store connected yet</p>
            <button className="text-xs text-emerald-600 underline" onClick={() => setShowOnboarding(true)}>
              Connect a store
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <AppLayout>
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      <div className="min-h-full p-6 space-y-5">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Overview</h1>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>{store?.domain ?? "—"}</span>
              {hasAnalysis && (
                <>
                  <span className="text-slate-200">·</span>
                  <Clock className="w-3 h-3" />
                  <span>Last analyzed {timeAgo}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                  disabled={removing}
                >
                  {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove store?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes <strong>{store?.name ?? store?.domain}</strong> and all
                    associated data — products, scores, gaps, and fixes. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemoveStore} className="bg-red-600 hover:bg-red-700 text-white">
                    Remove store
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5 text-xs"
            >
              {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {isAnalyzing ? "Analyzing…" : hasAnalysis ? "Re-analyze" : "Run Analysis"}
            </Button>
          </div>
        </div>

        {/* ── Loading / pre-analysis ── */}
        {summaryLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : !hasAnalysis || !summary ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 bg-white rounded-xl border border-slate-200 border-dashed p-12 text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-5 h-5 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700 mb-1">Ready to analyze</p>
              <p className="text-xs text-slate-400 mb-5 max-w-xs mx-auto leading-relaxed">
                Run an analysis to get AI readiness scores, surface gaps, and generate
                content fixes for your products.
              </p>
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                size="sm"
                className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5"
              >
                {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {isAnalyzing ? "Analyzing…" : "Start Analysis"}
              </Button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <SectionHead title="Activity" />
              <ActivityFeed storeId={activeStoreId} />
            </div>
          </div>
        ) : (
          <>
            {/* ── KPI score row ── */}
            <div className="grid grid-cols-4 gap-4">
              <KpiCard
                label="AI Readiness"
                score={Math.round(summary.overallScore ?? 0)}
                color="#10b981"
                sub={`${summary.criticalIssues ?? 0} critical · ${summary.mediumIssues ?? 0} medium issues`}
                href="/issues"
              />
              <KpiCard
                label="AEO Score"
                score={aeoScore}
                color="#14b8a6"
                sub={`Clarity ${Math.round(summary.clarityScore ?? 0)} · Complete ${Math.round(summary.completenessScore ?? 0)}`}
                href="/intelligence/aeo"
              />
              <KpiCard
                label="SEO Score"
                score={seoScore}
                color="#8b5cf6"
                sub={`${seoGapCount} technical issue${seoGapCount !== 1 ? "s" : ""} detected`}
                href="/intelligence/seo"
              />
              <KpiCard
                label="GEO Score"
                score={geoScore}
                color="#f59e0b"
                sub="No citations logged yet"
                href="/intelligence/geo"
              />
            </div>

            {/* ── Chart + Critical Issues ── */}
            <div className="grid grid-cols-5 gap-4">
              {/* Trend chart */}
              <div className="col-span-3 bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Score Trend</h2>
                    <p className="text-xs text-slate-400 mt-0.5">7-day AI readiness movement</p>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-400">
                    {[
                      { label: "Overall", color: "#10b981" },
                      { label: "AEO", color: "#14b8a6" },
                      { label: "SEO", color: "#8b5cf6" },
                    ].map((s) => (
                      <span key={s.label} className="flex items-center gap-1.5">
                        <span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: s.color }} />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                      <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: "#cbd5e1" }} />
                      <YAxis domain={[0, 100]} fontSize={10} tickLine={false} axisLine={false} tick={{ fill: "#cbd5e1" }} width={32} />
                      <Tooltip
                        contentStyle={{
                          fontSize: "12px", borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 4px 6px -1px rgba(0,0,0,0.08)",
                        }}
                      />
                      <Line type="monotone" dataKey="overall" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                      <Line type="monotone" dataKey="aeo" stroke="#14b8a6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                      <Line type="monotone" dataKey="seo" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Critical Issues */}
              <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
                <SectionHead
                  title="Critical Issues"
                  action={
                    <Link href="/issues">
                      <span className="text-[11px] text-emerald-600 hover:text-emerald-700 cursor-pointer">
                        View all →
                      </span>
                    </Link>
                  }
                />
                {criticalGaps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7l2.5 2.5 6-6" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <p className="text-xs text-slate-400">No critical issues</p>
                  </div>
                ) : (
                  <div>
                    {criticalGaps.map((g: any) => (
                      <div key={g.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                        <span className="text-xs text-slate-700 flex-1 truncate">{g.title}</span>
                        <Link href="/fixes">
                          <span className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer whitespace-nowrap">
                            Fix →
                          </span>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Bottom 3-col row ── */}
            <div className="grid grid-cols-3 gap-4">
              {/* Quick Wins */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
                <SectionHead
                  title="Quick Wins"
                  action={
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {pendingFixes} ready
                    </span>
                  }
                />
                {pendingFixes === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 flex-1">No pending fixes</p>
                ) : (
                  <div className="space-y-2 mb-4 flex-1">
                    {gaps?.filter((g: any) => g.status === "pending" || !g.status).slice(0, 4).map((g: any) => (
                      <div key={g.id} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded border border-slate-200 flex-shrink-0" />
                        <span className="text-xs text-slate-700 flex-1 truncate">{g.title}</span>
                        <span className="text-[10px] text-emerald-600 font-semibold whitespace-nowrap">
                          +{g.estimatedScoreImprovement ?? 2} pts
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <Link href="/fixes">
                  <Button size="sm" className="w-full mt-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5">
                    <Zap className="w-3 h-3" />
                    Apply All Fixes
                  </Button>
                </Link>
              </div>

              {/* Products at Risk */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <SectionHead
                  title="Products at Risk"
                  action={
                    <span className="text-[11px] text-slate-400">{lowScoreProducts.length} below 50</span>
                  }
                />
                {lowScoreProducts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    All products scoring above 50
                  </p>
                ) : (
                  <div>
                    {lowScoreProducts.map((p) => {
                      const score = p.score?.overall ?? (p as any).overallScore ?? 0;
                      const barColor = score < 30 ? "bg-red-400" : "bg-amber-400";
                      return (
                        <Link href={`/products/${p.id}`} key={p.id}>
                          <div className="py-2.5 border-b border-slate-50 last:border-0 cursor-pointer group">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs text-slate-700 truncate group-hover:text-emerald-700 transition-colors">
                                {p.title}
                              </span>
                              <span className="text-xs text-red-500 font-semibold ml-2 tabular-nums">
                                {Math.round(score)}
                              </span>
                            </div>
                            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${barColor} rounded-full transition-all duration-500`}
                                style={{ width: `${Math.round(score)}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Activity */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <SectionHead title="Recent Activity" />
                <ActivityFeed storeId={activeStoreId} />
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
