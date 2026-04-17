import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Bot, Loader2, MessageSquareQuote, Target } from "lucide-react";

type PerceptionPanelProps = {
  agentNarrative: string;
  perceivedStrengths: string[];
  unansweredQuestions: string[];
  ambiguities: string[];
  desiredPositioning: string;
  onDesiredPositioningChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  updatedAt: string | null;
};

function InsightList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item} className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground">
          {item}
        </div>
      ))}
    </div>
  );
}

export function PerceptionPanel({
  agentNarrative,
  perceivedStrengths,
  unansweredQuestions,
  ambiguities,
  desiredPositioning,
  onDesiredPositioningChange,
  onSave,
  isSaving,
  updatedAt,
}: PerceptionPanelProps) {
  return (
    <Card className="border-border col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          AI Perception Simulator
        </CardTitle>
        {updatedAt ? (
          <p className="text-[11px] text-muted-foreground">
            Updated {new Date(updatedAt).toLocaleString()}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <MessageSquareQuote className="w-4 h-4 text-primary" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                How AI currently sees your store
              </p>
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {agentNarrative || "Run an analysis to generate the store perception narrative."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {perceivedStrengths.map((strength) => (
              <Badge key={strength} variant="secondary" className="bg-green-100 text-green-700">
                {strength}
              </Badge>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold text-foreground">Unanswered questions</p>
              <ScrollArea className="h-48 rounded-lg border border-border bg-background p-3">
                <InsightList
                  items={unansweredQuestions}
                  emptyLabel="No major unanswered questions were flagged."
                />
              </ScrollArea>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-foreground">Ambiguities</p>
              <ScrollArea className="h-48 rounded-lg border border-border bg-background p-3">
                <InsightList items={ambiguities} emptyLabel="No major ambiguities were flagged." />
              </ScrollArea>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              How you want to be represented
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Save the tone, positioning, and buyer promise you want the perception simulator to optimize for.
          </p>
          <Textarea
            value={desiredPositioning}
            onChange={(event) => onDesiredPositioningChange(event.target.value)}
            placeholder="Example: Premium, design-led home goods brand with transparent materials, fast shipping, and gift-ready presentation."
            className="min-h-[220px] bg-background"
          />
          <div className="flex justify-end">
            <Button onClick={onSave} disabled={isSaving} size="sm">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save positioning
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}