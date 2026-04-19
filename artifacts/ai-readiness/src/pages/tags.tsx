import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Tag, AlertTriangle } from "lucide-react";
import { getStoreTagOptimizer } from "@/lib/insights-api";

export default function Tags() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["store-tag-optimizer", activeStoreId],
    queryFn: () => getStoreTagOptimizer(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!activeStoreId) { navigate("/"); return null; }

  const needsAttention = data?.items.filter(i => i.needsAttention) ?? [];

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Tag Optimizer</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Semantic tag coverage and AI retrieval suggestions</p>
          </div>
          {data && (
            <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-center">
              <p className="text-lg font-bold text-amber-700">{data.productsNeedingAttention}</p>
              <p className="text-[10px] text-amber-600">need attention</p>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="space-y-3">
            {data.items.map((item) => (
              <Card key={item.productId} className={`border-border ${item.needsAttention ? "border-l-4 border-l-amber-400" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <Link href={`/products/${item.productId}`}>
                        <p className="text-sm font-semibold text-foreground hover:text-primary cursor-pointer truncate">{item.title}</p>
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.recommendationSummary}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.needsAttention && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                      <span className={`text-xs font-bold tabular-nums ${item.tagScore >= 70 ? "text-green-600" : item.tagScore >= 40 ? "text-amber-600" : "text-red-600"}`}>
                        {Math.round(item.tagScore)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">Current tags</p>
                      <div className="flex flex-wrap gap-1">
                        {item.currentTags.length > 0 ? item.currentTags.map((t) => (
                          <Badge
                            key={t}
                            variant={item.genericTags.includes(t) ? "destructive" : "outline"}
                            className="text-[10px] px-1.5 h-5"
                          >
                            {t}
                          </Badge>
                        )) : <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">Suggested tags</p>
                      <div className="flex flex-wrap gap-1">
                        {item.suggestedTags.length > 0 ? item.suggestedTags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 h-5 text-primary">
                            {t}
                          </Badge>
                        )) : <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Tag className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Run an analysis to get tag optimization suggestions</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
