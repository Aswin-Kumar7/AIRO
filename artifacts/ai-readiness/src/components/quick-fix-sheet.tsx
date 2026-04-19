import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetProduct, getGetProductQueryKey, getListProductsQueryKey, getGetStoreSummaryQueryKey } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScoreRing } from "@/components/score-ring";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Loader2, Sparkles, RefreshCw, CheckCircle2,
  AlertTriangle, Zap, ChevronDown, ChevronUp, ExternalLink,
  Code2, Copy, Check,
} from "lucide-react";
import { generateProductFix, applyFix, type FixType, type QuickFix } from "@/lib/quick-fix-api";
import { cn } from "@/lib/utils";

const FIX_TYPES: {
  type: FixType;
  label: string;
  icon: string;
  scoreKey: "completeness" | "tags" | "clarity" | "trust";
  categories: string[];
}[] = [
  { type: "description", label: "Description", icon: "📝", scoreKey: "completeness", categories: ["completeness", "clarity"] },
  { type: "tags", label: "Tags", icon: "🏷️", scoreKey: "tags", categories: ["tags"] },
  { type: "title", label: "Title", icon: "✏️", scoreKey: "clarity", categories: ["clarity"] },
  { type: "schema", label: "JSON-LD Markup", icon: "⚙️", scoreKey: "trust", categories: ["trust"] },
];

const MANUAL_CATEGORIES = new Set(["policy"]);

const SEVERITY_COLORS: Record<string, string> = {
  high: "border-l-red-500 bg-red-50/50",
  medium: "border-l-amber-500 bg-amber-50/50",
  low: "border-l-blue-400 bg-blue-50/20",
};

const CATEGORY_ICONS: Record<string, string> = {
  clarity: "🔍", completeness: "📋", trust: "🛡️",
  tags: "🏷️", policy: "📄", consistency: "🔄",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded border border-border hover:bg-muted"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── FixSection ───────────────────────────────────────────────────────────────

function FixSection({
  storeId, productId, type, label, icon, scoreValue,
  existingFix, onFixApplied, isSchema,
}: {
  storeId: string; productId: string;
  type: FixType; label: string; icon: string; scoreValue: number;
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

  const isApplied = fix?.status === "applied";
  const scoreColor = scoreValue >= 75 ? "text-green-600" : scoreValue >= 50 ? "text-amber-600" : "text-red-600";

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateProductFix(storeId, productId, type);
      setFix(res.fix);
      setEditedContent(res.fix.improvedContent);
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
        toast({ title: `${label} applied to Shopify`, description: "Your store has been updated." });
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
    <div className={cn("rounded-xl border bg-card transition-all", isApplied && "opacity-80 border-green-200 bg-green-50/30")}>
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(!expanded)}>
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {!isSchema && <p className={cn("text-xs font-medium", scoreColor)}>Score: {Math.round(scoreValue)}/100</p>}
          {isSchema && <p className="text-xs text-muted-foreground">Add machine-readable product markup</p>}
        </div>
        {isApplied ? (
          <div className="flex items-center gap-1.5 text-green-600">
            <CheckCircle2 className="w-4 h-4" />
            {fix?.shopifySynced && <ExternalLink className="w-3 h-3" aria-label="Synced to Shopify" />}
            <span className="text-xs font-medium">Applied</span>
          </div>
        ) : fix ? (
          <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
            +{fix.estimatedScoreImprovement} pts
          </span>
        ) : null}
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
          {!fix && !isApplied ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-xs text-muted-foreground text-center">
                {isSchema
                  ? "Generate schema.org/Product JSON-LD markup to help AI systems parse your product data."
                  : "No AI fix generated yet for this dimension."}
              </p>
              <Button size="sm" onClick={handleGenerate} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isSchema ? <Code2 className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generating ? "Generating…" : isSchema ? "Generate JSON-LD" : "Generate Fix"}
              </Button>
            </div>
          ) : (
            <>
              {fix?.explanation && (
                <p className="text-xs text-muted-foreground leading-relaxed">{fix.explanation}</p>
              )}

              {isSchema ? (
                /* Schema: code block with copy button */
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Generated JSON-LD</p>
                    <div className="flex items-center gap-2">
                      {!isApplied && (
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs h-6 text-muted-foreground gap-1 px-2"
                          onClick={handleGenerate} disabled={generating}
                        >
                          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Regenerate
                        </Button>
                      )}
                      <CopyButton text={editedContent} />
                    </div>
                  </div>
                  <pre className="text-[10px] text-foreground bg-muted border border-border rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed font-mono">
                    {editedContent || "(empty)"}
                  </pre>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Copy and paste this into your Shopify theme's product template, or use "Apply to Shopify" to add it as a metafield.
                  </p>
                  {!isApplied && (
                    <Button
                      size="sm" className="w-full mt-2 h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleApply} disabled={applying || !editedContent}
                    >
                      {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      {applying ? "Applying…" : "Apply to Shopify"}
                    </Button>
                  )}
                </div>
              ) : (
                /* Standard: editable before/after */
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wider mb-1">Before</p>
                      <div className="text-[11px] text-foreground bg-red-50 border border-red-100 rounded-lg p-2.5 max-h-32 overflow-y-auto leading-relaxed">
                        {fix?.originalContent || "(empty)"}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1">After (editable)</p>
                      {isApplied ? (
                        <div className="text-[11px] text-foreground bg-green-50 border border-green-100 rounded-lg p-2.5 max-h-32 overflow-y-auto leading-relaxed">
                          {editedContent}
                        </div>
                      ) : (
                        <Textarea
                          value={editedContent}
                          onChange={(e) => setEditedContent(e.target.value)}
                          className="text-[11px] min-h-[80px] max-h-32 leading-relaxed resize-none"
                          placeholder="AI-generated content will appear here…"
                        />
                      )}
                    </div>
                  </div>

                  {!isApplied && (
                    <div className="flex items-center justify-between pt-1">
                      <Button
                        variant="ghost" size="sm"
                        className="text-xs h-7 text-muted-foreground gap-1"
                        onClick={handleGenerate} disabled={generating}
                      >
                        {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Regenerate
                      </Button>
                      <Button
                        size="sm" className="h-7 text-xs gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                        onClick={handleApply} disabled={applying || !editedContent}
                      >
                        {applying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        {applying ? "Applying…" : "Apply to Shopify"}
                      </Button>
                    </div>
                  )}
                </>
              )}

              {fix?.shopifyError && (
                <p className="text-[10px] text-red-500 bg-red-50 border border-red-100 rounded px-2 py-1">
                  Shopify sync error: {fix.shopifyError}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ManualIssues ─────────────────────────────────────────────────────────────

function ManualIssues({ issues }: {
  issues: Array<{ id: string; category: string; severity: string; title: string; description: string; suggestion: string }>
}) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Requires Manual Action</p>
      {issues.map((issue) => (
        <div key={issue.id} className={cn("p-3 rounded-lg border-l-4 border-border", SEVERITY_COLORS[issue.severity] ?? "")}>
          <div className="flex items-start gap-2">
            <span className="text-sm flex-shrink-0">{CATEGORY_ICONS[issue.category] ?? "⚠️"}</span>
            <div>
              <p className="text-xs font-semibold text-foreground">{issue.title}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{issue.description}</p>
              <p className="text-[11px] font-medium text-foreground mt-1">Fix: {issue.suggestion}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── QuickFixSheet ────────────────────────────────────────────────────────────

export function QuickFixSheet({
  storeId,
  productId,
  productTitle,
  isOpen,
  onClose,
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
    query: {
      enabled: isOpen && !!productId,
      queryKey: getGetProductQueryKey(storeId, productId),
    },
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
    (i) => i.category === "trust" && (i as unknown as { ruleId?: string }).ruleId === "TRUST_NO_SCHEMA" && !i.isFixed
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
      } catch { failed++; }
    }
    invalidateAfterFix();
    setApplyingAll(false);
    toast({
      title: `${pendingFixes.length} fixes applied`,
      description: synced > 0
        ? `${synced} synced to Shopify${failed > 0 ? `, ${failed} sync errors` : ""}`
        : failed > 0 ? `${failed} Shopify sync errors` : undefined,
    });
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px] flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          {isLoading || !product ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse w-40" />
                <div className="h-3 bg-muted rounded animate-pulse w-24" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt={product.title} className="w-12 h-12 rounded-xl object-cover border border-border flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base font-bold truncate">{product.title}</SheetTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  {product.productType && <span className="text-xs text-muted-foreground">{product.productType}</span>}
                  {product.price && <span className="text-xs text-muted-foreground">${product.price}</span>}
                  {autoFixableIssues.length > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                      <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                      {autoFixableIssues.length} issues
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-center">
                  <ScoreRing score={product.score.overall} size={44} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Now</p>
                </div>
                {projectedScore !== null && projectedScore > product.score.overall && (
                  <>
                    <span className="text-muted-foreground text-xs">→</span>
                    <div className="text-center">
                      <ScoreRing score={projectedScore} size={44} />
                      <p className="text-[10px] text-green-600 font-medium mt-0.5">After</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : product ? (
            <>
              {FIX_TYPES.map(({ type, label, icon, scoreKey, categories }) => {
                const score = product.score[scoreKey as keyof typeof product.score] ?? 0;
                const hasIssueForType = type === "schema"
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
                    scoreValue={score}
                    existingFix={fixByType[type]}
                    onFixApplied={invalidateAfterFix}
                    isSchema={type === "schema"}
                  />
                );
              })}

              <ManualIssues issues={manualIssues} />

              {autoFixableIssues.length === 0 && manualIssues.length === 0 && !hasSchemaIssue && (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                  <p className="text-sm font-medium text-foreground">No issues found</p>
                  <p className="text-xs text-muted-foreground">This product is fully AI-ready</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-16">Product not found</p>
          )}
        </div>

        {/* Apply All footer */}
        {pendingFixes.length > 1 && (
          <div className="px-6 py-4 border-t border-border flex-shrink-0 bg-card">
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApplyAll}
              disabled={applyingAll}
            >
              {applyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {applyingAll ? "Applying all fixes…" : `Apply All ${pendingFixes.length} Fixes to Shopify`}
              {totalPotential > 0 && !applyingAll && (
                <span className="ml-auto text-xs bg-white/20 px-1.5 py-0.5 rounded-full">+{totalPotential} pts</span>
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
