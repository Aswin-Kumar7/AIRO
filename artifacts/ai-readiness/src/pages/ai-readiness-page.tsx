import { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useGetConsistencyReport,
  getGetConsistencyReportQueryKey,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Bot, CheckCircle, HelpCircle, AlertCircle,
  Target, Save, Shuffle, ChevronDown, ChevronUp,
} from "lucide-react";
import { getStorePerception, updateStorePositioning } from "@/lib/insights-api";
import { ScoreRing } from "@/components/score-ring";
import { useToast } from "@/hooks/use-toast";

// ─── AI Perception tab ────────────────────────────────────────────────────────

function PerceptionTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [positioning, setPositioning] = useState("");
  const [posOpen, setPosOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["store-perception", storeId],
    queryFn: () => getStorePerception(storeId),
    enabled: !!storeId,
  });

  useEffect(() => {
    if (data?.merchantDesiredPositioning !== undefined) {
      setPositioning(data.merchantDesiredPositioning ?? "");
    }
  }, [data?.merchantDesiredPositioning]);

  const saveMutation = useMutation({
    mutationFn: () => updateStorePositioning(storeId, positioning),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-perception", storeId] });
      toast({ title: "Positioning saved" });
      setPosOpen(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mb-3">
          <Bot className="w-5 h-5 text-slate-400 dark:text-zinc-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
          No perception data yet
        </p>
        <p className="text-xs text-slate-400 dark:text-zinc-400">
          Run an analysis to generate your AI perception report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Agent Narrative - Clean Vercel Style */}
      <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <Bot className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
            <span className="text-[12px] font-bold text-slate-900 dark:text-white tracking-tight uppercase">Agent Intelligence</span>
          </div>
          {data.updatedAt && (
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest">
              Generated {new Date(data.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
        <div className="p-6">
          <blockquote className="text-[15px] text-slate-600 dark:text-zinc-200 leading-relaxed font-medium italic border-l-2 border-emerald-500/30 pl-4">
            "{data.agentNarrative}"
          </blockquote>
        </div>
      </div>

      {/* 3-column: Strengths / Unanswered / Ambiguities */}
      <div className="grid grid-cols-3 gap-4">
        {/* Strengths */}
        <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-2 bg-emerald-50/50 dark:bg-emerald-500/10">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-[13px] font-bold text-slate-900 dark:text-white tracking-tight">
              Strengths
            </span>
          </div>
          <div className="p-5 flex-1">
            {data.perceivedStrengths.length === 0 ? (
              <p className="text-[12px] text-slate-400 dark:text-zinc-400 italic">No significant strengths identified yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.perceivedStrengths.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-[12px] text-slate-600 dark:text-zinc-200 leading-snug">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Unanswered */}
        <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-2 bg-amber-50/50 dark:bg-amber-500/10">
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <span className="text-[13px] font-bold text-slate-900 dark:text-white tracking-tight">
              Gaps & Discovery
            </span>
          </div>
          <div className="p-5 flex-1">
            {data.unansweredQuestions.length === 0 ? (
              <p className="text-[12px] text-slate-400 dark:text-zinc-400 italic">All critical questions answered.</p>
            ) : (
              <ul className="space-y-3">
                {data.unansweredQuestions.map((q, i) => (
                  <li key={i} className="flex gap-2.5 text-[12px] text-slate-600 dark:text-zinc-200 leading-snug">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    {q}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Ambiguities */}
        <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200/60 dark:border-white/10 shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center gap-2 bg-red-50/50 dark:bg-red-500/10">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-[13px] font-bold text-slate-900 dark:text-white tracking-tight">
              Risk & Ambiguity
            </span>
          </div>
          <div className="p-5 flex-1">
            {data.ambiguities.length === 0 ? (
              <p className="text-[12px] text-slate-400 dark:text-zinc-400 italic">No major ambiguities found.</p>
            ) : (
              <ul className="space-y-3">
                {data.ambiguities.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-[12px] text-slate-600 dark:text-zinc-200 leading-snug">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Desired positioning — collapsible fieldset style */}
      <section className="space-y-4 pt-4">
        <div>
          <h2 className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tight">AI Identity & Positioning</h2>
          <p className="text-[12px] text-slate-500 dark:text-zinc-300 mt-1">Shape how AI shopping agents represent your brand to customers.</p>
        </div>
        <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col">
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest">Brand Voice & Core Identity</label>
              <Textarea
                value={positioning}
                onChange={(e) => setPositioning(e.target.value)}
                placeholder="e.g. Premium eco-friendly home goods for design-conscious families"
                className="text-[13px] resize-none h-24 border-slate-200 dark:border-white/10 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          </div>
          <div className="px-6 py-4 bg-slate-50/80 dark:bg-[#111214] border-t border-slate-200 dark:border-white/10 flex justify-between items-center">
            <p className="text-[11px] text-slate-400 dark:text-zinc-400 font-medium italic">Changes will take effect in the next AI analysis run.</p>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="h-8 px-4 rounded-[6px] gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[12px] transition-all shadow-sm"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Update Identity
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Consistency tab ──────────────────────────────────────────────────────────

const CONSISTENCY_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  tone: { label: "Tone & Voice", color: "border-l-violet-400" },
  structure: { label: "Structure", color: "border-l-blue-400" },
  formatting: { label: "Formatting", color: "border-l-amber-400" },
  missing_section: { label: "Missing Sections", color: "border-l-red-400" },
};

function ConsistencyTab({ storeId }: { storeId: string }) {
  const { data: report, isLoading } = useGetConsistencyReport(storeId, {
    query: {
      enabled: !!storeId,
      queryKey: getGetConsistencyReportQueryKey(storeId),
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/10 flex items-center justify-center mb-3">
          <Shuffle className="w-5 h-5 text-slate-400 dark:text-zinc-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
          No consistency report yet
        </p>
        <p className="text-xs text-slate-400 dark:text-zinc-400">
          Run an analysis to check catalog consistency.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-5">
      {/* Issues list */}
      <div className="col-span-2 space-y-2">
        {report.issues.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-10 text-center">
            <p className="text-sm font-semibold text-emerald-700">
              Excellent consistency
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              Your catalog tone and structure are uniform.
            </p>
          </div>
        ) : (
          (
            report.issues as Array<{
              type: string;
              description: string;
              affectedProductCount: number;
              examples: string[];
            }>
          ).map((issue, i) => {
            const cfg = CONSISTENCY_CONFIG[issue.type] ?? {
              label: issue.type,
              color: "border-l-slate-300",
            };
            return (
              <div
                key={i}
                className={`bg-white dark:bg-[#080808] rounded-[12px] border-l-4 border-y border-r border-slate-200/60 dark:border-white/10 shadow-sm p-5 hover:shadow-md transition-all ${cfg.color}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {cfg.label}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-300 bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full flex-shrink-0">
                    {issue.affectedProductCount} products
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-300 mb-2 leading-relaxed">
                  {issue.description}
                </p>
                {issue.examples.length > 0 && (
                  <ul className="space-y-1">
                    {issue.examples.map((ex, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-1.5 text-[11px] text-slate-400 dark:text-zinc-400"
                      >
                        <span className="flex-shrink-0">·</span>
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Score ring */}
      <div className="flex flex-col items-center pt-4 gap-2">
        <ScoreRing
          score={report.overallConsistencyScore}
          size={88}
          label="Consistency"
        />
        <p className="text-xs text-slate-500 dark:text-zinc-300 text-center">
          {report.issues.length === 0
            ? "No issues found"
            : `${report.issues.length} issue${report.issues.length !== 1 ? "s" : ""} across your catalog`}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiReadiness() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">AI Readiness</h1>
          <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">
            How AI shopping agents perceive and evaluate your store
          </p>
        </div>

        <Tabs defaultValue="perception">
          <TabsList className="mb-8 bg-slate-100/80 dark:bg-white/5 p-1 h-auto rounded-[12px] border dark:border-white/5 shadow-inner">
            <TabsTrigger
              value="perception"
              className="text-[13px] font-bold h-9 px-6 gap-2 data-[state=active]:bg-white dark:bg-transparent data-[state=active]:dark:bg-white/10 data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 dark:data-[state=active]:text-white rounded-[9px] transition-all"
            >
              <Bot className="w-4 h-4" /> AI Perception
            </TabsTrigger>
            <TabsTrigger
              value="consistency"
              className="text-[13px] font-bold h-9 px-6 gap-2 data-[state=active]:bg-white dark:bg-transparent data-[state=active]:dark:bg-white/10 data-[state=active]:shadow-sm data-[state=active]:text-emerald-700 dark:data-[state=active]:text-white rounded-[9px] transition-all"
            >
              <Shuffle className="w-4 h-4" /> Consistency
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perception" className="mt-0">
            <PerceptionTab storeId={activeStoreId} />
          </TabsContent>
          <TabsContent value="consistency" className="mt-0">
            <ConsistencyTab storeId={activeStoreId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
