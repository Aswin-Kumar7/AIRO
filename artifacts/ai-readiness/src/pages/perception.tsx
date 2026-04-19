import { useState, useEffect } from "react";
import { useStore } from "@/context/store-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Bot, CheckCircle, HelpCircle, AlertCircle, Target, Save } from "lucide-react";
import { getStorePerception, updateStorePositioning } from "@/lib/insights-api";
import { useToast } from "@/hooks/use-toast";

export default function Perception() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [positioning, setPositioning] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["store-perception", activeStoreId],
    queryFn: () => getStorePerception(activeStoreId!),
    enabled: !!activeStoreId,
  });

  useEffect(() => {
    if (data?.merchantDesiredPositioning !== undefined) {
      setPositioning(data.merchantDesiredPositioning ?? "");
    }
  }, [data?.merchantDesiredPositioning]);

  const saveMutation = useMutation({
    mutationFn: () => updateStorePositioning(activeStoreId!, positioning),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-perception", activeStoreId] });
      toast({ title: "Positioning saved" });
    },
  });

  if (!activeStoreId) { navigate("/"); return null; }

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">AI Perception</h1>
          <p className="text-sm text-muted-foreground mt-0.5">How AI shopping assistants perceive and describe your store</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* Agent narrative */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-violet-500" /> Agent Narrative
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground leading-relaxed italic">"{data.agentNarrative}"</p>
                {data.updatedAt && (
                  <p className="text-[10px] text-muted-foreground mt-3">
                    Updated {new Date(data.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-3 gap-4">
              {/* Strengths */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" /> Perceived Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.perceivedStrengths.length > 0 ? (
                    <ul className="space-y-1.5">
                      {data.perceivedStrengths.map((s, i) => (
                        <li key={i} className="text-xs text-foreground flex gap-2">
                          <span className="text-green-500 flex-shrink-0">+</span>{s}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">Run analysis to see strengths</p>}
                </CardContent>
              </Card>

              {/* Unanswered questions */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-500" /> Unanswered Questions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.unansweredQuestions.length > 0 ? (
                    <ul className="space-y-1.5">
                      {data.unansweredQuestions.map((q, i) => (
                        <li key={i} className="text-xs text-foreground flex gap-2">
                          <span className="text-amber-500 flex-shrink-0">?</span>{q}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">None found</p>}
                </CardContent>
              </Card>

              {/* Ambiguities */}
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" /> Ambiguities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.ambiguities.length > 0 ? (
                    <ul className="space-y-1.5">
                      {data.ambiguities.map((a, i) => (
                        <li key={i} className="text-xs text-foreground flex gap-2">
                          <span className="text-red-500 flex-shrink-0">!</span>{a}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-muted-foreground">None found</p>}
                </CardContent>
              </Card>
            </div>

            {/* Desired positioning */}
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Desired Positioning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Tell us how you want AI agents to describe your store. This guides the perception analysis.
                </p>
                <Textarea
                  placeholder="e.g. Premium sustainable outdoor gear for serious hikers who prioritize durability over price"
                  value={positioning}
                  onChange={(e) => setPositioning(e.target.value)}
                  className="text-sm resize-none"
                  rows={3}
                />
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                  Save positioning
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Run an analysis to see how AI agents perceive your store</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
