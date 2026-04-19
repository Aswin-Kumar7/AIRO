import { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetConsistencyReport, getGetConsistencyReportQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Bot, CheckCircle, HelpCircle, AlertCircle, Target, Save, Zap, CheckCircle2, XCircle, TrendingUp, Shuffle, ListChecks } from "lucide-react";
import { getStorePerception, updateStorePositioning } from "@/lib/insights-api";
import { getQuerySimulation, type QuerySimulationResult } from "@/lib/features-api";
import { ScoreRing } from "@/components/score-ring";
import { useToast } from "@/hooks/use-toast";

// ─── AI Perception tab ────────────────────────────────────────────────────────

function PerceptionTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [positioning, setPositioning] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["store-perception", storeId],
    queryFn: () => getStorePerception(storeId),
    enabled: !!storeId,
  });

  useEffect(() => {
    if (data?.merchantDesiredPositioning !== undefined) {
      setPositioning(data.merchantDesiredPositioning ?? "");
    }
  }, [data?.merchantDesiredPositioning]);

  const saveMutation = useMutation({
    mutationFn: () => updateStorePositioning(storeId, positioning),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-perception", storeId] });
      toast({ title: "Positioning saved" });
    },
  });

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  if (!data) return (
    <Card className="border-dashed"><CardContent className="py-12 text-center">
      <Bot className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-400">Run an analysis to generate your AI perception report</p>
    </CardContent></Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-violet-500" /> Agent Narrative</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-foreground leading-relaxed italic">"{data.agentNarrative}"</p>
          {data.updatedAt && <p className="text-[10px] text-muted-foreground mt-3">Updated {new Date(data.updatedAt).toLocaleString()}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-green-500" /> Strengths</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.perceivedStrengths.length === 0 ? <p className="text-xs text-muted-foreground">None identified</p>
              : data.perceivedStrengths.map((s, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-foreground"><span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>{s}</div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5 text-amber-500" /> Unanswered</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.unansweredQuestions.length === 0 ? <p className="text-xs text-muted-foreground">None</p>
              : data.unansweredQuestions.map((q, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-foreground"><span className="text-amber-500 mt-0.5 flex-shrink-0">?</span>{q}</div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-red-500" /> Ambiguities</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.ambiguities.length === 0 ? <p className="text-xs text-muted-foreground">None</p>
              : data.ambiguities.map((a, i) => (
                <div key={i} className="flex gap-1.5 text-xs text-foreground"><span className="text-red-400 mt-0.5 flex-shrink-0">!</span>{a}</div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Desired Positioning</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">How do you want AI agents to position your store? This guides the perception analysis.</p>
          <Textarea value={positioning} onChange={(e) => setPositioning(e.target.value)} placeholder="e.g. Premium eco-friendly home goods for design-conscious families" className="text-sm resize-none h-20" />
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save positioning
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Query Simulation tab ─────────────────────────────────────────────────────

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground w-6 text-right">{score}</span>
    </div>
  );
}

function QueryTab({ storeId }: { storeId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["query-simulation", storeId],
    queryFn: () => getQuerySimulation(storeId),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const successRate = data ? Math.round((data.successCount / data.totalQueries) * 100) : 0;

  if (isLoading || isFetching) return (
    <Card><CardContent className="flex flex-col items-center gap-3 py-16">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-sm text-slate-400">Simulating AI buyer queries…</p>
    </CardContent></Card>
  );

  if (!data || data.results.length === 0) return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5"><Zap className="w-3.5 h-3.5" /> Run simulation</Button>
      <Card className="border-dashed"><CardContent className="py-12 text-center"><p className="text-sm text-slate-400">No simulation results yet</p></CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="text-center px-3 py-2 bg-white border border-slate-200 rounded-lg">
            <p className="text-lg font-bold text-slate-900">{successRate}%</p>
            <p className="text-[10px] text-slate-400">Recommendation rate</p>
          </div>
          <div className="text-center px-3 py-2 bg-white border border-slate-200 rounded-lg">
            <p className="text-lg font-bold text-slate-900">{data.successCount}/{data.totalQueries}</p>
            <p className="text-[10px] text-slate-400">Queries answered</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Re-run</Button>
      </div>
      <div className="space-y-3">
        {data.results.map((result: QuerySimulationResult, i: number) => (
          <div key={i} className={`rounded-lg border p-4 ${result.wouldRecommend ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-start gap-3">
              {result.wouldRecommend ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground mb-1.5">"{result.query}"</p>
                <div className="mb-2"><ConfidenceBar score={result.confidenceScore} /></div>
                <p className="text-xs text-muted-foreground mb-2">{result.reasoning}</p>
                {result.missingInfo.length > 0 && (
                  <div className="space-y-1">
                    {result.missingInfo.map((info, j) => (
                      <div key={j} className="flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] text-amber-700">{info}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Consistency tab ──────────────────────────────────────────────────────────

const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
  tone: { icon: "🎭", label: "Tone & Voice", color: "border-l-purple-400 bg-purple-50/30" },
  structure: { icon: "📐", label: "Structure", color: "border-l-blue-400 bg-blue-50/30" },
  formatting: { icon: "✏️", label: "Formatting", color: "border-l-amber-400 bg-amber-50/30" },
  missing_section: { icon: "❌", label: "Missing Sections", color: "border-l-red-400 bg-red-50/30" },
};

function ConsistencyTab({ storeId }: { storeId: string }) {
  const { data: report, isLoading } = useGetConsistencyReport(storeId, {
    query: { enabled: !!storeId, queryKey: getGetConsistencyReportQueryKey(storeId) },
  });

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  if (!report) return (
    <Card className="border-dashed"><CardContent className="py-12 text-center">
      <Shuffle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-sm text-slate-400">Run an analysis to check consistency</p>
    </CardContent></Card>
  );

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 space-y-3">
        {report.issues.length === 0 ? (
          <Card className="border-green-200 bg-green-50/30"><CardContent className="py-8 text-center"><p className="text-sm font-medium text-green-700">Excellent consistency</p></CardContent></Card>
        ) : (
          (report.issues as Array<{ type: string; description: string; affectedProductCount: number; examples: string[] }>).map((issue, i) => {
            const cfg = typeConfig[issue.type] ?? { icon: "⚠️", label: issue.type, color: "border-l-gray-400" };
            return (
              <Card key={i} className={`border-l-4 border-border ${cfg.color}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">{cfg.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{cfg.label}</p>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{issue.affectedProductCount} products</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{issue.description}</p>
                      {issue.examples.map((ex, j) => (
                        <div key={j} className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><span>•</span><span>{ex}</span></div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
      <div className="flex flex-col items-center gap-2 pt-4">
        <ScoreRing score={report.overallConsistencyScore} size={80} label="Consistency" />
        <div className="text-center mt-2">
          <p className="text-xs font-medium text-foreground">{report.issues.length} issue{report.issues.length !== 1 ? "s" : ""}</p>
          <p className="text-[10px] text-muted-foreground">across your catalog</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiReadiness() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">AI Readiness</h1>
          <p className="text-sm text-slate-500 mt-0.5">How AI agents perceive, query, and describe your store</p>
        </div>
        <Tabs defaultValue="perception">
          <TabsList className="mb-6 bg-slate-100 p-0.5 h-9">
            <TabsTrigger value="perception" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Bot className="w-3.5 h-3.5" /> AI Perception
            </TabsTrigger>
            <TabsTrigger value="query-test" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Zap className="w-3.5 h-3.5" /> Query Simulation
            </TabsTrigger>
            <TabsTrigger value="consistency" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Shuffle className="w-3.5 h-3.5" /> Consistency
            </TabsTrigger>
          </TabsList>
          <TabsContent value="perception" className="mt-0"><PerceptionTab storeId={activeStoreId} /></TabsContent>
          <TabsContent value="query-test" className="mt-0"><QueryTab storeId={activeStoreId} /></TabsContent>
          <TabsContent value="consistency" className="mt-0"><ConsistencyTab storeId={activeStoreId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
