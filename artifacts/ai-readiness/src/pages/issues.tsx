import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useListGaps, getListGapsQueryKey } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, AlertTriangle, Zap, TrendingUp, ListChecks,
  Package, ChevronDown, ChevronUp, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { getStorePerception, type ActionPlanItem } from "@/lib/insights-api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Gap = {
  id: string;
  productId: string | null;
  productTitle?: string | null;
  category: string;
  severity: string;
  title: string;
  description: string;
  suggestion: string;
  evidence?: string | null;
  impactScore?: number | null;
  effortLevel?: string | null;
  ruleId?: string | null;
  isFixed: boolean;
};

// ─── Visual config ────────────────────────────────────────────────────────────

const SEV_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-violet-400",
};

const SEV_PILL: Record<string, string> = {
  high: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-200/50 dark:ring-red-500/20",
  medium: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-200/50 dark:ring-amber-500/20",
  low: "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-1 ring-inset ring-violet-200/50 dark:ring-violet-500/20",
};

const EFFORT_PILL: Record<string, string> = {
  low: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-200/50 dark:ring-emerald-500/20",
  medium: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-200/50 dark:ring-amber-500/20",
  high: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-200/50 dark:ring-red-500/20",
};

const EFFORT_LABEL: Record<string, string> = {
  low: "Easy",
  medium: "Medium",
  high: "High effort",
};

// ─── Gap row ──────────────────────────────────────────────────────────────────

function GapRow({ gap }: { gap: Gap }) {
  const [open, setOpen] = useState(false);
  const impact = gap.impactScore ?? 50;

  return (
    <div
      className={cn(
        "bg-white dark:bg-[#080808] rounded-[12px] border border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden mb-3 transition-all hover:border-slate-300 dark:hover:border-white/20 hover:shadow-md",
        gap.isFixed && "opacity-50",
      )}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest ring-1 ${SEV_PILL[gap.severity] ?? "bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-zinc-300 ring-slate-200/50 dark:ring-white/10"}`}
        >
          {gap.severity}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 tracking-tight truncate">
            {gap.title}
          </p>
          {gap.productTitle && (
            <p className="text-[12px] text-slate-400 dark:text-zinc-400 mt-0.5 truncate">
              {gap.productTitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {gap.isFixed && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 dark:bg-emerald-500/10 px-2.5 py-0.5 rounded-full ring-1 ring-emerald-200/50 dark:ring-emerald-500/20">
              Fixed
            </span>
          )}
          {gap.effortLevel && (
            <span
              className={cn(
                "text-[10px] font-bold px-2.5 py-0.5 rounded-full hidden sm:inline-flex",
                EFFORT_PILL[gap.effortLevel] ?? "",
              )}
            >
              {EFFORT_LABEL[gap.effortLevel] ?? gap.effortLevel}
            </span>
          )}
          <div className="flex items-center gap-2">
            <div className="w-10 h-1.5 bg-slate-100 dark:bg-[#111214] border dark:border-white/5 rounded-full overflow-hidden hidden sm:block">
              <div
                className={`h-full rounded-full ${SEV_DOT[gap.severity] ?? "bg-slate-300"}`}
                style={{ width: `${impact}%` }}
              />
            </div>
            {open ? (
              <ChevronUp className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-5 pb-5 pt-2 ml-[96px] space-y-3 border-t border-slate-50 dark:border-white/5">
          {gap.evidence && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 rounded-[10px] px-3.5 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-amber-800 dark:text-amber-200 font-medium leading-relaxed">{gap.evidence}</p>
            </div>
          )}
          <p className="text-[13px] text-slate-600 dark:text-zinc-200 leading-relaxed max-w-3xl">
            {gap.description}
          </p>
          <div className="flex items-start gap-2 bg-slate-50 dark:bg-white/5 rounded-[10px] px-3.5 py-2.5 max-w-3xl border border-slate-100 dark:border-white/5">
            <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">{gap.suggestion}</p>
          </div>
          {gap.productId && (
            <Link href={`/products/${gap.productId}`}>
              <span className="text-[12px] font-semibold text-slate-900 dark:text-white hover:text-emerald-700 flex items-center gap-1 mt-2 transition-colors">
                <Package className="w-3.5 h-3.5" />
                View product →
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Gap group ────────────────────────────────────────────────────────────────

function GapSection({
  title,
  icon: Icon,
  iconColor,
  gaps,
}: {
  title: string;
  icon: React.FC<{ className?: string }>;
  iconColor: string;
  gaps: Gap[];
}) {
  if (gaps.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>
        <span className="text-xs text-slate-400 dark:text-zinc-400">({gaps.length})</span>
      </div>
      {gaps.map((g) => (
        <GapRow key={g.id} gap={g} />
      ))}
    </div>
  );
}

// ─── Action plan ──────────────────────────────────────────────────────────────

const PHASE_CONFIG = [
  {
    sev: "high" as const,
    label: "Phase 1 — Immediate action",
    color: "text-red-600",
    bg: "bg-white dark:bg-[#080808] border border-red-100 dark:border-white/10 shadow-sm",
    badge: "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-red-200/50 dark:ring-red-500/20",
    num: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  },
  {
    sev: "medium" as const,
    label: "Phase 2 — Short-term fixes",
    color: "text-amber-600",
    bg: "bg-white dark:bg-[#080808] border border-amber-100 dark:border-white/10 shadow-sm",
    badge: "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-amber-200/50 dark:ring-amber-500/20",
    num: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
  {
    sev: "low" as const,
    label: "Phase 3 — Long-term",
    color: "text-violet-600",
    bg: "bg-white dark:bg-[#080808] border border-violet-100 dark:border-white/10 shadow-sm",
    badge: "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-1 ring-violet-200/50 dark:ring-violet-500/20",
    num: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400",
  },
];

function ActionRow({
  item,
  rank,
  cfg,
}: {
  item: ActionPlanItem;
  rank: number;
  cfg: (typeof PHASE_CONFIG)[number];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-[12px] overflow-hidden mb-3 transition-all hover:shadow-md ${cfg.bg}`}>
      <button
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${cfg.num}`}
        >
          {rank}
        </span>
        <p className="flex-1 text-[14px] font-semibold text-slate-800 dark:text-slate-200 tracking-tight truncate">
          {item.gap}
        </p>
        <span
          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-widest hidden sm:inline-flex flex-shrink-0 ${cfg.badge}`}
        >
          {item.severity}
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400 dark:text-zinc-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-zinc-400 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-3 ml-10 space-y-3 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-transparent">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-[13px] text-slate-700 dark:text-slate-200 font-medium">{item.conversionImpact}</p>
          </div>
          <div className="bg-white dark:bg-black rounded-[10px] px-4 py-3 border border-slate-200/60 dark:border-white/10 shadow-sm">
            <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5">
              Suggested fix
            </p>
            <p className="text-[13px] text-slate-600 dark:text-zinc-300 leading-relaxed font-medium">
              {item.suggestedFix}
            </p>
          </div>
          {item.productId && item.productTitle && (
            <Link href={`/products/${item.productId}`}>
              <span className="text-[12px] font-semibold text-slate-900 dark:text-white hover:text-emerald-700 flex items-center gap-1 transition-colors">
                <Package className="w-3.5 h-3.5" />
                {item.productTitle}
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Issues() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const [showFixed, setShowFixed] = useState(false);

  const queryClient = useQueryClient();

  const { data: gapsData, isLoading: gapsLoading } = useListGaps(
    activeStoreId!,
    {
      query: {
        enabled: !!activeStoreId,
        queryKey: getListGapsQueryKey(activeStoreId!),
      },
    },
  ) as { data: Gap[] | undefined; isLoading: boolean };

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ["store-perception", activeStoreId],
    queryFn: () => getStorePerception(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  const allGaps = gapsData ?? [];
  const openGaps = allGaps.filter((g) => !g.isFixed);
  const fixedGaps = allGaps.filter((g) => g.isFixed);

  const displayGaps = showFixed ? allGaps : openGaps;

  const quickWins = displayGaps.filter(
    (g) =>
      !g.isFixed &&
      (g.effortLevel === "low" || !g.effortLevel) &&
      (g.impactScore ?? 50) >= 40,
  );
  const highPriority = displayGaps.filter(
    (g) => !g.isFixed && g.severity === "high" && !quickWins.includes(g),
  );
  const improvements = displayGaps.filter(
    (g) =>
      !g.isFixed && !quickWins.includes(g) && !highPriority.includes(g),
  );

  const critCount = openGaps.filter((g) => g.severity === "high").length;
  const medCount = openGaps.filter((g) => g.severity === "medium").length;

  const plan = planData?.prioritizedActionPlan ?? [];
  const sorted = [...plan].sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 }[a.severity] ?? 2) -
      ({ high: 0, medium: 1, low: 2 }[b.severity] ?? 2),
  );

  function refresh() {
    queryClient.invalidateQueries({
      queryKey: getListGapsQueryKey(activeStoreId!),
    });
    queryClient.invalidateQueries({
      queryKey: ["store-perception", activeStoreId],
    });
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Issues</h1>
            <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">
              Evidence-backed gaps and prioritized improvements
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-[13px] rounded-[10px] shadow-sm gap-1.5 text-slate-600 dark:text-zinc-200"
            onClick={refresh}
            disabled={gapsLoading}
          >
            <RefreshCw
              className={cn("w-4 h-4", gapsLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Open", value: openGaps.length, color: "text-slate-900 dark:text-white" },
            { label: "Critical", value: critCount, color: "text-red-600" },
            { label: "Medium", value: medCount, color: "text-amber-600" },
            { label: "Fixed", value: fixedGaps.length, color: "text-emerald-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-5 flex flex-col items-center justify-center">
              <p className={`text-3xl font-bold tabular-nums tracking-tight leading-none ${s.color}`}>
                {s.value}
              </p>
              <p className="text-[13px] font-medium text-slate-500 dark:text-zinc-300 mt-2">{s.label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="gaps">
          <div className="flex items-center justify-between mb-6">
            <TabsList className="bg-slate-200/50 dark:bg-white/5 p-1 h-10 rounded-[10px]">
              <TabsTrigger
                value="gaps"
                className="text-[13px] font-semibold h-8 px-4 gap-1.5 rounded-[8px] data-[state=active]:bg-white dark:bg-transparent data-[state=active]:dark:bg-white/10 data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:text-white text-slate-500 dark:text-zinc-300"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> All Issues
              </TabsTrigger>
              <TabsTrigger
                value="action-plan"
                className="text-[13px] font-semibold h-8 px-4 gap-1.5 rounded-[8px] data-[state=active]:bg-white dark:bg-transparent data-[state=active]:dark:bg-white/10 data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:text-white text-slate-500 dark:text-zinc-300"
              >
                <ListChecks className="w-3.5 h-3.5 text-blue-500" /> Action Plan
              </TabsTrigger>
            </TabsList>

            {/* Show fixed toggle */}
            {fixedGaps.length > 0 && (
              <button
                onClick={() => setShowFixed((p) => !p)}
                className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-300 hover:text-slate-700 dark:text-slate-200 transition-colors"
              >
                {showFixed ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
                {showFixed ? "Hide fixed" : `Show ${fixedGaps.length} fixed`}
              </button>
            )}
          </div>

          {/* All Issues */}
          <TabsContent value="gaps" className="mt-0">
            {gapsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : openGaps.length === 0 && !showFixed ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                  <Zap className="w-5 h-5 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  No open issues
                </p>
                <p className="text-xs text-slate-400 dark:text-zinc-400">
                  Run an analysis to detect gaps in your catalog.
                </p>
              </div>
            ) : (
              <>
                <GapSection
                  title="Quick Wins — high impact, easy to fix"
                  icon={Zap}
                  iconColor="text-emerald-500"
                  gaps={quickWins}
                />
                <GapSection
                  title="High Priority"
                  icon={AlertTriangle}
                  iconColor="text-red-500"
                  gaps={highPriority}
                />
                <GapSection
                  title="Improvements"
                  icon={TrendingUp}
                  iconColor="text-violet-500"
                  gaps={improvements}
                />
                {showFixed && fixedGaps.length > 0 && (
                  <GapSection
                    title="Fixed"
                    icon={Zap}
                    iconColor="text-emerald-400"
                    gaps={fixedGaps}
                  />
                )}
              </>
            )}
          </TabsContent>

          {/* Action Plan */}
          <TabsContent value="action-plan" className="mt-0">
            {planLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ListChecks className="w-10 h-10 text-slate-200 mb-3" />
                <p className="text-sm text-slate-400 dark:text-zinc-400">
                  Run a full analysis to generate an action plan
                </p>
              </div>
            ) : (
              <div>
                {PHASE_CONFIG.map((cfg) => {
                  const items = sorted.filter((i) => i.severity === cfg.sev);
                  if (items.length === 0) return null;
                  const offset = sorted.filter(
                    (i) =>
                      ({ high: 0, medium: 1, low: 2 }[i.severity] ?? 2) <
                      ({ high: 0, medium: 1, low: 2 }[cfg.sev] ?? 2),
                  ).length;
                  return (
                    <div key={cfg.sev} className="mb-6">
                      <p
                        className={`text-xs font-bold uppercase tracking-wide mb-3 ${cfg.color}`}
                      >
                        {cfg.label}
                      </p>
                      {items.map((item, idx) => (
                        <ActionRow
                          key={item.gapId}
                          item={item}
                          rank={offset + idx + 1}
                          cfg={cfg}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
