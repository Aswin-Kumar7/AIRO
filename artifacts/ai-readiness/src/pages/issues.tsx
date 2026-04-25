import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListGaps, getListGapsQueryKey } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertTriangle, Zap, TrendingUp, Wrench, ListChecks, Package, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { getStorePerception, type ActionPlanItem } from "@/lib/insights-api";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

// ─── Gaps tab types & helpers ─────────────────────────────────────────────────

type Gap = {
  id: string; productId: string | null; productTitle?: string | null;
  category: string; severity: string; title: string; description: string;
  suggestion: string; evidence?: string | null; impactScore?: number | null;
  effortLevel?: string | null; ruleId?: string | null; isFixed: boolean;
};

const categoryIcons: Record<string, string> = {
  clarity: "🔍", completeness: "📋", trust: "🛡️", tags: "🏷️", policy: "📄", consistency: "🔄",
};
const effortConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Easy", className: "bg-green-100 text-green-700" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700" },
  high: { label: "High effort", className: "bg-red-100 text-red-700" },
};

function ImpactBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-amber-500" : "bg-violet-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{score}</span>
    </div>
  );
}

function GapCard({ gap }: { gap: Gap }) {
  const effort = gap.effortLevel ? effortConfig[gap.effortLevel] : null;
  const impact = gap.impactScore ?? 50;
  const border = gap.severity === "high" ? "border-l-red-500" : gap.severity === "medium" ? "border-l-amber-400" : "border-l-violet-400";
  return (
    <Card className={cn("border-l-4 border-border", border, gap.isFixed && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-base flex-shrink-0 mt-0.5">{categoryIcons[gap.category] ?? "⚠️"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{gap.title}</p>
                {gap.isFixed && <Badge variant="secondary" className="text-[10px] px-1.5 text-emerald-600">Fixed</Badge>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {effort && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${effort.className}`}>{effort.label}</span>}
                <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{gap.category}</Badge>
              </div>
            </div>
            {gap.productTitle && (
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Product:{" "}
                {gap.productId
                  ? <Link href={`/products/${gap.productId}`}><span className="text-primary hover:underline cursor-pointer">{gap.productTitle}</span></Link>
                  : gap.productTitle}
              </p>
            )}
            {gap.evidence && (
              <div className="mb-2 px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded text-[11px] text-amber-800 font-medium">
                Evidence: {gap.evidence}
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{gap.description}</p>
            <div className="flex items-center justify-between">
              <div className="text-xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground flex-1 mr-3">
                <span className="font-medium">Fix: </span>{gap.suggestion}
              </div>
              <div className="flex-shrink-0"><ImpactBar score={impact} /></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GapGroup({ title, icon: Icon, gaps, iconColor }: { title: string; icon: React.FC<{ className?: string }>; gaps: Gap[]; iconColor: string }) {
  if (gaps.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">({gaps.length})</span>
      </div>
      <div className="space-y-2.5">{gaps.map((g) => <GapCard key={g.id} gap={g} />)}</div>
    </div>
  );
}

// ─── Action Plan tab ──────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<ActionPlanItem["severity"], string> = {
  high: "bg-red-50 border-red-200", medium: "bg-amber-50 border-amber-200", low: "bg-violet-50 border-violet-200",
};
const SEVERITY_BADGE: Record<ActionPlanItem["severity"], string> = {
  high: "bg-red-100 text-red-700 border-red-200", medium: "bg-amber-100 text-amber-700 border-amber-200", low: "bg-violet-100 text-violet-700 border-violet-200",
};
const SEVERITY_ORDER: Record<ActionPlanItem["severity"], number> = { high: 0, medium: 1, low: 2 };

function ActionCard({ item, rank }: { item: ActionPlanItem; rank: number }) {
  return (
    <div className={`rounded-lg border p-4 ${SEVERITY_COLORS[item.severity]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center text-xs font-bold text-foreground">{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-foreground">{item.gap}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${SEVERITY_BADGE[item.severity]}`}>{item.severity}</span>
          </div>
          <div className="flex items-start gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
            <span className="text-xs text-muted-foreground leading-snug">{item.conversionImpact}</span>
          </div>
          <div className="rounded-md bg-background/70 border border-border/60 px-3 py-2 mb-2">
            <p className="text-xs font-medium text-foreground mb-0.5">Suggested fix</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{item.suggestedFix}</p>
          </div>
          {item.productId && item.productTitle && (
            <Link href={`/products/${item.productId}`}>
              <div className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer">
                <Package className="w-3 h-3" />{item.productTitle}
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Issues() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const [filterCategory, setFilterCategory] = useState("all");

  const { data: gapsData, isLoading: gapsLoading } = useListGaps(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getListGapsQueryKey(activeStoreId!) },
  }) as { data: Gap[] | undefined; isLoading: boolean };

  const queryClient = useQueryClient();
  const { data: planData, isLoading: planLoading, isFetching: planFetching } = useQuery({
    queryKey: ["store-perception", activeStoreId],
    queryFn: () => getStorePerception(activeStoreId!),
    enabled: !!activeStoreId,
  });

  const isRefreshing = gapsLoading || planFetching;

  function handleHardRefresh() {
    queryClient.invalidateQueries({ queryKey: getListGapsQueryKey(activeStoreId!) });
    queryClient.invalidateQueries({ queryKey: ["store-perception", activeStoreId] });
  }

  if (!activeStoreId) { navigate("/"); return null; }

  const allGaps = gapsData ?? [];
  const filtered = filterCategory === "all" ? allGaps : allGaps.filter((g) => g.category === filterCategory);
  const quickWins = filtered.filter((g) => (g.effortLevel === "low" || !g.effortLevel) && (g.impactScore ?? 50) >= 40 && !g.isFixed);
  const highPriority = filtered.filter((g) => g.severity === "high" && !quickWins.includes(g) && !g.isFixed);
  const improvements = filtered.filter((g) => !quickWins.includes(g) && !highPriority.includes(g) && !g.isFixed);
  const fixed = filtered.filter((g) => g.isFixed);
  const categories = [...new Set(allGaps.map((g) => g.category))];

  const plan = planData?.prioritizedActionPlan ?? [];
  const sorted = [...plan].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const critCount = allGaps.filter((g) => g.severity === "high" && !g.isFixed).length;
  const mediumCount = allGaps.filter((g) => g.severity === "medium" && !g.isFixed).length;
  const fixedCount = allGaps.filter((g) => g.isFixed).length;
  const total = allGaps.filter((g) => !g.isFixed).length;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">Issues</h1>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1 opacity-70 hover:opacity-100" onClick={handleHardRefresh} disabled={isRefreshing}>
                <RefreshCw className={cn("w-3 h-3", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Evidence-based gaps and prioritized action plan</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Issues", value: total, color: "text-slate-900" },
            { label: "Critical", value: critCount, color: "text-red-600" },
            { label: "Medium", value: mediumCount, color: "text-amber-600" },
            { label: "Fixed", value: fixedCount, color: "text-emerald-600" },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-lg border border-slate-200 p-3 text-center">
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="gaps">
          <TabsList className="mb-5 bg-slate-100 p-0.5 h-9">
            <TabsTrigger value="gaps" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700">
              <AlertTriangle className="w-3.5 h-3.5" /> All Issues
            </TabsTrigger>
            <TabsTrigger value="action-plan" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700">
              <ListChecks className="w-3.5 h-3.5" /> Action Plan
            </TabsTrigger>
            <TabsTrigger value="fixed" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700">
              <Wrench className="w-3.5 h-3.5" /> Fixed ({fixedCount})
            </TabsTrigger>
          </TabsList>

          {/* ── All Issues ── */}
          <TabsContent value="gaps" className="mt-0">
            <div className="flex items-center gap-1.5 mb-5 flex-wrap">
              {["all", ...categories].map((c) => (
                <button key={c} onClick={() => setFilterCategory(c)}
                  className={cn("text-xs px-3 py-1 rounded-full border transition-colors capitalize",
                    filterCategory === c
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}>
                  {c === "all" ? "All categories" : `${categoryIcons[c] ?? ""} ${c}`}
                </button>
              ))}
            </div>
            {gapsLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : (
              <div className="space-y-8">
                <GapGroup title="Quick Wins — high impact, low effort" icon={Zap} iconColor="text-green-500" gaps={quickWins} />
                <GapGroup title="High Priority" icon={AlertTriangle} iconColor="text-red-500" gaps={highPriority} />
                <GapGroup title="Improvements" icon={TrendingUp} iconColor="text-violet-500" gaps={improvements} />
                {filtered.length === 0 && (
                  <Card className="border-dashed"><CardContent className="py-12 text-center"><p className="text-sm text-slate-400">No gaps found — run an analysis first</p></CardContent></Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Action Plan ── */}
          <TabsContent value="action-plan" className="mt-0">
            {planLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
            ) : sorted.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                <p className="text-sm text-slate-400">Run a full analysis to generate an action plan</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[1.1rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {sorted.filter(i => i.severity === "high").length > 0 && (
                  <div className="relative space-y-3 z-10 w-full mb-8">
                    <h3 className="text-sm font-bold text-red-600 flex items-center justify-center bg-white py-1 relative">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-red-100 text-red-700 text-xs shadow-sm absolute left-0 md:bg-white md:static mr-2">1</span>
                      Phase 1: Immediate Action
                    </h3>
                    <div className="space-y-3 px-8 md:px-0">
                      {sorted.filter(i => i.severity === "high").map((item, idx) => <ActionCard key={item.gapId} item={item} rank={idx + 1} />)}
                    </div>
                  </div>
                )}
                {sorted.filter(i => i.severity === "medium").length > 0 && (
                  <div className="relative space-y-3 z-10 w-full mb-8">
                    <h3 className="text-sm font-bold text-amber-600 flex items-center justify-center bg-white py-1 relative">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-amber-100 text-amber-700 text-xs shadow-sm absolute left-0 md:bg-white md:static mr-2">2</span>
                      Phase 2: Short-Term Fixes
                    </h3>
                    <div className="space-y-3 px-8 md:px-0">
                      {sorted.filter(i => i.severity === "medium").map((item, idx) => <ActionCard key={item.gapId} item={item} rank={sorted.filter(i => i.severity === "high").length + idx + 1} />)}
                    </div>
                  </div>
                )}
                {sorted.filter(i => i.severity === "low").length > 0 && (
                  <div className="relative space-y-3 z-10 w-full">
                    <h3 className="text-sm font-bold text-violet-600 flex items-center justify-center bg-white py-1 relative">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-violet-100 text-violet-700 text-xs shadow-sm absolute left-0 md:bg-white md:static mr-2">3</span>
                      Phase 3: Long-Term Enhancements
                    </h3>
                    <div className="space-y-3 px-8 md:px-0">
                      {sorted.filter(i => i.severity === "low").map((item, idx) => <ActionCard key={item.gapId} item={item} rank={sorted.filter(i => i.severity === "high").length + sorted.filter(i => i.severity === "medium").length + idx + 1} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Fixed ── */}
          <TabsContent value="fixed" className="mt-0">
            {fixed.length === 0 ? (
              <Card className="border-dashed"><CardContent className="py-12 text-center"><p className="text-sm text-slate-400">No fixed issues yet</p></CardContent></Card>
            ) : (
              <div className="space-y-2.5">{fixed.map((g) => <GapCard key={g.id} gap={g} />)}</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
