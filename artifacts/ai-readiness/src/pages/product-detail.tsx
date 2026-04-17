import { useStore } from "@/context/store-context";
import { useGetProduct, useApplyFix, getGetProductQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { ScoreRing, ScoreBar } from "@/components/score-ring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Tag, AlertTriangle, CheckCircle, ChevronLeft, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

const severityColors: Record<string, string> = {
  high: "border-l-red-500 bg-red-50/40",
  medium: "border-l-amber-500 bg-amber-50/40",
  low: "border-l-blue-400 bg-blue-50/20",
};

const categoryIcons: Record<string, string> = {
  clarity: "🔍",
  completeness: "📋",
  trust: "🛡️",
  tags: "🏷️",
  policy: "📄",
  consistency: "🔄",
};

function FixCard({ fix, storeId, productId }: {
  fix: {
    id: string; type: string; status: string;
    originalContent: string; improvedContent: string;
    explanation: string; estimatedScoreImprovement: number;
  };
  storeId: string;
  productId: string;
}) {
  const applyFix = useApplyFix();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  async function handleApply() {
    await applyFix.mutateAsync({ storeId, fixId: fix.id });
    queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(storeId, productId) });
  }

  return (
    <Card className={`border ${fix.status === "applied" ? "border-green-200 bg-green-50/50" : "border-border"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] px-1.5 capitalize">{fix.type}</Badge>
              <span className="text-[11px] text-green-600 font-medium">+{fix.estimatedScoreImprovement} pts</span>
              {fix.status === "applied" && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
            </div>
            <p className="text-xs font-medium text-foreground">{fix.explanation}</p>
          </div>
          {fix.status === "pending" && (
            <Button size="sm" variant="outline" onClick={handleApply} disabled={applyFix.isPending} className="flex-shrink-0 text-xs h-7">
              {applyFix.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
            </Button>
          )}
        </div>

        <Button variant="ghost" size="sm" className="text-[10px] h-6 px-1 mt-2 text-muted-foreground" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide" : "Show"} before/after
        </Button>

        {expanded && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium text-red-600 mb-1 uppercase tracking-wider">Before</p>
              <div className="text-[11px] text-foreground bg-red-50 border border-red-100 rounded p-2.5 max-h-32 overflow-y-auto leading-relaxed">
                {fix.originalContent || "(empty)"}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-medium text-green-600 mb-1 uppercase tracking-wider">After</p>
              <div className="text-[11px] text-foreground bg-green-50 border border-green-100 rounded p-2.5 max-h-32 overflow-y-auto leading-relaxed">
                {fix.improvedContent}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductDetail({ params }: { params: { productId: string } }) {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const { data: product, isLoading } = useGetProduct(activeStoreId!, params.productId, {
    query: {
      enabled: !!activeStoreId && !!params.productId,
      queryKey: getGetProductQueryKey(activeStoreId!, params.productId),
    },
  });

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/products">
          <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground -ml-2">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Products
          </Button>
        </Link>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : product ? (
          <>
            <div className="flex items-start gap-4 mb-6">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.title} className="w-16 h-16 rounded-xl object-cover border border-border" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center">
                  <Package className="w-7 h-7 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl font-bold text-foreground">{product.title}</h1>
                <div className="flex items-center gap-2 mt-1">
                  {product.productType && <Badge variant="secondary" className="text-[10px]">{product.productType}</Badge>}
                  {product.vendor && <span className="text-xs text-muted-foreground">by {product.vendor}</span>}
                  {product.price && <span className="text-xs text-muted-foreground">${product.price}</span>}
                </div>
              </div>
              <ScoreRing score={product.score.overall} size={72} label="Overall Score" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Score Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ScoreBar score={product.score.clarity} label="Clarity — How clearly is this product described for AI?" />
                    <ScoreBar score={product.score.completeness} label="Completeness — Are specs, dimensions, and details present?" />
                    <ScoreBar score={product.score.trust} label="Trust Signals — Guarantees, materials, certifications?" />
                    <ScoreBar score={product.score.tags} label="Tag Quality — Are tags semantic and AI-retrieval-ready?" />
                  </CardContent>
                </Card>

                {product.aiPerceptionSummary && (
                  <Card className="border-border bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary" />
                        How AI Agents Perceive This Product
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-foreground leading-relaxed">{product.aiPerceptionSummary}</p>
                    </CardContent>
                  </Card>
                )}

                {product.issues.length > 0 && (
                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Issues ({product.issues.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {product.issues.map((issue) => (
                        <div key={issue.id} className={`p-3 rounded-lg border-l-4 border-border ${severityColors[issue.severity] ?? ""}`}>
                          <div className="flex items-start gap-2">
                            <span>{categoryIcons[issue.category] ?? "⚠️"}</span>
                            <div>
                              <p className="text-xs font-semibold">{issue.title}</p>
                              <p className="text-[11px] mt-0.5 text-muted-foreground">{issue.description}</p>
                              <p className="text-[11px] mt-1 font-medium text-foreground">Fix: {issue.suggestion}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {product.fixes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      AI-Generated Fixes ({product.fixes.length})
                    </h3>
                    <div className="space-y-2">
                      {product.fixes.map((fix) => (
                        <FixCard key={fix.id} fix={fix} storeId={activeStoreId} productId={params.productId} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5" />
                      Current Tags ({product.tags.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {product.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {product.tags.map(tag => (
                          <span key={tag} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border">{tag}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No tags</p>
                    )}
                  </CardContent>
                </Card>

                {product.suggestedTags.length > 0 && (
                  <Card className="border-green-200 bg-green-50/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs flex items-center gap-2 text-green-700">
                        <Sparkles className="w-3.5 h-3.5" />
                        Suggested Tags
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1">
                        {product.suggestedTags.map(tag => (
                          <span key={tag} className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200">{tag}</span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {product.description && (
                  <Card className="border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Current Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-6">
                        {product.description.replace(/<[^>]+>/g, "")}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-muted-foreground">
              Product not found
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
