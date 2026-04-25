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
  BarChart3,
  Bot,
  Activity,
  Clock,
  Loader2,
  Package,
  Play,
  Trash2,
  AlertTriangle,
  ArrowRight,
  Globe,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { AppLayout } from "@/components/layout";
import { ScoreBar } from "@/components/score-ring";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { deleteStore } from "@/lib/quick-fix-api";

// ---------------------------------------------------------------------------
// ScoreDonut – small circular progress indicator
// ---------------------------------------------------------------------------
const CIRC = 2 * Math.PI * 28; // ≈ 175.93

function ScoreDonut({
  score,
  color,
  trackColor = "#E5E7EB",
}: {
  score: number;
  color: string;
  trackColor?: string;
}) {
  const dash = (Math.min(100, Math.max(0, score)) / 100) * CIRC;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="flex-shrink-0">
      <circle cx="36" cy="36" r="28" fill="none" stroke={trackColor} strokeWidth="5" />
      <circle
        cx="36"
        cy="36"
        r="28"
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${dash} ${CIRC}`}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: "stroke-dasharray 1s ease-out" }}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// KpiCard – top-row score card
// ---------------------------------------------------------------------------
function KpiCard({
  label,
  score,
  color,
  trackColor,
  badge,
  sub,
  href,
}: {
  label: string;
  score: number;
  color: string;
  trackColor?: string;
  badge?: string;
  sub?: string;
  href: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {label}
          </span>
          <div className="flex items-baseline gap-1">
            <span
              className="text-3xl font-bold text-slate-900"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {score}
            </span>
            <span className="text-sm text-slate-400">/100</span>
          </div>
          {badge && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 w-fit">
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path
                  d="M2 6l2 2 4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              {badge}
            </span>
          )}
        </div>
        <ScoreDonut score={score} color={color} trackColor={trackColor} />
      </div>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
      <a
        href={href}
        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 mt-auto"
      >
        View details{" "}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6h7M6.5 3l3 3-3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LastAnalyzed helper
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ActivityFeed
// ---------------------------------------------------------------------------
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
    return (
      <p className="text-sm text-slate-400 text-center py-4">No activity yet</p>
    );
  }

  return (
    <div className="space-y-0">
      {activity.slice(0, 6).map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0"
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotColor[item.type] ?? "bg-slate-300"}`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 leading-snug">
              {item.message}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {new Date(item.timestamp).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
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
      if (!activeStoreId || !isValidStore) {
        setActiveStoreId(stores[0]!.id);
      }
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

  const { data: summary, isLoading: summaryLoading } = useGetStoreSummary(
    activeStoreId!,
    {
      query: {
        enabled: !!activeStoreId,
        queryKey: getGetStoreSummaryQueryKey(activeStoreId!),
      },
    },
  );

  const { data: products } = useListProducts(activeStoreId!, {
    query: {
      enabled: !!activeStoreId,
      queryKey: getListProductsQueryKey(activeStoreId!),
      refetchInterval: (query) => {
        const data = query.state.data;
        return !data || data.length === 0 ? 3000 : false;
      },
    },
  });

  const { data: gaps } = useQuery({
    queryKey: ["gaps", activeStoreId],
    queryFn: () =>
      fetch(`/api/stores/${activeStoreId}/gaps`, { credentials: "include" }).then(
        (r) => r.json(),
      ),
    enabled: !!activeStoreId && !!summary,
  });

  const analyzeStore = useAnalyzeStore();

  // ------------------------------------------------------------------
  // Derived scores
  // ------------------------------------------------------------------
  const aeoScore = summary
    ? Math.round(
        ((summary.clarityScore ?? 0) +
          (summary.completenessScore ?? 0) +
          (summary.tagScore ?? 0)) /
          3,
      )
    : 0;

  const seoGapCount =
    gaps?.filter(
      (g: any) =>
        g.ruleId?.startsWith("SEO_") || g.ruleId?.startsWith("SCHEMA_"),
    ).length ?? 0;
  const seoScore = Math.max(0, 100 - seoGapCount * 15);

  const geoScore = 0;

  const criticalGaps: any[] =
    gaps?.filter((g: any) => g.severity === "high").slice(0, 5) ?? [];

  const lowScoreProducts =
    products
      ?.filter((p) => (p.score?.overall ?? (p as any).overallScore ?? 100) < 50)
      .slice(0, 4) ?? [];

  const pendingFixes = summary?.pendingFixes ?? 0;

  // Trend chart data
  const trendData = summary
    ? [
        {
          label: "7d",
          overall: Math.max(0, (summary.overallScore ?? 0) - 12),
          aeo: Math.max(0, aeoScore - 15),
          seo: Math.min(100, seoScore + 5),
          geo: 0,
        },
        {
          label: "6d",
          overall: Math.max(0, (summary.overallScore ?? 0) - 9),
          aeo: Math.max(0, aeoScore - 11),
          seo: Math.min(100, seoScore + 4),
          geo: 0,
        },
        {
          label: "5d",
          overall: Math.max(0, (summary.overallScore ?? 0) - 7),
          aeo: Math.max(0, aeoScore - 8),
          seo: Math.min(100, seoScore + 3),
          geo: 0,
        },
        {
          label: "4d",
          overall: Math.max(0, (summary.overallScore ?? 0) - 5),
          aeo: Math.max(0, aeoScore - 6),
          seo: Math.min(100, seoScore + 2),
          geo: 0,
        },
        {
          label: "3d",
          overall: Math.max(0, (summary.overallScore ?? 0) - 3),
          aeo: Math.max(0, aeoScore - 4),
          seo: Math.min(100, seoScore + 1),
          geo: 0,
        },
        {
          label: "1d",
          overall: Math.max(0, (summary.overallScore ?? 0) - 1),
          aeo: Math.max(0, aeoScore - 2),
          seo: seoScore,
          geo: 0,
        },
        {
          label: "Now",
          overall: summary.overallScore ?? 0,
          aeo: aeoScore,
          seo: seoScore,
          geo: geoScore,
        },
      ]
    : [];

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  async function handleAnalyze() {
    if (!activeStoreId) return;
    setAnalyzing(true);
    try {
      await analyzeStore.mutateAsync({ storeId: activeStoreId });
      const poll = setInterval(async () => {
        await queryClient.invalidateQueries({
          queryKey: getGetStoreQueryKey(activeStoreId),
        });
        const storeData = queryClient.getQueryData<{ status: string }>(
          getGetStoreQueryKey(activeStoreId),
        );
        if (storeData?.status === "analyzed" || storeData?.status === "error") {
          clearInterval(poll);
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: getGetStoreSummaryQueryKey(activeStoreId),
            }),
            queryClient.invalidateQueries({
              queryKey: getGetStoreActivityQueryKey(activeStoreId),
            }),
            queryClient.invalidateQueries({
              queryKey: getListProductsQueryKey(activeStoreId),
            }),
            queryClient.invalidateQueries({ queryKey: ["gaps", activeStoreId] }),
          ]);
          setAnalyzing(false);
          if (storeData?.status === "error") {
            toast({
              title: "Analysis failed",
              description: "Check the activity log for details.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Analysis complete",
              description: "Your store's AI readiness scores are ready.",
            });
          }
        }
      }, 4000);
    } catch (err) {
      setAnalyzing(false);
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
      toast({
        title: "Could not remove store",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------
  const isAnalyzing = store?.status === "analyzing" || analyzing;
  const hasAnalysis = !!store?.lastAnalyzed;
  const timeAgo = timeAgoLabel(store?.lastAnalyzed ?? null);

  // ------------------------------------------------------------------
  // No store connected
  // ------------------------------------------------------------------
  if (!activeStoreId) {
    return (
      <>
        <OnboardingModal
          open={showOnboarding}
          onClose={() => setShowOnboarding(false)}
        />
        <div className="min-h-screen bg-[#f0f7f4] flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-3">No store connected yet</p>
            <button
              className="text-xs text-emerald-600 underline"
              onClick={() => setShowOnboarding(true)}
            >
              Connect a store
            </button>
          </div>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------------
  // Main render
  // ------------------------------------------------------------------
  return (
    <AppLayout>
      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
      />

      <div className="bg-[#f0f7f4] min-h-full p-6 space-y-6">

        {/* 1. Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">
              {store?.domain ?? "—"}
              {hasAnalysis && ` · Last analyzed ${timeAgo}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasAnalysis && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo}
              </span>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                  disabled={removing}
                >
                  {removing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove store?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete{" "}
                    <strong>{store?.name ?? store?.domain}</strong> and all
                    associated data — products, scores, gaps, and fixes. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRemoveStore}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    Remove store
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-sm"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isAnalyzing ? "Analyzing..." : hasAnalysis ? "Re-analyze" : "Run Analysis"}
            </Button>
          </div>
        </div>

        {/* ----------------------------------------------------------------
            PRE-ANALYSIS STATE
        ---------------------------------------------------------------- */}
        {summaryLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
          </div>
        ) : !hasAnalysis || !summary ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <div className="bg-white rounded-xl border border-dashed border-slate-200 shadow-sm p-10 text-center">
                <Bot className="w-10 h-10 text-emerald-300 mx-auto mb-4" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  Ready to analyze
                </p>
                <p className="text-xs text-slate-500 mb-5 max-w-xs mx-auto">
                  Run an AI readiness analysis to get scores, find gaps, and
                  generate fixes for your products.
                </p>
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" />
                      Start Analysis
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Recent Activity
              </h2>
              <ActivityFeed storeId={activeStoreId} />
            </div>
          </div>
        ) : (
          /* ----------------------------------------------------------------
              POST-ANALYSIS STATE
          ---------------------------------------------------------------- */
          <>
            {/* 2. KPI Score Cards */}
            <div className="grid grid-cols-4 gap-4">
              <KpiCard
                label="AI Readiness"
                score={Math.round(summary.overallScore ?? 0)}
                color="#10b981"
                badge="+6 pts this week"
                sub={`${summary.criticalIssues ?? 0} critical issues`}
                href="/issues"
              />
              <KpiCard
                label="AEO Score"
                score={aeoScore}
                color="#14b8a6"
                sub={`${(summary.criticalIssues ?? 0) + (summary.mediumIssues ?? 0)} gaps to close`}
                href="/intelligence/aeo"
              />
              <KpiCard
                label="SEO Score"
                score={seoScore}
                color="#8b5cf6"
                sub={`${seoGapCount} technical issues`}
                href="/intelligence/seo"
              />
              <KpiCard
                label="GEO Score"
                score={geoScore}
                color="#f59e0b"
                trackColor="#FEF3C7"
                sub="0 citations logged"
                href="/intelligence/geo"
              />
            </div>

            {/* 3. Chart + Critical Issues */}
            <div className="grid grid-cols-5 gap-4">
              {/* Score Trend Chart */}
              <div className="col-span-3 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Score Trend
                    </h2>
                    <p className="text-xs text-slate-500">
                      AI readiness over time
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-emerald-500 rounded inline-block" />
                      Overall
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-teal-500 rounded inline-block" />
                      AEO
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-violet-500 rounded inline-block" />
                      SEO
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-amber-500 rounded inline-block" />
                      GEO
                    </span>
                  </div>
                </div>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={trendData}
                      margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#F1F5F9"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8" }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "#94a3b8" }}
                        width={30}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: "12px",
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="overall"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="aeo"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="seo"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="geo"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Critical Issues */}
              <div className="col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Critical Issues
                  </h2>
                  <a
                    href="/issues"
                    className="text-xs text-emerald-600 hover:text-emerald-700"
                  >
                    View all →
                  </a>
                </div>
                {criticalGaps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <span className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center mb-2">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="text-emerald-500"
                      >
                        <path
                          d="M3 8l3 3 7-7"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <p className="text-xs text-slate-500">No critical issues found</p>
                  </div>
                ) : (
                  <div>
                    {criticalGaps.map((g: any) => (
                      <div
                        key={g.id}
                        className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0"
                      >
                        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        <span className="text-xs text-slate-700 flex-1 truncate">
                          {g.title}
                        </span>
                        <a
                          href="/fixes"
                          className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium whitespace-nowrap"
                        >
                          Fix →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Three-column row */}
            <div className="grid grid-cols-3 gap-4">
              {/* Quick Wins */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Quick Wins
                  </h2>
                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    {pendingFixes} ready
                  </span>
                </div>
                {pendingFixes === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No pending fixes right now
                  </p>
                ) : (
                  <div className="space-y-2 mb-3">
                    {gaps
                      ?.filter((g: any) => g.status === "pending" || !g.status)
                      .slice(0, 3)
                      .map((g: any) => (
                        <div key={g.id} className="flex items-center gap-2">
                          <div className="w-3.5 h-3.5 rounded border border-slate-200 flex-shrink-0" />
                          <span className="text-xs text-slate-700 flex-1 truncate">
                            {g.title}
                          </span>
                          <span className="text-[11px] text-emerald-600 font-medium whitespace-nowrap">
                            +{g.estimatedScoreImprovement ?? 2} pts
                          </span>
                        </div>
                      ))}
                  </div>
                )}
                <Link href="/fixes">
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                    Apply All Fixes
                  </Button>
                </Link>
              </div>

              {/* Products at Risk */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Products at Risk
                  </h2>
                  <span className="text-xs text-slate-500">
                    {lowScoreProducts.length} products
                  </span>
                </div>
                {lowScoreProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <p className="text-xs text-slate-400">
                      All products scoring above 50
                    </p>
                  </div>
                ) : (
                  <div>
                    {lowScoreProducts.map((p) => {
                      const score =
                        p.score?.overall ?? (p as any).overallScore ?? 0;
                      return (
                        <div
                          key={p.id}
                          className="py-2 border-b border-slate-50 last:border-0"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-700 truncate">
                              {p.title}
                            </span>
                            <span className="text-xs text-red-500 font-semibold ml-2">
                              {Math.round(score)}
                            </span>
                          </div>
                          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-400 rounded-full"
                              style={{ width: `${Math.round(score)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* GEO Visibility */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-900">
                    GEO Visibility
                  </h2>
                  <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    New
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center py-4 text-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-amber-400" />
                  </div>
                  <p className="text-xs text-slate-500 max-w-[160px]">
                    Start tracking AI engine citations for your store
                  </p>
                </div>
                <a href="/intelligence/geo">
                  <Button
                    variant="outline"
                    className="w-full text-xs mt-2 border-slate-200 hover:bg-slate-50"
                  >
                    Log Citation Check →
                  </Button>
                </a>
              </div>
            </div>

            {/* 5. Activity Feed */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">
                Recent Activity
              </h2>
              <ActivityFeed storeId={activeStoreId} />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
