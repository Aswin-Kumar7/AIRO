import { useState } from "react";
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
  ChevronRight, ChevronDown, ChevronUp,
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
  const [open, setOpen] = useState(false);
  const Icon = RULE_ICONS[gap.ruleId] ?? AlertCircle;
  const severityConfig = {
    high: { label: "High", badge: "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400", dot: "bg-red-500" },
    medium: { label: "Medium", badge: "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
    low: { label: "Low", badge: "bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400", dot: "bg-violet-500" },
  }[gap.severity];

  return (
    <div className={`flex flex-col border-b border-slate-100 dark:border-white/5 last:border-0 transition-colors hover:bg-slate-50/50 dark:hover:bg-white/5 ${gap.isFixed ? "opacity-50" : ""}`}>
      <button 
        className="w-full flex items-center gap-4 px-5 py-4 text-left" 
        onClick={() => setOpen(!open)}
      >
        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-slate-500 dark:text-zinc-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <div className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 tracking-tight flex-1 flex items-center flex-wrap gap-x-2 gap-y-1">
              <span>{gap.title}</span>
              {gap.productTitle && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-zinc-200 bg-slate-100 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 px-2 py-0.5 rounded-md truncate max-w-[250px]">
                  <Search className="w-3 h-3 text-slate-400 dark:text-zinc-400" />
                  <span className="truncate">{gap.productTitle}</span>
                </span>
              )}
            </div>
            {gap.isFixed && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 ring-1 ring-emerald-200/50">Fixed</span>
            )}
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full flex-shrink-0 ring-1 ${severityConfig.badge.replace("100", "50").replace("border", "ring-").replace("bg", "bg").replace("text", "text").replace(/-\d00/g, (m) => m + " ring" + m.replace("text", "ring").replace("700", "200/50"))}`}>
              {severityConfig.label}
            </span>
          </div>
          <p className="text-[12px] text-slate-500 dark:text-zinc-300 truncate">{gap.description}</p>
        </div>
        <div className="flex-shrink-0 ml-2">
          {open ? <ChevronUp className="w-4 h-4 text-slate-400 dark:text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 ml-[60px] pr-5">
          {gap.evidence && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-[10px] px-3.5 py-2.5 mb-2.5">
              <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800 dark:text-amber-200 font-medium leading-relaxed">{gap.evidence}</p>
            </div>
          )}
          <div className="flex items-start gap-2 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-[10px] px-3.5 py-2.5">
            <Zap className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">{gap.suggestion}</p>
          </div>
        </div>
      )}
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
    <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 shadow-sm rounded-[16px] px-5 py-4 flex flex-col items-center justify-center flex-1 min-w-[120px]">
      <span className={`text-3xl font-bold tabular-nums tracking-tight leading-none ${color}`}>{count}</span>
      <span className="text-[13px] font-medium text-slate-500 dark:text-zinc-300 mt-2">{label}</span>
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
          <p className="text-slate-500 dark:text-zinc-300 text-sm">Connect a store to see your SEO Audit</p>
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-violet-500" />
            SEO Audit
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-300 mt-0.5">
            Technical SEO and structured data gaps that affect AI discoverability
          </p>
        </div>

        {/* Info banner */}
        <div className="bg-violet-50/50 dark:bg-violet-500/10 border border-violet-200/60 dark:border-violet-500/20 rounded-[16px] p-5 flex gap-4 mb-8">
          <Info className="w-5 h-5 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
          <div className="text-[13px] text-violet-900 dark:text-violet-200 space-y-1.5 leading-relaxed">
            <p className="font-bold text-[14px]">Why SEO matters for AI</p>
            <p className="text-violet-800 dark:text-violet-300">AI engines like Perplexity and SearchGPT rely on crawl access, structured data, and meta information to discover and cite your products. Fixing these gaps directly improves your GEO citation rate.</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <HealthPill label="Open issues" count={openGaps.length} color="text-slate-900 dark:text-white" />
          <HealthPill label="Critical" count={critCount} color="text-red-600" />
          <HealthPill label="Fixed" count={fixedCount} color="text-emerald-600" />
        </div>

        {/* No data state */}
        {seoGaps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-10 h-10 text-slate-200 mb-4" />
            <p className="text-sm font-semibold text-slate-600 dark:text-zinc-200 mb-1">No SEO gaps found</p>
            <p className="text-xs text-slate-400 dark:text-zinc-400 mb-4 max-w-xs">
              Run a store analysis to detect SEO and structured data issues.
            </p>
            <Button
              size="sm"
              onClick={handleRunAnalysis}
              disabled={analyzeMutation.isPending}
              className="bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white gap-2 rounded-[10px] shadow-sm h-10 px-5 text-[13px]"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 text-amber-400" />
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
            <p className="text-xs text-slate-400 dark:text-zinc-400 mt-1">Your store is optimized for AI crawlers.</p>
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
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{meta.label}</h3>
                <Badge variant="secondary" className="ml-auto text-[10px]">{gaps.length} issue{gaps.length !== 1 ? "s" : ""}</Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-300 mb-2">{meta.description}</p>
              <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {gaps.map((gap) => <GapRow key={gap.id} gap={gap} />)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Footer */}
        {openGaps.length > 0 && (
          <div className="mt-4 flex items-center justify-between bg-violet-50 dark:bg-violet-500/10 border border-violet-100 dark:border-violet-500/20 rounded-xl px-4 py-3">
            <p className="text-xs text-violet-800 dark:text-violet-300">
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
