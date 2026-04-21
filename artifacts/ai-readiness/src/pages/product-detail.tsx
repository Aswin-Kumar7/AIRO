import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useGetProduct, getGetProductQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { ScoreRing, ScoreBar } from "@/components/score-ring";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Package, Tag, AlertTriangle, CheckCircle, ChevronLeft,
  Sparkles, Zap, Shield, Copy, Check, Code2, MessageSquare, XCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { QuickFixSheet } from "@/components/quick-fix-sheet";
import { useToast } from "@/hooks/use-toast";
import { getProductAiQa, type ProductQaResult } from "@/lib/features-api";

// Extended gap type (backend returns these extra fields now)
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

const categoryIcons: Record<string, string> = {
  clarity: "🔍", completeness: "📋", trust: "🛡️",
  tags: "🏷️", policy: "📄", consistency: "🔄",
};

const severityBorder: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-400",
  low: "border-l-blue-400",
};

const effortConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Easy", className: "bg-green-100 text-green-700" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700" },
  high: { label: "High effort", className: "bg-red-100 text-red-700" },
};

// Pre-written trust copy templates for common gaps
const TRUST_TEMPLATES: Record<string, { label: string; templates: string[] }> = {
  TRUST_NO_REVIEWS: {
    label: "Review prompts",
    templates: [
      "⭐ Be the first to review this product — your feedback helps others make confident purchases.",
      "Verified customer reviews coming soon. Purchase today and share your experience.",
    ],
  },
  TRUST_NO_BRAND: {
    label: "Brand copy",
    templates: [
      "Handcrafted by [Your Brand] — quality you can trust.",
      "[Your Brand]: designed with care, built to last.",
    ],
  },
  TRUST_NO_SCHEMA: {
    label: "Schema note",
    templates: [
      "Use the 'Generate JSON-LD' button in Quick Fix to add machine-readable product markup.",
    ],
  },
};

function ImpactBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-red-500" : score >= 40 ? "bg-amber-500" : "bg-blue-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums">{score}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={handleCopy} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function IssueCard({ issue, onOpenQuickFix }: { issue: EnrichedGap; onOpenQuickFix?: () => void }) {
  const effort = issue.effortLevel ? effortConfig[issue.effortLevel] : null;
  const impact = issue.impactScore ?? 50;
  const canAutoFix = ["clarity", "completeness", "tags"].includes(issue.category);
  const trustTemplates = issue.ruleId ? TRUST_TEMPLATES[issue.ruleId] : null;

  return (
    <div className={`p-3 rounded-lg border-l-4 border border-border ${severityBorder[issue.severity] ?? "border-l-gray-400"} ${issue.isFixed ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base flex-shrink-0">{categoryIcons[issue.category] ?? "⚠️"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-xs font-semibold text-foreground">{issue.title}</p>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {effort && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${effort.className}`}>
                  {effort.label}
                </span>
              )}
              {issue.isFixed && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
            </div>
          </div>

          {issue.evidence && (
            <div className="mb-1.5 px-2 py-1 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-[10px] text-amber-800 dark:text-amber-300 font-medium">
              {issue.evidence}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground mb-1.5 leading-relaxed">{issue.description}</p>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-foreground flex-1">
              <span className="font-medium">Fix: </span>{issue.suggestion}
            </p>
            <ImpactBar score={impact} />
          </div>

          {/* Trust copy templates */}
          {trustTemplates && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{trustTemplates.label}</p>
              {trustTemplates.templates.map((t, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-2 py-1.5 bg-muted/50 rounded text-[11px] text-foreground">
                  <span className="flex-1">{t}</span>
                  <CopyButton text={t} />
                </div>
              ))}
            </div>
          )}

          {/* Quick Fix link for auto-fixable issues */}
          {canAutoFix && !issue.isFixed && onOpenQuickFix && (
            <button
              onClick={onOpenQuickFix}
              className="mt-2 flex items-center gap-1 text-[10px] text-primary font-medium hover:underline"
            >
              <Zap className="w-3 h-3" />
              Open Quick Fix →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProductDetail({ params }: { params: { productId: string } }) {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [quickFixOpen, setQuickFixOpen] = useState(false);
  const [aiQaEnabled, setAiQaEnabled] = useState(false);

  const { data: product, isLoading } = useGetProduct(activeStoreId!, params.productId, {
    query: {
      enabled: !!activeStoreId && !!params.productId,
      queryKey: getGetProductQueryKey(activeStoreId!, params.productId),
    },
  });

  const { data: aiQa, isLoading: aiQaLoading } = useQuery({
    queryKey: ["product-ai-qa", activeStoreId, params.productId],
    queryFn: () => getProductAiQa(activeStoreId!, params.productId),
    enabled: !!activeStoreId && !!params.productId && aiQaEnabled,
    staleTime: 10 * 60 * 1000,
  });

  // Cast issues to enriched type
  const issues = (product?.issues ?? []) as unknown as EnrichedGap[];
  const isAnalyzed = !!product?.analyzedAt;

  if (!activeStoreId) { navigate("/"); return null; }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <Link href="/products">
          <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground -ml-2">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Products
          </Button>
        </Link>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : product ? (
          <>
            {/* Header */}
            <div className="flex items-start gap-4 mb-6">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.title} className="w-16 h-16 rounded-xl object-cover border border-border flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Package className="w-7 h-7 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-xl font-bold text-foreground">{product.title}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {product.productType && <Badge variant="secondary" className="text-[10px]">{product.productType}</Badge>}
                  {product.vendor && <span className="text-xs text-muted-foreground">by {product.vendor}</span>}
                  {product.price && <span className="text-xs text-muted-foreground">${product.price}</span>}
                  {!isAnalyzed && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Not analyzed yet</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {isAnalyzed && <ScoreRing score={product.score?.overall ?? 0} size={68} label="Overall" />}
                <Button size="sm" onClick={() => setQuickFixOpen(true)} className="h-8">
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  Quick Fix
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Left: scores + issues */}
              <div className="col-span-2 space-y-4">
                {isAnalyzed && (
                  <Card className="border-border">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Score Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ScoreBar score={product.score?.clarity ?? 0} label="Clarity — How clearly is this product described for AI?" />
                      <ScoreBar score={product.score?.completeness ?? 0} label="Completeness — Specs, dimensions, materials present?" />
                      <ScoreBar score={product.score?.trust ?? 0} label="Trust Signals — Brand, reviews, structured data?" />
                      <ScoreBar score={product.score?.tags ?? 0} label="Tag Quality — Semantic and AI-retrieval-ready?" />
                    </CardContent>
                  </Card>
                )}

                {product.aiPerceptionSummary && (
                  <Card className="border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-violet-500" />
                        How AI Agents Perceive This Product
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-foreground leading-relaxed italic">"{product.aiPerceptionSummary}"</p>
                    </CardContent>
                  </Card>
                )}

                {issues.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Issues ({issues.filter(i => !i.isFixed).length} open)
                      </h3>
                      <button
                        onClick={() => setQuickFixOpen(true)}
                        className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3" /> Fix all →
                      </button>
                    </div>
                    <div className="space-y-2">
                      {issues.map((issue) => (
                        <IssueCard
                          key={issue.id}
                          issue={issue}
                          onOpenQuickFix={() => setQuickFixOpen(true)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* AI Q&A Test */}
                <Card className="border-border">
                  <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      Can AI Answer This?
                    </CardTitle>
                    {!aiQaEnabled && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAiQaEnabled(true)}>
                        Run test
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {!aiQaEnabled ? (
                      <p className="text-xs text-muted-foreground">
                        Test whether an AI assistant can answer 5 standard buyer questions from this product page alone.
                      </p>
                    ) : aiQaLoading ? (
                      <div className="flex items-center gap-2 py-4">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Testing AI answers…</span>
                      </div>
                    ) : aiQa ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs text-muted-foreground">{aiQa.answerableCount}/{aiQa.totalQuestions} questions answerable</span>
                          <span className={`text-sm font-bold ${aiQa.answerabilityScore >= 60 ? "text-green-600" : aiQa.answerabilityScore >= 40 ? "text-amber-600" : "text-red-600"}`}>
                            {aiQa.answerabilityScore}%
                          </span>
                        </div>
                        {aiQa.results.map((qa: ProductQaResult, i: number) => (
                          <div key={i} className={`rounded-md p-3 border ${qa.canAnswer ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900" : "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900"}`}>
                            <div className="flex items-start gap-2">
                              {qa.canAnswer
                                ? <CheckCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                                : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                              }
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-foreground mb-1">{qa.question}</p>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{qa.answer}</p>
                                {qa.missingInfo && (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                                    Missing: {qa.missingInfo}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {!isAnalyzed && (
                  <Card className="border-dashed border-border">
                    <CardContent className="py-10 text-center">
                      <Sparkles className="w-7 h-7 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground mb-1">Not yet analyzed</p>
                      <p className="text-xs text-muted-foreground mb-3">
                        Run an analysis from the dashboard to get AI readiness scores and issues for this product.
                      </p>
                      <Link href="/dashboard">
                        <Button size="sm" variant="outline">Go to Dashboard</Button>
                      </Link>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right: tags + suggestions + JSON-LD + description */}
              <div className="space-y-4">
                {/* Quick Fix CTA */}
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-primary" />
                      <p className="text-xs font-semibold text-foreground">Quick Fix Available</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      AI-generate improved descriptions, tags, title, and JSON-LD markup — then push directly to Shopify.
                    </p>
                    <Button size="sm" className="w-full h-7 text-xs" onClick={() => setQuickFixOpen(true)}>
                      <Zap className="w-3.5 h-3.5 mr-1.5" />
                      Open Quick Fix
                    </Button>
                  </CardContent>
                </Card>

                {/* Tags */}
                <Card className="border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5" />
                      Tags ({product.tags.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {product.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {product.tags.map(tag => (
                          <span key={tag} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border border-border">{tag}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No tags — add 5–10 semantic tags for AI retrieval</p>
                    )}
                  </CardContent>
                </Card>

                {/* Suggested tags */}
                {product.suggestedTags.length > 0 && (
                  <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Suggested Tags
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {product.suggestedTags.map(tag => (
                          <span key={tag} className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-700">{tag}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => setQuickFixOpen(true)}
                        className="text-[10px] text-primary hover:underline font-medium"
                      >
                        Apply via Quick Fix →
                      </button>
                    </CardContent>
                  </Card>
                )}

                {/* JSON-LD quick action */}
                {issues.some(i => i.ruleId === "TRUST_NO_SCHEMA" && !i.isFixed) && (
                  <Card className="border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs flex items-center gap-2">
                        <Code2 className="w-3.5 h-3.5 text-emerald-500" />
                        JSON-LD Markup Missing
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Schema.org Product markup lets AI systems directly read your price, brand, and availability.
                      </p>
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => setQuickFixOpen(true)}>
                        <Code2 className="w-3.5 h-3.5 mr-1.5" />
                        Generate JSON-LD
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Trust signals */}
                {issues.some(i => i.category === "trust" && !i.isFixed) && (
                  <Card className="border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-blue-500" />
                        Trust Signal Gaps
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {issues
                        .filter(i => i.category === "trust" && !i.isFixed)
                        .map(i => (
                          <div key={i.id} className="text-[11px] flex gap-1.5">
                            <span className="text-red-400 flex-shrink-0">✗</span>
                            <span className="text-foreground">{i.title}</span>
                          </div>
                        ))}
                      <p className="text-[10px] text-muted-foreground pt-1">
                        Trust signals are critical for AI shopping assistant recommendations.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Description preview */}
                {product.description && (
                  <Card className="border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">Current Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-6">
                        {product.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Quick Fix Sheet */}
            <QuickFixSheet
              storeId={activeStoreId}
              productId={product.id}
              productTitle={product.title}
              isOpen={quickFixOpen}
              onClose={() => {
                setQuickFixOpen(false);
                void queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(activeStoreId, params.productId) });
                void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(activeStoreId) });
              }}
            />
          </>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center text-muted-foreground">
              Product not found
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
