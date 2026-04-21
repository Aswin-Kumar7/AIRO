import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/context/store-context";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Zap, Store } from "lucide-react";
const API_BASE = `${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api`;

function normalize(raw: string) {
  return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
}

function validateDomain(raw: string): string | null {
  const n = normalize(raw);
  if (!n) return "Enter your Shopify store domain";
  if (!n.endsWith(".myshopify.com")) return "Use the format: my-store.myshopify.com";
  return null;
}

export default function ConnectStore() {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    const pending = sessionStorage.getItem("pendingStoreUrl");
    if (pending) {
      setDomain(pending);
      sessionStorage.removeItem("pendingStoreUrl");
    }
  }, []);

  function handleOAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validateDomain(domain);
    if (err) { setError(err); return; }
    window.location.assign(`${API_BASE}/shopify/install?shop=${encodeURIComponent(normalize(domain))}`);
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900">Connect a store</h1>
          <p className="text-sm text-slate-500 mt-0.5">Add a Shopify store to analyze its AI readiness</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Store className="w-4 h-4 text-indigo-500" /> Shopify store
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-700 mb-1 block">Store domain</label>
              <Input
                placeholder="my-store.myshopify.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="text-sm"
                autoFocus
              />
            </div>

            <form onSubmit={handleOAuth}>
              {error && (
                <div className="flex items-center gap-2 text-red-600 text-xs mb-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                </div>
              )}
              <Button type="submit" className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Zap className="w-3.5 h-3.5" />Connect with Shopify OAuth
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
