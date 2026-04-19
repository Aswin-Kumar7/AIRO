import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileQuestion, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { getStorePerception } from "@/lib/insights-api";
import { Badge } from "@/components/ui/badge";

export default function FaqHealth() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["store-perception", activeStoreId],
    queryFn: () => getStorePerception(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!activeStoreId) { navigate("/"); return null; }

  const faq = data?.faqHealth;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">FAQ & Policies</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Coverage of common customer questions and store policies</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* FAQ page status */}
            <Card className="border-border">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  {faq?.found ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {faq?.found ? `FAQ page found: "${faq.title}"` : "No FAQ page found"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {faq?.found
                        ? `${faq.questionCount} questions detected`
                        : "Add a page with handle 'faq' to cover common questions"}
                    </p>
                  </div>
                  {faq?.found && (
                    <Badge variant="secondary" className="ml-auto">{faq.questionCount} Q&As</Badge>
                  )}
                </div>

                {faq?.found && faq.questionCount === 0 && (
                  <div className="text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-3 text-amber-800 dark:text-amber-300">
                    FAQ page exists but no questions were detected. Make sure questions use standard formatting (e.g. H2/H3 headings or bold text).
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Unanswered topics */}
            {faq?.unansweredTopics && faq.unansweredTopics.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-amber-500" /> Topics not covered
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    AI agents couldn't find answers to these common questions from your store.
                  </p>
                  <div className="space-y-2">
                    {faq.unansweredTopics.map((topic, i) => (
                      <div key={i} className="flex gap-2 items-start py-2 border-b border-border last:border-0">
                        <span className="text-amber-500 text-xs font-bold flex-shrink-0 mt-0.5">?</span>
                        <p className="text-xs text-foreground">{topic}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Unanswered questions from perception */}
            {data.unansweredQuestions.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileQuestion className="w-4 h-4 text-red-500" /> Shopper questions AI can't answer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.unansweredQuestions.map((q, i) => (
                      <div key={i} className="flex gap-2 items-start py-2 border-b border-border last:border-0">
                        <span className="text-red-400 text-xs flex-shrink-0 mt-0.5">✗</span>
                        <p className="text-xs text-foreground">{q}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <FileQuestion className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Run an analysis to see FAQ and policy coverage</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
