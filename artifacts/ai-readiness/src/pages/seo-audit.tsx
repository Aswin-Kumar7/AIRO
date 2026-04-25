import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Search, CheckCircle2, XCircle, AlertCircle,
  Globe, FileSearch, Link2, AlertTriangle, Zap, Info,
  ChevronRight,
} from "lucide-react";
import {
  useListGaps, getListGapsQueryKey,
  useAnalyzeStore,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// ─── SEO rule metadata ─────────────────────────────────────────────────────────

const SEO_RULE_IDS = new Set([
  "SEO_ROBOTS_MISSING",
  "SEO_ROBOTS_BLOCKING_PRODUCTS",
  "SEO_SITEMAP_MISSING",
  "SEO_SITEMAP_NO_PRODUCTS",
  "SEO_META_DESCRIPTION_MISSING",
  "SEO_CANONICAL_MISSING",
  "SCHEMA_INCOMPLETE",
  "SCHEMA_MALFORMED",
  "SCHEMA_OFFERS_INCOMPLETE",
  "SCHEMA_MISSING_BRAND",
  "TAXONOMY_TOO_GENERIC",
]);

const RULE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  SEO_ROBOTS_MISSING: Globe,
  SEO_ROBOTS_BLOCKING_PRODUCTS: Globe,
  SEO_SITEMAP_MISSING: Link2,
  SEO_SITEMAP_NO_PRODUCTS: Link2,
  SEO_META_DESCRIPTION_MISSING: FileSearch,
  SEO_CANONICAL_MISSING: Link2,
  SCHEMA_INCOMPLETE: AlertTriangle,
  SCHEMA_MALFORMED: AlertTriangle,
  SCHEMA_OFFERS_INCOMPLETE: AlertTriangle,
  SCHEMA_MISSING_BRAND: AlertTriangle,
  TAXONOMY_TOO_GENERIC: Search,
};

const CATEGORY_LABELS: Record<string, string> = {
  robots: "Crawlability",
  sitemap: "Sitemap",
  meta: "Meta Tags",
  schema: "Structured Data",
  taxonomy: "Taxonomy",
};

function getRuleCategory(ruleId: string): string {
  if (ruleId.startsWith("SEO_ROBOTS")) return "robots";
  if (ruleId.startsWith("SEO_SITEMAP")) return "sitemap";
  if (ruleId.startsWith("SEO_META") || ruleId.startsWith("SEO_CANONICAL")) return "meta";
  if (ruleId.startsWith("SCHEMA")) return "schema";
  if (ruleId.startsWith("TAXONOMY")) return "taxonomy";
  return "other";
}

// ─── Gap card ─────────────────────────────────────────────────────────────────

interface SeoGap {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  suggestion: string;
  evidence: string | null;
  severity: "high" | "medium" | "low";
  impactScore: number;
  effortLevel: "low" | "medium" | "high";
  productTitle: string | null;
  isFixed: boolean;
}

function GapRow({ gap }: { gap: SeoGap }) {
  const Icon = RULE_ICONS[gap.ruleId] ?? AlertCircle;
  const severityConfig = {
    high: { label: "High", badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
    medium: { label: "Medium", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
    low: { label: "Low", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  }[gap.severity];

  return (
    <div className={`flex gap-4 p-4 border-b border-slate-100 last:border-0 ${gap.isFixed ? "opacity-50" : ""}`}>
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 mb-1 flex-wrap">
          <p className="text-sm font-semibold text-slate-900 flex-1">{gap.title}</p>
          {gap.isFixed && (
            <Badge variant="secondary" className="text-emerald-600 text-[10px]">Fixed</Badge>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${severityConfig.badge}`}>
            {severityConfig.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-2">{gap.description}</p>
        {gap.evidence && (
          <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mb-2">
            <Info className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800">{gap.evidence}</p>
          </div>
        )}
        <div className="flex items-start gap-1.5 bg-emerald-50 rounded px-2.5 py-1.5">
          <Zap className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-800">{gap.suggestion}</p>
        </div>
        {gap.productTitle && (
          <p className="text-[10px] text-slate-400 mt-1.5">Product: {gap.productTitle}</p>
        )}
      </div>
    </div>
  );
}

// ─── Category section ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; icon: React.FC<{ className?: string }>; description: string }> = {
  robots: {
    label: "Crawlability",
    icon: Globe,
    description: "Controls how search engines and AI crawlers access your store",
  },
  sitemap: {
    label: "Sitemap",
    icon: Link2,
    description: "XML sitemap helps AI indexers discover all your products",
  },
  meta: {
    label: "Meta Tags",
    icon: FileSearch,
    description: "Meta descriptions and canonical tags affect how pages appear in AI results",
  },
  schema: {
    label: "Structured Data",
    icon: AlertTriangle,
    description: "JSON-LD schema helps AI engines understand products, prices, and availability",
  },
  taxonomy: {
    label: "Taxonomy",
    icon: Search,
    description: "Specific product types and categories help AI classify your catalog",
  },
};

// ─── Overview pills ───────────────────────────────────────────────────────────

function HealthPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex flex-col items-center bg-white border border-slate-200 rounded-xl px-5 py-3 min-w-[80px]">
      <span className={`text-xl font-bold ${color}`}>{count}</span>
      <span className="text-[10px] text-slate-500 mt-0.5">{label}</span>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SeoAuditPage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const analyzeMutation = useAnalyzeStore();

  const { data: allGaps, isLoading, refetch } = useListGaps(activeStoreId ?? "", {
    query: {
      queryKey: getListGapsQueryKey(activeStoreId ?? ""),
      enabled: !!activeStoreId,
    },
  });

  async function handleRunAnalysis() {
    if (!activeStoreId) return;
    try {
      await analyzeMutation.mutateAsync({ storeId: activeStoreId });
      await refetch();
      queryClient.invalidateQueries({ queryKey: getListGapsQueryKey(activeStoreId) });
      toast({ title: "Analysis complete", description: "SEO gaps updated." });
    } catch {
      toast({ title: "Analysis failed", variant: "destructive" });
    }
  }

  if (!activeStoreId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
          <Search className="w-10 h-10 text-slate-300" />
          <p className="text-slate-500 text-sm">Connect a store to see your SEO Audit</p>
          <Button size="sm" onClick={() => navigate("/connect")}>Connect store</Button>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      </AppLayout>
    );
  }

  // Filter to SEO-relevant gaps
  const rawGaps = (allGaps ?? []) as unknown as SeoGap[];
  const seoGaps = rawGaps.filter((g) => SEO_RULE_IDS.has(g.ruleId));
  const openGaps = seoGaps.filter((g) => !g.isFixed);
  const fixedCount = seoGaps.filter((g) => g.isFixed).length;
  const critCount = openGaps.filter((g) => g.severity === "high").length;

  // Group by category
  const byCategory = openGaps.reduce<Record<string, SeoGap[]>>((acc, gap) => {
    const cat = getRuleCategory(gap.ruleId);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(gap);
    return acc;
  }, {});

  const categories = Object.keys(byCategory).sort();

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-violet-500" />
            SEO Audit
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Technical SEO and structured data gaps that affect AI discoverability
          </p>
        </div>

        {/* Info banner */}
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex gap-3 mb-6">
          <Info className="w-4 h-4 text-violet-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-violet-800 space-y-1">
            <p className="font-semibold">Why SEO matters for AI</p>
            <p>AI engines like Perplexity and SearchGPT rely on crawl access, structured data, and meta information to discover and cite your products. Fixing these gaps directly improves your GEO citation rate.</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-6">
          <HealthPill label="Open issues" count={openGaps.length} color="text-slate-900" />
          <HealthPill label="Critical" count={critCount} color="text-red-600" />
          <HealthPill label="Fixed" count={fixedCount} color="text-emerald-600" />
        </div>

        {/* No data state */}
        {seoGaps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-10 h-10 text-slate-200 mb-4" />
            <p className="text-sm font-semibold text-slate-600 mb-1">No SEO gaps found</p>
            <p className="text-xs text-slate-400 mb-4 max-w-xs">
              Run a store analysis to detect SEO and structured data issues.
            </p>
            <Button
              size="sm"
              onClick={handleRunAnalysis}
              disabled={analyzeMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              {analyzeMutation.isPending ? "Analyzing…" : "Run analysis"}
            </Button>
          </div>
        )}

        {/* All fixed state */}
        {seoGaps.length > 0 && openGaps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
            <p className="text-sm font-semibold text-emerald-700">All SEO issues fixed!</p>
            <p className="text-xs text-slate-400 mt-1">Your store is optimized for AI crawlers.</p>
          </div>
        )}

        {/* Category sections */}
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat];
          const gaps = byCategory[cat] ?? [];
          if (!meta || gaps.length === 0) return null;
          const CatIcon = meta.icon;
          return (
            <div key={cat} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <CatIcon className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-slate-800">{meta.label}</h3>
                <Badge variant="secondary" className="ml-auto text-[10px]">{gaps.length} issue{gaps.length !== 1 ? "s" : ""}</Badge>
              </div>
              <p className="text-xs text-slate-500 mb-2">{meta.description}</p>
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  {gaps.map((gap) => <GapRow key={gap.id} gap={gap} />)}
                </CardContent>
              </Card>
            </div>
          );
        })}

        {/* Footer */}
        {openGaps.length > 0 && (
          <div className="mt-4 flex items-center justify-between bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
            <p className="text-xs text-violet-800">
              Fix these issues to improve AI citations and organic discovery.
            </p>
            <button
              onClick={() => navigate("/issues")}
              className="text-xs font-medium text-violet-700 hover:text-violet-900 flex items-center gap-1"
            >
              All issues <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
