import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, Copy, Check, Download, Info, FileQuestion, CheckCircle, XCircle, MessageSquare, Tag, AlertTriangle, BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getLlmsTxt, getFaqSchema } from "@/lib/features-api";
import { getStorePerception, getStoreTagOptimizer } from "@/lib/insights-api";
import { useGetBenchmark, getGetBenchmarkQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// ─── LLMs.txt tab ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}

function LlmsTab({ storeId }: { storeId: string }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["llms-txt", storeId],
    queryFn: () => getLlmsTxt(storeId),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  function download() {
    if (!data?.content) return;
    const blob = new Blob([data.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "llms.txt"; a.click(); URL.revokeObjectURL(url);
  }

  if (isLoading || isFetching) return <Card><CardContent className="flex items-center justify-center gap-3 py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /><span className="text-sm text-slate-400">Generating llms.txt…</span></CardContent></Card>;

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 space-y-1">
            <p className="font-semibold">What is llms.txt?</p>
            <p>The emerging standard (like robots.txt, but for AI) that tells LLM crawlers what your store sells. Supported by ChatGPT, Perplexity, and major AI search engines.</p>
          </div>
        </CardContent>
      </Card>

      {data?.content ? (
        <>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">Generated llms.txt</CardTitle>
              <div className="flex gap-2">
                <CopyButton text={data.content} />
                <Button variant="outline" size="sm" onClick={download} className="gap-1.5"><Download className="w-3.5 h-3.5" />Download</Button>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Regenerate</Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <pre className="bg-slate-50 rounded-md p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-foreground leading-relaxed border border-slate-200">{data.content}</pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm font-semibold">Deploy on Shopify</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2"><span className="font-bold text-foreground w-4">1.</span>Go to <strong className="text-foreground">Online Store → Pages → Add page</strong></li>
                <li className="flex gap-2"><span className="font-bold text-foreground w-4">2.</span>Set title to <code className="bg-muted px-1 rounded">llms</code> (handle becomes <code className="bg-muted px-1 rounded">llms</code>)</li>
                <li className="flex gap-2"><span className="font-bold text-foreground w-4">3.</span>Paste the content above</li>
                <li className="flex gap-2"><span className="font-bold text-foreground w-4">4.</span>Accessible at <code className="bg-muted px-1 rounded">https://{data.domain}/pages/llms</code></li>
              </ol>
            </CardContent>
          </Card>
        </>
      ) : (
        <Button variant="outline" onClick={() => refetch()} className="gap-1.5"><FileText className="w-3.5 h-3.5" />Generate llms.txt</Button>
      )}
    </div>
  );
}

// ─── FAQ tab ──────────────────────────────────────────────────────────────────

function FaqTab({ storeId }: { storeId: string }) {
  const [showSchema, setShowSchema] = useState(false);
  const [copiedSchema, setCopiedSchema] = useState(false);

  const { data: perception, isLoading: percLoading } = useQuery({
    queryKey: ["store-perception", storeId],
    queryFn: () => getStorePerception(storeId),
    enabled: !!storeId,
  });

  const { data: schema, isLoading: schemaLoading, refetch, isFetching } = useQuery({
    queryKey: ["faq-schema", storeId],
    queryFn: () => getFaqSchema(storeId),
    enabled: showSchema && !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  async function copySchema() {
    if (!schema?.jsonLd) return;
    await navigator.clipboard.writeText(`<script type="application/ld+json">\n${schema.jsonLd}\n</script>`);
    setCopiedSchema(true); setTimeout(() => setCopiedSchema(false), 2000);
  }

  const faq = perception?.faqHealth;

  return (
    <div className="space-y-4">
      {/* FAQ page health */}
      {percLoading ? <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div> : perception && (
        <>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                {faq?.found ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                <div>
                  <p className="text-sm font-semibold">{faq?.found ? `FAQ page found: "${faq.title}"` : "No FAQ page found"}</p>
                  <p className="text-xs text-muted-foreground">{faq?.found ? `${faq.questionCount} questions detected` : "Add a page with handle 'faq'"}</p>
                </div>
                {faq?.found && <Badge variant="secondary" className="ml-auto">{faq.questionCount} Q&As</Badge>}
              </div>
              {perception.unansweredQuestions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Questions AI can't answer</p>
                  {perception.unansweredQuestions.map((q, i) => (
                    <div key={i} className="flex gap-2 py-1.5 border-b border-border last:border-0">
                      <span className="text-red-400 text-xs flex-shrink-0">✗</span>
                      <p className="text-xs text-foreground">{q}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          {faq?.unansweredTopics && faq.unansweredTopics.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4 text-amber-500" />Topics not covered</CardTitle></CardHeader>
              <CardContent>
                {faq.unansweredTopics.map((t, i) => (
                  <div key={i} className="flex gap-2 py-2 border-b border-border last:border-0">
                    <span className="text-amber-500 text-xs font-bold flex-shrink-0">?</span>
                    <p className="text-xs text-foreground">{t}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* FAQ Schema generator */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Generate FAQPage JSON-LD</CardTitle>
            {!showSchema && <Button size="sm" onClick={() => setShowSchema(true)} className="gap-1.5"><FileQuestion className="w-3.5 h-3.5" />Generate schema</Button>}
          </div>
        </CardHeader>
        {showSchema && (
          <CardContent>
            {schemaLoading || isFetching ? (
              <div className="flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm text-slate-400">Generating FAQ schema…</span></div>
            ) : schema ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{schema.questionCount} Q&As generated</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={copySchema} className="gap-1.5">
                      {copiedSchema ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedSchema ? "Copied!" : "Copy snippet"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>Regenerate</Button>
                  </div>
                </div>
                {schema.questions.map((q, i) => (
                  <div key={i} className="border border-border rounded-lg p-3">
                    <p className="text-xs font-semibold text-foreground mb-1">{q.question}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{q.answer}</p>
                  </div>
                ))}
                <pre className="bg-slate-50 border border-slate-200 rounded-md p-3 text-[10px] font-mono overflow-x-auto">{`<script type="application/ld+json">\n${schema.jsonLd}\n</script>`}</pre>
              </div>
            ) : null}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ─── Tag Optimizer tab ────────────────────────────────────────────────────────

function TagsTab({ storeId }: { storeId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["store-tag-optimizer", storeId],
    queryFn: () => getStoreTagOptimizer(storeId),
    enabled: !!storeId,
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  if (!data || data.items.length === 0) return (
    <Card className="border-dashed"><CardContent className="py-12 text-center"><Tag className="w-8 h-8 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-400">Run an analysis to get tag suggestions</p></CardContent></Card>
  );

  return (
    <div className="space-y-3">
      {data.productsNeedingAttention > 0 && (
        <Card className="border-amber-200 bg-amber-50"><CardContent className="p-3">
          <p className="text-xs text-amber-800"><strong>{data.productsNeedingAttention} products</strong> have suboptimal tags that may reduce AI retrieval.</p>
        </CardContent></Card>
      )}
      {data.items.map((item) => (
        <Card key={item.productId} className={`border-border ${item.needsAttention ? "border-l-4 border-l-amber-400" : ""}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <Link href={`/products/${item.productId}`}>
                  <p className="text-sm font-semibold text-foreground hover:text-primary cursor-pointer truncate">{item.title}</p>
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">{item.recommendationSummary}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.needsAttention && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                <span className={`text-xs font-bold tabular-nums ${item.tagScore >= 70 ? "text-green-600" : item.tagScore >= 40 ? "text-amber-600" : "text-red-600"}`}>{Math.round(item.tagScore)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">Current tags</p>
                <div className="flex flex-wrap gap-1">
                  {item.currentTags.length > 0
                    ? item.currentTags.map((t) => <Badge key={t} variant={item.genericTags.includes(t) ? "destructive" : "outline"} className="text-[10px] px-1.5 h-5">{t}</Badge>)
                    : <span className="text-xs text-muted-foreground">None</span>}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1.5">Suggested tags</p>
                <div className="flex flex-wrap gap-1">
                  {item.suggestedTags.length > 0
                    ? item.suggestedTags.map((t) => <Badge key={t} variant="secondary" className="text-[10px] px-1.5 h-5 text-primary">{t}</Badge>)
                    : <span className="text-xs text-muted-foreground">None</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Benchmark tab ────────────────────────────────────────────────────────────

function BenchmarkBar({ name, storeScore, benchmarkScore, gap, priority }: { name: string; storeScore: number; benchmarkScore: number; gap: number; priority: string }) {
  const isAhead = gap <= 0;
  const gapColor = isAhead ? "text-green-600" : priority === "high" ? "text-red-600" : priority === "medium" ? "text-amber-600" : "text-blue-600";
  const barColor = isAhead ? "bg-green-500" : priority === "high" ? "bg-red-400" : priority === "medium" ? "bg-amber-400" : "bg-blue-400";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">{name}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">You: <strong>{Math.round(storeScore)}</strong></span>
          <span className="text-xs text-muted-foreground">Target: <strong>{Math.round(benchmarkScore)}</strong></span>
          <span className={`text-xs font-semibold ${gapColor} flex items-center gap-0.5`}>
            {isAhead ? <TrendingUp className="w-3 h-3" /> : gap > 15 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {isAhead ? `+${Math.abs(Math.round(gap))}` : `-${Math.round(gap)}`}
          </span>
        </div>
      </div>
      <div className="relative h-2.5 bg-muted rounded-full overflow-hidden">
        <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/20 z-10" style={{ left: `${benchmarkScore}%` }} />
        <div className={`absolute top-0 bottom-0 left-0 rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, storeScore)}%` }} />
      </div>
    </div>
  );
}

function BenchmarkTab({ storeId }: { storeId: string }) {
  const { data: benchmark, isLoading } = useGetBenchmark(storeId, {
    query: { enabled: !!storeId, queryKey: getGetBenchmarkQueryKey(storeId) },
  });

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>;

  if (!benchmark) return (
    <Card className="border-dashed"><CardContent className="py-12 text-center"><BarChart3 className="w-8 h-8 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">Run an analysis to see benchmarks</p></CardContent></Card>
  );

  const isAspirational = (benchmark as any).benchmarkSource === "aspirational";

  if (isAspirational) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Info className="w-8 h-8 text-blue-300 mx-auto mb-3" />
          <p className="text-sm text-slate-600 font-medium mb-1">Not enough data to compute benchmarks</p>
          <p className="text-xs text-slate-400 max-w-[280px] mx-auto">
            We need at least 10 analyzed stores in the system to compute a real P90 benchmark. Once reached, your scores will be compared against top-tier AI-ready stores.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold text-foreground">{Math.round(benchmark.overallStoreScore)}</p><p className="text-xs text-muted-foreground mt-1">Your Score</p></CardContent></Card>
        <Card className="bg-slate-50"><CardContent className="p-4 text-center">
          <p className="text-3xl font-bold text-foreground">{Math.round(benchmark.overallBenchmarkScore)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {(benchmark as { benchmarkSource?: string }).benchmarkSource === "real-p90"
              ? `P90 of ${(benchmark as { benchmarkSampleSize?: number }).benchmarkSampleSize} analyzed`
              : "Aspirational target"}
          </p>
        </CardContent></Card>
        <Card className={`border ${benchmark.overallGap > 0 ? "border-red-200 bg-red-50/30" : "border-green-200 bg-green-50/30"}`}>
          <CardContent className="p-4 text-center">
            <div className={`flex items-center justify-center gap-1 ${benchmark.overallGap > 0 ? "text-red-600" : "text-green-600"}`}>
              {benchmark.overallGap > 0 ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
              <p className="text-3xl font-bold">{Math.abs(Math.round(benchmark.overallGap))}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{benchmark.overallGap > 0 ? "Points behind" : "Points ahead"}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Dimension Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {(benchmark.dimensions as Array<{ name: string; storeScore: number; benchmarkScore: number; gap: number; priority: string }>)
            .sort((a, b) => b.gap - a.gap)
            .map((dim) => <BenchmarkBar key={dim.name} {...dim} />)}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  if (!activeStoreId) { navigate("/"); return null; }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Tools</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI optimization assets and benchmarking for your store</p>
        </div>
        <Tabs defaultValue="llms-txt">
          <TabsList className="mb-6 bg-slate-100 p-0.5 h-9 flex-wrap">
            <TabsTrigger value="llms-txt" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm"><FileText className="w-3.5 h-3.5" />LLMs.txt</TabsTrigger>
            <TabsTrigger value="faq" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm"><FileQuestion className="w-3.5 h-3.5" />FAQ</TabsTrigger>
            <TabsTrigger value="tags" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm"><Tag className="w-3.5 h-3.5" />Tags</TabsTrigger>
            <TabsTrigger value="benchmark" className="text-xs h-8 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm"><BarChart3 className="w-3.5 h-3.5" />Benchmark</TabsTrigger>
          </TabsList>
          <TabsContent value="llms-txt" className="mt-0"><LlmsTab storeId={activeStoreId} /></TabsContent>
          <TabsContent value="faq" className="mt-0"><FaqTab storeId={activeStoreId} /></TabsContent>
          <TabsContent value="tags" className="mt-0"><TagsTab storeId={activeStoreId} /></TabsContent>
          <TabsContent value="benchmark" className="mt-0"><BenchmarkTab storeId={activeStoreId} /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
