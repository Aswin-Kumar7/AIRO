import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BookOpen, AlertCircle, TrendingUp, Package, Link2, ArrowRight } from "lucide-react";
import { getTopicalAuthority, getInternalLinks, type TopicalCluster, type InternalLinkSuggestion } from "@/lib/features-api";
import { useState } from "react";

// ─── Topical Authority tab ────────────────────────────────────────────────────

function CoverageBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  const textColor = score >= 70 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-32 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold tabular-nums w-8 text-right ${textColor}`}>{score}</span>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: TopicalCluster }) {
  const isWeak = cluster.coverageScore < 50;
  return (
    <Card className={isWeak ? "border-amber-200" : "border-border"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{cluster.topic}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Package className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{cluster.productCount} product{cluster.productCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <div className="text-right">
            <span className={`text-xl font-bold ${cluster.coverageScore >= 70 ? "text-green-600" : cluster.coverageScore >= 40 ? "text-amber-600" : "text-red-600"}`}>{cluster.coverageScore}</span>
            <p className="text-[10px] text-muted-foreground">coverage</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {cluster.products.slice(0, 4).map((p, i) => <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground border border-border">{p}</span>)}
          {cluster.products.length > 4 && <span className="text-[10px] text-muted-foreground self-center">+{cluster.products.length - 4} more</span>}
        </div>
        {cluster.gaps.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Content gaps</p>
            {cluster.gaps.map((gap, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                <span className="text-xs text-muted-foreground">{gap}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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

  const sorted = [...(data?.clusters ?? [])].sort((a, b) => a.coverageScore - b.coverageScore);

  if (!hasRun && !data) return (
    <div className="space-y-4">
      <Card className="border-dashed"><CardContent className="py-12 text-center">
        <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">Ready for Analysis</p>
        <p className="text-sm text-slate-400 mb-4">Run analysis to map your content gaps and topic coverage</p>
        <Button onClick={() => setHasRun(true)} disabled={isFetching}>Run Analysis</Button>
      </CardContent></Card>
    </div>
  );

  if (isLoading || isFetching) return (
    <Card><CardContent className="flex flex-col items-center gap-3 py-16">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-sm text-slate-400">Mapping topic clusters…</p>
    </CardContent></Card>
  );

  if (!data || sorted.length === 0) return (
    <div className="space-y-4">
      <Card className="border-dashed"><CardContent className="py-12 text-center"><p className="text-sm text-slate-400">No products to analyze</p></CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{sorted.length} topic clusters · avg coverage {data.averageCoverageScore}</span>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Re-analyze</Button>
      </div>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Coverage by Topic</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2.5">
          {sorted.map((c) => <CoverageBar key={c.topic} label={c.topic} score={c.coverageScore} />)}
        </CardContent>
      </Card>
      <div className="space-y-3">{sorted.map((c) => <ClusterCard key={c.topic} cluster={c} />)}</div>
    </div>
  );
}

// ─── Internal Links tab ───────────────────────────────────────────────────────

const LINK_TYPE_CONFIG: Record<InternalLinkSuggestion["linkType"], { label: string; color: string }> = {
  complementary: { label: "Buy together", color: "bg-green-100 text-green-700 border-green-200" },
  alternative: { label: "Alternative", color: "bg-blue-100 text-blue-700 border-blue-200" },
  "same-category": { label: "Same category", color: "bg-purple-100 text-purple-700 border-purple-200" },
  upsell: { label: "Upsell", color: "bg-amber-100 text-amber-700 border-amber-200" },
};

function LinkCard({ suggestion }: { suggestion: InternalLinkSuggestion }) {
  const config = LINK_TYPE_CONFIG[suggestion.linkType];
  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-2.5">
          <div className="flex-1 min-w-0">
            <Link href={`/products/${suggestion.fromProductId}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary cursor-pointer truncate">
                <Package className="w-3 h-3 flex-shrink-0" />{suggestion.fromProductTitle}
              </div>
            </Link>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <Link href={`/products/${suggestion.toProductId}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary cursor-pointer truncate">
                <Package className="w-3 h-3 flex-shrink-0" />{suggestion.toProductTitle}
              </div>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.color}`}>{config.label}</span>
          <span className="text-xs text-muted-foreground">{suggestion.reason}</span>
        </div>
      </CardContent>
    </Card>
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

  const byType = (type: InternalLinkSuggestion["linkType"]) => data?.suggestions.filter((s) => s.linkType === type) ?? [];
  const allGroups: Array<{ type: InternalLinkSuggestion["linkType"]; items: InternalLinkSuggestion[] }> = [
    { type: "complementary", items: byType("complementary") },
    { type: "upsell", items: byType("upsell") },
    { type: "alternative", items: byType("alternative") },
    { type: "same-category", items: byType("same-category") },
  ];
  const groups = allGroups.filter((g) => g.items.length > 0);

  if (!hasRun && !data) return (
    <div className="space-y-4">
      <Card className="border-dashed"><CardContent className="py-12 text-center">
        <Link2 className="w-8 h-8 text-slate-300 mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground mb-1">Ready for Analysis</p>
        <p className="text-sm text-slate-400 mb-4">Run analysis to find internal link opportunities between related products</p>
        <Button onClick={() => setHasRun(true)} disabled={isFetching}>Run Analysis</Button>
      </CardContent></Card>
    </div>
  );

  if (isLoading || isFetching) return (
    <Card><CardContent className="flex flex-col items-center gap-3 py-16">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
      <p className="text-sm text-slate-400">Finding link opportunities…</p>
    </CardContent></Card>
  );

  if (groups.length === 0) return (
    <div className="space-y-4">
      <Card className="border-dashed"><CardContent className="py-12 text-center">
        <p className="text-sm text-slate-400">{(data?.totalProducts ?? 0) < 2 ? "Need at least 2 products." : "No link opportunities found."}</p>
      </CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Card className="flex-1 border-amber-200 bg-amber-50 mr-3">
          <CardContent className="p-3">
            <p className="text-xs text-amber-800"><strong>{data?.suggestions.length} link opportunities</strong> across {data?.totalProducts} products. Add as "Related products" in Shopify.</p>
          </CardContent>
        </Card>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Re-analyze</Button>
      </div>
      {groups.map(({ type, items }) => (
        <div key={type} className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{LINK_TYPE_CONFIG[type].label} ({items.length})</p>
          {items.map((s, i) => <LinkCard key={i} suggestion={s} />)}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Content Strategy</h1>
          <p className="text-sm text-slate-500 mt-0.5">Topic coverage and internal link opportunities across your catalog</p>
        </div>
        <Tabs defaultValue="topical">
          <TabsList className="mb-6 bg-slate-100 p-0.5 h-9">
            <TabsTrigger value="topical" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <BookOpen className="w-3.5 h-3.5" /> Topical Authority
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Link2 className="w-3.5 h-3.5" /> Internal Links
            </TabsTrigger>
          </TabsList>
          <TabsContent value="topical" className="mt-0"><TopicalTab storeId={activeStoreId} /></TabsContent>
          <TabsContent value="links" className="mt-0"><LinksTab storeId={activeStoreId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
