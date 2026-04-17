import { useEffect, useState } from "react";
import { useStore } from "@/context/store-context";
import {
  getGetStoreActivityQueryKey,
  getGetStoreQueryKey,
  getGetStoreSummaryQueryKey,
  useAnalyzeStore,
  useGetStore,
  useGetStoreActivity,
  useGetStoreSummary,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Loader2,
  Package,
  Play,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout";
import { ScoreBar, ScoreRing } from "@/components/score-ring";
import { ActionPlanPanel } from "@/components/action-plan-panel";
import { BulkOptimizer } from "@/components/bulk-optimizer";
import { FaqHealthCard } from "@/components/faq-health-card";
import { PerceptionPanel } from "@/components/perception-panel";
import { StructuredDataCard } from "@/components/structured-data-card";
import { TagOptimizerPanel } from "@/components/tag-optimizer-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getStorePerception,
  getStoreTagOptimizer,
  updateStorePositioning,
} from "@/lib/insights-api";

function ActivityFeed({ storeId }: { storeId: string }) {
  const { data: activity } = useGetStoreActivity(storeId, {
    query: { queryKey: getGetStoreActivityQueryKey(storeId) },
  });

  const icons: Record<string, string> = {
    store_connected: "🔗",
    analysis_started: "⚡",
    analysis_completed: "✅",
    gap_detected: "⚠️",
    fix_applied: "🔧",
  };

  if (!activity || activity.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>;
  }

  return (
    <div className="space-y-2">
      {activity.slice(0, 5).map((item) => (
        <div key={item.id} className="flex items-start gap-2.5 py-2 border-b border-border last:border-0">
          <span className="text-base">{icons[item.type] ?? "•"}</span>
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

export default function Dashboard() {
  const { activeStoreId } = useStore();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [desiredPositioning, setDesiredPositioning] = useState("");

  const { data: store } = useGetStore(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreQueryKey(activeStoreId!) },
  });
  const { data: summary, isLoading } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });
  const { data: perception } = useQuery({
    queryKey: ["store-perception", activeStoreId],
    queryFn: () => getStorePerception(activeStoreId!),
    enabled: !!activeStoreId,
  });
  const { data: tagOptimizer } = useQuery({
    queryKey: ["store-tag-optimizer", activeStoreId],
    queryFn: () => getStoreTagOptimizer(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const analyzeStore = useAnalyzeStore();
  const updatePositioningMutation = useMutation({
    mutationFn: (nextDesiredPositioning: string) =>
      updateStorePositioning(activeStoreId!, nextDesiredPositioning),
    onSuccess: (data) => {
      setDesiredPositioning(data.desiredPositioning ?? "");
      queryClient.invalidateQueries({ queryKey: ["store-perception", activeStoreId] });
      queryClient.invalidateQueries({ queryKey: getGetStoreQueryKey(activeStoreId!) });
      toast({
        title: "Positioning saved",
        description: "The perception simulator will use this positioning on the next analysis run.",
      });
    },
    onError: (error) => {
      toast({
        title: "Could not save positioning",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    setDesiredPositioning(perception?.merchantDesiredPositioning ?? "");
  }, [perception?.merchantDesiredPositioning]);

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  async function handleAnalyze() {
    if (!activeStoreId) return;

    setAnalyzing(true);
    try {
      await analyzeStore.mutateAsync({ storeId: activeStoreId });

      // Poll store status every 4 seconds until analysis finishes
      const poll = setInterval(async () => {
        await queryClient.invalidateQueries({ queryKey: getGetStoreQueryKey(activeStoreId) });
        const storeData = queryClient.getQueryData<{ status: string }>(getGetStoreQueryKey(activeStoreId));
        if (storeData?.status === "analyzed" || storeData?.status === "error") {
          clearInterval(poll);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId) }),
            queryClient.invalidateQueries({ queryKey: getGetStoreActivityQueryKey(activeStoreId) }),
            queryClient.invalidateQueries({ queryKey: ["store-perception", activeStoreId] }),
            queryClient.invalidateQueries({ queryKey: ["store-tag-optimizer", activeStoreId] }),
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

  const isStoreAnalyzing = store?.status === "analyzing" || analyzing;

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">{store?.name ?? "Dashboard"}</h1>
            <p className="text-sm text-muted-foreground">{store?.domain}</p>
          </div>
          <Button onClick={handleAnalyze} disabled={isStoreAnalyzing} size="sm">
            {isStoreAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Analysis
              </>
            )}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card className="col-span-1 border-border">
                <CardContent className="p-4 flex flex-col items-center justify-center">
                  <ScoreRing score={summary.overallScore} size={100} />
                  <p className="text-xs text-muted-foreground mt-2 text-center">Overall AI Readiness</p>
                </CardContent>
              </Card>
              <Card className="col-span-3 border-border">
                <CardContent className="p-4 grid grid-cols-3 gap-3">
                  {[
                    { label: "Clarity", score: summary.clarityScore },
                    { label: "Completeness", score: summary.completenessScore },
                    { label: "Trust Signals", score: summary.trustScore },
                    { label: "Tag Quality", score: summary.tagScore },
                    { label: "Consistency", score: summary.consistencyScore },
                    { label: "Policy Coverage", score: summary.policyScore },
                  ].map(({ label, score }) => (
                    <ScoreBar key={label} label={label} score={score} />
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Products", value: summary.totalProducts, icon: Package, color: "text-blue-500", href: "/products" },
                { label: "Critical Issues", value: summary.criticalIssues, icon: AlertTriangle, color: "text-red-500", href: "/gaps" },
                { label: "Pending Fixes", value: summary.pendingFixes, icon: CheckSquare, color: "text-amber-500", href: "/fixes" },
                { label: "Applied Fixes", value: summary.appliedFixes, icon: TrendingUp, color: "text-green-500", href: "/fixes" },
              ].map(({ label, value, icon: Icon, color, href }) => (
                <Link key={label} href={href}>
                  <Card className="cursor-pointer hover:shadow-sm transition-shadow border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                      </div>
                      <p className="text-2xl font-bold text-foreground">{value}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Issues by Severity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "Critical / High", count: summary.criticalIssues, color: "bg-red-500" },
                    { label: "Medium Priority", count: summary.mediumIssues, color: "bg-amber-500" },
                    { label: "Low Priority", count: summary.lowIssues, color: "bg-blue-400" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <span className="text-xs font-semibold">{count}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${color}`}
                            style={{
                              width: `${Math.min(
                                100,
                                (count / Math.max(summary.criticalIssues + summary.mediumIssues + summary.lowIssues, 1)) * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Link href="/gaps">
                    <Button variant="outline" size="sm" className="w-full mt-2 text-xs">
                      View all gaps
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityFeed storeId={activeStoreId} />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <Link href="/products">
                <Card className="cursor-pointer hover:bg-accent border-border transition-colors">
                  <CardContent className="p-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium">View Products</span>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/fixes">
                <Card className="cursor-pointer hover:bg-accent border-border transition-colors">
                  <CardContent className="p-3 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-medium">Apply Fixes ({summary.pendingFixes})</span>
                  </CardContent>
                </Card>
              </Link>
              <Link href="/benchmark">
                <Card className="cursor-pointer hover:bg-accent border-border transition-colors">
                  <CardContent className="p-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-medium">Benchmark Report</span>
                  </CardContent>
                </Card>
              </Link>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <PerceptionPanel
                agentNarrative={perception?.agentNarrative ?? ""}
                perceivedStrengths={perception?.perceivedStrengths ?? []}
                unansweredQuestions={perception?.unansweredQuestions ?? []}
                ambiguities={perception?.ambiguities ?? []}
                desiredPositioning={desiredPositioning}
                onDesiredPositioningChange={setDesiredPositioning}
                onSave={() => updatePositioningMutation.mutate(desiredPositioning)}
                isSaving={updatePositioningMutation.isPending}
                updatedAt={perception?.updatedAt ?? null}
              />
              <FaqHealthCard
                faqHealth={
                  perception?.faqHealth ?? {
                    found: false,
                    title: null,
                    questionCount: 0,
                    unansweredTopics: [],
                  }
                }
              />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <StructuredDataCard
                structuredData={
                  perception?.structuredData ?? {
                    totalProducts: 0,
                    missingProductCount: 0,
                    missingProducts: [],
                  }
                }
              />
              <TagOptimizerPanel data={tagOptimizer} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <ActionPlanPanel items={perception?.prioritizedActionPlan ?? []} />
              <BulkOptimizer storeId={activeStoreId} />
            </div>
          </>
        ) : (
          <Card className="border-dashed border-border">
            <CardContent className="py-16 text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No analysis yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Run an AI analysis to get your store's readiness score
              </p>
              <Button onClick={handleAnalyze} disabled={isStoreAnalyzing}>
                {isStoreAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Start Analysis
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
