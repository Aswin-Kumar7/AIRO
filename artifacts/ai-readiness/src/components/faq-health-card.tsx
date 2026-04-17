import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CircleHelp, FileQuestion } from "lucide-react";

type FaqHealthCardProps = {
  faqHealth: {
    found: boolean;
    title: string | null;
    questionCount: number;
    unansweredTopics: string[];
  };
};

export function FaqHealthCard({ faqHealth }: FaqHealthCardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CircleHelp className="w-4 h-4 text-primary" />
          FAQ Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {faqHealth.found ? faqHealth.title ?? "FAQ found" : "No FAQ detected"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {faqHealth.questionCount} likely question{faqHealth.questionCount === 1 ? "" : "s"} covered
            </p>
          </div>
          <Badge variant={faqHealth.found ? "secondary" : "destructive"}>
            {faqHealth.found ? "Healthy" : "Missing"}
          </Badge>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-foreground">Topics still not addressed</p>
          {faqHealth.unansweredTopics.length > 0 ? (
            <div className="space-y-2">
              {faqHealth.unansweredTopics.map((topic) => (
                <div key={topic} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground">
                  <FileQuestion className="h-3.5 w-3.5 text-amber-500" />
                  {topic}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Common AI-agent FAQ topics are covered.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}