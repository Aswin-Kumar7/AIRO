import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ListChecks, TrendingUp, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getStorePerception, type ActionPlanItem } from "@/lib/insights-api";

const SEVERITY_COLORS: Record<ActionPlanItem["severity"], string> = {
  high: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900",
  medium: "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900",
  low: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900",
};

const SEVERITY_BADGE: Record<ActionPlanItem["severity"], string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const CATEGORY_LABEL: Record<string, string> = {
  clarity: "Clarity",
  completeness: "Completeness",
  trust: "Trust",
  tags: "Tags",
  policy: "Policy",
  consistency: "Consistency",
};

function ImpactBadge({ impact }: { impact: string }) {
  const level = impact.toLowerCase().startsWith("high")
    ? "high"
    : impact.toLowerCase().startsWith("medium")
    ? "medium"
    : "low";
  const colors = { high: "text-red-600", medium: "text-amber-600", low: "text-blue-600" };
  return (
    <div className="flex items-start gap-1.5">
      <TrendingUp className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${colors[level]}`} />
      <span className="text-xs text-muted-foreground leading-snug">{impact}</span>
    </div>
  );
}

function ActionCard({ item, rank }: { item: ActionPlanItem; rank: number }) {
  return (
    <div className={`rounded-lg border p-4 ${SEVERITY_COLORS[item.severity]}`}>
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center text-xs font-bold text-foreground">
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-foreground">{item.gap}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${SEVERITY_BADGE[item.severity]}`}>
              {item.severity}
            </span>
            {item.category && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                {CATEGORY_LABEL[item.category] ?? item.category}
              </span>
            )}
          </div>

          {/* Conversion impact */}
          <div className="mb-2">
            <ImpactBadge impact={item.conversionImpact} />
          </div>

          {/* Suggested fix */}
          <div className="rounded-md bg-background/70 border border-border/60 px-3 py-2 mb-2">
            <p className="text-xs font-medium text-foreground mb-0.5">Suggested fix</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{item.suggestedFix}</p>
          </div>

          {/* Product link if applicable */}
          {item.productId && item.productTitle && (
            <Link href={`/products/${item.productId}`}>
              <div className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer">
                <Package className="w-3 h-3" />
                {item.productTitle}
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

const SEVERITY_ORDER: Record<ActionPlanItem["severity"], number> = { high: 0, medium: 1, low: 2 };

export default function ActionPlan() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["store-perception", activeStoreId],
    queryFn: () => getStorePerception(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  const plan = data?.prioritizedActionPlan ?? [];
  const highCount = plan.filter(i => i.severity === "high").length;
  const mediumCount = plan.filter(i => i.severity === "medium").length;
  const lowCount = plan.filter(i => i.severity === "low").length;

  const sorted = [...plan].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              Action Plan
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Prioritized fixes ranked by AI-conversion impact
            </p>
          </div>
          {data?.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Last updated {new Date(data.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : plan.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-48 gap-3">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="text-sm font-medium text-foreground">No action items</p>
              <p className="text-xs text-muted-foreground text-center max-w-xs">
                Run a full store analysis to generate a prioritized action plan based on your gaps.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <div>
                    <p className="text-lg font-bold text-foreground">{highCount}</p>
                    <p className="text-[10px] text-muted-foreground">Critical</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-lg font-bold text-foreground">{mediumCount}</p>
                    <p className="text-[10px] text-muted-foreground">Important</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-lg font-bold text-foreground">{lowCount}</p>
                    <p className="text-[10px] text-muted-foreground">Improvements</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Action items */}
            <div className="space-y-3">
              {sorted.map((item, idx) => (
                <ActionCard key={item.gapId} item={item} rank={idx + 1} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
