import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, Store,
  TrendingUp, Award,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListingCheck {
  id: string;
  label: string;
  description: string;
  passed: boolean;
  score: number;
  weight: number;
  recommendation: string;
}

interface ListingReadinessReport {
  overallScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: ListingCheck[];
  summary: string;
  topRecommendations: string[];
}

// ─── Grade badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  const map: Record<string, string> = {
    A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    B: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    C: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    D: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    F: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl text-[28px] font-extrabold ${map[grade] ?? ""}`}>
      {grade}
    </span>
  );
}

// ─── Check row ────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: ListingCheck }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-zinc-800 last:border-0">
      <div className="mt-0.5 shrink-0">
        {check.passed
          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          : <XCircle className="w-4 h-4 text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">{check.label}</p>
          <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-600">{check.score}/{check.weight} pts</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">{check.description}</p>
        {!check.passed && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 flex items-start gap-1">
            <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" />
            {check.recommendation}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ListingReadinessPage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<ListingReadinessReport>({
    queryKey: ["listing-readiness", activeStoreId],
    queryFn: async () => {
      const res = await fetch(`/api/stores/${activeStoreId}/listing-readiness`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load listing readiness.");
      return res.json();
    },
    enabled: !!activeStoreId,
    staleTime: 5 * 60_000,
  });

  if (!activeStoreId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-slate-500">Connect a store to check listing readiness.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Store className="w-5 h-5 text-emerald-600" />
            <h1 className="text-[22px] font-extrabold text-slate-900 dark:text-white tracking-tight">
              Marketplace Listing Readiness
            </h1>
            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-bold px-2">
              NEW
            </Badge>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-zinc-500">
            Is your catalog ready for AI marketplaces, Google Shopping, and Shopify Collective? This score checks the quality bar.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-[40vh]">
            <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-[8px] bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-[13px]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && !data && (
          <div className="flex flex-col items-center justify-center h-[40vh] gap-4 text-center">
            <AlertCircle className="w-8 h-8 text-amber-500" />
            <p className="text-slate-600 dark:text-zinc-400 max-w-sm">
              Run an analysis first to compute listing readiness.
            </p>
            <Button onClick={() => navigate("/dashboard")} className="h-9 px-4 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[13px]">
              Go to Dashboard
            </Button>
          </div>
        )}

        {data && (
          <>
            {/* Score overview */}
            <Card className="border-slate-200 dark:border-zinc-800">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-5">
                  <GradeBadge grade={data.grade} />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-0.5">Listing Readiness Score</p>
                    <p className="text-[36px] font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">{data.overallScore}</p>
                    <p className="text-[12px] text-slate-500 dark:text-zinc-500 mt-1">{data.summary}</p>
                  </div>
                </div>

                {/* Score bar */}
                <div className="mt-4 h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${data.overallScore}%`,
                      backgroundColor: data.overallScore >= 75 ? "#10b981" : data.overallScore >= 50 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Top recommendations */}
            {data.topRecommendations.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-[13px] font-bold text-amber-800 dark:text-amber-400 flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    Top Actions to Improve Your Score
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {data.topRecommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-amber-800 dark:text-amber-300">
                      <span className="font-bold shrink-0 w-4">{i + 1}.</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Full checklist */}
            <Card className="border-slate-200 dark:border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-[14px] font-bold text-slate-800 dark:text-zinc-200">
                  Listing Readiness Checklist
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
