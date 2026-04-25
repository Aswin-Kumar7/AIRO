import { useState } from "react";
import { useStore } from "@/context/store-context";
import {
  useGetProduct,
  getGetProductQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Package, Tag, AlertTriangle, CheckCircle2, ChevronLeft,
  Sparkles, Zap, XCircle, ChevronDown, ChevronUp, MessageSquare,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { QuickFixSheet } from "@/components/quick-fix-sheet";
import { useToast } from "@/hooks/use-toast";
import { getProductAiQa, type ProductQaResult } from "@/lib/features-api";

// ─── Types ────────────────────────────────────────────────────────────────────

type EnrichedGap = {
  id: string;
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

// ─── Severity config ──────────────────────────────────────────────────────────

const SEV_BAR: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-violet-400",
};

const SEV_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-violet-400",
};

const EFFORT_PILL: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
};

const EFFORT_LABEL: Record<string, string> = {
  low: "Easy",
  medium: "Medium",
  high: "Effort",
};

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreLine({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-700 w-6 text-right tabular-nums">
        {score}
      </span>
    </div>
  );
}

// ─── Issue row ────────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  onFix,
}: {
  issue: EnrichedGap;
  onFix: () => void;
}) {
  const [open, setOpen] = useState(false);
  const impact = issue.impactScore ?? 50;
  const canAutoFix = ["clarity", "completeness", "tags"].includes(
    issue.category,
  );

  return (
    <div
      className={`border-b border-slate-100 last:border-0 ${issue.isFixed ? "opacity-50" : ""}`}
    >
      {/* Row header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 text-left transition-colors"
        onClick={() => setOpen((p) => !p)}
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 mt-0.5 ${SEV_DOT[issue.severity] ?? "bg-slate-300"}`}
        />
        <p className="flex-1 text-sm font-medium text-slate-800 truncate">
          {issue.title}
        </p>
        {issue.isFixed && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        )}
        {issue.effortLevel && (
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border hidden sm:inline-flex flex-shrink-0 ${EFFORT_PILL[issue.effortLevel] ?? ""}`}
          >
            {EFFORT_LABEL[issue.effortLevel] ?? issue.effortLevel}
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
            <div
              className={`h-full rounded-full ${SEV_BAR[issue.severity] ?? "bg-slate-300"}`}
              style={{ width: `${impact}%` }}
            />
          </div>
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {open && (
        <div className="px-4 pb-4 ml-5 space-y-2.5">
          {issue.evidence && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800">{issue.evidence}</p>
            </div>
          )}
          <p className="text-xs text-slate-500 leading-relaxed">
            {issue.description}
          </p>
          <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <Zap className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700">{issue.suggestion}</p>
          </div>
          {canAutoFix && !issue.isFixed && (
            <button
              onClick={onFix}
              className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <Zap className="w-3 h-3" />
              Fix with Quick Fix
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI Q&A panel ─────────────────────────────────────────────────────────────

function AiQaPanel({
  storeId,
  productId,
}: {
  storeId: string;
  productId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["product-ai-qa", storeId, productId],
    queryFn: () => getProductAiQa(storeId, productId),
    enabled,
    staleTime: 10 * 60 * 1000,
  });

  if (!enabled) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Test whether AI can answer buyer questions about this product.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs flex-shrink-0"
          onClick={() => setEnabled(true)}
        >
          Run test
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        <span className="text-xs text-slate-400">Testing AI answers…</span>
      </div>
    );
  }

  if (!data) return null;

  const color =
    data.answerabilityScore >= 60
      ? "text-emerald-600"
      : data.answerabilityScore >= 40
        ? "text-amber-600"
        : "text-red-500";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">
          {data.answerableCount}/{data.totalQuestions} questions answerable
        </span>
        <span className={`text-sm font-bold tabular-nums ${color}`}>
          {data.answerabilityScore}%
        </span>
      </div>
      {data.results.map((qa: ProductQaResult, i: number) => (
        <div
          key={i}
          className={`rounded-lg border px-3 py-2.5 ${
            qa.canAnswer
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-red-200 bg-red-50/40"
          }`}
        >
          <div className="flex items-start gap-2">
            {qa.canAnswer ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-slate-800 mb-1">
                {qa.question}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {qa.answer}
              </p>
              {qa.missingInfo && (
                <p className="text-[10px] text-amber-700 mt-1 font-medium">
                  Missing: {qa.missingInfo}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductDetail({
  params,
}: {
  params: { productId: string };
}) {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [quickFixOpen, setQuickFixOpen] = useState(false);

  const { data: product, isLoading } = useGetProduct(
    activeStoreId!,
    params.productId,
    {
      query: {
        enabled: !!activeStoreId && !!params.productId,
        queryKey: getGetProductQueryKey(activeStoreId!, params.productId),
      },
    },
  );

  const issues = (product?.issues ?? []) as unknown as EnrichedGap[];
  const openIssues = issues.filter((i) => !i.isFixed);
  const isAnalyzed = !!product?.analyzedAt;

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Back */}
        <Link href="/products">
          <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 mb-5 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
            Products
          </button>
        </Link>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : product ? (
          <div className="space-y-5">
            {/* ── Product header ── */}
            <div className="flex items-start gap-4 bg-white rounded-xl border border-slate-200 p-5">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="w-14 h-14 rounded-lg object-cover border border-slate-200 flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-6 h-6 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-slate-900 leading-snug">
                  {product.title}
                </h1>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {product.productType && (
                    <Badge variant="secondary" className="text-[10px]">
                      {product.productType}
                    </Badge>
                  )}
                  {product.vendor && (
                    <span className="text-xs text-slate-400">
                      {product.vendor}
                    </span>
                  )}
                  {product.price && (
                    <span className="text-xs font-medium text-slate-600">
                      ${product.price}
                    </span>
                  )}
                  {!isAnalyzed && (
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      Not analyzed
                    </span>
                  )}
                </div>
                {product.aiPerceptionSummary && (
                  <p className="text-xs text-slate-500 italic mt-2 leading-relaxed">
                    "{product.aiPerceptionSummary}"
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 text-right">
                {isAnalyzed && (
                  <div className="mb-3">
                    <p
                      className={`text-3xl font-bold tabular-nums ${
                        (product.score?.overall ?? 0) >= 70
                          ? "text-emerald-600"
                          : (product.score?.overall ?? 0) >= 50
                            ? "text-amber-600"
                            : "text-red-500"
                      }`}
                    >
                      {Math.round(product.score?.overall ?? 0)}
                    </p>
                    <p className="text-[10px] text-slate-400">/ 100</p>
                  </div>
                )}
                <Button
                  size="sm"
                  onClick={() => setQuickFixOpen(true)}
                  className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Quick Fix
                </Button>
              </div>
            </div>

            {/* ── Main content ── */}
            <div className="grid grid-cols-3 gap-5">

              {/* Left: Issues */}
              <div className="col-span-2 space-y-5">
                {isAnalyzed ? (
                  <>
                    {/* Issues list */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span className="text-sm font-semibold text-slate-800">
                            Issues
                          </span>
                          {openIssues.length > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
                              {openIssues.length} open
                            </span>
                          )}
                        </div>
                        {openIssues.length > 0 && (
                          <button
                            onClick={() => setQuickFixOpen(true)}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                          >
                            <Zap className="w-3 h-3" />
                            Fix all
                          </button>
                        )}
                      </div>
                      {issues.length === 0 ? (
                        <div className="py-12 text-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">No issues found</p>
                        </div>
                      ) : (
                        issues.map((issue) => (
                          <IssueRow
                            key={issue.id}
                            issue={issue}
                            onFix={() => setQuickFixOpen(true)}
                          />
                        ))
                      )}
                    </div>

                    {/* AI Q&A */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                        <MessageSquare className="w-4 h-4 text-slate-400" />
                        <span className="text-sm font-semibold text-slate-800">
                          Can AI answer this?
                        </span>
                      </div>
                      <div className="px-4 py-4">
                        <AiQaPanel
                          storeId={activeStoreId}
                          productId={params.productId}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-white rounded-xl border border-dashed border-slate-200 py-16 text-center">
                    <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-600 mb-1">
                      Not analyzed yet
                    </p>
                    <p className="text-xs text-slate-400 mb-4 max-w-xs mx-auto">
                      Run an analysis from the Dashboard to get scores and issues
                      for this product.
                    </p>
                    <Link href="/dashboard">
                      <Button size="sm" variant="outline" className="text-xs">
                        Go to Dashboard
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Right: meta panel */}
              <div className="space-y-4">
                {/* Scores */}
                {isAnalyzed && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Score breakdown
                    </p>
                    <ScoreLine
                      label="Clarity"
                      score={product.score?.clarity ?? 0}
                      color="bg-teal-500"
                    />
                    <ScoreLine
                      label="Completeness"
                      score={product.score?.completeness ?? 0}
                      color="bg-violet-500"
                    />
                    <ScoreLine
                      label="Trust"
                      score={product.score?.trust ?? 0}
                      color="bg-rose-500"
                    />
                    <ScoreLine
                      label="Tags"
                      score={product.score?.tags ?? 0}
                      color="bg-amber-500"
                    />
                  </div>
                )}

                {/* Tags */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Tags
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {product.tags.length}
                    </span>
                  </div>
                  {product.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {product.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      No tags — add 5–10 descriptive tags.
                    </p>
                  )}
                  {product.suggestedTags.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> AI suggestions
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {product.suggestedTags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => setQuickFixOpen(true)}
                        className="text-[10px] text-emerald-600 hover:text-emerald-700 mt-2 font-medium"
                      >
                        Apply via Quick Fix →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            Product not found
          </div>
        )}
      </div>

      {product && (
        <QuickFixSheet
          storeId={activeStoreId}
          productId={product.id}
          productTitle={product.title}
          isOpen={quickFixOpen}
          onClose={() => {
            setQuickFixOpen(false);
            void queryClient.invalidateQueries({
              queryKey: getGetProductQueryKey(
                activeStoreId,
                params.productId,
              ),
            });
            void queryClient.invalidateQueries({
              queryKey: getListProductsQueryKey(activeStoreId),
            });
          }}
        />
      )}
    </AppLayout>
  );
}
