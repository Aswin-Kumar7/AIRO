import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, FileText, Copy, Check, Download, Info,
  FileQuestion, CheckCircle, XCircle, MessageSquare, Zap,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { getLlmsTxt, getFaqSchema } from "@/lib/features-api";
import { getStorePerception } from "@/lib/insights-api";
import { useToast } from "@/hooks/use-toast";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

// ─── LLMs.txt tab ─────────────────────────────────────────────────────────────

function LlmsTab({ storeId }: { storeId: string }) {
  const [hasRun, setHasRun] = useState(false);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["llms-txt", storeId],
    queryFn: () => getLlmsTxt(storeId),
    enabled: !!storeId && hasRun,
    staleTime: 5 * 60 * 1000,
  });

  function download() {
    if (!data?.content) return;
    const blob = new Blob([data.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "llms.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        <span className="text-sm text-slate-400">Generating llms.txt…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Info strip */}
      <div className="flex gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="font-semibold text-slate-700">llms.txt</span> is the emerging standard
          for AI crawlers — like robots.txt, but for LLMs. It tells ChatGPT, Perplexity, and other
          AI engines exactly what your store offers.
        </p>
      </div>

      {data?.content ? (
        <>
          {/* Generated file */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-slate-700">llms.txt</span>
              </div>
              <div className="flex items-center gap-4">
                <CopyButton text={data.content} />
                <button
                  onClick={download}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
                >
                  Regenerate
                </button>
              </div>
            </div>
            <pre className="px-4 py-4 text-[11px] font-mono text-slate-600 whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {data.content}
            </pre>
          </div>

          {/* Deploy steps */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-slate-700 mb-3">Deploy to Shopify</p>
            <ol className="space-y-2.5">
              {[
                <>Go to <strong className="text-slate-800">Online Store → Pages → Add page</strong></>,
                <>Set the page title to <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-mono">llms</code></>,
                <>Paste the generated content into the page body</>,
                <>File will be accessible at <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-mono">yourstore.com/pages/llms</code></>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-xs text-slate-500">
                  <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-700 mb-1">Generate your llms.txt</p>
          <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
            Creates a file that tells AI shopping agents what your store sells, your policies,
            and how to cite you accurately.
          </p>
          <Button
            onClick={() => setHasRun(true)}
            disabled={isFetching}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
            size="sm"
          >
            <Zap className="w-3.5 h-3.5" />
            Generate file
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── FAQ Schema tab ───────────────────────────────────────────────────────────

function FaqTab({ storeId }: { storeId: string }) {
  const [hasRun, setHasRun] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);

  const { data: perception, isLoading: percLoading, isFetching } = useQuery({
    queryKey: ["store-perception", storeId],
    queryFn: () => getStorePerception(storeId),
    enabled: !!storeId && hasRun,
  });

  const { data: schema, isLoading: schemaLoading, refetch: refetchSchema, isFetching: schemaFetching } = useQuery({
    queryKey: ["faq-schema", storeId],
    queryFn: () => getFaqSchema(storeId),
    enabled: showSchema && !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const faq = perception?.faqHealth;
  const snippet = schema?.jsonLd
    ? `<script type="application/ld+json">\n${schema.jsonLd}\n</script>`
    : "";

  if (!hasRun && !perception) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
          <FileQuestion className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-1">FAQ health analysis</p>
        <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
          Scans your FAQ page, finds unanswered customer questions, and generates
          structured JSON-LD schema to improve AI citation accuracy.
        </p>
        <Button
          onClick={() => setHasRun(true)}
          disabled={isFetching}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          size="sm"
        >
          <Zap className="w-3.5 h-3.5" />
          Analyze FAQ
        </Button>
      </div>
    );
  }

  if (percLoading || isFetching) {
    return (
      <div className="flex items-center justify-center py-20 gap-3">
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        <span className="text-sm text-slate-400">Analyzing FAQ…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* FAQ page status */}
      {perception && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4">
            {faq?.found ? (
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {faq?.found ? `FAQ page found — "${faq.title}"` : "No FAQ page found"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {faq?.found
                  ? `${faq.questionCount} question${faq.questionCount !== 1 ? "s" : ""} detected`
                  : "Add a Shopify page with handle 'faq'"}
              </p>
            </div>
            {faq?.found && (
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                {faq.questionCount} Q&As
              </span>
            )}
          </div>

          {/* Unanswered questions */}
          {perception.unansweredQuestions.length > 0 && (
            <>
              <div className="border-t border-slate-100 px-5 py-2.5 bg-slate-50/60">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                  Questions AI can't answer
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {perception.unansweredQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 px-5 py-2.5">
                    <span className="text-amber-400 text-xs flex-shrink-0 mt-0.5 font-bold">?</span>
                    <p className="text-xs text-slate-600">{q}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Uncovered topics */}
      {faq?.unansweredTopics && faq.unansweredTopics.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-100 bg-amber-50/40">
            <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-slate-700">Topics not covered</span>
          </div>
          <div className="divide-y divide-amber-50">
            {faq.unansweredTopics.map((t, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-2.5">
                <span className="text-amber-400 text-xs flex-shrink-0 mt-0.5">·</span>
                <p className="text-xs text-slate-600">{t}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* JSON-LD generator — collapsible */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50/60 transition-colors"
          onClick={() => {
            if (!showSchema) setShowSchema(true);
            setSchemaOpen((p) => !p);
          }}
        >
          <div className="flex items-center gap-2">
            <FileQuestion className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800">FAQPage JSON-LD schema</span>
            {schema && (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Generated
              </span>
            )}
          </div>
          {schemaOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {schemaOpen && (
          <div className="border-t border-slate-100">
            {schemaLoading || schemaFetching ? (
              <div className="flex items-center justify-center py-12 gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                <span className="text-sm text-slate-400">Generating schema…</span>
              </div>
            ) : schema ? (
              <div className="p-5 space-y-4">
                {/* Q&A preview */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                    {schema.questionCount} Q&As included
                  </p>
                  {schema.questions.map((q: { question: string; answer: string }, i: number) => (
                    <div key={i} className="border border-slate-100 rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-slate-800 mb-1">{q.question}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{q.answer}</p>
                    </div>
                  ))}
                </div>

                {/* Code snippet */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
                    <span className="text-[10px] font-mono text-slate-400">
                      application/ld+json
                    </span>
                    <CopyButton text={snippet} label="Copy snippet" />
                  </div>
                  <pre className="px-3 py-3 text-[10px] font-mono text-slate-600 overflow-x-auto whitespace-pre-wrap">
                    {snippet}
                  </pre>
                </div>

                <button
                  onClick={() => refetchSchema()}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Regenerate
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  if (!activeStoreId) {
    navigate("/");
    return null;
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Tools</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate AI-optimization assets for your store
          </p>
        </div>

        <Tabs defaultValue="llms-txt">
          <TabsList className="mb-6 bg-slate-100 p-0.5 h-9">
            <TabsTrigger
              value="llms-txt"
              className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
            >
              <FileText className="w-3.5 h-3.5" /> LLMs.txt
            </TabsTrigger>
            <TabsTrigger
              value="faq"
              className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-emerald-700"
            >
              <FileQuestion className="w-3.5 h-3.5" /> FAQ Schema
            </TabsTrigger>
          </TabsList>

          <TabsContent value="llms-txt" className="mt-0">
            <LlmsTab storeId={activeStoreId} />
          </TabsContent>
          <TabsContent value="faq" className="mt-0">
            <FaqTab storeId={activeStoreId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
