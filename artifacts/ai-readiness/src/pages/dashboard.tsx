import { useState, useEffect, useRef } from "react";
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
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Bot, Activity, Clock, Loader2,
  Package, Play, Trash2, AlertTriangle, ArrowRight,
  Globe, Zap, TrendingUp, Store, Check, Search, Wifi, Sparkles,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { deleteStore } from "@/lib/quick-fix-api";
import { getSnapshots, type ScoreSnapshot } from "@/lib/schedule-api";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The generated Store schema omits backend-only fields that the /stores/:id route
 * does return. Extend here to avoid unsafe `any` casts (4.18 pattern: explicit extension
 * beats silent cast).
 */
type StoreWithMeta = { productsFetched?: boolean; [k: string]: unknown };

/**
 * The generated Gap schema doesn't include backend-only fields like ruleId and
 * impactScore, but the /gaps route DOES return them (see analysis.ts GET /gaps, line ~248).
 * This interface covers both the generated fields and the extra backend-only fields.
 *
 * 4.18: If the backend ever stops returning ruleId/impactScore, seoGaps would silently
 * become empty and seoScore would jump to 100. The `store?.lastAnalyzed` guard below
 * prevents the 100-on-unanalyzed false-positive, but a backend regression would still
 * produce a misleading score. The TODO is to add ruleId/impactScore to the OpenAPI spec.
 */
interface GapWithMeta {
  id: string;
  title: string;
  description?: string;
  severity?: string;
  category?: string;
  isFixed?: boolean;
  /** Populated by GET /gaps — must remain in the route's serialization. */
  ruleId?: string | null;
  /** Populated by GET /gaps — must remain in the route's serialization. */
  impactScore?: number | null;
}

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
  label, score, color: _color, sub, href, unscanned, delta,
}: {
  label: string; score: number; color: string; sub?: string; href: string; unscanned?: boolean; delta?: number | null;
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
          <div className="flex items-center gap-1.5">
            {delta !== null && delta !== undefined && (
              <span className={`text-[10px] font-bold tabular-nums ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-red-500 dark:text-red-400" : "text-slate-400"}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
            {unscanned ? (
              <div className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500">
                Not scanned
              </div>
            ) : (
              <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${isGood ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : isWarning ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
                {isGood ? <TrendingUp className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                {isGood ? "Good" : isWarning ? "Moderate" : "Needs work"}
              </div>
            )}
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
  // Stable ref to the poll interval so we can clear it on unmount or completion
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Snapshots (trend chart + deltas) ─────────────────────────────────────────
  const { data: snapshots = [] } = useQuery<ScoreSnapshot[]>({
    queryKey: ["snapshots", activeStoreId],
    queryFn: () => getSnapshots(activeStoreId!, 10),
    enabled: !!activeStoreId,
    staleTime: 60_000,
  });

  // ── GEO visibility summary ────────────────────────────────────────────────────
  const { data: geoSummary } = useQuery<{ lastGeoScore: number | null } | null>({
    queryKey: ["visibility-summary", activeStoreId],
    queryFn: () =>
      fetch(`/api/stores/${activeStoreId}/visibility-summary`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    enabled: !!activeStoreId,
    staleTime: 5 * 60_000,
  });

  // ── AI Perception summary ─────────────────────────────────────────────────────
  const { data: perceptionSummary } = useQuery<{
    agentNarrative: string;
    unansweredQuestions: string[];
    ambiguities: string[];
  } | null>({
    queryKey: ["perception", activeStoreId],
    queryFn: () =>
      fetch(`/api/stores/${activeStoreId}/perception`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    enabled: !!activeStoreId,
    staleTime: 5 * 60_000,
    select: (d) =>
      d?.agentNarrative
        ? { agentNarrative: d.agentNarrative, unansweredQuestions: d.unansweredQuestions ?? [], ambiguities: d.ambiguities ?? [] }
        : null,
  });

  // ── Listing readiness ─────────────────────────────────────────────────────────
  const { data: listingReadiness } = useQuery<{
    overallScore: number;
    grade: string;
    topRecommendations: string[];
  } | null>({
    queryKey: ["listing-readiness", activeStoreId],
    queryFn: () =>
      fetch(`/api/stores/${activeStoreId}/listing-readiness`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    enabled: !!activeStoreId,
    staleTime: 5 * 60_000,
    select: (d) =>
      d && typeof d.overallScore === "number"
        ? { overallScore: d.overallScore, grade: d.grade, topRecommendations: d.topRecommendations ?? [] }
        : null,
  });

  // Clean up poll interval if the component unmounts while analysis is running
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
        const data = query.state.data as { productsFetched?: boolean; status?: string } | undefined;
        // Poll while products haven't loaded yet OR while an analysis job is running
        if (!data?.productsFetched) return 3000;
        if (data.status === "analyzing") return 4000;
        return false;
      },
    },
  });

  // When the store transitions out of "analyzing" state, finalise the analysis flow.
  // This replaces the manual setInterval in handleAnalyze — no race condition, no leak.
  useEffect(() => {
    if (!analyzing) return;
    if (store?.status !== "analyzed" && store?.status !== "error") return;

    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setAnalyzing(false);

    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId!) }),
      queryClient.invalidateQueries({ queryKey: getGetStoreActivityQueryKey(activeStoreId!) }),
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(activeStoreId!) }),
      queryClient.invalidateQueries({ queryKey: getListGapsQueryKey(activeStoreId!) }),
      queryClient.invalidateQueries({ queryKey: ["snapshots", activeStoreId] }),
      queryClient.invalidateQueries({ queryKey: ["perception", activeStoreId] }),
      queryClient.invalidateQueries({ queryKey: ["listing-readiness", activeStoreId] }),
    ]);

    toast({
      title: store.status === "error" ? "Analysis failed" : "Analysis complete",
      description: store.status === "error" ? "Check activity for details." : "Scores updated.",
      variant: store.status === "error" ? "destructive" : undefined,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.status, analyzing]);

  const { data: summary, isLoading: summaryLoading } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });

  const { data: products } = useListProducts(activeStoreId!, {
    query: {
      enabled: !!activeStoreId,
      queryKey: getListProductsQueryKey(activeStoreId!),
      // Only poll while the store hasn't yet fetched products from Shopify.
      // Once productsFetched is true (even if product count is 0), stop — otherwise
      // a store with a genuinely empty catalog would poll forever (4.8).
      refetchInterval: (query) => {
        if ((store as unknown as StoreWithMeta)?.productsFetched) return false;
        return !query.state.data || query.state.data.length === 0 ? 3000 : false;
      },
    },
  });

  const { data: gaps, isLoading: gapsLoading } = useListGaps(activeStoreId ?? "", {
    query: {
      queryKey: getListGapsQueryKey(activeStoreId ?? ""),
      enabled: !!activeStoreId && !!summary,
    },
  });

  const analyzeStore = useAnalyzeStore();

  // Derived scores
  // AEO = average of the three AI-content dimensions (Clarity + Completeness + Tags)
  const aeoScore = summary
    ? Math.round(((summary.clarityScore ?? 0) + (summary.completenessScore ?? 0) + (summary.tagScore ?? 0)) / 3)
    : 0;
  // SEO = 100 minus weighted impact of detected SEO/Schema gaps.
  // Each gap deducts (impactScore / 10) points — a high-impact (90pt) gap costs 9pts, a low one ~3pts.
  // Guard: only compute after an analysis has run — an empty gaps array on an unanalyzed
  // store would otherwise produce a misleading "SEO Score 100".
  const seoGaps = (gaps as GapWithMeta[] | undefined)?.filter(
    (g) => g.ruleId?.startsWith("SEO_") || g.ruleId?.startsWith("SCHEMA_"),
  ) ?? [];
  const seoScore = store?.lastAnalyzed
    ? Math.max(0, Math.round(100 - seoGaps.reduce((sum, g) => sum + ((g.impactScore ?? 50) / 10), 0)))
    : null;
  // GEO = citation % from the most recent automated scan; null = never scanned
  const geoScore = geoSummary?.lastGeoScore ?? null;
  const geoScoreValue = geoScore ?? 0;

  // Real score deltas — use only non-error snapshots (4.4: null overallScore = error run).
  // Error snapshots have overallScore:null; including them would show a fake +score delta.
  const validSnapshots = snapshots.filter((s) => s.overallScore != null);
  const prevSnapshot = validSnapshots.length >= 2 ? validSnapshots[1] : null;  // [0] = latest
  const overallDelta = prevSnapshot && summary
    ? Math.round((summary.overallScore ?? 0) - (prevSnapshot.overallScore ?? 0))
    : null;
  const aeoPrev = prevSnapshot
    ? Math.round(((prevSnapshot.clarityScore ?? 0) + (prevSnapshot.completenessScore ?? 0) + (prevSnapshot.tagScore ?? 0)) / 3)
    : null;
  const aeoDelta = aeoPrev !== null ? aeoScore - aeoPrev : null;

  const criticalGaps = (() => {
    if (!gaps) return [] as GapWithMeta[];
    const seen = new Set<string>();
    return (gaps as GapWithMeta[]).filter((g) => {
      if (g.severity !== "high" || seen.has(g.title)) return false;
      seen.add(g.title);
      return true;
    }).slice(0, 5);
  })();
  const lowScoreProducts = products?.filter((p) => (p.score?.overall ?? 100) < 50).slice(0, 5) ?? [];
  const pendingFixes = summary?.pendingFixes ?? 0;

  // Build trend from valid (non-error) snapshots only — error runs have overallScore:null
  // and would appear as a false zero dip in the chart (4.4).
  const trendData = validSnapshots.length >= 1
    ? [...validSnapshots].reverse().map((s) => ({
        label: new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        overall: s.overallScore ?? 0,
      }))
    : [];

  // Handlers
  async function handleAnalyze() {
    if (!activeStoreId) return;
    
    // Optimistically set to "analyzing" so the useEffect doesn't instantly fire
    // when re-analyzing a store that is already "analyzed" in the cache.
    queryClient.setQueryData(getGetStoreQueryKey(activeStoreId), (old: any) => 
      old ? { ...old, status: "analyzing" } : old
    );
    
    setAnalyzing(true);
    
    try {
      await analyzeStore.mutateAsync({ storeId: activeStoreId });
      // Completion is detected by the useEffect watching store.status above.
      // The store hook's refetchInterval already polls at 4 s while status==="analyzing".
    } catch (err) {
      setAnalyzing(false);
      queryClient.invalidateQueries({ queryKey: getGetStoreQueryKey(activeStoreId) });
      toast({
        title: "Could not start analysis",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
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

  const isDemo = !!store?.isDemo;
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
                {isDemo && (
                  <span className="text-[10px] font-extrabold uppercase tracking-widest bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full border border-violet-200">
                    Demo Store
                  </span>
                )}
                {hasAnalysis && (
                  <div className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-zinc-300">
                    <Clock className="w-3.5 h-3.5" />
                    Last analyzed {timeAgo}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isDemo && (
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
              )}

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
            <div className="space-y-5">
              {/* KPI skeleton row */}
              <div className="grid grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 p-5 flex flex-col gap-4 h-[140px]">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                    <div className="mt-auto space-y-2">
                      <Skeleton className="h-10 w-20" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Chart + issues skeleton */}
              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-3 bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 p-6 h-[380px] flex flex-col gap-4">
                  <div className="flex justify-between">
                    <div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-40" /></div>
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="flex-1 rounded-xl" />
                </div>
                <div className="col-span-2 bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 p-6 h-[380px] flex flex-col gap-3">
                  <Skeleton className="h-4 w-32 mb-2" />
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-white/5 last:border-0">
                      <div className="flex items-center gap-3 flex-1">
                        <Skeleton className="w-1.5 h-1.5 rounded-full" />
                        <Skeleton className="h-3 flex-1 max-w-[180px]" />
                      </div>
                      <Skeleton className="h-6 w-12 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
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
              {/* ── Stale-score warning: last analysis run failed (4.19) ── */}
              {store?.status === "error" && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-[12px] bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-[13px] font-medium">
                    The last analysis run failed — scores shown are from a previous run and may be stale.
                    Check the <span className="font-bold">Activity</span> feed for details, then re-run analysis.
                  </p>
                </div>
              )}

              {/* ── KPI score row ── */}
              <div className="grid grid-cols-4 gap-4">
                <KpiCard
                  label="AI Readiness"
                  score={Math.round(summary.overallScore ?? 0)}
                  color="#10b981"
                  sub={`${summary.criticalIssues ?? 0} critical · ${summary.mediumIssues ?? 0} medium issues`}
                  href="/issues"
                  delta={overallDelta}
                />
                <KpiCard
                  label="AEO Score"
                  score={aeoScore}
                  color="#14b8a6"
                  sub={`Clarity ${Math.round(summary.clarityScore ?? 0)} · Complete ${Math.round(summary.completenessScore ?? 0)}`}
                  href="/intelligence/aeo"
                  delta={aeoDelta}
                />
                <KpiCard
                  label="SEO Score"
                  score={seoScore ?? 0}
                  color="#8b5cf6"
                  sub={seoScore !== null ? `${seoGaps.length} technical issue${seoGaps.length !== 1 ? "s" : ""} detected` : "Run analysis to calculate"}
                  href="/intelligence/seo"
                  unscanned={seoScore === null}
                />
                <KpiCard
                  label="GEO Score"
                  score={geoScoreValue}
                  color="#f59e0b"
                  sub={geoScore === null ? "Run a live AI scan to get your score" : `${geoScore}% cited across 5 AI agents`}
                  href="/intelligence/geo"
                  unscanned={geoScore === null}
                />
              </div>

              {/* ── Live AI Visibility Test Hero ── */}
              {geoScore === null && (
                <div className="relative overflow-hidden rounded-[16px] border border-amber-200/60 dark:border-amber-500/20 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-500/5 dark:via-orange-500/5 dark:to-amber-500/5 p-5">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.12),transparent_60%)]" />
                  <div className="relative flex items-center justify-between gap-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/15 border border-amber-200/60 dark:border-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <Wifi className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[14px] font-bold text-slate-900 dark:text-white">GEO Score not yet tested</p>
                          <span className="text-[10px] font-bold uppercase tracking-widest bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-200/60 dark:border-amber-500/30">
                            New
                          </span>
                        </div>
                        <p className="text-[13px] text-slate-600 dark:text-zinc-300 max-w-lg leading-relaxed">
                          Run a live 5-agent scan to see how Tavily, Google Search, Claude AI, Gemini AI, and OpenAI GPT actually perceive your store — the core metric AI shopping engines use to decide recommendations.
                        </p>
                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                          {[
                            { label: "Tavily Search",  desc: "Live web results",      color: "text-teal-600 dark:text-teal-400",    dot: "bg-teal-400" },
                            { label: "Google Search",  desc: "Organic results",       color: "text-blue-600 dark:text-blue-400",    dot: "bg-blue-400" },
                            { label: "Claude AI",      desc: "Brand intent scoring",  color: "text-violet-600 dark:text-violet-400", dot: "bg-violet-400" },
                            { label: "Gemini AI",      desc: "Content quality",       color: "text-sky-600 dark:text-sky-400",      dot: "bg-sky-400" },
                            { label: "OpenAI GPT",     desc: "GPT-4o content judge",  color: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-400" },
                          ].map((agent) => (
                            <div key={agent.label} className="flex items-center gap-1.5 bg-white/70 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 rounded-[8px] px-2.5 py-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${agent.dot} flex-shrink-0`} />
                              <span className={`text-[11px] font-semibold ${agent.color}`}>{agent.label}</span>
                              <span className="text-[11px] text-slate-400 dark:text-zinc-400">{agent.desc}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Link href="/intelligence/geo" className="flex-shrink-0">
                      <Button className="h-10 px-5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-[10px] gap-2 shadow-sm whitespace-nowrap">
                        <Sparkles className="w-4 h-4" />
                        Run Live AI Test
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {/* ── Chart + Critical Issues ── */}
              <div className="grid grid-cols-5 gap-4">
                {/* Trend chart */}
                <div className="col-span-3 bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">Score Trend</h2>
                      <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">AI readiness over time</p>
                    </div>
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-zinc-300">
                      <span className="w-3 h-0.5 rounded inline-block bg-emerald-500" />
                      Overall Score
                    </span>
                  </div>
                  <div className="h-[260px] mt-6 w-full">
                    {trendData.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                        <p className="text-[13px] font-semibold text-slate-400 dark:text-zinc-500">No historical data yet</p>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-600">Run more analyses to build a score trend</p>
                      </div>
                    ) : (
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
                        <Area type="monotone" dataKey="overall" name="Overall Score" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorOverall)" activeDot={{ r: 6, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                    )}
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
                  {gapsLoading ? (
                    <div className="space-y-0.5">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between py-3 border-b border-slate-50 dark:border-white/5 last:border-0">
                          <div className="flex items-center gap-3 flex-1">
                            <Skeleton className="w-1.5 h-1.5 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                              <Skeleton className="h-3 w-3/4" />
                              <Skeleton className="h-2.5 w-1/2" />
                            </div>
                          </div>
                          <Skeleton className="h-6 w-10 rounded-md ml-4" />
                        </div>
                      ))}
                    </div>
                  ) : criticalGaps.length === 0 ? (
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
                    {criticalGaps.map((g) => (
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
                      {(gaps as GapWithMeta[] | undefined)?.filter((g) => !g.isFixed).slice(0, 4).map((g) => (
                        <div key={g.id} className="flex items-center gap-3 group hover:bg-slate-50/50 dark:hover:bg-white/5 rounded-lg py-2 -mx-2 px-2 transition-colors">
                          <div className="w-3 h-3 rounded-[3px] border border-slate-200 dark:border-white/10 flex-shrink-0 group-hover:border-emerald-300 transition-colors" />
                          <span className="text-[13px] text-slate-700 dark:text-slate-200 flex-1 truncate">{g.title}</span>
                          <span className="text-[11px] text-emerald-600 font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                            +{Math.round((g.impactScore ?? 20) / 10)} pts
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
                        const score = p.score?.overall ?? 0;
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

              {/* ── AI Perception + Listing Readiness row ── */}
              {(perceptionSummary || listingReadiness) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* AI Perception Summary */}
                  {perceptionSummary && perceptionSummary.agentNarrative && (
                    <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6">
                      <SectionHead
                        title="AI Perception"
                        action={
                          <Link href="/ai-readiness">
                            <span className="text-[11px] text-emerald-600 hover:text-emerald-700 cursor-pointer">Details →</span>
                          </Link>
                        }
                      />
                      <p className="text-[13px] text-slate-700 dark:text-zinc-300 leading-relaxed line-clamp-3 mb-3">
                        {perceptionSummary.agentNarrative}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {perceptionSummary.unansweredQuestions.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            {perceptionSummary.unansweredQuestions.length} unanswered {perceptionSummary.unansweredQuestions.length === 1 ? "question" : "questions"}
                          </div>
                        )}
                        {perceptionSummary.ambiguities.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400">
                            <AlertTriangle className="w-3 h-3" />
                            {perceptionSummary.ambiguities.length} content {perceptionSummary.ambiguities.length === 1 ? "ambiguity" : "ambiguities"}
                          </div>
                        )}
                        {perceptionSummary.unansweredQuestions.length === 0 && perceptionSummary.ambiguities.length === 0 && (
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                            <Check className="w-3 h-3" />
                            No open questions detected
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Listing Readiness */}
                  {listingReadiness && (
                    <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6">
                      <SectionHead
                        title="Marketplace Readiness"
                        action={
                          <Link href="/listing-readiness">
                            <span className="text-[11px] text-emerald-600 hover:text-emerald-700 cursor-pointer">Details →</span>
                          </Link>
                        }
                      />
                      <div className="flex items-center gap-4 mb-3">
                        <div className={`w-14 h-14 rounded-[12px] flex items-center justify-center text-[28px] font-extrabold shrink-0 ${
                          listingReadiness.grade === "A" ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : listingReadiness.grade === "B" ? "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"
                          : listingReadiness.grade === "C" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}>
                          {listingReadiness.grade}
                        </div>
                        <div>
                          <p className="text-[22px] font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">{listingReadiness.overallScore}<span className="text-[13px] font-medium text-slate-400 ml-1">/100</span></p>
                          <p className="text-[12px] text-slate-500 dark:text-zinc-400 mt-0.5">AI marketplace readiness</p>
                        </div>
                      </div>
                      {listingReadiness.topRecommendations.length > 0 && (
                        <div className="space-y-1.5">
                          {listingReadiness.topRecommendations.slice(0, 2).map((rec, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                              <span className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                              <span className="line-clamp-2">{rec}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
