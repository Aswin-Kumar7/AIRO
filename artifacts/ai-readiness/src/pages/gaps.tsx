import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListGaps, getListGapsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Zap, TrendingUp, Wrench } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

type Gap = {
  id: string;
  productId: string | null;
  productTitle?: string | null;
  category: string;
  severity: string;
  title: string;
  description: string;
  suggestion: string;
  evidence?: string | null;
  impactScore?: number | null;
  effortLevel?: string | null;
  ruleId?: string | null;
  isFixed: boolean;
};

const categoryIcons: Record<string, string> = {
  clarity: "🔍",
  completeness: "📋",
  trust: "🛡️",
  tags: "🏷️",
  policy: "📄",
  consistency: "🔄",
};

const effortConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Easy", className: "bg-green-100 text-green-700" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700" },
  high: { label: "High effort", className: "bg-red-100 text-red-700" },
};

function ImpactBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-amber-500" : "bg-blue-400";
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
  const severityBorder = gap.severity === "high" ? "border-l-red-500" : gap.severity === "medium" ? "border-l-amber-400" : "border-l-blue-400";

  return (
    <Card className={cn("border-l-4 border-border", severityBorder, gap.isFixed && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="text-base flex-shrink-0 mt-0.5">{categoryIcons[gap.category] ?? "⚠️"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{gap.title}</p>
                {gap.isFixed && <Badge variant="secondary" className="text-[10px] px-1.5 text-green-600">Fixed</Badge>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {effort && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${effort.className}`}>
                    {effort.label}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{gap.category}</Badge>
              </div>
            </div>

            {gap.productTitle && (
              <p className="text-[11px] text-muted-foreground mb-1.5">
                Product:{" "}
                {gap.productId ? (
                  <Link href={`/products/${gap.productId}`}>
                    <span className="text-primary hover:underline cursor-pointer">{gap.productTitle}</span>
                  </Link>
                ) : gap.productTitle}
              </p>
            )}

            {gap.evidence && (
              <div className="mb-2 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                Evidence: {gap.evidence}
              </div>
            )}

            <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{gap.description}</p>

            <div className="flex items-center justify-between">
              <div className="text-xs bg-background border border-border rounded px-2.5 py-1.5 text-foreground flex-1 mr-3">
                <span className="font-medium">Fix: </span>{gap.suggestion}
              </div>
              <div className="flex-shrink-0">
                <ImpactBar score={impact} />
              </div>
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
      <div className="space-y-2.5">
        {gaps.map((gap) => <GapCard key={gap.id} gap={gap} />)}
      </div>
    </div>
  );
}

export default function Gaps() {
  const { activeStoreId } = useStore();
  const { data: gaps, isLoading } = useListGaps(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getListGapsQueryKey(activeStoreId!) },
  }) as { data: Gap[] | undefined; isLoading: boolean };
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  const allGaps = gaps ?? [];
  const filtered = filterCategory === "all" ? allGaps : allGaps.filter(g => g.category === filterCategory);

  // Group by intent rather than severity
  const quickWins = filtered.filter(g => (g.effortLevel === "low" || !g.effortLevel) && (g.impactScore ?? 50) >= 40 && !g.isFixed);
  const highPriority = filtered.filter(g => g.severity === "high" && !quickWins.includes(g) && !g.isFixed);
  const improvements = filtered.filter(g => !quickWins.includes(g) && !highPriority.includes(g) && !g.isFixed);
  const fixed = filtered.filter(g => g.isFixed);

  const categories = [...new Set(allGaps.map(g => g.category))];

  const totalIssues = allGaps.length;
  const critCount = allGaps.filter(g => g.severity === "high" && !g.isFixed).length;
  const fixedCount = allGaps.filter(g => g.isFixed).length;
  const quickWinCount = allGaps.filter(g => (g.effortLevel === "low" || !g.effortLevel) && (g.impactScore ?? 50) >= 40 && !g.isFixed).length;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Gap Analysis</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Evidence-based issues found across your store's product catalog
            </p>
          </div>
          <div className="flex gap-2">
            {[
              { label: "Total", count: totalIssues, color: "text-foreground" },
              { label: "Critical", count: critCount, color: "text-red-600" },
              { label: "Quick wins", count: quickWinCount, color: "text-green-600" },
              { label: "Fixed", count: fixedCount, color: "text-muted-foreground" },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-center px-3 py-2 bg-card border border-border rounded-lg min-w-[52px]">
                <p className={`text-base font-bold ${color}`}>{count}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Category filters */}
        <div className="flex items-center gap-1.5 mb-5 flex-wrap">
          {["all", ...categories].map(c => (
            <button key={c} onClick={() => setFilterCategory(c)}
              className={cn("text-xs px-3 py-1 rounded-full border transition-colors capitalize",
                filterCategory === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40"
              )}>
              {c === "all" ? "All" : `${categoryIcons[c] ?? ""} ${c}`}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-8">
            <GapGroup
              title="Quick Wins — high impact, low effort"
              icon={Zap}
              iconColor="text-green-500"
              gaps={quickWins}
            />
            <GapGroup
              title="High Priority"
              icon={AlertTriangle}
              iconColor="text-red-500"
              gaps={highPriority}
            />
            <GapGroup
              title="Improvements"
              icon={TrendingUp}
              iconColor="text-blue-500"
              gaps={improvements}
            />
            {fixed.length > 0 && (
              <GapGroup
                title="Fixed"
                icon={Wrench}
                iconColor="text-muted-foreground"
                gaps={fixed}
              />
            )}

            {filtered.length === 0 && !isLoading && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No gaps found — run an analysis first</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
