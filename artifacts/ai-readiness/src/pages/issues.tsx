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

const SEV_LEFT: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-400",
  low: "border-l-violet-400",
};

const EFFORT_PILL: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
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
        "border-l-4 bg-white border border-slate-200 rounded-lg overflow-hidden mb-2",
        SEV_LEFT[gap.severity] ?? "border-l-slate-300",
        gap.isFixed && "opacity-50",
      )}
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 text-left transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${SEV_DOT[gap.severity] ?? "bg-slate-300"}`}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {gap.title}
          </p>
          {gap.productTitle && (
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {gap.productTitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {gap.isFixed && (
            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              Fixed
            </span>
          )}
          {gap.effortLevel && (
            <span
              className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full border hidden sm:inline-flex",
                EFFORT_PILL[gap.effortLevel] ?? "",
              )}
            >
              {EFFORT_LABEL[gap.effortLevel] ?? gap.effortLevel}
            </span>
          )}
          <div className="flex items-center gap-1">
            <div className="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
              <div
                className={`h-full rounded-full ${SEV_DOT[gap.severity] ?? "bg-slate-300"}`}
                style={{ width: `${impact}%` }}
              />
            </div>
            {open ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
        </div>
      </button>

      {/* Expanded */}
      {open && (
        <div className="px-4 pb-4 pt-1 ml-5 space-y-2.5 border-t border-slate-100">
          {gap.evidence && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800">{gap.evidence}</p>
            </div>
          )}
          <p className="text-xs text-slate-500 leading-relaxed">
            {gap.description}
          </p>
          <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <Zap className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700">{gap.suggestion}</p>
          </div>
          {gap.productId && (
            <Link href={`/products/${gap.productId}`}>
              <span className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                <Package className="w-3 h-3" />
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
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className="text-xs text-slate-400">({gaps.length})</span>
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
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
    num: "bg-red-100 text-red-700",
  },
  {
    sev: "medium" as const,
    label: "Phase 2 — Short-term fixes",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    num: "bg-amber-100 text-amber-700",
  },
  {
    sev: "low" as const,
    label: "Phase 3 — Long-term",
    color: "text-violet-600",
    bg: "bg-violet-50 border-violet-200",
    badge: "bg-violet-100 text-violet-700",
    num: "bg-violet-100 text-violet-700",
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
    <div className={`rounded-lg border overflow-hidden mb-2 ${cfg.bg}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:brightness-95 transition-all"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${cfg.num}`}
        >
          {rank}
        </span>
        <p className="flex-1 text-sm font-medium text-slate-800 truncate">
          {item.gap}
        </p>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide hidden sm:inline-flex flex-shrink-0 ${cfg.badge}`}
        >
          {item.severity}
        </span>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 ml-8 space-y-2 border-t border-white/60">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">{item.conversionImpact}</p>
          </div>
          <div className="bg-white/70 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Suggested fix
            </p>
            <p className="text-xs text-slate-700 leading-relaxed">
              {item.suggestedFix}
            </p>
          </div>
          {item.productId && item.productTitle && (
            <Link href={`/products/${item.productId}`}>
              <span className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                <Package className="w-3 h-3" />
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
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Issues</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Evidence-backed gaps and prioritized improvements
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-slate-500"
            onClick={refresh}
            disabled={gapsLoading}
          >
            <RefreshCw
              className={cn("w-3 h-3", gapsLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200 mb-6">
          {[
            {
              label: "Open",
              value: openGaps.length,
              color: "text-slate-900",
            },
            { label: "Critical", value: critCount, color: "text-red-600" },
            { label: "Medium", value: medCount, color: "text-amber-600" },
            {
              label: "Fixed",
              value: fixedGaps.length,
              color: "text-emerald-600",
            },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3.5 text-center">
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>
                {s.value}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="gaps">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-slate-100 p-0.5 h-9">
              <TabsTrigger
                value="gaps"
                className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> All Issues
              </TabsTrigger>
              <TabsTrigger
                value="action-plan"
                className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
              >
                <ListChecks className="w-3.5 h-3.5" /> Action Plan
              </TabsTrigger>
            </TabsList>

            {/* Show fixed toggle */}
            {fixedGaps.length > 0 && (
              <button
                onClick={() => setShowFixed((p) => !p)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
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
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  No open issues
                </p>
                <p className="text-xs text-slate-400">
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
                <p className="text-sm text-slate-400">
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
