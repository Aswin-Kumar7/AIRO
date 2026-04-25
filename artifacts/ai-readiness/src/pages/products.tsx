import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Loader2, Package, Search, AlertTriangle, CheckCircle, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ─── Mini score bar ───────────────────────────────────────────────────────────

function MiniScore({ score }: { score: number }) {
  const s = Math.round(score);
  const color =
    s >= 75 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-red-500";
  return <span className={`text-xs font-semibold tabular-nums ${color}`}>{s}</span>;
}

// ─── Score ring (small) ───────────────────────────────────────────────────────

const R = 14;
const CIRC = 2 * Math.PI * R;

function TinyRing({ score }: { score: number }) {
  const s = Math.min(100, Math.max(0, score));
  const dash = (s / 100) * CIRC;
  const color =
    s >= 75 ? "#10b981" : s >= 50 ? "#f59e0b" : "#f87171";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="flex-shrink-0">
      <circle cx="18" cy="18" r={R} fill="none" stroke="#f1f5f9" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={R} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${CIRC}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text
        x="18" y="18" textAnchor="middle" dominantBaseline="central"
        fontSize="9" fontWeight="700" fill="#0f172a"
      >
        {Math.round(s)}
      </text>
    </svg>
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
            <h1 className="text-xl font-bold text-slate-900">Products</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {products?.length ?? 0} total · {analyzedCount} analyzed · {issueCount} with issues
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] text-xs h-8 border-slate-200">
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
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder="Search…"
                className="pl-8 h-8 text-xs w-52 border-slate-200"
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
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
              <Package className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600 mb-1">No products found</p>
            <p className="text-xs text-slate-400">
              {search ? "Try a different search term" : "Run an analysis to populate products"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Table header */}
            <div className="grid items-center px-5 py-2.5 border-b border-slate-100 bg-slate-50/80" style={{ gridTemplateColumns: "1fr 56px 52px 52px 52px 52px 120px" }}>
              {["Product", "Score", "Clarity", "Complete", "Trust", "Tags", "Status"].map((h) => (
                <div key={h} className={`text-[10px] font-semibold text-slate-400 uppercase tracking-wider ${h !== "Product" ? "text-center" : ""}`}>
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {sorted.map((product) => (
              <Link href={`/products/${product.id}`} key={product.id}>
                <div
                  className="grid items-center px-5 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer group"
                  style={{ gridTemplateColumns: "1fr 56px 52px 52px 52px 52px 120px" }}
                >
                  {/* Product info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="w-9 h-9 rounded-lg object-cover border border-slate-100 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate group-hover:text-emerald-700 transition-colors">
                        {product.title}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {[product.productType, product.price ? `$${product.price}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>

                  {/* Overall score */}
                  <div className="flex justify-center">
                    <TinyRing score={product.score.overall} />
                  </div>

                  {/* Sub-scores */}
                  <div className="text-center"><MiniScore score={product.score.clarity} /></div>
                  <div className="text-center"><MiniScore score={product.score.completeness} /></div>
                  <div className="text-center"><MiniScore score={product.score.trust} /></div>
                  <div className="text-center"><MiniScore score={product.score.tags} /></div>

                  {/* Status */}
                  <div className="flex items-center justify-start pl-2">
                    {!product.analyzedAt ? (
                      <span className="text-[11px] text-slate-400">Not analyzed</span>
                    ) : product.issueCount > 0 ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-amber-600 font-medium group-hover:text-amber-700">
                        <AlertTriangle className="w-3 h-3" />
                        {product.issueCount} issue{product.issueCount !== 1 ? "s" : ""}
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Good
                      </span>
                    )}
                    {product.hasAppliedFixes && (
                      <span className="ml-2 text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
                        Fixed
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
