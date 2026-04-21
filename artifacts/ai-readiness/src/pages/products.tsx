import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { ScoreRing } from "@/components/score-ring";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Package, Search, Tag, AlertTriangle, CheckCircle, Zap } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function ScoreChip({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-100 text-green-700" : score >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{Math.round(score)}</span>;
}

export default function Products() {
  const { activeStoreId } = useStore();
  const { data: products, isLoading } = useListProducts(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getListProductsQueryKey(activeStoreId!) },
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [, navigate] = useLocation();

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  const filtered = products?.filter(p => {
    const rawSearch = search.trim().toLowerCase();
    const matchSearch = !rawSearch || 
      p.title.toLowerCase().includes(rawSearch) ||
      p.productType?.toLowerCase().includes(rawSearch) ||
      p.tags.some(t => t.toLowerCase().includes(rawSearch));

    let matchStatus = true;
    if (statusFilter === "analyzed") matchStatus = !!p.analyzedAt;
    if (statusFilter === "unanalyzed") matchStatus = !p.analyzedAt;
    if (statusFilter === "hasIssues") matchStatus = !!p.analyzedAt && p.issueCount > 0;
    if (statusFilter === "fixed") matchStatus = !!p.analyzedAt && !!p.hasAppliedFixes;

    return matchSearch && matchStatus;
  }) ?? [];

  const sorted = [...filtered].sort((a, b) => a.score.overall - b.score.overall);

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Products</h1>
            <p className="text-sm text-muted-foreground">{products?.length ?? 0} products analyzed</p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] text-sm h-9">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="analyzed">Analyzed</SelectItem>
                <SelectItem value="unanalyzed">Not analyzed</SelectItem>
                <SelectItem value="hasIssues">Has issues</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search products..." className="pl-9 h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No products found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* Header row */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Product</div>
              <div className="col-span-1 text-center">Score</div>
              <div className="col-span-1 text-center">Clarity</div>
              <div className="col-span-1 text-center">Complete</div>
              <div className="col-span-1 text-center">Trust</div>
              <div className="col-span-1 text-center">Tags</div>
              <div className="col-span-3 text-center">Actions</div>
            </div>

            {sorted.map((product) => (
              <Card key={product.id} className="border-border hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Product info — clicking navigates to detail */}
                    <Link href={`/products/${product.id}`} className="col-span-4 flex items-center gap-3 min-w-0">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.title} className="w-10 h-10 rounded-lg object-cover border border-border flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors">{product.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {product.productType && <span className="text-[11px] text-muted-foreground">{product.productType}</span>}
                          {product.price && <span className="text-[11px] text-muted-foreground">${product.price}</span>}
                        </div>
                      </div>
                    </Link>

                    <div className="col-span-1 flex justify-center">
                      <ScoreRing score={product.score.overall} size={36} showLabel={true} />
                    </div>

                    <div className="col-span-1 text-center"><ScoreChip score={product.score.clarity} /></div>
                    <div className="col-span-1 text-center"><ScoreChip score={product.score.completeness} /></div>
                    <div className="col-span-1 text-center"><ScoreChip score={product.score.trust} /></div>
                    <div className="col-span-1 text-center"><ScoreChip score={product.score.tags} /></div>

                    {/* Actions */}
                    <div className="col-span-3 flex items-center justify-center gap-2">
                      {!product.analyzedAt ? (
                        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                          Not analyzed
                        </div>
                      ) : product.issueCount > 0 ? (
                        <Link href={`/products/${product.id}`} onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" className="h-7 text-[11px] gap-1.5" variant="outline">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            View Issues
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-amber-100 text-amber-700 border-0">
                              {product.issueCount}
                            </Badge>
                          </Button>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          <span>Good</span>
                        </div>
                      )}
                      {product.hasAppliedFixes && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Fixed</Badge>
                      )}
                    </div>
                  </div>

                  {product.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 pl-[52px]">
                      <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      {product.tags.slice(0, 5).map(tag => (
                        <span key={tag} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{tag}</span>
                      ))}
                      {product.tags.length > 5 && <span className="text-[10px] text-muted-foreground">+{product.tags.length - 5}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
