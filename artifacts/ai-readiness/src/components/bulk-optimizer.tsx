import { useMemo, useState } from "react";
import {
  getGetStoreSummaryQueryKey,
  getListFixesQueryKey,
  getListProductsQueryKey,
  useBulkApplyFixes,
  useListFixes,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Wand2 } from "lucide-react";
import { Link } from "wouter";

type BulkOptimizerProps = {
  storeId: string;
};

type ProductFixGroup = {
  key: string;
  productId: string | null;
  label: string;
  fixIds: string[];
  fixTypes: string[];
  estimatedScoreGain: number;
};

export function BulkOptimizer({ storeId }: BulkOptimizerProps) {
  const queryClient = useQueryClient();
  const bulkApply = useBulkApplyFixes();
  const { data: fixes, isLoading } = useListFixes(storeId, {
    query: { enabled: !!storeId, queryKey: getListFixesQueryKey(storeId) },
  });
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const pendingGroups = useMemo(() => {
    const groups = new Map<string, ProductFixGroup>();

    for (const fix of fixes ?? []) {
      if (fix.status !== "pending") {
        continue;
      }

      const key = fix.productId ?? `store:${fix.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.fixIds.push(fix.id);
        existing.fixTypes.push(fix.type);
        existing.estimatedScoreGain += fix.estimatedScoreImprovement;
        continue;
      }

      groups.set(key, {
        key,
        productId: fix.productId ?? null,
        label: fix.productTitle ?? "Store-wide fixes",
        fixIds: [fix.id],
        fixTypes: [fix.type],
        estimatedScoreGain: fix.estimatedScoreImprovement,
      });
    }

    return Array.from(groups.values()).sort((left, right) => right.estimatedScoreGain - left.estimatedScoreGain);
  }, [fixes]);

  const selectedFixIds = pendingGroups
    .filter((group) => selectedGroups.has(group.key))
    .flatMap((group) => group.fixIds);
  const selectedScoreGain = pendingGroups
    .filter((group) => selectedGroups.has(group.key))
    .reduce((sum, group) => sum + group.estimatedScoreGain, 0);

  function toggleGroup(key: string) {
    setSelectedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleBulkApply() {
    if (selectedFixIds.length === 0) {
      return;
    }

    await bulkApply.mutateAsync({
      storeId,
      data: { fixIds: selectedFixIds },
    });

    setSelectedGroups(new Set());
    queryClient.invalidateQueries({ queryKey: getListFixesQueryKey(storeId) });
    queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(storeId) });
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(storeId) });
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-primary" />
          Bulk Optimizer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pendingGroups.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-foreground">Select products to auto-apply</p>
                <p className="text-[11px] text-muted-foreground">
                  {pendingGroups.length} products with pending fixes
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedGroups(new Set(pendingGroups.map((group) => group.key)))}
                >
                  Select all
                </Button>
                <Button size="sm" onClick={handleBulkApply} disabled={bulkApply.isPending || selectedFixIds.length === 0}>
                  {bulkApply.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply selected
                </Button>
              </div>
            </div>

            {selectedFixIds.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {selectedFixIds.length} fixes selected across {selectedGroups.size} products. Estimated gain +{Math.round(selectedScoreGain)} points.
              </p>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Product</TableHead>
                  <TableHead>Pending fixes</TableHead>
                  <TableHead>Potential lift</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingGroups.slice(0, 6).map((group) => (
                  <TableRow key={group.key}>
                    <TableCell>
                      <Checkbox
                        checked={selectedGroups.has(group.key)}
                        onCheckedChange={() => toggleGroup(group.key)}
                        aria-label={`Select ${group.label}`}
                      />
                    </TableCell>
                    <TableCell>
                      {group.productId ? (
                        <Link href={`/products/${group.productId}`}>
                          <span className="cursor-pointer text-sm font-medium text-foreground hover:text-primary">
                            {group.label}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-foreground">{group.label}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set(group.fixTypes)).map((fixType) => (
                          <Badge key={`${group.key}-${fixType}`} variant="outline" className="capitalize">
                            {fixType}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-green-700">
                      +{Math.round(group.estimatedScoreGain)} pts
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No pending fixes are available for bulk optimization.</p>
        )}
      </CardContent>
    </Card>
  );
}