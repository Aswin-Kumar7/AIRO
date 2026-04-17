import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListGaps, getListGapsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Filter } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const categoryIcons: Record<string, string> = {
  clarity: "🔍",
  completeness: "📋",
  trust: "🛡️",
  tags: "🏷️",
  policy: "📄",
  consistency: "🔄",
};

const severityConfig = {
  high: { label: "Critical", className: "border-l-red-500 bg-red-50/30", dotColor: "bg-red-500" },
  medium: { label: "Medium", className: "border-l-amber-500 bg-amber-50/30", dotColor: "bg-amber-500" },
  low: { label: "Low", className: "border-l-blue-400 bg-blue-50/20", dotColor: "bg-blue-400" },
};

export default function Gaps() {
  const { activeStoreId } = useStore();
  const { data: gaps, isLoading } = useListGaps(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getListGapsQueryKey(activeStoreId!) },
  });
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  const filtered = gaps?.filter(g => {
    if (filterSeverity !== "all" && g.severity !== filterSeverity) return false;
    if (filterCategory !== "all" && g.category !== filterCategory) return false;
    return true;
  }) ?? [];

  const grouped = {
    high: filtered.filter(g => g.severity === "high"),
    medium: filtered.filter(g => g.severity === "medium"),
    low: filtered.filter(g => g.severity === "low"),
  };

  const categories = [...new Set(gaps?.map(g => g.category) ?? [])];

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Gap Analysis</h1>
            <p className="text-sm text-muted-foreground">{gaps?.length ?? 0} issues identified across your store</p>
          </div>

          <div className="flex gap-3">
            {[
              { label: "Critical", count: gaps?.filter(g => g.severity === "high").length ?? 0, color: "text-red-600" },
              { label: "Medium", count: gaps?.filter(g => g.severity === "medium").length ?? 0, color: "text-amber-600" },
              { label: "Low", count: gaps?.filter(g => g.severity === "low").length ?? 0, color: "text-blue-600" },
            ].map(({ label, count, color }) => (
              <div key={label} className="text-center px-3 py-2 bg-card border border-border rounded-lg">
                <p className={`text-lg font-bold ${color}`}>{count}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          {["all", "high", "medium", "low"].map(s => (
            <button key={s} onClick={() => setFilterSeverity(s)}
              className={cn("text-xs px-3 py-1 rounded-full border transition-colors",
                filterSeverity === s ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40"
              )}>
              {s === "all" ? "All severity" : s === "high" ? "Critical" : s === "medium" ? "Medium" : "Low"}
            </button>
          ))}
          <span className="text-muted-foreground text-xs">|</span>
          {["all", ...categories].map(c => (
            <button key={c} onClick={() => setFilterCategory(c)}
              className={cn("text-xs px-3 py-1 rounded-full border transition-colors capitalize",
                filterCategory === c ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40"
              )}>
              {c === "all" ? "All categories" : `${categoryIcons[c] ?? ""} ${c}`}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {(["high", "medium", "low"] as const).map(severity => {
              const sGaps = grouped[severity];
              if (sGaps.length === 0) return null;
              const config = severityConfig[severity];
              return (
                <div key={severity}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                    <h2 className="text-sm font-semibold text-foreground">{config.label} Priority</h2>
                    <span className="text-xs text-muted-foreground">({sGaps.length})</span>
                  </div>
                  <div className="space-y-2">
                    {sGaps.map((gap) => (
                      <Card key={gap.id} className={`border-l-4 border-border ${config.className}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0">{categoryIcons[gap.category] ?? "⚠️"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <p className="text-sm font-semibold text-foreground">{gap.title}</p>
                                <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{gap.category}</Badge>
                                {gap.isFixed && <Badge variant="secondary" className="text-[10px] px-1.5 text-green-600">Fixed</Badge>}
                              </div>
                              {gap.productTitle && (
                                <p className="text-[11px] text-muted-foreground mb-1">
                                  Product:{" "}
                                  {gap.productId ? (
                                    <Link href={`/products/${gap.productId}`}>
                                      <span className="text-primary hover:underline cursor-pointer">{gap.productTitle}</span>
                                    </Link>
                                  ) : gap.productTitle}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mb-2">{gap.description}</p>
                              <div className="text-xs bg-background border border-border rounded px-3 py-2 text-foreground">
                                <span className="font-medium">Suggested fix: </span>{gap.suggestion}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No gaps found matching your filters</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
