import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Braces, ExternalLink } from "lucide-react";
import { Link } from "wouter";

type StructuredDataCardProps = {
  structuredData: {
    totalProducts: number;
    missingProductCount: number;
    missingProducts: Array<{ id: string; title: string }>;
  };
};

export function StructuredDataCard({ structuredData }: StructuredDataCardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Braces className="w-4 h-4 text-primary" />
          Structured Data Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {structuredData.totalProducts - structuredData.missingProductCount} / {structuredData.totalProducts} products ready
            </p>
            <p className="text-[11px] text-muted-foreground">
              {structuredData.missingProductCount} products still need Product JSON-LD
            </p>
          </div>
          <Badge variant={structuredData.missingProductCount > 0 ? "destructive" : "secondary"}>
            {structuredData.missingProductCount > 0 ? "Attention" : "Healthy"}
          </Badge>
        </div>

        {structuredData.missingProducts.length > 0 ? (
          <div className="space-y-2">
            {structuredData.missingProducts.slice(0, 5).map((product) => (
              <Link key={product.id} href={`/products/${product.id}`}>
                <div className="flex cursor-pointer items-center justify-between rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:bg-muted/40">
                  <span className="font-medium text-foreground">{product.title}</span>
                  <span className="flex items-center gap-1 text-primary">
                    Add fix
                    <ExternalLink className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Every analyzed product currently has structured-data coverage.</p>
        )}
      </CardContent>
    </Card>
  );
}