import { useState } from "react";
import { useStore } from "@/context/store-context";
import { getGetStoreSummaryQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Loader2, Zap, CheckCircle2, AlertCircle,
  ChevronRight, Edit2, RefreshCw, Check, X, Clock,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { applyFix } from "@/lib/quick-fix-api";

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

const TYPE_CONFIG: Record<string, { label: string; dot: string; pill: string }> = {
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
    dot: "bg-blue-500",
    pill: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200/50",
  },
  schema: {
    label: "Schema",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-200/50",
  },
};

function getTypeConfig(type: string) {
  return (
    TYPE_CONFIG[type] ?? {
      label: type,
      dot: "bg-slate-400",
      pill: "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-200 ring-1 ring-slate-200/50 dark:ring-white/10",
    }
  );
}

// ─── Individual pending fix row (with inline review panel) ───────────────────

function PendingRow({
  fix,
  onApply,
  applying: externalApplying,
}: {
  fix: Fix;
  onApply: (id: string, editedContent?: string) => Promise<void>;
  applying: boolean;
}) {
  const cfg = getTypeConfig(fix.type);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editedContent, setEditedContent] = useState(
    fix.improvedContent.replace(/<[^>]+>/g, " ").trim(),
  );
  const [progress, setProgress] = useState(0);
  const [confirming, setConfirming] = useState(false);

  async function handleConfirmApply() {
    setConfirming(true);
    setProgress(5);
    let p = 5;
    const iv = setInterval(() => {
      p = Math.min(80, p + Math.round(Math.random() * 10 + 5));
      setProgress(p);
      if (p >= 80) clearInterval(iv);
    }, 250);
    try {
      await onApply(fix.id, editedContent);
      clearInterval(iv);
      setProgress(100);
    } catch {
      clearInterval(iv);
      setProgress(0);
      setConfirming(false);
    }
  }

  return (
    <div>
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 tracking-tight truncate">
            {fix.productTitle ?? fix.title}
          </p>
          <p className="text-[12px] text-slate-400 dark:text-zinc-400 truncate mt-0.5">
            {fix.improvedContent.replace(/<[^>]+>/g, " ").trim().slice(0, 80)}
            {fix.improvedContent.length > 80 ? "…" : ""}
          </p>
        </div>
        <span className={`hidden sm:inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 ${cfg.pill}`}>
          {cfg.label}
        </span>
        <span className="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0 hidden md:block tabular-nums">
          +{fix.estimatedScoreImprovement} pts
        </span>
        <Button
          size="sm"
          onClick={() => {
            setReviewOpen((v) => !v);
            setProgress(0);
            setConfirming(false);
          }}
          disabled={externalApplying || confirming}
          className="h-8 px-4 text-[12px] bg-white dark:bg-[#111214] hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-300 dark:hover:border-emerald-500/40 gap-1.5 rounded-[8px] flex-shrink-0 shadow-sm ml-2 transition-colors"
        >
          {reviewOpen ? (
            <><X className="w-3.5 h-3.5 text-slate-400" /> Close</>
          ) : (
            <><ChevronRight className="w-3.5 h-3.5 text-emerald-500" /> Review</>
          )}
        </Button>
      </div>

      {/* Inline review / confirm panel */}
      {reviewOpen && (
        <div className="mx-5 mb-4 border border-emerald-200 dark:border-emerald-800 rounded-[10px] overflow-hidden bg-emerald-50/40 dark:bg-emerald-900/10">
          {/* Progress bar */}
          <div className="h-1 bg-slate-100 dark:bg-zinc-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <Edit2 className="w-3 h-3" /> Review &amp; edit before applying
              </p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.pill}`}>
                {cfg.label}
              </span>
            </div>
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              rows={4}
              disabled={confirming}
              className="text-[12px] font-mono resize-none bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 rounded-[8px] focus-visible:ring-emerald-500"
            />
            {fix.explanation && (
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 italic leading-relaxed">
                <span className="font-semibold not-italic">Why: </span>
                {fix.explanation}
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => { setReviewOpen(false); setProgress(0); setConfirming(false); }}
                disabled={confirming}
                className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors disabled:opacity-40"
              >
                Discard
              </button>
              <Button
                size="sm"
                onClick={handleConfirmApply}
                disabled={confirming}
                className="h-8 px-4 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 rounded-[8px] shadow-sm"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {progress < 100 ? `Applying… ${progress}%` : "Done!"}
                  </>
                ) : (
                  <><Check className="w-3.5 h-3.5" /> Confirm &amp; Apply</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Applied fix row ──────────────────────────────────────────────────────────

function AppliedRow({ fix }: { fix: Fix }) {
  const cfg = getTypeConfig(fix.type);
  const date = fix.appliedAt
    ? new Date(fix.appliedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
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
      <span className={`hidden sm:inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 opacity-60 ${cfg.pill}`}>
        {cfg.label}
      </span>

      {/* Sync status — three clear states */}
      {fix.shopifySynced ? (
        <span className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium flex-shrink-0">
          <CheckCircle2 className="w-4 h-4" /> Synced
        </span>
      ) : fix.shopifyError ? (
        <span
          className="flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400 font-medium flex-shrink-0"
          title={fix.shopifyError}
        >
          <AlertCircle className="w-4 h-4" /> Sync failed
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-[12px] text-slate-400 dark:text-zinc-400 font-medium flex-shrink-0">
          <Clock className="w-3.5 h-3.5" /> Pending sync
        </span>
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
      <div className="divide-y divide-slate-50 dark:divide-white/5">{children}</div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="text-center flex flex-col items-center justify-center h-full">
      <p className={`text-3xl font-bold tabular-nums tracking-tight leading-none ${color}`}>{value}</p>
      <p className="text-[13px] font-medium text-slate-500 dark:text-zinc-300 mt-2">{label}</p>
    </div>
  );
}

// ─── Bulk apply progress bar ──────────────────────────────────────────────────

function BulkProgressBar({ progress, total, done }: { progress: number; total: number; done: number }) {
  return (
    <div className="mb-4 bg-white dark:bg-[#080808] rounded-[14px] border border-emerald-200 dark:border-emerald-800/50 shadow-sm overflow-hidden">
      <div className="h-1.5 bg-slate-100 dark:bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[12px] font-medium text-slate-600 dark:text-zinc-300 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
          Applying fixes… {done} of {total}
        </span>
        <span className="text-[12px] tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
          {progress}%
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Fixes() {
  const { activeStoreId } = useStore();
  const { data: fixes, isLoading, refetch } = useFixes(activeStoreId!);
  const [, navigate] = useLocation();
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkDone, setBulkDone] = useState(0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  const pending = fixes?.filter((f) => f.status === "pending") ?? [];
  const applied = fixes?.filter((f) => f.status === "applied") ?? [];
  const syncedCount = applied.filter((f) => f.shopifySynced).length;
  const failedSyncCount = applied.filter((f) => !!f.shopifyError && !f.shopifySynced).length;

  async function handleApply(fixId: string, editedContent?: string) {
    setApplyingId(fixId);
    try {
      await applyFix(activeStoreId!, fixId, editedContent);
      refetch();
      queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId!) });
      toast({ title: "Fix applied", description: "Shopify sync initiated." });
    } catch (e) {
      toast({
        title: "Apply failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      throw e; // re-throw so PendingRow can reset its confirming state
    } finally {
      setApplyingId(null);
    }
  }

  async function handleBulkApply() {
    if (pending.length === 0 || bulkApplying) return;
    setBulkConfirming(false);
    setBulkApplying(true);
    setBulkProgress(0);
    setBulkDone(0);
    let ok = 0;
    for (let i = 0; i < pending.length; i++) {
      const fix = pending[i]!;
      try {
        await applyFix(activeStoreId!, fix.id);
        ok++;
      } catch { /* skip individual failures */ }
      const done = i + 1;
      setBulkDone(done);
      setBulkProgress(Math.round((done / pending.length) * 100));
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId!) });
    toast({ title: `${ok} of ${pending.length} fixes applied` });
    setBulkApplying(false);
    setBulkProgress(0);
    setBulkDone(0);
  }

  async function handleRetryFailed() {
    const failed = applied.filter((f) => !!f.shopifyError && !f.shopifySynced);
    let ok = 0;
    for (const fix of failed) {
      try {
        await applyFix(activeStoreId!, fix.id);
        ok++;
      } catch { /* skip */ }
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(activeStoreId!) });
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
            {failedSyncCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryFailed}
                className="text-[13px] gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 h-9 px-4 rounded-[10px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry {failedSyncCount} failed
              </Button>
            )}

            {pending.length > 1 && !bulkApplying && (
              bulkConfirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-slate-500 dark:text-zinc-400">
                    Apply all {pending.length} fixes?
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkConfirming(false)}
                    className="h-9 px-3 text-[12px] rounded-[10px]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkApply}
                    className="text-[13px] gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[10px] h-9 px-5 shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" /> Yes, apply all
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setBulkConfirming(true)}
                  className="text-[13px] gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[10px] h-9 px-5 shadow-sm transition-all"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  Apply all ({pending.length})
                </Button>
              )
            )}

            {bulkApplying && (
              <Button size="sm" disabled className="text-[13px] gap-2 rounded-[10px] h-9 px-5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Applying…
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
                { label: "Sync issues", value: failedSyncCount, color: failedSyncCount > 0 ? "text-amber-600" : "text-slate-400 dark:text-zinc-400" },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-5 flex items-center justify-center">
                  <Stat label={s.label} value={s.value} color={s.color} />
                </div>
              ))}
            </div>

            {/* Bulk progress bar (visible during bulk apply) */}
            {bulkApplying && (
              <BulkProgressBar progress={bulkProgress} total={pending.length} done={bulkDone} />
            )}

            {/* Pending */}
            {pending.length > 0 && (
              <Section label="Pending" count={pending.length}>
                {pending.map((fix) => (
                  <PendingRow
                    key={fix.id}
                    fix={fix}
                    onApply={(id, content) => handleApply(id, content)}
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
    </AppLayout>
  );
}
