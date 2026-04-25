import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, BookOpen, AlertCircle, TrendingUp,
  Package, Link2, ArrowRight, Zap,
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
    <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 last:border-0">
      <ScoreDot score={cluster.coverageScore} />
      <span className="text-xs text-slate-600 w-36 truncate flex-shrink-0">
        {cluster.topic}
      </span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${cluster.coverageScore}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-8 text-right ${textColor}`}>
        {cluster.coverageScore}
      </span>
      <span className="text-[10px] text-slate-400 w-16 text-right flex-shrink-0">
        {cluster.productCount} product{cluster.productCount !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function ClusterDetail({ cluster }: { cluster: TopicalCluster }) {
  if (cluster.gaps.length === 0 && cluster.products.length === 0) return null;
  return (
    <div className="border-b border-slate-100 last:border-0 px-5 py-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <ScoreDot score={cluster.coverageScore} />
          <p className="text-xs font-semibold text-slate-800">{cluster.topic}</p>
        </div>
        <span className="text-[10px] text-slate-400">{cluster.productCount} products</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-2 ml-4">
        {cluster.products.slice(0, 5).map((p, i) => (
          <span
            key={i}
            className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"
          >
            {p}
          </span>
        ))}
        {cluster.products.length > 5 && (
          <span className="text-[10px] text-slate-400">
            +{cluster.products.length - 5} more
          </span>
        )}
      </div>
      {cluster.gaps.length > 0 && (
        <div className="ml-4 space-y-1">
          {cluster.gaps.map((gap, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
              <span className="text-[11px] text-slate-500">{gap}</span>
            </div>
          ))}
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
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
          <BookOpen className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">Topical coverage map</p>
        <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
          Groups your catalog into topic clusters and surfaces content gaps that reduce
          AI retrieval relevance.
        </p>
        <Button
          onClick={() => setHasRun(true)}
          disabled={isFetching}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
        >
          <Zap className="w-3.5 h-3.5" />
          Run analysis
        </Button>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        <span className="text-sm text-slate-400">Mapping topic clusters…</span>
      </div>
    );
  }

  if (!data || sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-slate-400">No products to analyze</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {sorted.length} clusters · avg coverage{" "}
          <span className="font-semibold text-slate-700">{data.averageCoverageScore}</span>
          {weak.length > 0 && (
            <span className="text-amber-600">
              {" "}· {weak.length} weak
            </span>
          )}
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
        >
          Re-analyze
        </button>
      </div>

      {/* Coverage chart */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 bg-slate-50/80">
          <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">Coverage by topic</span>
        </div>
        {sorted.map((c) => (
          <CoverageRow key={c.topic} cluster={c} />
        ))}
      </div>

      {/* Gap details — only for weak clusters */}
      {weak.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-amber-100 bg-amber-50/40">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700">
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
    pill: "bg-blue-50 text-blue-700 border-blue-200",
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <Link href={`/products/${suggestion.fromProductId}`}>
          <span className="text-xs text-slate-700 hover:text-emerald-700 cursor-pointer truncate transition-colors">
            {suggestion.fromProductTitle}
          </span>
        </Link>
      </div>
      <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <Link href={`/products/${suggestion.toProductId}`}>
          <span className="text-xs text-slate-700 hover:text-emerald-700 cursor-pointer truncate transition-colors">
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
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
          <Link2 className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">Internal link opportunities</p>
        <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
          Finds complementary, upsell, and category-level links between products to
          strengthen your catalog graph for AI engines.
        </p>
        <Button
          onClick={() => setHasRun(true)}
          disabled={isFetching}
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
        >
          <Zap className="w-3.5 h-3.5" />
          Run analysis
        </Button>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        <span className="text-sm text-slate-400">Finding link opportunities…</span>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-slate-400">
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
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{data?.suggestions.length}</span>{" "}
          opportunities across{" "}
          <span className="font-semibold text-slate-700">{data?.totalProducts}</span> products
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
        >
          Re-analyze
        </button>
      </div>

      {groups.map(({ type, items }) => (
        <div key={type} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              {LINK_CONFIG[type].label}
            </span>
            <span className="text-[10px] text-slate-400">{items.length}</span>
          </div>
          {items.map((s, i) => (
            <LinkRow key={i} suggestion={s} />
          ))}
        </div>
      ))}

      {/* Hint */}
      <p className="text-[11px] text-slate-400 text-center">
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
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Content Strategy</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Topic coverage and internal link opportunities across your catalog
          </p>
        </div>

        <Tabs defaultValue="topical">
          <TabsList className="mb-6 bg-slate-100 p-0.5 h-9">
            <TabsTrigger
              value="topical"
              className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
            >
              <BookOpen className="w-3.5 h-3.5" /> Topical Authority
            </TabsTrigger>
            <TabsTrigger
              value="links"
              className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
            >
              <Link2 className="w-3.5 h-3.5" /> Internal Links
            </TabsTrigger>
          </TabsList>

          <TabsContent value="topical" className="mt-0">
            <TopicalTab storeId={activeStoreId} />
          </TabsContent>
          <TabsContent value="links" className="mt-0">
            <LinksTab storeId={activeStoreId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
