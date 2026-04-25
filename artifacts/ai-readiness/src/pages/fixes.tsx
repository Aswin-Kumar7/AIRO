import { useState } from "react";
import { useStore } from "@/context/store-context";
import {
  useListProducts, getListProductsQueryKey,
  getGetStoreSummaryQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Loader2, Zap, CheckCircle2, AlertCircle, ExternalLink,
  ChevronRight, Edit2, RefreshCw, CircleDot,
} from "lucide-react";
import { useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { QuickFixSheet } from "@/components/quick-fix-sheet";
import { useToast } from "@/hooks/use-toast";
import { applyFix } from "@/lib/quick-fix-api";
import { getCsrfToken } from "@/lib/csrf-service";

// ─── Types ────────────────────────────────────────────────────────────────────

type Fix = {
  id: string;
  type: string;
  status: string;
  title: string;
  improvedContent: string;
  explanation: string;
  estimatedScoreImprovement: number;
  shopifySynced: boolean;
  shopifyError: string | null;
  appliedAt: string | null;
  productId: string | null;
  productTitle: string | null;
};

function useFixes(storeId: string) {
  return useQuery<Fix[]>({
    queryKey: ["fixes", storeId],
    queryFn: () =>
      fetch(`/api/stores/${storeId}/fixes`, { credentials: "include" }).then(
        (r) => r.json(),
      ),
    enabled: !!storeId,
  });
}

// ─── Visual config ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  string,
  { label: string; dot: string; pill: string }
> = {
  description: {
    label: "Description",
    dot: "bg-teal-500",
    pill: "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 ring-1 ring-teal-200/50 dark:ring-teal-500/20",
  },
  tags: {
    label: "Tags",
    dot: "bg-violet-500",
    pill: "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-1 ring-violet-200/50 dark:ring-violet-500/20",
  },
  title: {
    label: "Title",
    dot: "bg-amber-500",
    pill: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-500/20",
  },
  structure: {
    label: "Structure",
    dot: "bg-blue-50 dark:bg-blue-500/100",
    pill: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200/50",
  },
  schema: {
    label: "Schema",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/50",
  },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, dot: "bg-slate-400", pill: "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-200 ring-1 ring-slate-200/50 dark:ring-white/10" };
}

// ─── Single fix row ───────────────────────────────────────────────────────────

function PendingRow({
  fix,
  onApply,
  applying,
}: {
  fix: Fix;
  onApply: (id: string) => void;
  applying: boolean;
}) {
  const cfg = getTypeConfig(fix.type);
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 tracking-tight truncate group-hover:text-slate-900 dark:text-white transition-colors">
          {fix.productTitle ?? fix.title}
        </p>
        <p className="text-[12px] text-slate-400 dark:text-zinc-400 truncate mt-0.5">
          {fix.improvedContent.replace(/<[^>]+>/g, " ").trim().slice(0, 80)}
          {fix.improvedContent.length > 80 ? "…" : ""}
        </p>
      </div>
      <span
        className={`hidden sm:inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${cfg.pill}`}
      >
        {cfg.label}
      </span>
      <span className="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0 hidden md:block tabular-nums">
        +{fix.estimatedScoreImprovement} pts
      </span>
      <Button
        size="sm"
        onClick={() => onApply(fix.id)}
        disabled={applying}
        className="h-8 px-4 text-[12px] bg-white dark:bg-[#111214] hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-300 dark:hover:border-emerald-500/40 gap-1.5 rounded-[8px] flex-shrink-0 shadow-sm ml-2 transition-colors"
      >
        {applying ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <>Apply <ChevronRight className="w-3.5 h-3.5 text-emerald-500" /></>
        )}
      </Button>
    </div>
  );
}

function AppliedRow({ fix }: { fix: Fix }) {
  const cfg = getTypeConfig(fix.type);
  const date = fix.appliedAt
    ? new Date(fix.appliedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} opacity-50`} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-slate-500 dark:text-zinc-300 tracking-tight truncate">
          {fix.productTitle ?? fix.title}
        </p>
        <p className="text-[12px] text-slate-400 dark:text-zinc-400 truncate mt-0.5">
          {fix.explanation.slice(0, 80)}{fix.explanation.length > 80 ? "…" : ""}
        </p>
      </div>
      <span
        className={`hidden sm:inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 opacity-60 ${cfg.pill}`}
      >
        {cfg.label}
      </span>
      {fix.shopifySynced ? (
        <span className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">
          <CheckCircle2 className="w-4 h-4" /> Synced
        </span>
      ) : fix.shopifyError ? (
        <span
          className="flex items-center gap-1.5 text-[12px] text-amber-600 font-medium flex-shrink-0"
          title={fix.shopifyError}
        >
          <AlertCircle className="w-4 h-4" /> Manual
        </span>
      ) : (
        <span className="text-[12px] text-slate-400 dark:text-zinc-400 flex-shrink-0 font-medium">Applied</span>
      )}
      {date && (
        <span className="text-[12px] text-slate-400 dark:text-zinc-400 flex-shrink-0 hidden md:block">
          {date}
        </span>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden mb-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-300 uppercase tracking-widest">
          {label}
        </span>
        <span className="text-[12px] font-medium text-slate-400 dark:text-zinc-400">{count}</span>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-white/5">
        {children}
      </div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="text-center flex flex-col items-center justify-center h-full">
      <p className={`text-3xl font-bold tabular-nums tracking-tight leading-none ${color}`}>{value}</p>
      <p className="text-[13px] font-medium text-slate-500 dark:text-zinc-300 mt-2">{label}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Fixes() {
  const { activeStoreId } = useStore();
  const { data: fixes, isLoading, refetch } = useFixes(activeStoreId!);
  const { data: products } = useListProducts(activeStoreId!, {
    query: {
      enabled: !!activeStoreId,
      queryKey: getListProductsQueryKey(activeStoreId!),
    },
  });
  const [, navigate] = useLocation();
  const [quickFixProduct, setQuickFixProduct] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  const pending = fixes?.filter((f) => f.status === "pending") ?? [];
  const applied = fixes?.filter((f) => f.status === "applied") ?? [];
  const syncedCount = applied.filter((f) => f.shopifySynced).length;
  const failedCount = applied.filter((f) => !!f.shopifyError && !f.shopifySynced).length;

  async function handleApply(fixId: string) {
    setApplyingId(fixId);
    try {
      await applyFix(activeStoreId!, fixId);
      refetch();
      queryClient.invalidateQueries({
        queryKey: getGetStoreSummaryQueryKey(activeStoreId!),
      });
      toast({ title: "Fix applied", description: "Shopify sync initiated." });
    } catch (e) {
      toast({
        title: "Apply failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setApplyingId(null);
    }
  }

  async function handleBulkApply() {
    if (pending.length === 0) return;
    let ok = 0;
    for (const fix of pending) {
      try {
        await applyFix(activeStoreId!, fix.id);
        ok++;
      } catch { /* skip */ }
    }
    refetch();
    queryClient.invalidateQueries({
      queryKey: getGetStoreSummaryQueryKey(activeStoreId!),
    });
    toast({ title: `${ok}/${pending.length} fixes applied` });
  }

  async function handleRetryFailed() {
    const failed = applied.filter((f) => !!f.shopifyError && !f.shopifySynced);
    let ok = 0;
    for (const fix of failed) {
      try {
        await applyFix(activeStoreId!, fix.id);
        if (true) ok++; // re-check after
      } catch { /* skip */ }
    }
    refetch();
    queryClient.invalidateQueries({
      queryKey: getGetStoreSummaryQueryKey(activeStoreId!),
    });
    toast({ title: `${ok} sync${ok !== 1 ? "s" : ""} retried` });
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Quick Fixes</h1>
            <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">
              AI-generated improvements ready to push to Shopify
            </p>
          </div>
          <div className="flex items-center gap-3">
            {failedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryFailed}
                className="text-[13px] gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 h-9 px-4 rounded-[10px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry {failedCount} failed
              </Button>
            )}
            {pending.length > 1 && (
              <Button
                size="sm"
                onClick={handleBulkApply}
                className="text-[13px] gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[10px] h-9 px-5 shadow-sm transition-all"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                Apply all ({pending.length})
              </Button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : !fixes?.length ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-slate-400 dark:text-zinc-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">No fixes yet</p>
            <p className="text-xs text-slate-400 dark:text-zinc-400 max-w-xs">
              Run an analysis from the Dashboard to generate AI-powered
              improvements for your products.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Pending", value: pending.length, color: "text-slate-900 dark:text-white" },
                { label: "Applied", value: applied.length, color: "text-emerald-600" },
                { label: "Shopify synced", value: syncedCount, color: "text-emerald-600" },
                { label: "Need attention", value: failedCount, color: failedCount > 0 ? "text-amber-600" : "text-slate-400 dark:text-zinc-400" },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-5 flex items-center justify-center">
                  <Stat label={s.label} value={s.value} color={s.color} />
                </div>
              ))}
            </div>

            {/* Pending */}
            {pending.length > 0 && (
              <Section label="Pending" count={pending.length}>
                {pending.map((fix) => (
                  <PendingRow
                    key={fix.id}
                    fix={fix}
                    onApply={handleApply}
                    applying={applyingId === fix.id}
                  />
                ))}
              </Section>
            )}

            {/* Applied */}
            {applied.length > 0 && (
              <Section label="Applied" count={applied.length}>
                {applied.map((fix) => (
                  <AppliedRow key={fix.id} fix={fix} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>

      {quickFixProduct && (
        <QuickFixSheet
          storeId={activeStoreId}
          productId={quickFixProduct.id}
          productTitle={quickFixProduct.title}
          isOpen
          onClose={() => {
            setQuickFixProduct(null);
            refetch();
            queryClient.invalidateQueries({
              queryKey: getListProductsQueryKey(activeStoreId),
            });
            queryClient.invalidateQueries({
              queryKey: getGetStoreSummaryQueryKey(activeStoreId),
            });
          }}
        />
      )}
    </AppLayout>
  );
}
