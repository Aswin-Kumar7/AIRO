import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Brain, CheckCircle2, XCircle, AlertCircle, Zap, FileText,
  BarChart3, Tag, Shield, MessageSquare, ArrowRight, TrendingUp, Search,
} from "lucide-react";
import {
  useGetStoreSummary, getGetStoreSummaryQueryKey,
  useListGaps, getListGapsQueryKey,
} from "@workspace/api-client-react";

// ─── Score ring ───────────────────────────────────────────────────────────────

const CIRC = 2 * Math.PI * 34;

function ScoreArc({
  score,
  color,
  size = 88,
  strokeWidth = 6,
  fontSize = 24,
}: {
  score: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  fontSize?: number;
}) {
  const r = (size - strokeWidth * 2) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 transform -rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
        <circle
          cx={c} cy={c} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-extrabold text-slate-900 dark:text-white tracking-tighter" style={{ fontSize: `${fontSize}px` }}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

// ─── Dimension config ─────────────────────────────────────────────────────────

const DIMENSIONS = [
  {
    key: "clarityScore" as const,
    label: "Clarity",
    icon: Brain,
    color: "#14b8a6",
    description: "How clearly product descriptions answer AI agent queries",
    tip: "Use natural language. Avoid jargon and model numbers in titles.",
  },
  {
    key: "completenessScore" as const,
    label: "Completeness",
    icon: FileText,
    color: "#8b5cf6",
    description: "How much key product data (material, dimensions, use case) is present",
    tip: "Add material composition, dimensions, and a clear target audience.",
  },
  {
    key: "trustScore" as const,
    label: "Trust",
    icon: Shield,
    color: "#f43f5e",
    description: "Trust signals that help AI recommend your store confidently",
    tip: "Add reviews, brand schema, and structured product data.",
  },
  {
    key: "tagScore" as const,
    label: "Tags",
    icon: Tag,
    color: "#f59e0b",
    description: "Quality and specificity of product tags for AI classification",
    tip: "Use specific tags like 'organic cotton' instead of generic ones like 'sale'.",
  },
  {
    key: "consistencyScore" as const,
    label: "Consistency",
    icon: BarChart3,
    color: "#10b981",
    description: "Tone, structure, and formatting uniformity across the catalog",
    tip: "Standardize description length and tone across all products.",
  },
  {
    key: "policyScore" as const,
    label: "Policies",
    icon: MessageSquare,
    color: "#6366f1",
    description: "Clarity and completeness of shipping, returns, and FAQ policies",
    tip: "Ensure each policy page is at least 50 words with clear terms.",
  },
];

function scoreTier(s: number): { label: string; color: string; bg: string } {
  if (s >= 80) return { label: "Strong", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10" };
  if (s >= 60) return { label: "Moderate", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-500/10" };
  return { label: "Needs work", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10" };
}

// ─── AEO Score radar breakdown ────────────────────────────────────────────────

function DimensionCard({
  dimension,
  score,
}: {
  dimension: (typeof DIMENSIONS)[number];
  score: number;
}) {
  const tier = scoreTier(score);
  const Icon = dimension.icon;
  return (
    <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm p-6 flex flex-col transition-all hover:shadow-md hover:border-slate-300/80">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${dimension.color}15` }}>
            <Icon className="w-4 h-4" style={{ color: dimension.color }} />
          </div>
          <span className="font-bold text-slate-900 dark:text-white text-[14px] tracking-tight">{dimension.label}</span>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full ring-1 ${tier.bg} ${tier.color} ring-slate-200/50 dark:ring-white/10`}>
          {tier.label}
        </span>
      </div>
      
      <div className="flex items-end gap-3 mb-3">
        <div className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tighter tabular-nums leading-none">
          {Math.round(score)}<span className="text-xl text-slate-300 font-semibold">/100</span>
        </div>
      </div>
      
      <p className="text-[13px] text-slate-500 dark:text-zinc-300 leading-relaxed mb-5 flex-1">{dimension.description}</p>
      
      <div className="flex items-start gap-2.5 bg-slate-50/80 dark:bg-[#111214] border border-slate-100 dark:border-white/5 rounded-[10px] px-4 py-3 mt-auto">
        <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{dimension.tip}</p>
      </div>
    </div>
  );
}

// ─── Overall hero ──────────────────────────────────────────────────────────────

function OverallHero({ score, criticalIssues, pendingFixes, lastAnalyzed }: {
  score: number;
  criticalIssues: number;
  pendingFixes: number;
  lastAnalyzed: string | null | undefined;
}) {
  const tier = scoreTier(score);
  const [, navigate] = useLocation();
  return (
    <div className="bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 rounded-[24px] shadow-sm mb-8 overflow-hidden">
      {/* Top Section: Hero Content */}
      <div className="p-8 md:p-10 bg-gradient-to-b from-slate-50/50 to-white dark:from-white/[0.03] dark:to-transparent relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-[14px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center shadow-sm">
                <Brain className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-[24px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none mb-1">AEO Readiness</h2>
                <p className="text-[14px] text-slate-500 dark:text-zinc-400 font-medium">Answer Engine Optimization Analysis</p>
              </div>
            </div>
            
            <p className="text-slate-600 dark:text-zinc-300 text-[15px] leading-relaxed mb-0">
              Your store's readiness score measures how effectively AI assistants (like ChatGPT, Perplexity, and Google AI) can understand, trust, and recommend your products to high-intent shoppers.
            </p>
          </div>

          <div className="flex-shrink-0">
            <Button
              onClick={() => navigate("/issues")}
              className="w-full sm:w-auto bg-slate-900 dark:bg-white/10 hover:bg-slate-800 dark:hover:bg-white/20 text-white rounded-[12px] h-11 px-6 text-[14px] font-semibold transition-all shadow-sm gap-2"
            >
              View detailed report <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Grid Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/20 dark:bg-black/20">
        
        {/* 1. Score Widget */}
        <div className="p-6 md:p-8 flex flex-col justify-center items-center text-center border-r border-slate-100 dark:border-white/5">
          <ScoreArc score={score} color="#10b981" size={80} strokeWidth={7} fontSize={26} />
          <div className="mt-4">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${tier.bg} ${tier.color} ring-1 ring-inset ring-slate-200/50 dark:ring-white/10`}>
              {tier.label} Score
            </span>
          </div>
        </div>

        {/* 2. Critical Issues */}
        <div className="p-6 md:p-8 flex flex-col justify-center border-r border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
            <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Critical</div>
          </div>
          <div className="text-4xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tighter">{criticalIssues}</div>
          <div className="text-[13px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">Immediate action needed</div>
        </div>

        {/* 3. Pending Fixes */}
        <div className="p-6 md:p-8 flex flex-col justify-center border-t border-slate-100 dark:border-white/5 md:border-t-0 md:border-r">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
            <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Pending</div>
          </div>
          <div className="text-4xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tighter">{pendingFixes}</div>
          <div className="text-[13px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">Optimizations found</div>
        </div>

        {/* 4. Last Analyzed */}
        <div className="p-6 md:p-8 flex flex-col justify-center border-t border-slate-100 dark:border-white/5 md:border-t-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-zinc-600" />
            <div className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">Analyzed</div>
          </div>
          <div className="text-[20px] font-extrabold text-slate-900 dark:text-white tracking-tight">
            {lastAnalyzed ? new Date(lastAnalyzed).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "--"}
          </div>
          <div className="text-[13px] text-slate-400 dark:text-zinc-500 mt-1 font-medium">
            {lastAnalyzed ? new Date(lastAnalyzed).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Top issues banner ────────────────────────────────────────────────────────

function TopIssues({ gaps }: { gaps: Array<{ ruleId: string; title: string; description?: string; productTitle?: string; severity: string; impactScore: number }> }) {
  const top = gaps
    .filter((g) => !("isFixed" in g && (g as unknown as { isFixed: boolean }).isFixed))
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 3);
  const [, navigate] = useLocation();

  if (top.length === 0) return null;

  return (
    <div className="mb-8 bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 shadow-sm rounded-[24px] overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          <h3 className="text-[16px] font-extrabold text-slate-900 dark:text-white tracking-tight">Top AEO Opportunities</h3>
        </div>
        <button 
          onClick={() => navigate("/issues")}
          className="text-[12px] font-bold text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white transition-colors flex items-center gap-1"
        >
          View all <ArrowRight className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
        </button>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {top.map((g, i) => (
          <div key={g.ruleId ?? i} className="group flex flex-col sm:flex-row sm:items-center gap-6 px-6 py-6 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
            {/* Rank / Icon */}
            <div className="w-10 h-10 rounded-full bg-slate-100/80 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 text-slate-900 dark:text-white text-[15px] font-black flex items-center justify-center flex-shrink-0 shadow-sm">
              {i + 1}
            </div>
            
            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <div className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight flex-1 flex items-center flex-wrap gap-x-2 gap-y-1">
                  <span>{g.title}</span>
                  {g.productTitle && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100/60 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                      <Search className="w-3 h-3 text-emerald-500" />
                      <span className="truncate">{g.productTitle}</span>
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full flex-shrink-0 ring-1 ${
                  g.severity === "high" ? "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-200/50 dark:ring-red-500/20" :
                  g.severity === "medium" ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-200/50 dark:ring-amber-500/20" :
                  "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-violet-200/50 dark:ring-violet-500/20"
                }`}>
                  {g.severity} Priority
                </span>
              </div>
              <p className="text-[13px] text-slate-500 dark:text-zinc-300 leading-relaxed truncate max-w-2xl">
                {g.description ?? "Fixing this issue will significantly improve how AI engines understand and rank your products."}
              </p>
            </div>
            
            {/* Impact score */}
            <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-slate-100 dark:border-white/5">
              <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest">Impact Score</span>
              <div className="flex items-center gap-3">
                <div className="w-20 h-2 bg-slate-200/60 rounded-full overflow-hidden hidden sm:block">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${g.impactScore}%` }} />
                </div>
                <span className="text-[18px] font-extrabold text-slate-900 dark:text-white tabular-nums">{g.impactScore}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AeoScorePage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data: summary, isLoading: summaryLoading } = useGetStoreSummary(activeStoreId ?? "", {
    query: {
      queryKey: getGetStoreSummaryQueryKey(activeStoreId ?? ""),
      enabled: !!activeStoreId,
    },
  });

  const { data: gapsData, isLoading: gapsLoading } = useListGaps(activeStoreId ?? "", {
    query: {
      queryKey: getListGapsQueryKey(activeStoreId ?? ""),
      enabled: !!activeStoreId,
    },
  });

  const isLoading = summaryLoading || gapsLoading;

  if (!activeStoreId) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
          <Brain className="w-10 h-10 text-slate-300" />
          <p className="text-slate-500 dark:text-zinc-300 text-sm">Connect a store to see your AEO Score</p>
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

  if (!summary || summary.lastAnalyzed == null) {
    return (
      <AppLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Brain className="w-12 h-12 text-slate-200 mb-4" />
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">No AEO data yet</p>
            <p className="text-sm text-slate-400 dark:text-zinc-400 mb-6 max-w-sm">
              Run an analysis from the Dashboard to generate your AEO Score breakdown.
            </p>
            <Button onClick={() => navigate("/dashboard")} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Zap className="w-4 h-4" /> Go to Dashboard
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const gaps = (gapsData ?? []) as unknown as Array<{
    ruleId: string;
    title: string;
    severity: string;
    impactScore: number;
    isFixed: boolean;
    description?: string;
    productTitle?: string;
  }>;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-emerald-500" />
            AEO Score
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-300 mt-0.5">
            How well AI assistants can understand and recommend your store
          </p>
        </div>

        {/* Overall hero */}
        <OverallHero
          score={summary.overallScore ?? 0}
          criticalIssues={summary.criticalIssues ?? 0}
          pendingFixes={summary.pendingFixes ?? 0}
          lastAnalyzed={summary.lastAnalyzed}
        />

        {/* Top issues */}
        <TopIssues gaps={gaps} />

        {/* Dimension breakdown */}
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400 dark:text-zinc-400" /> Score Breakdown
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {DIMENSIONS.map((dim) => (
            <DimensionCard
              key={dim.key}
              dimension={dim}
              score={(summary[dim.key] as number | null | undefined) ?? 0}
            />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "View all issues", icon: AlertCircle, href: "/issues" },
            { label: "Apply quick fixes", icon: Zap, href: "/fixes" },
            { label: "AI perception", icon: Brain, href: "/ai-readiness" },
            { label: "Content tools", icon: FileText, href: "/content" },
          ].map(({ label, icon: Icon, href }) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-200 hover:text-emerald-700 bg-white dark:bg-[#080808] border border-slate-200 dark:border-white/10 hover:border-emerald-200 rounded-lg px-3 py-2.5 transition-colors"
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
