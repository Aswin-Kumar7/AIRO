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
    pill: "bg-teal-50 text-teal-700 border-teal-200",
  },
  tags: {
    label: "Tags",
    dot: "bg-violet-500",
    pill: "bg-violet-50 text-violet-700 border-violet-200",
  },
  title: {
    label: "Title",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
  },
  structure: {
    label: "Structure",
    dot: "bg-blue-500",
    pill: "bg-blue-50 text-blue-700 border-blue-200",
  },
  schema: {
    label: "Schema",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 border-rose-200",
  },
};

function getTypeConfig(type: string) {
  return TYPE_CONFIG[type] ?? { label: type, dot: "bg-slate-400", pill: "bg-slate-50 text-slate-600 border-slate-200" };
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
    <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors group">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">
          {fix.productTitle ?? fix.title}
        </p>
        <p className="text-xs text-slate-400 truncate mt-0.5">
          {fix.improvedContent.replace(/<[^>]+>/g, " ").trim().slice(0, 80)}
          {fix.improvedContent.length > 80 ? "…" : ""}
        </p>
      </div>
      <span
        className={`hidden sm:inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.pill}`}
      >
        {cfg.label}
      </span>
      <span className="text-xs text-slate-400 flex-shrink-0 hidden md:block tabular-nums">
        +{fix.estimatedScoreImprovement} pts
      </span>
      <Button
        size="sm"
        onClick={() => onApply(fix.id)}
        disabled={applying}
        className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1 flex-shrink-0"
      >
        {applying ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <>Apply <ChevronRight className="w-3 h-3" /></>
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
    <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 last:border-0">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} opacity-50`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-500 truncate">
          {fix.productTitle ?? fix.title}
        </p>
        <p className="text-xs text-slate-400 truncate mt-0.5">
          {fix.explanation.slice(0, 80)}{fix.explanation.length > 80 ? "…" : ""}
        </p>
      </div>
      <span
        className={`hidden sm:inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 opacity-60 ${cfg.pill}`}
      >
        {cfg.label}
      </span>
      {fix.shopifySynced ? (
        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium flex-shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" /> Synced
        </span>
      ) : fix.shopifyError ? (
        <span
          className="flex items-center gap-1 text-[11px] text-amber-600 font-medium flex-shrink-0"
          title={fix.shopifyError}
        >
          <AlertCircle className="w-3.5 h-3.5" /> Manual
        </span>
      ) : (
        <span className="text-[11px] text-slate-400 flex-shrink-0">Applied</span>
      )}
      {date && (
        <span className="text-[11px] text-slate-400 flex-shrink-0 hidden md:block">
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-slate-400">{count}</span>
      </div>
      {children}
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
    <div className="text-center">
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
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
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Quick Fixes</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              AI-generated improvements ready to push to Shopify
            </p>
          </div>
          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryFailed}
                className="text-xs gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry {failedCount} failed
              </Button>
            )}
            {pending.length > 1 && (
              <Button
                size="sm"
                onClick={handleBulkApply}
                className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Zap className="w-3.5 h-3.5" />
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
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">No fixes yet</p>
            <p className="text-xs text-slate-400 max-w-xs">
              Run an analysis from the Dashboard to generate AI-powered
              improvements for your products.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
              {[
                {
                  label: "Pending",
                  value: pending.length,
                  color: "text-slate-900",
                },
                {
                  label: "Applied",
                  value: applied.length,
                  color: "text-emerald-600",
                },
                {
                  label: "Shopify synced",
                  value: syncedCount,
                  color: "text-emerald-600",
                },
                {
                  label: "Need attention",
                  value: failedCount,
                  color: failedCount > 0 ? "text-amber-600" : "text-slate-400",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white px-5 py-4 text-center"
                >
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
