import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListProducts, getListProductsQueryKey, getGetStoreSummaryQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Zap, CheckCircle2, AlertCircle, ExternalLink, BarChart3 } from "lucide-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { QuickFixSheet } from "@/components/quick-fix-sheet";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { applyFix } from "@/lib/quick-fix-api";

type Fix = {
  id: string; type: string; status: string; title: string;
  improvedContent: string; explanation: string;
  estimatedScoreImprovement: number;
  shopifySynced: boolean; shopifyError: string | null;
  appliedAt: string | null; productId: string | null; productTitle: string | null;
};

function useFixes(storeId: string) {
  return useQuery<Fix[]>({
    queryKey: ["fixes", storeId],
    queryFn: () => fetch(`/api/stores/${storeId}/fixes`).then((r) => r.json()),
    enabled: !!storeId,
  });
}

const TYPE_ICONS: Record<string, string> = {
  description: "📝", tags: "🏷️", title: "✏️", structure: "🔧",
};

function SyncBadge({ synced, error }: { synced: boolean; error: string | null }) {
  if (synced) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
        <ExternalLink className="w-2.5 h-2.5" /> Shopify synced
      </span>
    );
  }
  if (error) {
    return (
      <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full" title={error}>
        <AlertCircle className="w-2.5 h-2.5" /> Sync failed
      </span>
    );
  }
  return null;
}

export default function Fixes() {
  const { activeStoreId } = useStore();
  const { data: fixes, isLoading, refetch } = useFixes(activeStoreId!);
  const { data: products } = useListProducts(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getListProductsQueryKey(activeStoreId!) },
  });
  const [, navigate] = useLocation();
  const [quickFixProduct, setQuickFixProduct] = useState<{ id: string; title: string } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (!activeStoreId) { navigate("/"); return null; }

  const pending = fixes?.filter((f) => f.status === "pending") ?? [];
  const applied = fixes?.filter((f) => f.status === "applied") ?? [];
  const syncedCount = applied.filter((f) => f.shopifySynced).length;
  const failedCount = applied.filter((f) => f.shopifyError).length;
  const totalPotential = pending.reduce((s, f) => s + f.estimatedScoreImprovement, 0);

  async function handleRetrySyncFailed() {
    const failed = applied.filter((f) => f.shopifyError && !f.shopifySynced);
    let count = 0;
    for (const fix of failed) {
      try {
        const result = await applyFix(activeStoreId!, fix.id);
        if (result.shopifySynced) count++;
      } catch { /* ignore */ }
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId!) });
    toast({ title: `${count} of ${failed.length} retried syncs succeeded` });
  }

  // Products with pending fixes — for the quick-access panel
  const productsWithPendingFixes = (products ?? []).filter((p) => p.issueCount > 0);

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Quick Fixes</h1>
            <p className="text-sm text-muted-foreground">
              {pending.length} pending · {applied.length} applied · {syncedCount} synced to Shopify
            </p>
          </div>
          {failedCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleRetrySyncFailed} className="text-xs gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500" />
              Retry {failedCount} failed sync{failedCount > 1 ? "s" : ""}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats row */}
            {(pending.length > 0 || applied.length > 0) && (
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Pending Fixes", value: pending.length, color: "text-amber-600" },
                  { label: "Potential Score Gain", value: `+${Math.round(totalPotential)} pts`, color: "text-blue-600" },
                  { label: "Applied Fixes", value: applied.length, color: "text-green-600" },
                  { label: "Synced to Shopify", value: syncedCount, color: "text-green-700" },
                ].map(({ label, value, color }) => (
                  <Card key={label} className="border-border">
                    <CardContent className="p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Products needing fixes */}
            {productsWithPendingFixes.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Products Needing Fixes ({productsWithPendingFixes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {productsWithPendingFixes.map((product) => (
                    <div key={product.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.title} className="w-8 h-8 rounded-lg object-cover border border-border flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{product.title}</p>
                        <p className="text-xs text-muted-foreground">Score: {Math.round(product.score.overall)}/100 · {product.issueCount} issues</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0"
                        onClick={() => setQuickFixProduct({ id: product.id, title: product.title })}
                      >
                        <Zap className="w-3 h-3" />
                        Quick Fix
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Applied fixes history */}
            {applied.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    Fix History ({applied.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {applied.map((fix) => (
                    <div key={fix.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                      <span className="text-base flex-shrink-0">{TYPE_ICONS[fix.type] ?? "🔧"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-medium text-foreground">{fix.title}</p>
                          <SyncBadge synced={fix.shopifySynced} error={fix.shopifyError} />
                        </div>
                        {fix.productTitle && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{fix.productTitle}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-0.5">{fix.explanation}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs font-semibold text-green-600">+{fix.estimatedScoreImprovement} pts</p>
                        {fix.appliedAt && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(fix.appliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Empty state */}
            {!fixes?.length && (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">No fixes yet</p>
                  <p className="text-xs text-muted-foreground">Run an analysis to generate AI-powered product improvements</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {quickFixProduct && (
        <QuickFixSheet
          storeId={activeStoreId}
          productId={quickFixProduct.id}
          productTitle={quickFixProduct.title}
          isOpen={true}
          onClose={() => {
            setQuickFixProduct(null);
            refetch();
            queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(activeStoreId) });
            queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId) });
          }}
        />
      )}
    </AppLayout>
  );
}
