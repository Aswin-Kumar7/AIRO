import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Link2, ArrowRight, Package } from "lucide-react";
import { getInternalLinks, type InternalLinkSuggestion } from "@/lib/features-api";

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
                <Package className="w-3 h-3 flex-shrink-0" />
                {suggestion.fromProductTitle}
              </div>
            </Link>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <Link href={`/products/${suggestion.toProductId}`}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary cursor-pointer truncate">
                <Package className="w-3 h-3 flex-shrink-0" />
                {suggestion.toProductTitle}
              </div>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.color}`}>
            {config.label}
          </span>
          <span className="text-xs text-muted-foreground">{suggestion.reason}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InternalLinks() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["internal-links", activeStoreId],
    queryFn: () => getInternalLinks(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 5 * 60 * 1000,
  });

  if (!activeStoreId) { navigate("/"); return null; }

  const byType = (type: InternalLinkSuggestion["linkType"]) =>
    data?.suggestions.filter(s => s.linkType === type) ?? [];

  const allGroups: Array<{ type: InternalLinkSuggestion["linkType"]; items: InternalLinkSuggestion[] }> = [
    { type: "complementary", items: byType("complementary") },
    { type: "upsell", items: byType("upsell") },
    { type: "alternative", items: byType("alternative") },
    { type: "same-category", items: byType("same-category") },
  ];
  const groups = allGroups.filter(g => g.items.length > 0);

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" />
              Internal Link Audit
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Missing product links that help AI understand your catalog structure
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Re-analyze"}
          </Button>
        </div>

        {isLoading || isFetching ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Finding link opportunities…</p>
                <p className="text-xs text-muted-foreground mt-1">Analyzing product relationships across your catalog</p>
              </div>
            </CardContent>
          </Card>
        ) : groups.length > 0 ? (
          <>
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
              <CardContent className="p-4">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  <strong>{data?.suggestions.length} link opportunities</strong> found across {data?.totalProducts} products.
                  Add these as "Related products" or "Customers also bought" sections in your Shopify product pages.
                </p>
              </CardContent>
            </Card>

            {groups.map(({ type, items }) => (
              <div key={type} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {LINK_TYPE_CONFIG[type].label} ({items.length})
                </p>
                {items.map((suggestion, i) => (
                  <LinkCard key={i} suggestion={suggestion} />
                ))}
              </div>
            ))}
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Link2 className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {(data?.totalProducts ?? 0) < 2
                  ? "Need at least 2 products for link analysis."
                  : "No link opportunities found."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
