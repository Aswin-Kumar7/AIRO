import { useStore } from "@/context/store-context";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Loader2, Brain, FileText,
  ArrowRight, TrendingUp, Search, Zap, AlertCircle,
  ShieldCheck, ShoppingCart, Map,
} from "lucide-react";
import {
  useGetStoreSummary, getGetStoreSummaryQueryKey,
  useListGaps, getListGapsQueryKey,
} from "@workspace/api-client-react";

// ─── Mini score arc ───────────────────────────────────────────────────────────

function ScoreArc({ score, color, size = 56, sw = 5 }: { score: number; color: string; size?: number; sw?: number }) {
  const r = (size - sw * 2) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} className="dark:stroke-zinc-800" />
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease-out" }} />
      </svg>
      <span className="absolute text-[15px] font-extrabold text-slate-900 dark:text-white tabular-nums">
        {Math.round(score)}
      </span>
    </div>
  );
}


function tier(s: number) {
  if (s >= 80) return { label: "Strong",     cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" };
  if (s >= 60) return { label: "Moderate",   cls: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10" };
  return         { label: "Needs work",  cls: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10" };
}

// ─── Journey stage config ─────────────────────────────────────────────────────

interface JourneyStage {
  id: string;
  label: string;
  subtitle: string;
  icon: React.FC<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  dims: Array<{ label: string; weight: number; key: string }>;
  tip: string;
}

const JOURNEY_STAGES: JourneyStage[] = [
  {
    id: "discovery", label: "Discovery", subtitle: "Can AI find your products?",
    icon: Search, color: "#3b82f6",
    dims: [{ label: "Tags", weight: 0.55, key: "tagScore" }, { label: "Consistency", weight: 0.45, key: "consistencyScore" }],
    tip: "Add structured product type, vendor, and descriptive tags.",
  },
  {
    id: "evaluation", label: "Evaluation", subtitle: "Can AI answer buyer questions?",
    icon: Brain, color: "#8b5cf6",
    dims: [{ label: "Clarity", weight: 0.5, key: "clarityScore" }, { label: "Completeness", weight: 0.5, key: "completenessScore" }],
    tip: "Write descriptions that answer: what is it, who is it for, what problem does it solve?",
  },
  {
    id: "trust", label: "Trust", subtitle: "Does AI vouch for your product?",
    icon: ShieldCheck, color: "#f59e0b",
    dims: [{ label: "Trust", weight: 0.7, key: "trustScore" }, { label: "Policy", weight: 0.3, key: "policyScore" }],
    tip: "Add reviews, certifications, and clear return/shipping policies.",
  },
  {
    id: "decision", label: "Decision", subtitle: "Does AI close the sale?",
    icon: ShoppingCart, color: "#10b981",
    dims: [{ label: "Overall", weight: 0.6, key: "overallScore" }, { label: "Policy", weight: 0.4, key: "policyScore" }],
    tip: "Ensure pricing, shipping, and return policies are explicit.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AeoScorePage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data: summary, isLoading: summaryLoading } = useGetStoreSummary(activeStoreId ?? "", {
    query: { queryKey: getGetStoreSummaryQueryKey(activeStoreId ?? ""), enabled: !!activeStoreId },
  });

  const { data: gapsData, isLoading: gapsLoading } = useListGaps(activeStoreId ?? "", {
    query: { queryKey: getListGapsQueryKey(activeStoreId ?? ""), enabled: !!activeStoreId },
  });

  const isLoading = summaryLoading || gapsLoading;

  if (!activeStoreId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
          <Brain className="w-8 h-8 text-slate-300" />
          <p className="text-[13px] text-slate-500">Connect a store to see your AI Score</p>
          <Button size="sm" onClick={() => navigate("/connect")}>Connect store</Button>
        </div>
      </AppLayout>
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        </div>
      </AppLayout>
    );
  }

  if (!summary || summary.lastAnalyzed == null) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Brain className="w-10 h-10 text-slate-200" />
          <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-200">No data yet</p>
          <p className="text-[12px] text-slate-400 max-w-xs">Run an analysis from the Dashboard to generate your AI Score breakdown.</p>
          <Button size="sm" onClick={() => navigate("/dashboard")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Zap className="w-3.5 h-3.5" /> Go to Dashboard
          </Button>
        </div>
      </AppLayout>
    );
  }

  const overallScore = summary.overallScore ?? 0;
  const t = tier(overallScore);

  const gaps = ((gapsData ?? []) as unknown as Array<{
    ruleId: string; title: string; severity: string; impactScore: number;
    isFixed: boolean; description?: string; productTitle?: string;
  }>).filter((g) => !g.isFixed).sort((a, b) => b.impactScore - a.impactScore);

  const scores: Record<string, number> = {
    tagScore: summary.tagScore ?? 0,
    consistencyScore: summary.consistencyScore ?? 0,
    clarityScore: summary.clarityScore ?? 0,
    completenessScore: summary.completenessScore ?? 0,
    trustScore: summary.trustScore ?? 0,
    policyScore: summary.policyScore ?? 0,
    overallScore,
  };

  const stageScores = JOURNEY_STAGES.map((s) => ({
    stage: s,
    score: Math.round(s.dims.reduce((acc, d) => acc + (scores[d.key] ?? 0) * d.weight, 0)),
  }));

  const weakest = stageScores.reduce((a, b) => (b.score < a.score ? b : a));

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-emerald-500" />
              AI Score
            </h1>
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-0.5">
              How well AI assistants can understand and recommend your store
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/issues")}
            className="h-8 px-4 text-[13px] font-semibold gap-1.5 rounded-[8px]"
          >
            All issues <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* ── Score + stats row ── */}
        <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 rounded-[14px] shadow-sm overflow-hidden">
          <div className="flex items-stretch divide-x divide-slate-100 dark:divide-white/5">
            {/* Score */}
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-5 min-w-[120px]">
              <ScoreArc score={overallScore} color="#10b981" size={72} sw={6} />
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
            </div>
            {/* Stats */}
            {[
              { label: "Critical", value: summary.criticalIssues ?? 0, dot: "bg-red-500" },
              { label: "Pending fixes", value: summary.pendingFixes ?? 0, dot: "bg-amber-500" },
              { label: "Applied fixes", value: summary.appliedFixes ?? 0, dot: "bg-emerald-500" },
            ].map(({ label, value, dot }) => (
              <div key={label} className="flex flex-col justify-center px-6 py-5 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                </div>
                <span className="text-[28px] font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">{value}</span>
              </div>
            ))}
            {/* Last analyzed */}
            <div className="flex flex-col justify-center px-6 py-5 hidden sm:flex">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Analyzed</span>
              <span className="text-[14px] font-bold text-slate-700 dark:text-zinc-300">
                {new Date(summary.lastAnalyzed!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <span className="text-[11px] text-slate-400">
                {new Date(summary.lastAnalyzed!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          </div>
        </div>

        {/* ── Top issues ── */}
        {gaps.slice(0, 3).length > 0 && (
          <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 rounded-[14px] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-[14px] font-bold text-slate-800 dark:text-zinc-200">Top Opportunities</span>
              </div>
              <button
                onClick={() => navigate("/issues")}
                className="text-[12px] font-semibold text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-1"
              >
                View all <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {gaps.slice(0, 3).map((g, i) => (
                <div key={g.ruleId ?? i} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                  <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-zinc-800 text-[11px] font-black text-slate-600 dark:text-zinc-300 flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200 truncate">{g.title}</span>
                      {g.productTitle && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded truncate max-w-[160px]">{g.productTitle}</span>
                      )}
                    </div>
                    {g.description && (
                      <p className="text-[12px] text-slate-400 dark:text-zinc-500 truncate mt-0.5">{g.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      g.severity === "high" ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                      : g.severity === "medium" ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                      : "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
                    }`}>{g.severity}</span>
                    <span className="text-[12px] font-bold text-slate-500 dark:text-zinc-400 tabular-nums">{g.impactScore}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI Buyer Journey (includes all dimension scores) ── */}
        <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 rounded-[14px] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center gap-2">
              <Map className="w-4 h-4 text-emerald-500" />
              <span className="text-[14px] font-bold text-slate-800 dark:text-zinc-200">Score Breakdown & Buyer Journey</span>
            </div>
            <span className="text-[12px] text-slate-400">
              Weakest: <span className="font-bold text-amber-600 dark:text-amber-400">{weakest.stage.label} ({weakest.score})</span>
            </span>
          </div>

          {/* Flow pills */}
          <div className="flex items-center gap-1.5 px-5 py-3.5 border-b border-slate-100 dark:border-white/5 overflow-x-auto">
            {stageScores.map(({ stage, score: ss }, i) => {
              const pill = ss >= 75
                ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800"
                : ss >= 50
                ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800"
                : "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800";
              return (
                <div key={stage.id} className="flex items-center gap-1.5 shrink-0">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border ${pill}`}>
                    <stage.icon className="w-3 h-3" />
                    {stage.label} <span className="tabular-nums">{ss}</span>
                  </div>
                  {i < stageScores.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-zinc-600" />}
                </div>
              );
            })}
          </div>

          {/* Stage detail grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100 dark:bg-white/5">
            {stageScores.map(({ stage, score: ss }) => (
              <div key={stage.id} className="bg-white dark:bg-[#080808] px-5 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${stage.color}18` }}>
                    <stage.icon className="w-4 h-4" style={{ color: stage.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-800 dark:text-zinc-200">{stage.label}</p>
                    <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">{stage.subtitle}</p>
                  </div>
                  <span className="text-[22px] font-extrabold tabular-nums shrink-0" style={{ color: stage.color }}>{ss}</span>
                </div>
                <div className="space-y-2 mt-1">
                  {stage.dims.map((dim) => {
                    const v = scores[dim.key] ?? 0;
                    const dimTier = tier(v);
                    return (
                      <div key={dim.key} className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 w-24 shrink-0">{dim.label}</span>
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, v)}%`, backgroundColor: stage.color }} />
                        </div>
                        <span className="text-[12px] font-bold tabular-nums w-6 text-right" style={{ color: stage.color }}>{Math.round(v)}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0 ${dimTier.cls}`}>{dimTier.label}</span>
                      </div>
                    );
                  })}
                </div>
                {ss < 50 && (
                  <p className="mt-2.5 text-[11px] text-slate-500 dark:text-zinc-500 leading-relaxed border-t border-slate-100 dark:border-white/5 pt-2">{stage.tip}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick nav ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "All issues", icon: AlertCircle, href: "/issues" },
            { label: "Quick fixes", icon: Zap, href: "/fixes" },
            { label: "AI perception", icon: Brain, href: "/ai-readiness" },
            { label: "Content tools", icon: FileText, href: "/content" },
          ].map(({ label, icon: Icon, href }) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-zinc-300 hover:text-emerald-700 bg-white dark:bg-[#080808] border border-slate-200 dark:border-white/10 hover:border-emerald-200 rounded-[8px] px-4 py-2.5 transition-colors"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

      </div>
    </AppLayout>
  );
}
