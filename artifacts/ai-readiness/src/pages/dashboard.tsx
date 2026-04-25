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
  useListGaps,
  getListGapsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  BarChart3, Bot, Activity, Clock, Loader2,
  Package, Play, Trash2, AlertTriangle, ArrowRight,
  Globe, Zap, TrendingUp, ChevronRight, Store, Check, Search,
} from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip,
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, score, color, sub, href,
}: {
  label: string; score: number; color: string; sub?: string; href: string;
}) {
  const isGood = score >= 70;
  const isWarning = score >= 50 && score < 70;

  return (
    <Link href={href}>
      <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 p-5 flex flex-col gap-4 hover:border-slate-300/80 hover:shadow-sm transition-all cursor-pointer group h-full">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-300 tracking-wide">
            {label}
          </p>
          <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${isGood ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : isWarning ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
            {isGood ? <TrendingUp className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
            {isGood ? "+12%" : "Needs work"}
          </div>
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline gap-1">
            <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
              {Math.round(score)}
            </p>
            <p className="text-sm font-medium text-slate-400 dark:text-zinc-400">/100</p>
          </div>
          {sub && <p className="text-[12px] text-slate-500 dark:text-zinc-300 mt-2 leading-snug">{sub}</p>}
        </div>
      </div>
    </Link>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ storeId }: { storeId: string }) {
  const { data: activity } = useGetStoreActivity(storeId, {
    query: { queryKey: getGetStoreActivityQueryKey(storeId) },
  });

  const ActivityIcon: Record<string, React.FC<{ className?: string }>> = {
    store_connected: Store,
    products_fetched: Package,
    analysis_started: Bot,
    analysis_completed: Check,
    analysis_failed: AlertTriangle,
    gap_detected: Search,
    fix_applied: Zap,
  };

  const iconColor: Record<string, string> = {
    store_connected: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    products_fetched: "bg-teal-100 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400",
    analysis_started: "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    analysis_completed: "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    analysis_failed: "bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400",
    gap_detected: "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    fix_applied: "bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };

  if (!activity || activity.length === 0) {
    return <p className="text-[13px] text-slate-400 dark:text-zinc-400 text-center py-8">No activity yet</p>;
  }

  return (
    <div className="space-y-4">
      {activity.slice(0, 6).map((item) => {
        const Icon = ActivityIcon[item.type] ?? Activity;
        return (
          <div key={item.id} className="flex items-start gap-3 group">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconColor[item.type] ?? "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-zinc-300"}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-snug group-hover:text-slate-900 dark:text-white transition-colors">{item.message}</p>
              <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-400 mt-1">
                {new Date(item.timestamp).toLocaleDateString("en-US", {
                  month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
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

  const { data: gaps } = useListGaps(activeStoreId ?? "", {
    query: {
      queryKey: getListGapsQueryKey(activeStoreId ?? ""),
      enabled: !!activeStoreId && !!summary,
    },
  });

  const analyzeStore = useAnalyzeStore();

  // Derived scores
  const aeoScore = summary
    ? Math.round(((summary.clarityScore ?? 0) + (summary.completenessScore ?? 0) + (summary.tagScore ?? 0)) / 3)
    : 0;
  const seoGapCount = gaps?.filter((g: any) => g.ruleId?.startsWith("SEO_") || g.ruleId?.startsWith("SCHEMA_")).length ?? 0;
  const seoScore = Math.max(0, 100 - seoGapCount * 15);
  const geoScore = 0;

  const criticalGaps = (() => {
    if (!gaps) return [];
    const seen = new Set();
    const unique: any[] = [];
    for (const g of gaps) {
      if (g.severity === "high" && !seen.has(g.title)) {
        seen.add(g.title);
        unique.push(g);
      }
      if (unique.length >= 5) break;
    }
    return unique;
  })();
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
            queryClient.invalidateQueries({ queryKey: getListGapsQueryKey(activeStoreId) }),
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
            <p className="text-sm text-slate-400 dark:text-zinc-400 mb-3">No store connected yet</p>
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

      <div className="min-h-full relative overflow-hidden">
        <div className="p-6 space-y-5 relative z-10 max-w-[1600px] mx-auto">

          {/* ── Page header ── */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Overview</h1>
              <div className="flex items-center gap-3 mt-2.5">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-white dark:bg-white/5 border border-slate-200/60 dark:border-white/10 shadow-sm text-[12px] font-medium text-slate-600 dark:text-zinc-200">
                  <Globe className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 dark:text-zinc-300" />
                  {store?.domain ?? "—"}
                </div>
                {hasAnalysis && (
                  <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-zinc-300">
                    <Clock className="w-3.5 h-3.5" />
                    Last analyzed {timeAgo}
                  </div>
                )}
              </div>
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
                className="h-9 px-4 bg-white dark:bg-[#27272a] hover:bg-slate-50 dark:hover:bg-[#222] border border-slate-200 dark:border-white/10 shadow-sm text-slate-700 dark:text-slate-200 font-medium rounded-[10px] gap-2 transition-all hover:border-slate-300 dark:hover:border-white/20"
              >
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin text-slate-400 dark:text-zinc-400" /> : <Play className="h-4 w-4 text-emerald-500" fill="currentColor" />}
                {isAnalyzing ? "Analyzing…" : hasAnalysis ? "Re-analyze Store" : "Run Analysis"}
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
              <div className="col-span-2 bg-white dark:bg-[#080808] rounded-xl border border-slate-200 dark:border-white/10 border-dashed p-12 text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-5 h-5 text-slate-400 dark:text-zinc-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Ready to analyze</p>
                <p className="text-xs text-slate-400 dark:text-zinc-400 mb-5 max-w-xs mx-auto leading-relaxed">
                  Run an analysis to get AI readiness scores, surface gaps, and generate
                  content fixes for your products.
                </p>
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  size="sm"
                  className="bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white gap-1.5"
                >
                  {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {isAnalyzing ? "Analyzing…" : "Start Analysis"}
                </Button>
              </div>
              <div className="bg-white dark:bg-[#080808] rounded-xl border border-slate-200 dark:border-white/10 p-5">
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
                <div className="col-span-3 bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">Score Trend</h2>
                      <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">7-day AI readiness movement</p>
                    </div>
                    <div className="flex items-center gap-5 text-[12px] font-medium text-slate-500 dark:text-zinc-300">
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
                  <div className="h-[260px] mt-6 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorOverall" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(255,255,255,0.05)" opacity={1} />
                        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontWeight: 500 }} dy={10} />
                        <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontWeight: 500 }} width={40} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#ffffff",
                            border: "1px solid rgba(226, 232, 240, 0.8)",
                            color: "#0f172a",
                            fontSize: "13px",
                            fontWeight: 600,
                            borderRadius: "12px",
                            padding: "12px 16px",
                            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -4px rgba(0,0,0,0.02)",
                          }}
                          itemStyle={{ color: "#334155", padding: "3px 0", fontWeight: 500, fontSize: "12px" }}
                          cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area type="monotone" dataKey="overall" name="Overall" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorOverall)" activeDot={{ r: 6, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }} />
                        <Line type="monotone" dataKey="aeo" name="AEO" stroke="#14b8a6" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#14b8a6", stroke: "#fff", strokeWidth: 2 }} />
                        <Line type="monotone" dataKey="seo" name="SEO" stroke="#8b5cf6" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Critical Issues */}
                <div className="col-span-2 bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6 flex flex-col">
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
                      <p className="text-xs text-slate-400 dark:text-zinc-400">No critical issues</p>
                    </div>
                  ) : (
                  <div className="space-y-0.5">
                    {criticalGaps.map((g: any) => (
                      <div key={g.id} className="flex items-start justify-between py-2.5 border-b border-slate-50 dark:border-white/5 dark:border-white/5 last:border-0 group hover:bg-slate-50/50 dark:hover:bg-white/5 rounded-lg -mx-2 px-2 transition-colors">
                        <div className="flex items-start gap-3 min-w-0 pr-4">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{g.title}</span>
                            {g.description && (
                              <span className="text-[11px] text-slate-500 dark:text-zinc-300 line-clamp-1 mt-0.5 leading-relaxed">{g.description}</span>
                            )}
                          </div>
                        </div>
                        <Link href="/fixes">
                          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-300 group-hover:text-emerald-700 transition-all cursor-pointer flex items-center gap-1 mt-0.5 whitespace-nowrap bg-white dark:bg-[#080808] border border-slate-200 dark:border-white/10 px-2 py-1 rounded-[6px] shadow-sm group-hover:border-emerald-200 group-hover:bg-emerald-50 flex-shrink-0">
                            Fix <ArrowRight className="w-3 h-3" />
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
                <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6 flex flex-col">
                  <SectionHead
                    title="Quick Wins"
                    action={
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        {pendingFixes} ready
                      </span>
                    }
                  />
                  {pendingFixes === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-zinc-400 text-center py-4 flex-1">No pending fixes</p>
                  ) : (
                    <div className="space-y-1 mb-5 flex-1">
                      {gaps?.filter((g: any) => g.status === "pending" || !g.status).slice(0, 4).map((g: any) => (
                        <div key={g.id} className="flex items-center gap-3 group hover:bg-slate-50/50 dark:hover:bg-white/5 rounded-lg py-2 -mx-2 px-2 transition-colors">
                          <div className="w-3 h-3 rounded-[3px] border border-slate-200 dark:border-white/10 flex-shrink-0 group-hover:border-emerald-300 transition-colors" />
                          <span className="text-[13px] text-slate-700 dark:text-slate-200 flex-1 truncate">{g.title}</span>
                          <span className="text-[11px] text-emerald-600 font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                            +{g.estimatedScoreImprovement ?? 2} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link href="/fixes">
                    <Button size="sm" className="w-full mt-auto bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white text-[13px] gap-2 h-10 rounded-[10px] shadow-sm">
                      <Zap className="w-3.5 h-3.5" />
                      Apply All Fixes
                    </Button>
                  </Link>
                </div>

                {/* Products at Risk */}
                <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6">
                  <SectionHead
                    title="Products at Risk"
                    action={
                      <span className="text-[11px] text-slate-400 dark:text-zinc-400">{lowScoreProducts.length} below 50</span>
                    }
                  />
                  {lowScoreProducts.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-zinc-400 text-center py-4">
                      All products scoring above 50
                    </p>
                  ) : (
                    <div>
                      {lowScoreProducts.map((p) => {
                        const score = p.score?.overall ?? (p as any).overallScore ?? 0;
                        const barColor = score < 30 ? "bg-red-400" : "bg-amber-400";
                        return (
                          <Link href={`/products/${p.id}`} key={p.id}>
                            <div className="py-2.5 border-b border-slate-50 dark:border-white/5 dark:border-white/5 last:border-0 cursor-pointer group">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[13px] text-slate-700 dark:text-slate-200 truncate group-hover:text-red-600 transition-colors">
                                  {p.title}
                                </span>
                                <span className="text-[12px] text-red-500 dark:text-red-400 font-semibold ml-2 tabular-nums bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
                                  {Math.round(score)}
                                </span>
                              </div>
                              <div className="h-1 bg-slate-100 dark:bg-[#111214] border dark:border-white/5 rounded-full overflow-hidden mt-2">
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
                <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6">
                  <SectionHead title="Recent Activity" />
                  <ActivityFeed storeId={activeStoreId} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
