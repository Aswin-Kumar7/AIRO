import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, AlertCircle, TrendingUp, Package } from "lucide-react";
import { getTopicalAuthority, type TopicalCluster } from "@/lib/features-api";

function CoverageBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  const textColor = score >= 70 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-8 text-right ${textColor}`}>{score}</span>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: TopicalCluster }) {
  const isWeak = cluster.coverageScore < 50;
  return (
    <Card className={isWeak ? "border-amber-200 dark:border-amber-900" : "border-border"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{cluster.topic}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Package className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{cluster.productCount} product{cluster.productCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xl font-bold ${cluster.coverageScore >= 70 ? "text-green-600" : cluster.coverageScore >= 40 ? "text-amber-600" : "text-red-600"}`}>
              {cluster.coverageScore}
            </span>
            <p className="text-[10px] text-muted-foreground">coverage</p>
          </div>
        </div>

        {/* Product list */}
        <div className="flex flex-wrap gap-1 mb-3">
          {cluster.products.slice(0, 4).map((p, i) => (
            <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground border border-border">
              {p}
            </span>
          ))}
          {cluster.products.length > 4 && (
            <span className="text-[10px] text-muted-foreground self-center">+{cluster.products.length - 4} more</span>
          )}
        </div>

        {/* Gaps */}
        {cluster.gaps.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Content gaps</p>
            {cluster.gaps.map((gap, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground">{gap}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TopicalAuthority() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["topical-authority", activeStoreId],
    queryFn: () => getTopicalAuthority(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 5 * 60 * 1000,
  });

  if (!activeStoreId) { navigate("/"); return null; }

  const sorted = [...(data?.clusters ?? [])].sort((a, b) => a.coverageScore - b.coverageScore);

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              Topical Authority
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              How well your catalog covers each product topic for AI search engines
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Re-analyze"}
          </Button>
        </div>

        {isLoading || isFetching ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Mapping your topic clusters…</p>
                <p className="text-xs text-muted-foreground mt-1">Analyzing how thoroughly each product category is covered</p>
              </div>
            </CardContent>
          </Card>
        ) : data && sorted.length > 0 ? (
          <>
            {/* Coverage summary */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Coverage by Topic
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2.5">
                {sorted.map((cluster) => (
                  <CoverageBar key={cluster.topic} label={cluster.topic} score={cluster.coverageScore} />
                ))}
                <div className="pt-2 border-t border-border flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Average coverage</span>
                  <span className="text-sm font-bold text-foreground">{data.averageCoverageScore}/100</span>
                </div>
              </CardContent>
            </Card>

            {/* Cluster detail cards — weakest first */}
            <div className="space-y-3">
              {sorted.map((cluster) => (
                <ClusterCard key={cluster.topic} cluster={cluster} />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No products to analyze. Fetch your store products first.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
