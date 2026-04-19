import { useState } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/context/store-context";
import { useConnectStore } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, Key, Loader2, ChevronDown, Zap, Store } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [accessToken, setAccessToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const connectStore = useConnectStore();
  const { setActiveStoreId } = useStore();
  const [, navigate] = useLocation();

  function handleOAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validateDomain(domain);
    if (err) { setError(err); return; }
    window.location.assign(`${API_BASE}/shopify/install?shop=${encodeURIComponent(normalize(domain))}`);
  }

  async function handleToken(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validateDomain(domain);
    if (err) { setError(err); return; }
    if (!accessToken.trim()) { setError("Enter the Admin API access token"); return; }
    setIsPending(true);
    try {
      const store = await connectStore.mutateAsync({
        data: { domain: normalize(domain), accessToken: accessToken.trim(), name: normalize(domain) },
      });
      setActiveStoreId(store.id);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed — check your domain and token.");
    } finally {
      setIsPending(false);
    }
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
              {error && !showAdvanced && (
                <div className="flex items-center gap-2 text-red-600 text-xs mb-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                </div>
              )}
              <Button type="submit" className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700">
                <Zap className="w-3.5 h-3.5" />Connect with Shopify OAuth
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors mx-auto"
            >
              <Key className="w-3 h-3" />Use Admin API token
              <ChevronDown className={cn("w-3 h-3 transition-transform", showAdvanced ? "" : "-rotate-90")} />
            </button>

            {showAdvanced && (
              <form onSubmit={handleToken} className="space-y-2.5 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Admin API Access Token</label>
                  <Input
                    type="password"
                    placeholder="shpat_xxxxxxxxxxxx"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="text-sm font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Settings → Apps → Develop apps</p>
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                  </div>
                )}
                <Button type="submit" variant="outline" className="w-full gap-2" disabled={isPending}>
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  Connect with token
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
