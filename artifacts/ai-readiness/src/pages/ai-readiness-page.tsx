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
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
          <Bot className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">
          No perception data yet
        </p>
        <p className="text-xs text-slate-400">
          Run an analysis to generate your AI perception report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Agent narrative */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-violet-500" />
          <span className="text-sm font-semibold text-slate-800">
            Agent narrative
          </span>
          {data.updatedAt && (
            <span className="ml-auto text-[10px] text-slate-400">
              {new Date(data.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-600 leading-relaxed italic">
          "{data.agentNarrative}"
        </p>
      </div>

      {/* 3-column: Strengths / Unanswered / Ambiguities */}
      <div className="grid grid-cols-3 gap-3">
        {/* Strengths */}
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-slate-700">
              Strengths
            </span>
          </div>
          {data.perceivedStrengths.length === 0 ? (
            <p className="text-xs text-slate-400">None identified</p>
          ) : (
            <ul className="space-y-1.5">
              {data.perceivedStrengths.map((s, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-slate-600">
                  <span className="text-emerald-500 flex-shrink-0 mt-0.5">
                    ✓
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Unanswered */}
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700">
              Unanswered
            </span>
          </div>
          {data.unansweredQuestions.length === 0 ? (
            <p className="text-xs text-slate-400">None found</p>
          ) : (
            <ul className="space-y-1.5">
              {data.unansweredQuestions.map((q, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-slate-600">
                  <span className="text-amber-500 flex-shrink-0 mt-0.5">
                    ?
                  </span>
                  {q}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Ambiguities */}
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-semibold text-slate-700">
              Ambiguities
            </span>
          </div>
          {data.ambiguities.length === 0 ? (
            <p className="text-xs text-slate-400">None found</p>
          ) : (
            <ul className="space-y-1.5">
              {data.ambiguities.map((a, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-slate-600">
                  <span className="text-red-400 flex-shrink-0 mt-0.5">!</span>
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Desired positioning — collapsible */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition-colors"
          onClick={() => setPosOpen((p) => !p)}
        >
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800">
              Desired positioning
            </span>
            {data.merchantDesiredPositioning && (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Set
              </span>
            )}
          </div>
          {posOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
        {posOpen && (
          <div className="px-4 pb-4 border-t border-slate-100 space-y-3">
            <p className="text-xs text-slate-500 mt-3">
              How do you want AI agents to describe your store? This shapes the
              perception analysis.
            </p>
            <Textarea
              value={positioning}
              onChange={(e) => setPositioning(e.target.value)}
              placeholder="e.g. Premium eco-friendly home goods for design-conscious families"
              className="text-sm resize-none h-20"
            />
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save positioning
            </Button>
          </div>
        )}
      </div>
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
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
          <Shuffle className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">
          No consistency report yet
        </p>
        <p className="text-xs text-slate-400">
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
                className={`bg-white rounded-xl border-l-4 border border-slate-200 p-4 ${cfg.color}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {cfg.label}
                  </p>
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                    {issue.affectedProductCount} products
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                  {issue.description}
                </p>
                {issue.examples.length > 0 && (
                  <ul className="space-y-1">
                    {issue.examples.map((ex, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-1.5 text-[11px] text-slate-400"
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
        <p className="text-xs text-slate-500 text-center">
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
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">AI Readiness</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            How AI shopping agents perceive and evaluate your store
          </p>
        </div>

        <Tabs defaultValue="perception">
          <TabsList className="mb-6 bg-slate-100 p-0.5 h-9">
            <TabsTrigger
              value="perception"
              className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
            >
              <Bot className="w-3.5 h-3.5" /> AI Perception
            </TabsTrigger>
            <TabsTrigger
              value="consistency"
              className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
            >
              <Shuffle className="w-3.5 h-3.5" /> Consistency
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
