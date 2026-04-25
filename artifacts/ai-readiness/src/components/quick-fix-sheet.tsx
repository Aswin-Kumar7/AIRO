import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProduct, getGetProductQueryKey,
  getListProductsQueryKey, getGetStoreSummaryQueryKey,
} from "@workspace/api-client-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Loader2, RefreshCw, CheckCircle2,
  AlertTriangle, Zap, ChevronDown, ChevronUp,
  ExternalLink, Code2, Copy, Check, FileText, Tag, Pencil, X,
} from "lucide-react";
import { generateProductFix, applyFix, type FixType, type QuickFix } from "@/lib/quick-fix-api";
import { cn } from "@/lib/utils";

// ─── Fix type config ──────────────────────────────────────────────────────────

const FIX_TYPES: {
  type: FixType;
  label: string;
  icon: React.FC<{ className?: string }>;
  scoreKey: "completeness" | "tags" | "clarity" | "trust";
  categories: string[];
  iconColor: string;
}[] = [
  {
    type: "description", label: "Description",
    icon: FileText, scoreKey: "completeness",
    categories: ["completeness", "clarity"], iconColor: "text-teal-500",
  },
  {
    type: "tags", label: "Tags",
    icon: Tag, scoreKey: "tags",
    categories: ["tags"], iconColor: "text-violet-500",
  },
  {
    type: "title", label: "Title",
    icon: Pencil, scoreKey: "clarity",
    categories: ["clarity"], iconColor: "text-amber-500",
  },
  {
    type: "schema", label: "JSON-LD Markup",
    icon: Code2, scoreKey: "trust",
    categories: ["trust"], iconColor: "text-rose-500",
  },
];

const MANUAL_CATEGORIES = new Set(["policy"]);

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-red-400",
  medium: "bg-amber-400",
  low: "bg-slate-300",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Score arc ────────────────────────────────────────────────────────────────

const ARC_R = 19;
const ARC_C = 2 * Math.PI * ARC_R;

function ScoreArc({ score, label }: { score: number; label: string }) {
  const s = Math.min(100, Math.max(0, score));
  const dash = (s / 100) * ARC_C;
  const color = s >= 70 ? "#10b981" : s >= 50 ? "#f59e0b" : "#f87171";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r={ARC_R} fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
        <circle
          cx="23" cy="23" r={ARC_R} fill="none"
          stroke={color} strokeWidth="3.5"
          strokeDasharray={`${dash} ${ARC_C}`}
          strokeLinecap="round"
          transform="rotate(-90 23 23)"
          style={{ transition: "stroke-dasharray 0.7s ease-out" }}
        />
        <text
          x="23" y="23" textAnchor="middle" dominantBaseline="central"
          fontSize="10" fontWeight="700" fill="#0f172a"
        >
          {Math.round(s)}
        </text>
      </svg>
      <span className="text-[9px] text-slate-400">{label}</span>
    </div>
  );
}

// ─── FixSection ───────────────────────────────────────────────────────────────

function FixSection({
  storeId, productId, type, label, icon: Icon, iconColor,
  scoreValue, existingFix, onFixApplied, isSchema,
}: {
  storeId: string;
  productId: string;
  type: FixType;
  label: string;
  icon: React.FC<{ className?: string }>;
  iconColor: string;
  scoreValue: number;
  existingFix: QuickFix | undefined;
  onFixApplied: () => void;
  isSchema?: boolean;
}) {
  const { toast } = useToast();
  const [fix, setFix] = useState<QuickFix | undefined>(existingFix);
  const [editedContent, setEditedContent] = useState(existingFix?.improvedContent ?? "");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [view, setView] = useState<"generated" | "existing">("generated");

  const isApplied = fix?.status === "applied";

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateProductFix(storeId, productId, type);
      setFix(res.fix);
      setEditedContent(res.fix.improvedContent);
      setView("generated");
    } catch (err) {
      toast({ title: "Generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleApply() {
    if (!fix) return;
    setApplying(true);
    try {
      const result = await applyFix(storeId, fix.id, editedContent);
      setFix({ ...fix, status: "applied", shopifySynced: result.shopifySynced, shopifyError: result.shopifyError });
      if (result.shopifySynced) {
        toast({ title: `${label} applied to Shopify` });
      } else if (result.shopifyError) {
        toast({ title: "Applied locally", description: `Shopify sync failed: ${result.shopifyError}`, variant: "destructive" });
      } else {
        toast({ title: `${label} fix applied` });
      }
      onFixApplied();
    } catch (err) {
      toast({ title: "Apply failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all",
      isApplied ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-white",
    )}>
      {/* Section header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50/60 transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        <Icon className={cn("w-4 h-4 flex-shrink-0", iconColor)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          {!isSchema && (
            <p className={cn(
              "text-[11px] font-medium",
              scoreValue >= 75 ? "text-emerald-600" : scoreValue >= 50 ? "text-amber-600" : "text-red-500",
            )}>
              Score: {Math.round(scoreValue)}/100
            </p>
          )}
          {isSchema && <p className="text-[11px] text-slate-400">Machine-readable product markup</p>}
        </div>
        {isApplied ? (
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {fix?.shopifySynced && <ExternalLink className="w-3 h-3" />}
            <span className="text-[11px] font-semibold">Applied</span>
          </div>
        ) : fix ? (
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            +{fix.estimatedScoreImprovement} pts
          </span>
        ) : null}
        {expanded
          ? <ChevronUp className="w-4 h-4 text-slate-300 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0" />
        }
      </button>

      {/* Section body */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          {!fix && !isApplied ? (
            /* Empty state */
            <div className="flex flex-col items-center gap-2 py-5 text-center">
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                {isSchema
                  ? "Generate schema.org/Product JSON-LD markup for AI systems."
                  : "No AI fix generated yet for this dimension."}
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                {generating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Zap className="w-3.5 h-3.5" />
                }
                {generating ? "Generating…" : "Generate Fix"}
              </button>
            </div>
          ) : (
            <>
              {fix?.explanation && (
                <p className="text-[11px] text-slate-500 leading-relaxed">{fix.explanation}</p>
              )}

              {isSchema ? (
                /* JSON-LD view */
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Generated JSON-LD
                    </span>
                    <div className="flex items-center gap-3">
                      {!isApplied && (
                        <button
                          onClick={handleGenerate}
                          disabled={generating}
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
                        >
                          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Regenerate
                        </button>
                      )}
                      <CopyBtn text={editedContent} />
                    </div>
                  </div>
                  <pre className="text-[10px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-44 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
                    {editedContent || "(empty)"}
                  </pre>
                  {!isApplied && (
                    <button
                      onClick={handleApply}
                      disabled={applying || !editedContent}
                      className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
                    >
                      {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      {applying ? "Applying…" : "Apply to Shopify"}
                    </button>
                  )}
                </div>
              ) : (
                /* Text fix view */
                <div className="space-y-2.5">
                  {/* Toggle: Existing / Generated */}
                  {!isApplied && (
                    <div className="flex items-center gap-px bg-slate-100 rounded-lg p-0.5 w-fit">
                      {(["existing", "generated"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setView(v)}
                          className={cn(
                            "px-3 py-1 text-[11px] font-medium rounded-md transition-colors",
                            view === v
                              ? "bg-white text-slate-800 shadow-sm"
                              : "text-slate-500 hover:text-slate-700",
                          )}
                        >
                          {v === "existing" ? "Original" : "Generated"}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Content area */}
                  {view === "existing" ? (
                    <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-36 overflow-y-auto leading-relaxed">
                      {fix?.originalContent || <span className="text-slate-400 italic">No original content</span>}
                    </div>
                  ) : isApplied ? (
                    <div className="text-[11px] text-slate-600 bg-emerald-50 border border-emerald-200 rounded-lg p-3 max-h-36 overflow-y-auto leading-relaxed">
                      {editedContent}
                    </div>
                  ) : (
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="text-[11px] min-h-[100px] max-h-36 resize-y leading-relaxed border-slate-200 bg-white"
                      placeholder="AI-generated content will appear here…"
                    />
                  )}

                  {/* Actions */}
                  {!isApplied && view === "generated" && (
                    <div className="flex items-center justify-between pt-0.5">
                      <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
                      >
                        {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Regenerate
                      </button>
                      <button
                        onClick={handleApply}
                        disabled={applying || !editedContent}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        {applying ? "Applying…" : "Apply to Shopify"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {fix?.shopifyError && (
                <p className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  Sync error: {fix.shopifyError}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual issues ────────────────────────────────────────────────────────────

function ManualIssues({
  issues,
}: {
  issues: Array<{
    id: string; category: string; severity: string;
    title: string; description: string; suggestion: string;
  }>;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
        Requires Manual Action
      </p>
      {issues.map((issue) => (
        <div key={issue.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${SEVERITY_DOT[issue.severity] ?? "bg-slate-300"}`} />
          <div>
            <p className="text-xs font-semibold text-slate-800">{issue.title}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{issue.description}</p>
            <p className="text-[11px] text-slate-700 mt-1 font-medium">↳ {issue.suggestion}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── QuickFixSheet ────────────────────────────────────────────────────────────

export function QuickFixSheet({
  storeId, productId, productTitle, isOpen, onClose,
}: {
  storeId: string;
  productId: string;
  productTitle: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [applyingAll, setApplyingAll] = useState(false);

  const { data: product, isLoading } = useGetProduct(storeId, productId, {
    query: { enabled: isOpen && !!productId, queryKey: getGetProductQueryKey(storeId, productId) },
  });

  function invalidateAfterFix() {
    void queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(storeId, productId) });
    void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(storeId) });
  }

  const issues = product?.issues ?? [];
  const autoFixableIssues = issues.filter((i) => !MANUAL_CATEGORIES.has(i.category));
  const manualIssues = issues.filter((i) => MANUAL_CATEGORIES.has(i.category));
  const fixByType = Object.fromEntries(
    (product?.fixes ?? []).map((f) => [f.type, f as unknown as QuickFix]),
  );

  const pendingFixes = (product?.fixes ?? []).filter((f) => f.status === "pending");
  const totalPotential = pendingFixes.reduce((sum, f) => sum + f.estimatedScoreImprovement, 0);
  const projectedScore = product ? Math.min(100, product.score.overall + totalPotential) : null;

  const hasSchemaIssue = issues.some(
    (i) =>
      i.category === "trust" &&
      (i as unknown as { ruleId?: string }).ruleId === "TRUST_NO_SCHEMA" &&
      !i.isFixed,
  );

  async function handleApplyAll() {
    if (pendingFixes.length === 0) return;
    setApplyingAll(true);
    let synced = 0;
    let failed = 0;
    for (const fix of pendingFixes) {
      try {
        const result = await applyFix(storeId, fix.id, fix.improvedContent);
        if (result.shopifySynced) synced++;
        if (result.shopifyError) failed++;
      } catch {
        failed++;
      }
    }
    invalidateAfterFix();
    setApplyingAll(false);
    toast({
      title: `${pendingFixes.length} fix${pendingFixes.length !== 1 ? "es" : ""} applied`,
      description:
        synced > 0
          ? `${synced} synced to Shopify${failed > 0 ? `, ${failed} errors` : ""}`
          : failed > 0
          ? `${failed} Shopify sync errors`
          : undefined,
    });
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[560px] sm:max-w-[560px] flex flex-col p-0 gap-0 bg-[#f4f6f8]"
      >
        {/* ── Header ── */}
        <div className="bg-white border-b border-slate-200 px-5 py-4 flex-shrink-0">
          {isLoading || !product ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-slate-100 rounded animate-pulse w-40" />
                <div className="h-3 bg-slate-100 rounded animate-pulse w-24" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.title} className="w-11 h-11 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{product.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {product.productType && (
                    <span className="text-[11px] text-slate-400">{product.productType}</span>
                  )}
                  {product.price && (
                    <span className="text-[11px] text-slate-400">${product.price}</span>
                  )}
                  {autoFixableIssues.length > 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      {autoFixableIssues.length} issues
                    </span>
                  )}
                </div>
              </div>

              {/* Score before → after */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <ScoreArc score={product.score.overall} label="Now" />
                {projectedScore !== null && projectedScore > product.score.overall && (
                  <>
                    <span className="text-slate-200 text-lg leading-none">→</span>
                    <ScoreArc score={projectedScore} label="After" />
                  </>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0 ml-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
          ) : product ? (
            <>
              {FIX_TYPES.map(({ type, label, icon, iconColor, scoreKey, categories }) => {
                const score = product.score[scoreKey as keyof typeof product.score] ?? 0;
                const hasIssueForType =
                  type === "schema"
                    ? hasSchemaIssue
                    : autoFixableIssues.some((i) => categories.includes(i.category));
                const hasFix = Boolean(fixByType[type]);
                if (!hasIssueForType && !hasFix) return null;

                return (
                  <FixSection
                    key={type}
                    storeId={storeId}
                    productId={productId}
                    type={type}
                    label={label}
                    icon={icon}
                    iconColor={iconColor}
                    scoreValue={score}
                    existingFix={fixByType[type]}
                    onFixApplied={invalidateAfterFix}
                    isSchema={type === "schema"}
                  />
                );
              })}

              <ManualIssues issues={manualIssues} />

              {autoFixableIssues.length === 0 && manualIssues.length === 0 && !hasSchemaIssue && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">No issues found</p>
                  <p className="text-xs text-slate-400">This product is fully AI-ready</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400 text-center py-16">Product not found</p>
          )}
        </div>

        {/* ── Apply All footer ── */}
        {pendingFixes.length > 1 && (
          <div className="bg-white border-t border-slate-200 px-5 py-3.5 flex-shrink-0">
            <button
              onClick={handleApplyAll}
              disabled={applyingAll}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2.5 rounded-xl transition-colors"
            >
              {applyingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {applyingAll
                ? "Applying all fixes…"
                : `Apply All ${pendingFixes.length} Fixes to Shopify`
              }
              {totalPotential > 0 && !applyingAll && (
                <span className="ml-auto text-[11px] font-semibold bg-white/25 px-2 py-0.5 rounded-full">
                  +{totalPotential} pts
                </span>
              )}
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
