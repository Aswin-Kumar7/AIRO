import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Brain, CheckCircle2, XCircle, AlertCircle, Zap, FileText,
  BarChart3, Tag, Shield, MessageSquare, ArrowRight, TrendingUp,
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
}: {
  score: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth * 2) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, score)) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#E5E7EB" strokeWidth={strokeWidth} />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: "stroke-dasharray 0.9s ease-out" }}
      />
      <text x={c} y={c + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill="#0F172A">
        {score}
      </text>
    </svg>
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
  if (s >= 80) return { label: "Strong", color: "text-emerald-700", bg: "bg-emerald-50" };
  if (s >= 60) return { label: "Moderate", color: "text-amber-700", bg: "bg-amber-50" };
  return { label: "Needs work", color: "text-red-700", bg: "bg-red-50" };
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex gap-4">
      <ScoreArc score={score} color={dimension.color} size={80} strokeWidth={5} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: dimension.color }} />
          <span className="font-semibold text-slate-900 text-sm">{dimension.label}</span>
          <span className={`ml-auto text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${tier.bg} ${tier.color}`}>
            {tier.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed mb-2">{dimension.description}</p>
        <div className="flex items-start gap-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5">
          <Zap className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600">{dimension.tip}</p>
        </div>
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
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white mb-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-emerald-500/10" />
      <div className="absolute -right-2 top-12 w-24 h-24 rounded-full bg-teal-400/10" />

      <div className="relative flex flex-col md:flex-row md:items-center gap-6">
        {/* Score ring */}
        <div className="flex-shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
            <circle
              cx="60" cy="60" r="50"
              fill="none" stroke="#10b981" strokeWidth="8"
              strokeDasharray={`${(score / 100) * 314.2} 314.2`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dasharray 1s ease-out" }}
            />
            <text x="60" y="55" textAnchor="middle" fontSize="28" fontWeight="800" fill="white">{score}</text>
            <text x="60" y="73" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.6)">/100</text>
          </svg>
        </div>

        {/* Text */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold">AEO Score</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tier.bg} ${tier.color}`}>
              {tier.label}
            </span>
          </div>
          <p className="text-slate-300 text-sm max-w-md">
            Your Answer Engine Optimization score measures how well AI assistants like ChatGPT, Perplexity, and Google AI can understand, trust, and recommend your store.
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="text-center bg-white/10 rounded-lg px-4 py-2">
              <div className="text-lg font-bold text-white">{criticalIssues}</div>
              <div className="text-[11px] text-slate-400">Critical issues</div>
            </div>
            <div className="text-center bg-white/10 rounded-lg px-4 py-2">
              <div className="text-lg font-bold text-white">{pendingFixes}</div>
              <div className="text-[11px] text-slate-400">Pending fixes</div>
            </div>
            {lastAnalyzed && (
              <div className="text-center bg-white/10 rounded-lg px-4 py-2">
                <div className="text-[11px] text-slate-400 mb-0.5">Last analyzed</div>
                <div className="text-xs font-medium text-slate-200">
                  {new Date(lastAnalyzed).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate("/issues")}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 self-start md:self-center"
        >
          View issues <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Top issues banner ────────────────────────────────────────────────────────

function TopIssues({ gaps }: { gaps: Array<{ ruleId: string; title: string; severity: string; impactScore: number }> }) {
  const top = gaps
    .filter((g) => !("isFixed" in g && (g as unknown as { isFixed: boolean }).isFixed))
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 3);

  if (top.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-emerald-500" /> Top AEO Opportunities
      </h3>
      <div className="grid gap-2">
        {top.map((g, i) => (
          <div key={g.ruleId ?? i} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5 shadow-sm">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{g.title}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              g.severity === "high" ? "bg-red-100 text-red-700" :
              g.severity === "medium" ? "bg-amber-100 text-amber-700" :
              "bg-violet-100 text-violet-700"
            }`}>
              Impact {g.impactScore}
            </span>
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
          <p className="text-slate-500 text-sm">Connect a store to see your AEO Score</p>
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
            <p className="text-lg font-semibold text-slate-700 mb-2">No AEO data yet</p>
            <p className="text-sm text-slate-400 mb-6 max-w-sm">
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
  }>;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="w-5 h-5 text-emerald-500" />
            AEO Score
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
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
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-400" /> Score Breakdown
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
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-700 bg-white border border-slate-200 hover:border-emerald-200 rounded-lg px-3 py-2.5 transition-colors"
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
