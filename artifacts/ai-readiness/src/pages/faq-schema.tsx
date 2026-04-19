import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, HelpCircle, Copy, Check, ChevronDown, ChevronUp, Code2 } from "lucide-react";
import { getFaqSchema } from "@/lib/features-api";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : label}
    </Button>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left gap-3"
      >
        <span className="text-sm font-medium text-foreground">{question}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {open && (
        <p className="pb-3 text-sm text-muted-foreground leading-relaxed">{answer}</p>
      )}
    </div>
  );
}

const DEPLOY_SNIPPET = (jsonLd: string) =>
  `<script type="application/ld+json">\n${jsonLd}\n</script>`;

export default function FaqSchema() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const [showCode, setShowCode] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["faq-schema", activeStoreId],
    queryFn: () => getFaqSchema(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 5 * 60 * 1000,
  });

  if (!activeStoreId) { navigate("/"); return null; }

  const snippet = data?.jsonLd ? DEPLOY_SNIPPET(data.jsonLd) : "";

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              FAQ Schema Generator
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Auto-generated FAQPage JSON-LD markup — paste directly into Shopify
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Regenerate"}
          </Button>
        </div>

        {isLoading || isFetching ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Generating FAQ schema…</p>
                <p className="text-xs text-muted-foreground mt-1">Creating customer Q&A pairs from your product catalog</p>
              </div>
            </CardContent>
          </Card>
        ) : data && data.questions.length > 0 ? (
          <>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">
                  {data.questionCount} Questions Generated
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {data.questions.map((qa, i) => (
                  <FaqItem key={i} question={qa.question} answer={qa.answer} />
                ))}
              </CardContent>
            </Card>

            {/* JSON-LD code */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Code2 className="w-4 h-4" />
                  FAQPage JSON-LD Markup
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)} className="text-xs">
                    {showCode ? "Hide code" : "Show code"}
                  </Button>
                  <CopyButton text={snippet} label="Copy snippet" />
                </div>
              </CardHeader>
              {showCode && (
                <CardContent className="px-4 pb-4">
                  <pre className="bg-muted rounded-md p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-foreground leading-relaxed">
                    {snippet}
                  </pre>
                </CardContent>
              )}
            </Card>

            {/* Deploy instructions */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">How to add to Shopify</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ol className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">1.</span>Copy the snippet above</li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">2.</span>In Shopify admin, go to <strong className="text-foreground">Online Store → Themes → Edit code</strong></li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">3.</span>Open <code className="bg-muted px-1 rounded">layout/theme.liquid</code> and paste the snippet before <code className="bg-muted px-1 rounded">&lt;/head&gt;</code> on your FAQ or homepage</li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">4.</span>Alternatively, add it to a specific product or collection page template</li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">5.</span>Validate at <strong className="text-foreground">schema.org validator</strong> or Google Rich Results Test</li>
                </ol>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <HelpCircle className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Could not generate FAQ schema. Make sure you have products connected.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
