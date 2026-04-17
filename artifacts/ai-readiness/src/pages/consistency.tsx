import { useStore } from "@/context/store-context";
import { useGetConsistencyReport, getGetConsistencyReportQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { ScoreRing } from "@/components/score-ring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Shuffle, ListChecks } from "lucide-react";
import { useLocation } from "wouter";

const typeConfig: Record<string, { icon: string; label: string; color: string }> = {
  tone: { icon: "🎭", label: "Tone & Voice", color: "border-l-purple-400 bg-purple-50/30" },
  structure: { icon: "📐", label: "Structure", color: "border-l-blue-400 bg-blue-50/30" },
  formatting: { icon: "✏️", label: "Formatting", color: "border-l-amber-400 bg-amber-50/30" },
  missing_section: { icon: "❌", label: "Missing Sections", color: "border-l-red-400 bg-red-50/30" },
};

export default function Consistency() {
  const { activeStoreId } = useStore();
  const { data: report, isLoading } = useGetConsistencyReport(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetConsistencyReportQueryKey(activeStoreId!) },
  });
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Consistency Report</h1>
            <p className="text-sm text-muted-foreground">How consistently your products are described across your store</p>
          </div>
          {report && <ScoreRing score={report.overallConsistencyScore} size={72} label="Consistency" />}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : report ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-primary" />
                Consistency Issues ({report.issues.length})
              </h2>

              {report.issues.length === 0 ? (
                <Card className="border-green-200 bg-green-50/30">
                  <CardContent className="py-8 text-center">
                    <p className="text-sm font-medium text-green-700">Excellent consistency across your store</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {(report.issues as Array<{ type: string; description: string; affectedProductCount: number; examples: string[] }>).map((issue, i) => {
                    const config = typeConfig[issue.type] ?? { icon: "⚠️", label: issue.type, color: "border-l-gray-400" };
                    return (
                      <Card key={i} className={`border-l-4 border-border ${config.color}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <span className="text-xl flex-shrink-0">{config.icon}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-semibold text-foreground">{config.label}</p>
                                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  {issue.affectedProductCount} products affected
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">{issue.description}</p>
                              {issue.examples.length > 0 && (
                                <div className="space-y-1">
                                  {issue.examples.map((ex, j) => (
                                    <div key={j} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                      <span className="mt-0.5">•</span>
                                      <span>{ex}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-primary" />
                    Suggested Structure
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] text-muted-foreground mb-3">Apply this structure to all products for AI-ready consistency:</p>
                  <div className="space-y-2">
                    {report.suggestedStructure.map((section, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </div>
                        <p className="text-xs text-foreground">{section}</p>
                      </div>
                    ))}
                  </div>
                  {report.analyzedAt && (
                    <p className="text-[10px] text-muted-foreground mt-4 pt-3 border-t border-border">
                      Analyzed {new Date(report.analyzedAt).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Shuffle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Run an analysis to generate your consistency report</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
