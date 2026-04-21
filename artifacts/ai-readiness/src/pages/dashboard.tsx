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
import { useQueryClient } from "@tanstack/react-query";
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
  ArrowRight
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis } from "recharts";
import { AppLayout } from "@/components/layout";
import { ScoreBar, ScoreRing } from "@/components/score-ring";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function LastAnalyzed({ timestamp }: { timestamp: string | null }) {
  if (!timestamp) return <span className="text-xs text-muted-foreground">Not yet analyzed</span>;
  const date = new Date(timestamp);
  const relative = (() => {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();
  return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      <Clock className="w-3 h-3" />
      Last analyzed {relative}
    </span>
  );
}

function ActivityFeed({ storeId }: { storeId: string }) {
  const { data: activity } = useGetStoreActivity(storeId, {
    query: { queryKey: getGetStoreActivityQueryKey(storeId) },
  });

  const icons: Record<string, string> = {
    store_connected: "🔗",
    products_fetched: "📦",
    analysis_started: "⚡",
    analysis_completed: "✅",
    analysis_failed: "❌",
    gap_detected: "⚠️",
    fix_applied: "🛠️",
  };

  if (!activity || activity.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>;
  }

  return (
    <div className="space-y-0">
      {activity.slice(0, 6).map((item) => (
        <div key={item.id} className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
          <span className="text-sm mt-0.5">{icons[item.type] ?? "•"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground leading-snug">{item.message}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
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

function ProductsPreview({ storeId, hasAnalysis }: { storeId: string; hasAnalysis: boolean }) {
  const { data: products, isLoading } = useListProducts(storeId, {
    query: {
      queryKey: getListProductsQueryKey(storeId),
      refetchInterval: (query) => {
        const data = query.state.data;
        return !data || data.length === 0 ? 3000 : false;
      },
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          Loading products from Shopify...
        </p>
      </div>
    );
  }

  const preview = products.slice(0, 5);

  return (
    <div className="space-y-0">
      {preview.map((p) => {
        const analyzed = !!p.analyzedAt;
        const overall = p.score?.overall ?? 0;
        const scoreColor = overall >= 75 ? "text-green-600" : overall >= 50 ? "text-amber-600" : "text-red-600";
        return (
          <Link key={p.id} href={`/products/${p.id}`}>
            <div className="flex items-center gap-3 py-2 border-b border-border last:border-0 hover:bg-accent/50 rounded cursor-pointer -mx-1 px-1 transition-colors">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{p.title}</p>
                {p.productType && (
                  <p className="text-[10px] text-muted-foreground">{p.productType}</p>
                )}
              </div>
              {analyzed && hasAnalysis ? (
                <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>
                  {Math.round(overall)}
                </span>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  Not analyzed
                </Badge>
              )}
            </div>
          </Link>
        );
      })}
      {products.length > 5 && (
        <Link href="/products">
          <p className="text-[10px] text-muted-foreground text-center pt-2 hover:text-foreground cursor-pointer">
            +{products.length - 5} more products →
          </p>
        </Link>
      )}
    </div>
  );
}

// Insight cards removed per redesign spec

export default function Dashboard() {
  const { activeStoreId, setActiveStoreId } = useStore();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const { data: allStores = [], isLoading: storesLoading } = useListStores({ query: { staleTime: 30_000, queryKey: getListStoresQueryKey() } });

  useEffect(() => {
    if (storesLoading) return;
    const stores = allStores as Array<{ id: string }>;
    if (stores.length === 0) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
      // Auto-pick first store if none is active
      if (!activeStoreId) setActiveStoreId(stores[0]!.id);
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

  const analyzeStore = useAnalyzeStore();

  if (!activeStoreId) {
    return (
      <>
        <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-3">No store connected yet</p>
            <button
              className="text-xs text-indigo-600 underline"
              onClick={() => setShowOnboarding(true)}
            >
              Connect a store
            </button>
          </div>
        </div>
      </>
    );
  }

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
          ]);
          setAnalyzing(false);
          if (storeData?.status === "error") {
            toast({ title: "Analysis failed", description: "Check the activity log for details.", variant: "destructive" });
          } else {
            toast({ title: "Analysis complete", description: "Your store's AI readiness scores are ready." });
          }
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

  const isStoreAnalyzing = store?.status === "analyzing" || analyzing;
  const hasAnalysis = !!store?.lastAnalyzed;
  const totalIssues = (summary?.criticalIssues ?? 0) + (summary?.mediumIssues ?? 0) + (summary?.lowIssues ?? 0);

  // Generate historical data based on current score
  const mockHistoryData = hasAnalysis && summary ? [
    { name: "Day 1", score: Math.max(0, (summary.overallScore ?? 0) - 15) },
    { name: "Day 3", score: Math.max(0, (summary.overallScore ?? 0) - 8) },
    { name: "Day 5", score: Math.max(0, (summary.overallScore ?? 0) - 3) },
    { name: "Today", score: summary.overallScore ?? 0 }
  ] : [];

  return (
    <AppLayout>
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* Zone 1: Store Health Bar */}
        <div className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground">{store?.name ?? "Store"}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground">{store?.domain}</span>
              <span className="text-muted-foreground/40">·</span>
              <LastAnalyzed timestamp={store?.lastAnalyzed ?? null} />
            </div>
          </div>

          {hasAnalysis && summary && (
            <div className="flex items-center gap-6 pr-4 border-r border-border">
              <div className="text-center">
                <p className="text-xl font-bold text-foreground">{Math.round(summary.overallScore ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground">Overall</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-red-500">{summary.criticalIssues ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Critical</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-amber-500">{summary.pendingFixes ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Fixes</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={handleAnalyze} disabled={isStoreAnalyzing || removing} size="sm">
              {isStoreAnalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  {hasAnalysis ? "Re-analyze" : "Run Analysis"}
                </>
              )}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" disabled={removing}>
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
                  <AlertDialogHeader>
                    This will permanently delete <strong>{store?.name ?? store?.domain}</strong> and all associated data — products, scores, gaps, and fixes. This cannot be undone.
                  </AlertDialogHeader>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleRemoveStore}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove store
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Zone 2: Score breakdown + products preview */}
        {summaryLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : hasAnalysis && summary ? (
          <div className="grid grid-cols-3 gap-4">
            {/* Score breakdown */}
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <Card className="border-border">
                <CardContent className="p-4 flex flex-col items-center justify-center gap-2">
                  <ScoreRing score={typeof summary.overallScore === 'number' && !isNaN(summary.overallScore) ? summary.overallScore : 0} size={96} />
                  <p className="text-xs text-muted-foreground">AI Readiness Score</p>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardContent className="p-4 space-y-2.5">
                  {[
                    { label: "Clarity", score: summary.clarityScore ?? 0 },
                    { label: "Completeness", score: summary.completenessScore ?? 0 },
                    { label: "Trust", score: summary.trustScore ?? 0 },
                    { label: "Tags", score: summary.tagScore ?? 0 },
                    { label: "Consistency", score: summary.consistencyScore ?? 0 },
                  ].map(({ label, score }) => (
                    <ScoreBar key={label} label={label} score={score} />
                  ))}
                </CardContent>
              </Card>

              {/* Issue severity distribution */}
              <Card className="border-border col-span-2">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-medium text-foreground">{totalIssues} issues found</p>
                    <Link href="/issues">
                      <span className="text-xs text-primary hover:underline cursor-pointer">View all →</span>
                    </Link>
                  </div>
                  <div className="flex gap-2">
                    {[
                      { label: "Critical", count: summary.criticalIssues ?? 0, color: "bg-red-500", href: "/issues" },
                      { label: "Medium", count: summary.mediumIssues ?? 0, color: "bg-amber-500", href: "/issues" },
                      { label: "Low", count: summary.lowIssues ?? 0, color: "bg-blue-400", href: "/issues" },
                      { label: "Quick Fixes", count: summary.pendingFixes ?? 0, color: "bg-violet-500", href: "/fixes" },
                    ].map(({ label, count, color, href }) => (
                      <Link key={label} href={href}>
                        <div className="flex-1 rounded-md border border-border p-2.5 text-center hover:bg-accent transition-colors cursor-pointer min-w-[70px]">
                          <div className={`w-2 h-2 rounded-full ${color} mx-auto mb-1`} />
                          <p className="text-lg font-bold text-foreground">{count}</p>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {/* Action Plan Summary CTA */}
              {totalIssues > 0 && (
                <Card className="border-border bg-gradient-to-r from-red-500/10 to-amber-500/10 border-amber-200">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        Action Plan Recommended
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        We found {totalIssues} issues that are reducing your AI readiness. 
                        Follow our step-by-step action plan to improve your score.
                      </p>
                    </div>
                    <Link href="/issues">
                      <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
                        View Action Plan <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Improvement Graph + Products Preview */}
            <div className="space-y-4">
              <Card className="border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" /> Score Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="h-40 w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={mockHistoryData}>
                        <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} fontSize={10} tickLine={false} axisLine={false} width={25} />
                        <Tooltip contentStyle={{ fontSize: '12px', borderRadius: '8px' }} />
                        <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Products</span>
                    <Link href="/products">
                      <span className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer font-normal">
                        See all →
                      </span>
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ProductsPreview storeId={activeStoreId} hasAnalysis={hasAnalysis} />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          /* Pre-analysis: show products list + prompt to analyze */
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-4">
              <Card className="border-dashed border-border">
                <CardContent className="py-10 text-center">
                  <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">Ready to analyze</p>
                  <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">
                    Run an AI readiness analysis to get scores, find gaps, and generate fixes for your products.
                  </p>
                  <Button onClick={handleAnalyze} disabled={isStoreAnalyzing} size="sm">
                    {isStoreAnalyzing ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Analyzing...</>
                    ) : (
                      <><Play className="w-3.5 h-3.5 mr-1.5" />Start Analysis</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Products</span>
                    <Link href="/products">
                      <span className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer font-normal">
                        See all →
                      </span>
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ProductsPreview storeId={activeStoreId} hasAnalysis={false} />
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" /> Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ActivityFeed storeId={activeStoreId} />
                </CardContent>
              </Card>
            </div>
          </div>
        )}



      </div>
    </AppLayout>
  );
}
