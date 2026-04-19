import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, CheckCircle2, XCircle, AlertCircle, TrendingUp } from "lucide-react";
import { getQuerySimulation, type QuerySimulationResult } from "@/lib/features-api";

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

function QueryCard({ result }: { result: QuerySimulationResult }) {
  const success = result.wouldRecommend;
  return (
    <div className={`rounded-lg border p-4 ${success ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900" : "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900"}`}>
      <div className="flex items-start gap-3">
        {success
          ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
          : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground mb-1.5">"{result.query}"</p>

          <div className="mb-2">
            <ConfidenceBar score={result.confidenceScore} />
          </div>

          {result.recommendedProduct && (
            <p className="text-xs text-muted-foreground mb-1.5">
              <span className="font-medium text-green-700 dark:text-green-400">Matched: </span>
              {result.recommendedProduct}
            </p>
          )}

          <p className="text-xs text-muted-foreground mb-2">{result.reasoning}</p>

          {result.missingInfo.length > 0 && (
            <div className="space-y-1">
              {result.missingInfo.map((info, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-[11px] text-amber-700 dark:text-amber-400">{info}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QueryTest() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["query-simulation", activeStoreId],
    queryFn: () => getQuerySimulation(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 5 * 60 * 1000,
  });

  if (!activeStoreId) { navigate("/"); return null; }

  const successRate = data ? Math.round((data.successCount / data.totalQueries) * 100) : 0;
  const avgConfidence = data?.results.length
    ? Math.round(data.results.reduce((s, r) => s + r.confidenceScore, 0) / data.results.length)
    : 0;

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              AI Query Simulation
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real buyer queries tested against your catalog — would an AI recommend your products?
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Re-run"}
          </Button>
        </div>

        {isLoading || isFetching ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Simulating AI buyer queries…</p>
                <p className="text-xs text-muted-foreground mt-1">Testing how AI assistants respond to real shopping questions about your store</p>
              </div>
            </CardContent>
          </Card>
        ) : data && data.results.length > 0 ? (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <div>
                    <p className="text-lg font-bold text-foreground">{successRate}%</p>
                    <p className="text-[10px] text-muted-foreground">Recommendation rate</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <div>
                    <p className="text-lg font-bold text-foreground">{data.successCount}/{data.totalQueries}</p>
                    <p className="text-[10px] text-muted-foreground">Queries answered</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <div>
                    <p className="text-lg font-bold text-foreground">{avgConfidence}</p>
                    <p className="text-[10px] text-muted-foreground">Avg. confidence</p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="space-y-3">
              {data.results.map((result, i) => (
                <QueryCard key={i} result={result} />
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              Generated {new Date(data.generatedAt).toLocaleString()} · Queries are AI-generated based on your catalog
            </p>
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Zap className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No products found. Connect and fetch your store products first.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
