import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TagOptimizerResponse } from "@/lib/insights-api";
import { Tags } from "lucide-react";
import { Link } from "wouter";

function TagPill({ tag, tone }: { tag: string; tone: "muted" | "accent" | "warning" }) {
  const className =
    tone === "accent"
      ? "bg-green-100 text-green-700 border-green-200"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-muted text-muted-foreground border-border";

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${className}`}>{tag}</span>;
}

export function TagOptimizerPanel({ data }: { data: TagOptimizerResponse | undefined }) {
  const items = data?.items.slice(0, 6) ?? [];

  return (
    <Card className="border-border col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Tags className="w-4 h-4 text-primary" />
          Tag Optimizer
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Current tags</TableHead>
                <TableHead>Suggested tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>
                    <div className="space-y-1">
                      <Link href={`/products/${item.productId}`}>
                        <span className="cursor-pointer text-sm font-medium text-foreground hover:text-primary">
                          {item.title}
                        </span>
                      </Link>
                      <p className="text-xs text-muted-foreground">Tag score {Math.round(item.tagScore)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {item.currentTags.length > 0 ? (
                        item.currentTags.slice(0, 5).map((tag) => (
                          <TagPill
                            key={`${item.productId}-current-${tag}`}
                            tag={tag}
                            tone={item.genericTags.includes(tag) ? "warning" : "muted"}
                          />
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">No tags yet</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {item.suggestedTags.length > 0 ? (
                          item.suggestedTags.slice(0, 5).map((tag) => (
                            <TagPill key={`${item.productId}-suggested-${tag}`} tag={tag} tone="accent" />
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">No AI suggestions yet</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.recommendationSummary}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Run an analysis to generate current vs suggested tags.</p>
        )}
      </CardContent>
    </Card>
  );
}