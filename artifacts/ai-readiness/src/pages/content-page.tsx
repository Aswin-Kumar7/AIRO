import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, BookOpen, AlertCircle, TrendingUp,
  Package, Target, Link2, ArrowRight, Zap,
  MessageSquare, XCircle, Search,
} from "lucide-react";
import {
  getTopicalAuthority, getInternalLinks,
  type TopicalCluster, type InternalLinkSuggestion,
} from "@/lib/features-api";
import { useState } from "react";

// ─── Topical Authority tab ────────────────────────────────────────────────────

function ScoreDot({ score }: { score: number }) {
  const cls =
    score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-400";
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cls}`} />;
}

function CoverageRow({ cluster }: { cluster: TopicalCluster }) {
  const textColor =
    cluster.coverageScore >= 70
      ? "text-emerald-600"
      : cluster.coverageScore >= 40
      ? "text-amber-600"
      : "text-red-500";
  const barColor =
    cluster.coverageScore >= 70
      ? "bg-emerald-400"
      : cluster.coverageScore >= 40
      ? "bg-amber-400"
      : "bg-red-400";

  return (
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-white/5 last:border-0">
      <ScoreDot score={cluster.coverageScore} />
      <span className="text-xs text-slate-600 dark:text-zinc-200 w-36 truncate flex-shrink-0">
        {cluster.topic}
      </span>
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-[#111214] border dark:border-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${cluster.coverageScore}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 text-right ${textColor}`}>
        {cluster.coverageScore}
      </span>
      {cluster.queryCount > 0 && (
        <span className="text-[10px] text-slate-400 dark:text-zinc-500 w-16 text-right flex-shrink-0 hidden sm:block">
          {cluster.queryCount} queries
        </span>
      )}
      <span className="text-[10px] text-slate-400 dark:text-zinc-400 w-16 text-right flex-shrink-0">
        {cluster.productCount} product{cluster.productCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function ClusterDetail({ cluster }: { cluster: TopicalCluster }) {
  if (cluster.gaps.length === 0 && cluster.products.length === 0 && cluster.topQueries.length === 0 && cluster.missingSubtopics.length === 0) return null;
  return (
    <div className="border-b border-slate-100 dark:border-white/5 last:border-0 px-5 py-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <ScoreDot score={cluster.coverageScore} />
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{cluster.topic}</p>
        </div>
        <div className="flex items-center gap-3">
          {cluster.queryCount > 0 && (
            <span className="text-[10px] text-slate-400 dark:text-zinc-400 flex items-center gap-1">
              <Search className="w-3 h-3" />{cluster.queryCount} queries covered
            </span>
          )}
          <span className="text-[10px] text-slate-400 dark:text-zinc-400">{cluster.productCount} products</span>
        </div>
      </div>

      {/* Products in cluster */}
      {cluster.products.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3 ml-4">
          {cluster.products.slice(0, 5).map((p, i) => (
            <span key={i} className="text-[10px] text-slate-500 dark:text-zinc-300 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
              {p}
            </span>
          ))}
          {cluster.products.length > 5 && (
            <span className="text-[10px] text-slate-400 dark:text-zinc-400">
              +{cluster.products.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Example queries AI routes to this cluster */}
      {cluster.topQueries.length > 0 && (
        <div className="ml-4 mb-3">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
            Example AI queries
          </p>
          <div className="space-y-1">
            {cluster.topQueries.map((q, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <MessageSquare className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-500 dark:text-zinc-300 italic">"{q}"</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing sub-topics (catalog gaps — no products) */}
      {cluster.missingSubtopics.length > 0 && (
        <div className="ml-4 mb-3">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
            Missing sub-topics
          </p>
          <div className="space-y-1">
            {cluster.missingSubtopics.map((st, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <XCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-500 dark:text-zinc-300">{st}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content quality gaps */}
      {cluster.gaps.length > 0 && (
        <div className="ml-4">
          <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5">
            Content gaps
          </p>
          <div className="space-y-1">
            {cluster.gaps.map((gap, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-500 dark:text-zinc-300">{gap}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TopicalTab({ storeId }: { storeId: string }) {
  const [hasRun, setHasRun] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["topical-authority", storeId],
    queryFn: () => getTopicalAuthority(storeId),
    enabled: !!storeId && hasRun,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...(data?.clusters ?? [])].sort(
    (a, b) => a.coverageScore - b.coverageScore,
  );
  const weak = sorted.filter((c) => c.coverageScore < 50);

  if (!hasRun && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mb-4">
          <BookOpen className="w-6 h-6 text-slate-400 dark:text-zinc-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Topical coverage map</p>
        <p className="text-xs text-slate-400 dark:text-zinc-400 max-w-xs mb-5 leading-relaxed">
          Groups your catalog into topic clusters and surfaces content gaps that reduce
          AI retrieval relevance.
        </p>
        <Button
          onClick={() => setHasRun(true)}
          disabled={isFetching}
          className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-medium rounded-[10px] gap-2 transition-all"
        >
          <Zap className="w-4 h-4" />
          Run analysis
        </Button>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        <span className="text-sm text-slate-400 dark:text-zinc-400">Mapping topic clusters…</span>
      </div>
    );
  }

  if (!data || sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-slate-400 dark:text-zinc-400">No products to analyze</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-zinc-300">
          {sorted.length} clusters · avg coverage{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{data.averageCoverageScore}</span>
          {(() => {
            const totalQueries = sorted.reduce((s, c) => s + (c.queryCount ?? 0), 0);
            return totalQueries > 0 ? (
              <span className="text-slate-400 dark:text-zinc-500">
                {" "}· {totalQueries} queries covered
              </span>
            ) : null;
          })()}
          {weak.length > 0 && (
            <span className="text-amber-600">
              {" "}· {weak.length} weak
            </span>
          )}
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-slate-400 dark:text-zinc-400 hover:text-slate-600 dark:text-zinc-200 transition-colors disabled:opacity-40"
        >
          Re-analyze
        </button>
      </div>

      {/* Coverage chart */}
      <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-[#111214]">
          <TrendingUp className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
          <span className="text-xs font-semibold text-slate-600 dark:text-zinc-200">Coverage by topic</span>
        </div>
        {sorted.map((c) => (
          <CoverageRow key={c.topic} cluster={c} />
        ))}
      </div>

      {/* Gap details — only for weak clusters */}
      {weak.length > 0 && (
        <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-amber-200/60 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-amber-100 bg-amber-50/40">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {weak.length} under-covered cluster{weak.length !== 1 ? "s" : ""}
            </span>
          </div>
          {weak.map((c) => (
            <ClusterDetail key={c.topic} cluster={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Internal Links tab ───────────────────────────────────────────────────────

const LINK_CONFIG: Record<
  InternalLinkSuggestion["linkType"],
  { label: string; pill: string }
> = {
  complementary: {
    label: "Pair with",
    pill: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  alternative: {
    label: "Alternative",
    pill: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200",
  },
  "same-category": {
    label: "Same category",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
  },
  upsell: {
    label: "Upsell",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

function LinkRow({ suggestion }: { suggestion: InternalLinkSuggestion }) {
  const cfg = LINK_CONFIG[suggestion.linkType];
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50/60 transition-colors">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Link href={`/products/${suggestion.fromProductId}`}>
          <span className="text-xs text-slate-700 dark:text-slate-200 hover:text-emerald-700 cursor-pointer truncate transition-colors">
            {suggestion.fromProductTitle}
          </span>
        </Link>
      </div>
      <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <Link href={`/products/${suggestion.toProductId}`}>
          <span className="text-xs text-slate-700 dark:text-slate-200 hover:text-emerald-700 cursor-pointer truncate transition-colors">
            {suggestion.toProductTitle}
          </span>
        </Link>
      </div>
      <span
        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 hidden sm:inline-flex ${cfg.pill}`}
      >
        {cfg.label}
      </span>
    </div>
  );
}

function LinksTab({ storeId }: { storeId: string }) {
  const [hasRun, setHasRun] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["internal-links", storeId],
    queryFn: () => getInternalLinks(storeId),
    enabled: !!storeId && hasRun,
    staleTime: 5 * 60 * 1000,
  });

  const byType = (type: InternalLinkSuggestion["linkType"]) =>
    data?.suggestions.filter((s) => s.linkType === type) ?? [];

  const allGroups: Array<{
    type: InternalLinkSuggestion["linkType"];
    items: InternalLinkSuggestion[];
  }> = [
    { type: "complementary", items: byType("complementary") },
    { type: "upsell", items: byType("upsell") },
    { type: "alternative", items: byType("alternative") },
    { type: "same-category", items: byType("same-category") },
  ];
  const groups = allGroups.filter((g) => g.items.length > 0);

  if (!hasRun && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mb-4">
          <Link2 className="w-6 h-6 text-slate-400 dark:text-zinc-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Internal link opportunities</p>
        <p className="text-xs text-slate-400 dark:text-zinc-400 max-w-xs mb-5 leading-relaxed">
          Finds complementary, upsell, and category-level links between products to
          strengthen your catalog graph for AI engines.
        </p>
        <Button
          onClick={() => setHasRun(true)}
          disabled={isFetching}
          className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-medium rounded-[10px] gap-2 transition-all"
        >
          <Zap className="w-4 h-4" />
          Run analysis
        </Button>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        <span className="text-sm text-slate-400 dark:text-zinc-400">Finding link opportunities…</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-slate-400 dark:text-zinc-400">
          {(data?.totalProducts ?? 0) < 2
            ? "Need at least 2 products to find links."
            : "No link opportunities found."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-zinc-300">
          <span className="font-semibold text-slate-700 dark:text-slate-200">{data?.suggestions.length}</span>{" "}
          opportunities across{" "}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{data?.totalProducts}</span> products
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-slate-400 dark:text-zinc-400 hover:text-slate-600 dark:text-zinc-200 transition-colors disabled:opacity-40"
        >
          Re-analyze
        </button>
      </div>

      {groups.map(({ type, items }) => (
        <div key={type} className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-[#111214]">
            <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-300 uppercase tracking-wide">
              {LINK_CONFIG[type].label}
            </span>
            <span className="text-[10px] text-slate-400 dark:text-zinc-400">{items.length}</span>
          </div>
          {items.map((s, i) => (
            <LinkRow key={i} suggestion={s} />
          ))}
        </div>
      ))}

      {/* Hint */}
      <p className="text-[11px] text-slate-400 dark:text-zinc-400 text-center">
        Add links as "Related products" or metafields in Shopify.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Content Strategy</h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">
            Topic coverage and internal link opportunities across your catalog
          </p>
        </div>

        <Tabs defaultValue="authority">
          <TabsList className="mb-8 bg-slate-100/80 dark:bg-white/5 p-1 h-auto rounded-[12px] border dark:border-white/5 shadow-inner">
            <TabsTrigger
              value="authority"
              className="text-[13px] font-bold h-9 px-6 gap-2 data-[state=active]:bg-white dark:bg-transparent data-[state=active]:dark:bg-white/10 data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 dark:data-[state=active]:text-white rounded-[9px] transition-all"
            >
              <Target className="w-4 h-4" /> Topical Authority
            </TabsTrigger>
            <TabsTrigger
              value="linking"
              className="text-[13px] font-bold h-9 px-6 gap-2 data-[state=active]:bg-white dark:bg-transparent data-[state=active]:dark:bg-white/10 data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 dark:data-[state=active]:text-white rounded-[9px] transition-all"
            >
              <Link2 className="w-4 h-4" /> Internal Linking
            </TabsTrigger>
          </TabsList>

          <TabsContent value="authority" className="mt-0">
            <TopicalTab storeId={activeStoreId} />
          </TabsContent>
          <TabsContent value="linking" className="mt-0">
            <LinksTab storeId={activeStoreId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
