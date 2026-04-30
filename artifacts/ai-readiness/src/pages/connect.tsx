import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout";
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
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Store className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Connect your store</h1>
            <p className="text-slate-500 dark:text-zinc-300 text-sm mt-2">Enter your Shopify domain to get started</p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-[#080808] rounded-xl border border-slate-200 dark:border-white/10 shadow-sm p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-1 block">Store domain</label>
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
                <div className="flex items-center gap-2 bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                </div>
              )}
              <Button type="submit" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Zap className="w-3.5 h-3.5" />Connect with Shopify OAuth
              </Button>
            </form>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-slate-400 dark:text-zinc-400 mt-4">
            You'll need a Shopify Admin API token with read_products scope
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
