import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetProduct, getGetProductQueryKey,
  getListProductsQueryKey, getGetStoreSummaryQueryKey,
} from "@workspace/api-client-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Package, Loader2, RefreshCw, CheckCircle2,
  Zap,
  Code2, Copy, Check, FileText, Tag, Pencil, X,
  ArrowRight, Search, Info, TrendingUp as TrendingUpIcon,
} from "lucide-react";
import { generateProductFix, applyFix, type FixType, type QuickFix } from "@/lib/quick-fix-api";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ─── Fix type config ──────────────────────────────────────────────────────────

const FIX_TYPES: {
  type: FixType;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  scoreKey: "completeness" | "tags" | "clarity" | "trust";
  categories: string[];
}[] = [
  {
    type: "description", label: "Description",
    description: "AI-enhanced product narrative for search intent.",
    icon: FileText, scoreKey: "completeness",
    categories: ["completeness", "clarity"],
  },
  {
    type: "tags", label: "Tags",
    description: "Semantic classification for discovery.",
    icon: Tag, scoreKey: "tags",
    categories: ["tags"],
  },
  {
    type: "title", label: "Title",
    description: "Keyword-optimized product naming.",
    icon: Pencil, scoreKey: "clarity",
    categories: ["clarity"],
  },
  {
    type: "schema", label: "JSON-LD",
    description: "Rich result structured data markup.",
    icon: Code2, scoreKey: "trust",
    categories: ["trust"],
  },
];

const MANUAL_CATEGORIES = new Set(["policy"]);

// ─── Score Meter ──────────────────────────────────────────────────────────────

function ScoreMeter({ score, label }: { score: number; label: string }) {
  const s = Math.min(100, Math.max(0, score));
  const color = s >= 75 ? "bg-emerald-500" : s >= 50 ? "bg-amber-500" : "bg-red-500";
  
  return (
    <div className="flex flex-col gap-1.5 min-w-[80px]">
      <div className="flex items-end justify-between px-0.5">
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{label}</span>
        <span className="text-[12px] font-black text-slate-900 dark:text-white tabular-nums">{Math.round(s)}</span>
      </div>
      <div className="h-1 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${s}%` }}
          className={cn("h-full rounded-full transition-all duration-700", color)}
        />
      </div>
    </div>
  );
}

// ─── FixDetail ───────────────────────────────────────────────────────────────

function ApplyProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden mt-2">
      <motion.div
        className="h-full bg-emerald-500 rounded-full"
        initial={{ width: "0%" }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
}

function FixDetail({
  storeId, productId, type, label,
  scoreValue: _scoreValue, existingFix, onFixApplied,
}: {
  storeId: string;
  productId: string;
  type: FixType;
  label: string;
  scoreValue: number;
  existingFix: QuickFix | undefined;
  onFixApplied: () => void;
}) {
  const { toast } = useToast();
  const [fix, setFix] = useState<QuickFix | undefined>(existingFix);
  const [editedContent, setEditedContent] = useState(existingFix?.improvedContent ?? "");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [confirmPending, setConfirmPending] = useState(false);

  const isApplied = fix?.status === "applied";

  useEffect(() => {
    if (existingFix) {
      setFix(existingFix);
      setEditedContent(existingFix.improvedContent);
    } else {
      setFix(undefined);
      setEditedContent("");
    }
    setConfirmPending(false);
  }, [existingFix, type]);

  async function handleGenerate() {
    setGenerating(true);
    setConfirmPending(false);
    try {
      const res = await generateProductFix(storeId, productId, type);
      setFix(res.fix);
      setEditedContent(res.fix.improvedContent);
    } catch (err) {
      toast({ title: "Failed to generate", description: "Internal AI engine error", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleApply() {
    if (!fix) return;
    setApplying(true);
    setApplyProgress(0);
    // Animate progress bar: 0→80% over 1.5s, then snap to 100% on completion
    const interval = setInterval(() => {
      setApplyProgress((p) => Math.min(p + 12, 80));
    }, 200);
    try {
      await applyFix(storeId, fix.id, editedContent);
      clearInterval(interval);
      setApplyProgress(100);
      await new Promise((r) => setTimeout(r, 350)); // let bar reach 100% visually
      toast({ title: "Optimization applied" });
      onFixApplied();
      setFix({ ...fix, status: "applied", improvedContent: editedContent });
      setConfirmPending(false);
    } catch (err) {
      clearInterval(interval);
      setApplyProgress(0);
      toast({ title: "Apply failed", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <motion.div
      key={type}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col h-full"
    >
      {generating ? (
        <div className="h-full flex flex-col items-center justify-center gap-6">
          <div className="relative">
             <div className="w-10 h-10 rounded-full border-2 border-slate-100 dark:border-white/5 border-t-emerald-500 animate-spin" />
          </div>
          <p className="text-[13px] text-slate-500 font-medium animate-pulse">Analyzing product metadata...</p>
        </div>
      ) : !fix ? (
        <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-white/5 flex items-center justify-center mb-6 shadow-sm">
            <Zap className="w-8 h-8 text-slate-200 dark:text-zinc-800" />
          </div>
          <h3 className="text-[18px] font-black text-slate-900 dark:text-white mb-2 tracking-tight">Run Analysis</h3>
          <p className="text-[13px] text-slate-500 leading-relaxed mb-8 font-medium">
            Generate an AI-optimized {label.toLowerCase()} for this product to improve visibility in answer engines.
          </p>
          <button
            onClick={handleGenerate}
            className="w-full bg-slate-900 dark:bg-white text-white dark:text-black py-3 rounded-xl text-[14px] font-bold hover:opacity-90 active:scale-95 transition-all shadow-xl"
          >
            Generate Optimization
          </button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar pr-6 pb-6">
            {/* Original vs AI suggestion toggle */}
            {!isApplied && fix.originalContent && (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => setShowOriginal((v) => !v)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-colors",
                    showOriginal
                      ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                      : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-white/10"
                  )}
                >
                  <Info className="w-3 h-3" />
                  {showOriginal ? "Hide original" : "Compare with original"}
                </button>
              </div>
            )}

            {/* Original content (collapsible) */}
            {showOriginal && fix.originalContent && (
              <div className="bg-amber-50/60 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-2">Current (original)</p>
                <p className="text-[12px] text-amber-900 dark:text-amber-200 leading-relaxed font-medium whitespace-pre-wrap line-clamp-6">
                  {fix.originalContent}
                </p>
              </div>
            )}

            {/* Editor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <span className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                     {isApplied ? "Applied Content" : "AI Suggested — Edit before applying"}
                   </span>
                   {!isApplied && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                </div>
                {isApplied && (
                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-100 dark:border-emerald-500/20">SYNCED</span>
                )}
              </div>
              <div className="relative group">
                <Textarea
                  value={editedContent}
                  onChange={(e) => { setEditedContent(e.target.value); setConfirmPending(false); }}
                  className="min-h-[200px] text-[14px] leading-relaxed bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-white/10 rounded-2xl focus:ring-0 focus:border-slate-400 dark:focus:border-white/30 transition-all resize-none font-medium text-slate-800 dark:text-zinc-200 p-6 shadow-inner"
                  readOnly={isApplied}
                  placeholder="Edit the AI suggestion before applying…"
                />
                {!isApplied && (
                  <div className="absolute bottom-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <CopyBtn text={editedContent} />
                  </div>
                )}
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
                 <div className="flex items-center gap-2 mb-2">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Strategy</p>
                 </div>
                 <p className="text-[12px] text-slate-700 dark:text-zinc-300 leading-relaxed font-medium">
                   {fix.explanation}
                 </p>
              </div>
              <div className="bg-emerald-500/5 dark:bg-emerald-500/[0.03] border border-emerald-500/10 dark:border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between">
                 <div className="flex items-center gap-2 mb-2">
                    <TrendingUpIcon className="w-3.5 h-3.5 text-emerald-500" />
                    <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest">Estimated Impact</p>
                 </div>
                 <div>
                    <p className="text-[20px] font-black text-emerald-600 dark:text-emerald-400 leading-none">+{fix.estimatedScoreImprovement}</p>
                    <p className="text-[10px] text-emerald-600/60 dark:text-emerald-500/50 font-bold uppercase tracking-widest mt-1">Score Points</p>
                 </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          {!isApplied && (
            <div className="pt-5 mt-auto border-t border-slate-100 dark:border-white/10 space-y-3">
              {/* Progress bar */}
              {applying && <ApplyProgressBar progress={applyProgress} />}

              <div className="flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={generating || applying}
                  className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-[13px] font-bold hover:bg-slate-50 dark:hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  Regenerate
                </button>
                {confirmPending ? (
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="flex-[2] flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {applying
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Applying…</>
                      : <><CheckCircle2 className="w-4 h-4" /> Confirm & Apply</>}
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmPending(true)}
                    disabled={applying}
                    className="flex-[2] flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black text-[13px] font-bold shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Apply to Catalog
                  </button>
                )}
              </div>
              {confirmPending && !applying && (
                <p className="text-[11px] text-center text-amber-600 dark:text-amber-400 font-medium">
                  Review your edits above, then click "Confirm & Apply" to save.
                  <button onClick={() => setConfirmPending(false)} className="ml-2 text-slate-400 hover:text-slate-700 underline">Cancel</button>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

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
      className="flex items-center gap-1.5 bg-white dark:bg-zinc-800 border dark:border-white/10 px-2.5 py-1.5 rounded-lg shadow-sm text-[11px] font-bold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── QuickFixSheet ───────────────────────────────────────────────────────────

export function QuickFixSheet({
  storeId,
  productId,
  productTitle: _productTitle,
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
  const { data: product, isLoading } = useGetProduct(storeId, productId, {
    query: { 
      queryKey: getGetProductQueryKey(storeId, productId),
      enabled: !!storeId && !!productId && isOpen 
    },
  });

  const [activeType, setActiveType] = useState<FixType>("description");
  const [applyingAll, setApplyingAll] = useState(false);

  const invalidateAfterFix = () => {
    void queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(storeId, productId) });
    void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(storeId) });
    void queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(storeId) });
  };

  const fixes = product?.fixes ?? [];
  const fixByType = Object.fromEntries(fixes.map((f: any) => [f.type, f]));
  const issues = (product?.issues ?? []) as any[];
  const autoFixableIssues = issues.filter((i) => !i.isFixed && !MANUAL_CATEGORIES.has(i.category));
  const hasSchemaIssue = issues.some((i) => i.category === "trust" && (i.title.toLowerCase().includes("markup") || i.title.toLowerCase().includes("json-ld")));

  const pendingFixes = Object.values(fixByType).filter((f: any) => f.status === "pending");
  const totalPotential: number = pendingFixes.reduce<number>((acc: number, f: any) => acc + (f.estimatedScoreImprovement ?? 0), 0);
  const projectedScore: number | null = product ? Math.min(100, product.score.overall + totalPotential) : null;

  useEffect(() => {
    if (product && !autoFixableIssues.some(i => i.category === "completeness") && !fixByType["description"]) {
       const firstAvailable = FIX_TYPES.find(ft => {
          const hasIssue = ft.type === "schema" ? hasSchemaIssue : autoFixableIssues.some(i => ft.categories.includes(i.category));
          return hasIssue || fixByType[ft.type];
       });
       if (firstAvailable) setActiveType(firstAvailable.type);
    }
  }, [product]);

  async function handleApplyAll() {
    setApplyingAll(true);
    let success = 0;
    try {
      for (const fix of pendingFixes as any[]) {
        await applyFix(storeId, fix.id, fix.improvedContent);
        success++;
      }
      toast({ title: `Applied ${success} optimizations.` });
      invalidateAfterFix();
    } catch (e) {
      toast({ title: "Bulk update failed", variant: "destructive" });
    } finally {
      setApplyingAll(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="w-[98vw] sm:max-w-[1000px] flex flex-col p-0 gap-0 bg-white dark:bg-black border-slate-200 dark:border-white/10 shadow-3xl overflow-hidden rounded-[32px] [&>button]:hidden h-[720px] outline-none"
      >
        <AnimatePresence mode="wait">
          {!product && isLoading ? (
            <motion.div 
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-black z-50 gap-4"
            >
               <div className="relative">
                  <div className="w-14 h-14 rounded-[20px] border-4 border-slate-100 dark:border-white/5 border-t-emerald-500 animate-spin" />
                  <Zap className="absolute inset-0 m-auto w-6 h-6 text-emerald-500 animate-pulse" />
               </div>
               <p className="text-[13px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing catalog data...</p>
            </motion.div>
          ) : (
            <motion.div 
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col h-full w-full"
            >
              {/* Header */}
              <div className="px-10 py-6 border-b border-slate-100 dark:border-white/10 bg-white dark:bg-black flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-white/10 flex items-center justify-center overflow-hidden shadow-sm">
                    {product?.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[20px] font-black text-slate-900 dark:text-white truncate tracking-tight">{product?.title || "Loading..."}</h2>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{product?.productType || "Inventory Item"}</span>
                      <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-zinc-800" />
                      <span className="text-[12px] font-black text-slate-900 dark:text-zinc-300 tabular-nums">${product?.price || "0.00"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-10">
                  <div className="flex items-center gap-6">
                    <ScoreMeter score={product?.score.overall ?? 0} label="Before" />
                    {projectedScore !== null && projectedScore > (product?.score.overall ?? 0) && (
                      <div className="flex items-center gap-6">
                        <ArrowRight className="w-4 h-4 text-slate-200 dark:text-zinc-800" />
                        <ScoreMeter score={projectedScore!} label="Optimized" />
                      </div>
                    )}
                  </div>
                  <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-slate-400 border dark:border-white/5">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 flex overflow-hidden">
                <div className="w-[300px] border-r border-slate-100 dark:border-white/10 bg-white dark:bg-black flex flex-col p-6 space-y-2 overflow-y-auto custom-scrollbar">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-600 uppercase tracking-[0.2em] px-3 mb-4">Modules</p>
                  {FIX_TYPES.map((ft) => {
                    const hasIssue = ft.type === "schema" ? hasSchemaIssue : autoFixableIssues.some(i => ft.categories.includes(i.category));
                    const hasFix = Boolean(fixByType[ft.type]);
                    const isApplied = fixByType[ft.type]?.status === "applied";
                    if (!hasIssue && !hasFix) return null;

                    return (
                      <button
                        key={ft.type}
                        onClick={() => setActiveType(ft.type)}
                        className={cn(
                          "w-full flex flex-col items-start px-4 py-4 rounded-2xl transition-all border",
                          activeType === ft.type 
                            ? "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-white/20 shadow-sm" 
                            : "bg-transparent border-transparent hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
                        )}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <div className="flex items-center gap-3">
                            <ft.icon className={cn("w-4 h-4", activeType === ft.type ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-zinc-600")} />
                            <span className={cn("text-[14px] font-black tracking-tight", activeType === ft.type ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-zinc-400")}>
                              {ft.label}
                            </span>
                          </div>
                          {isApplied ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : hasFix && (
                            <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium text-left line-clamp-1">{ft.description}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="flex-1 p-10 bg-white dark:bg-black overflow-hidden relative">
                  <AnimatePresence mode="wait">
                    <FixDetail
                      key={activeType}
                      storeId={storeId}
                      productId={productId}
                      type={activeType}
                      label={FIX_TYPES.find(f => f.type === activeType)?.label || ""}
                      scoreValue={(product?.score as any)?.[FIX_TYPES.find(f => f.type === activeType)?.scoreKey || "overall"] ?? 0}
                      existingFix={fixByType[activeType]}
                      onFixApplied={invalidateAfterFix}
                    />
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer */}
              <AnimatePresence>
                {pendingFixes.length > 1 && (
                  <motion.div 
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 80, opacity: 0 }}
                    transition={{ type: "spring", damping: 20, stiffness: 100 }}
                    className="bg-black dark:bg-zinc-950 px-10 py-5 flex items-center justify-between border-t border-white/10"
                  >
                    <div className="flex items-center gap-4 text-white">
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                        {applyingAll ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-[14px] font-black tracking-tight">Bulk Synchronization</p>
                        <p className="text-[12px] opacity-50 font-medium">{pendingFixes.length} pending optimizations ready.</p>
                      </div>
                    </div>
                    <button
                      onClick={handleApplyAll}
                      disabled={applyingAll}
                      className="px-8 py-3 rounded-xl bg-white text-black text-[14px] font-black hover:bg-slate-200 transition-all disabled:opacity-50 flex items-center gap-2.5 shadow-xl"
                    >
                      {applyingAll ? "Deploying..." : "Sync All Data"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
