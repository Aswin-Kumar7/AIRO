import { useStore } from "@/context/store-context";
import { useGetBenchmark, getGetBenchmarkQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useLocation } from "wouter";

function BenchmarkBar({ name, storeScore, benchmarkScore, gap, priority }: {
  name: string; storeScore: number; benchmarkScore: number; gap: number; priority: string;
}) {
  const isAhead = gap <= 0;
  const gapColor = isAhead ? "text-green-600" : priority === "high" ? "text-red-600" : priority === "medium" ? "text-amber-600" : "text-blue-600";
  const barColor = isAhead ? "bg-green-500" : priority === "high" ? "bg-red-400" : priority === "medium" ? "bg-amber-400" : "bg-blue-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">{name}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">You: <strong>{Math.round(storeScore)}</strong></span>
          <span className="text-xs text-muted-foreground">Benchmark: <strong>{Math.round(benchmarkScore)}</strong></span>
          <span className={`text-xs font-semibold ${gapColor} flex items-center gap-0.5`}>
            {isAhead ? <TrendingUp className="w-3 h-3" /> : gap > 15 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {isAhead ? `+${Math.abs(Math.round(gap))}` : `-${Math.round(gap)}`}
          </span>
        </div>
      </div>
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/30 z-10" style={{ left: `${benchmarkScore}%` }} />
        <div className={`absolute top-0 bottom-0 left-0 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, storeScore)}%` }} />
      </div>
    </div>
  );
}

export default function Benchmark() {
  const { activeStoreId } = useStore();
  const { data: benchmark, isLoading } = useGetBenchmark(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetBenchmarkQueryKey(activeStoreId!) },
  });
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Benchmark Comparison</h1>
          <p className="text-sm text-muted-foreground">How your store compares to the ideal AI-ready Shopify store</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : benchmark ? (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="border-border">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-foreground">{Math.round(benchmark.overallStoreScore)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Your Score</p>
                </CardContent>
              </Card>
              <Card className="border-border bg-muted/30">
                <CardContent className="p-4 text-center">
                  <p className="text-3xl font-bold text-foreground">{Math.round(benchmark.overallBenchmarkScore)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(benchmark as { benchmarkSource?: string }).benchmarkSource === "real-p90"
                      ? `P90 of ${(benchmark as { benchmarkSampleSize?: number }).benchmarkSampleSize} analyzed products`
                      : "Aspirational target"}
                  </p>
                </CardContent>
              </Card>
              <Card className={`border ${benchmark.overallGap > 0 ? "border-red-200 bg-red-50/30" : "border-green-200 bg-green-50/30"}`}>
                <CardContent className="p-4 text-center">
                  <div className={`flex items-center justify-center gap-1 ${benchmark.overallGap > 0 ? "text-red-600" : "text-green-600"}`}>
                    {benchmark.overallGap > 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                    <p className="text-3xl font-bold">{Math.abs(Math.round(benchmark.overallGap))}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{benchmark.overallGap > 0 ? "Points behind" : "Points ahead"}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card className="col-span-2 border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Dimension Breakdown
                  </CardTitle>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 bg-foreground/30 inline-block" /> Benchmark target
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-1.5 bg-primary inline-block rounded" /> Your score
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(benchmark.dimensions as Array<{ name: string; storeScore: number; benchmarkScore: number; gap: number; priority: string }>)
                    .sort((a, b) => b.gap - a.gap)
                    .map((dim) => (
                      <BenchmarkBar key={dim.name} {...dim} />
                    ))}
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    Priority Improvements
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {benchmark.topImprovements.map((improvement, i) => (
                    <div key={i} className="flex gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{improvement}</p>
                    </div>
                  ))}

                  <div className="mt-4 pt-3 border-t border-border">
                    <p className="text-[10px] font-medium text-muted-foreground mb-2">Overall progress</p>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-700"
                        style={{ width: `${(benchmark.overallStoreScore / benchmark.overallBenchmarkScore) * 100}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {Math.round((benchmark.overallStoreScore / benchmark.overallBenchmarkScore) * 100)}% of benchmark achieved
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Run an analysis to see your benchmark comparison</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
