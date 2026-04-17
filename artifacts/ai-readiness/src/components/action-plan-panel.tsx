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
import type { ActionPlanItem } from "@/lib/insights-api";
import { ListOrdered } from "lucide-react";
import { Link } from "wouter";

const severityStyles: Record<ActionPlanItem["severity"], string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-blue-100 text-blue-700",
};

export function ActionPlanPanel({ items }: { items: ActionPlanItem[] }) {
  return (
    <Card className="border-border col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-primary" />
          Prioritized Action Plan
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gap</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Conversion impact</TableHead>
                <TableHead>Suggested fix</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 8).map((item) => (
                <TableRow key={item.gapId}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{item.gap}</p>
                      {item.productId && item.productTitle ? (
                        <Link href={`/products/${item.productId}`}>
                          <span className="cursor-pointer text-xs text-primary hover:underline">
                            {item.productTitle}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground capitalize">{item.category}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={severityStyles[item.severity]}>{item.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.conversionImpact}</TableCell>
                  <TableCell className="text-xs text-foreground">{item.suggestedFix}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">Run an analysis to build a prioritized action plan.</p>
        )}
      </CardContent>
    </Card>
  );
}