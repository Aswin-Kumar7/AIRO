import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Copy, Check, Download, Info } from "lucide-react";
import { getLlmsTxt } from "@/lib/features-api";
import { useToast } from "@/hooks/use-toast";

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

export default function LlmsTxt() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["llms-txt", activeStoreId],
    queryFn: () => getLlmsTxt(activeStoreId!),
    enabled: !!activeStoreId,
    staleTime: 5 * 60 * 1000,
  });

  if (!activeStoreId) { navigate("/"); return null; }

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

  const deploySnippet = data?.content
    ? `<!-- Add this to your Shopify theme's <head> or serve at https://${data.domain}/llms.txt -->\n<!-- Shopify: create a new page with handle "llms-txt" and paste the content below -->`
    : "";

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              LLMs.txt Generator
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Help AI crawlers (ChatGPT, Perplexity, Claude) understand your brand and catalog
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Regenerate"}
          </Button>
        </div>

        {/* What is llms.txt */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
          <CardContent className="p-4 flex gap-3">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <p className="font-semibold">What is llms.txt?</p>
              <p>The emerging standard (like robots.txt, but for AI) that tells LLM crawlers what your store sells, your brand identity, and your policies. Supported by ChatGPT, Perplexity, and major AI search engines.</p>
              <p>Place it at <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://{data?.domain ?? "yourstore.com"}/llms.txt</code></p>
            </div>
          </CardContent>
        </Card>

        {isLoading || isFetching ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-3 py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Generating your llms.txt…</span>
            </CardContent>
          </Card>
        ) : data?.content ? (
          <>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Generated llms.txt</CardTitle>
                <div className="flex gap-2">
                  <CopyButton text={data.content} label="Copy content" />
                  <Button variant="outline" size="sm" onClick={download} className="gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <pre className="bg-muted rounded-md p-4 text-xs font-mono whitespace-pre-wrap overflow-x-auto text-foreground leading-relaxed">
                  {data.content}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">How to deploy on Shopify</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <ol className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">1.</span>In your Shopify admin, go to <strong className="text-foreground">Online Store → Pages → Add page</strong></li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">2.</span>Set the page title to <code className="bg-muted px-1 rounded">llms</code> (handle becomes <code className="bg-muted px-1 rounded">llms</code>)</li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">3.</span>Paste the content above into the page body</li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">4.</span>Your file will be accessible at <code className="bg-muted px-1 rounded">https://{data.domain}/pages/llms</code></li>
                  <li className="flex gap-2"><span className="font-bold text-foreground w-4 flex-shrink-0">5.</span>For a clean <code className="bg-muted px-1 rounded">/llms.txt</code> URL, use a URL redirect in your Shopify admin or a custom app proxy</li>
                </ol>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16">
              <FileText className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Failed to generate. Try again.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
