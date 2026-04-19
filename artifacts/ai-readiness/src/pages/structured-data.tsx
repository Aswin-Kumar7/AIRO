import { useStore } from "@/context/store-context";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Layers, CheckCircle, XCircle, Package } from "lucide-react";
import { getStorePerception } from "@/lib/insights-api";

export default function StructuredData() {
  const { activeStoreId } = useStore();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["store-perception", activeStoreId],
    queryFn: () => getStorePerception(activeStoreId!),
    enabled: !!activeStoreId,
  });

  if (!activeStoreId) { navigate("/"); return null; }

  const sd = data?.structuredData;
  const coverage = sd ? Math.round(((sd.totalProducts - sd.missingProductCount) / Math.max(sd.totalProducts, 1)) * 100) : 0;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-foreground">Structured Data</h1>
          <p className="text-sm text-muted-foreground mt-0.5">JSON-LD Product markup coverage across your catalog</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : sd ? (
          <div className="space-y-4">
            {/* Coverage summary */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Products", value: sd.totalProducts, color: "text-foreground" },
                { label: "With Schema", value: sd.totalProducts - sd.missingProductCount, color: "text-green-600" },
                { label: "Missing", value: sd.missingProductCount, color: "text-red-600" },
              ].map(({ label, value, color }) => (
                <Card key={label} className="border-border">
                  <CardContent className="p-4 text-center">
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Coverage bar */}
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-foreground">Schema.org coverage</p>
                  <p className="text-xs font-bold text-foreground">{coverage}%</p>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${coverage >= 80 ? "bg-green-500" : coverage >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${coverage}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  JSON-LD Product markup lets AI systems parse price, brand, and availability directly — without relying on description text.
                </p>
              </CardContent>
            </Card>

            {/* Products missing schema */}
            {sd.missingProducts.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-500" /> Products missing JSON-LD
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {sd.missingProducts.map((p) => (
                      <Link key={p.id} href={`/products/${p.id}`}>
                        <div className="flex items-center gap-2 py-1.5 border-b border-border last:border-0 hover:bg-accent/50 rounded px-1 -mx-1 cursor-pointer transition-colors">
                          <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-foreground hover:text-primary">{p.title}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Use the Quick Fix sheet on each product to auto-generate JSON-LD markup.
                  </p>
                </CardContent>
              </Card>
            )}

            {sd.missingProductCount === 0 && (
              <Card className="border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <p className="text-sm text-foreground">All products have JSON-LD structured data.</p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Layers className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Run an analysis to check structured data coverage</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
