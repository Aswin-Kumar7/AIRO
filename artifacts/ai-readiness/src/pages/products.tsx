import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Loader2, Package, Search, CheckCircle, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const s = Math.round(score);
  const colorClass =
    s >= 75 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-200/50 dark:ring-emerald-500/20" :
      s >= 50 ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-200/50 dark:ring-amber-500/20" :
        "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-200/50 dark:ring-red-500/20";

  return (
    <span className={`inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-[6px] text-[12px] font-bold tabular-nums ring-1 ring-inset ${colorClass}`}>
      {s}
    </span>
  );
}

function MiniScore({ score }: { score: number }) {
  const s = Math.round(score);
  const color =
    s >= 75 ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 ring-emerald-200/50 dark:ring-emerald-500/20" :
      s >= 50 ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 ring-amber-200/50 dark:ring-amber-500/20" :
        "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 ring-red-200/50 dark:ring-red-500/20";
  return (
    <span className={`inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-[6px] text-[12px] font-bold tabular-nums ring-1 ring-inset ${color}`}>
      {s}
    </span>
  );
}

// ─── Products page ────────────────────────────────────────────────────────────

export default function Products() {
  const { activeStoreId } = useStore();
  const { data: products, isLoading } = useListProducts(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getListProductsQueryKey(activeStoreId!) },
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  const filtered = products?.filter((p) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      p.title.toLowerCase().includes(q) ||
      p.productType?.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q));

    let matchStatus = true;
    if (statusFilter === "analyzed") matchStatus = !!p.analyzedAt;
    if (statusFilter === "unanalyzed") matchStatus = !p.analyzedAt;
    if (statusFilter === "hasIssues") matchStatus = !!p.analyzedAt && p.issueCount > 0;
    if (statusFilter === "fixed") matchStatus = !!p.analyzedAt && !!p.hasAppliedFixes;

    return matchSearch && matchStatus;
  }) ?? [];

  const sorted = [...filtered].sort((a, b) => a.score.overall - b.score.overall);

  const analyzedCount = products?.filter((p) => p.analyzedAt).length ?? 0;
  const issueCount = products?.filter((p) => p.issueCount > 0).length ?? 0;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Products</h1>
            <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">
              {products?.length ?? 0} total · {analyzedCount} analyzed · {issueCount} with issues
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] text-[13px] h-9 rounded-[10px] border-slate-200/80 shadow-sm focus:ring-slate-200 bg-white dark:bg-[#080808]">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent className="rounded-[10px] shadow-lg border-slate-200/80">
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="analyzed">Analyzed</SelectItem>
                <SelectItem value="unanalyzed">Not analyzed</SelectItem>
                <SelectItem value="hasIssues">Has issues</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-zinc-400" />
              <Input
                placeholder="Search…"
                className="pl-9 h-9 text-[13px] w-64 rounded-[10px] border-slate-200/80 shadow-sm focus-visible:ring-slate-200 bg-white dark:bg-[#080808]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mb-4">
              <Package className="w-6 h-6 text-slate-400 dark:text-zinc-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-zinc-200 mb-1">No products found</p>
            <p className="text-xs text-slate-400 dark:text-zinc-400">
              {search ? "Try a different search term" : "Run an analysis to populate products"}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Table header */}
              <div className="grid items-center px-6 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5" style={{ gridTemplateColumns: "1fr 80px 80px 90px 80px 80px 160px" }}>
                {["Product", "Score", "Clarity", "Complete", "Trust", "Tags", "Status"].map((h) => (
                  <div key={h} className={`text-[11px] font-semibold text-slate-400 dark:text-zinc-400 uppercase tracking-widest ${h !== "Product" ? "text-center" : ""}`}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-50 dark:divide-white/5">
                {sorted.map((product) => (
                  <Link href={`/products/${product.id}`} key={product.id}>
                    <div
                      className="grid items-center px-6 py-3.5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer group"
                      style={{ gridTemplateColumns: "1fr 80px 80px 90px 80px 80px 160px" }}
                    >
                      {/* Product info */}
                      <div className="flex items-center gap-3.5 min-w-0 pr-4">
                        {product.imageUrl ? (
                          <div className="rounded-[10px] ring-1 ring-slate-900/5 shadow-sm overflow-hidden flex-shrink-0 bg-white dark:bg-[#080808]">
                            <img
                              src={product.imageUrl}
                              alt={product.title}
                              className="w-10 h-10 object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-[10px] ring-1 ring-slate-900/5 shadow-sm bg-slate-50 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 tracking-tight truncate group-hover:text-slate-900 dark:text-white transition-colors">
                            {product.title}
                          </p>
                          <p className="text-[12px] text-slate-400 dark:text-zinc-400 mt-0.5 truncate">
                            {[product.productType, product.price ? `$${product.price}` : null].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>

                      {/* Overall score */}
                      <div className="flex justify-center">
                        <ScoreBadge score={product.score.overall} />
                      </div>

                      {/* Sub-scores */}
                      <div className="text-center"><MiniScore score={product.score.clarity} /></div>
                      <div className="text-center"><MiniScore score={product.score.completeness} /></div>
                      <div className="text-center"><MiniScore score={product.score.trust} /></div>
                      <div className="text-center"><MiniScore score={product.score.tags} /></div>

                      {/* Status */}
                      <div className="flex items-center justify-between pl-4">
                        <div className="flex items-center">
                          {!product.analyzedAt ? (
                            <span className="text-[12px] text-slate-400 dark:text-zinc-400">Not analyzed</span>
                          ) : product.issueCount > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              <span className="text-[12px] text-amber-700 font-medium">
                                {product.issueCount} issue{product.issueCount !== 1 ? "s" : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="flex items-center gap-1 text-[12px] text-emerald-600 font-medium">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Good
                            </span>
                          )}

                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
