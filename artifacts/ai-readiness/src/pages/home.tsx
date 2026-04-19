import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useListStores, useConnectStore, useGetStoreSummary, getGetStoreSummaryQueryKey, getListStoresQueryKey } from "@workspace/api-client-react";
import { useStore } from "@/context/store-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreRing } from "@/components/score-ring";
import { BarChart3, Store, ArrowRight, Loader2, AlertCircle, Sparkles, CheckCircle, Zap, Shield, Key, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function StoreCard({ store }: { store: { id: string; name: string; domain: string; status: string; productCount?: number | null } }) {
  const [, navigate] = useLocation();
  const { setActiveStoreId } = useStore();
  const { data: summary } = useGetStoreSummary(store.id, {
    query: { enabled: store.status === "analyzed", queryKey: getGetStoreSummaryQueryKey(store.id) },
  });

  function handleSelect() {
    setActiveStoreId(store.id);
    navigate("/dashboard");
  }

  const statusColors: Record<string, string> = {
    connected: "bg-blue-100 text-blue-700",
    analyzing: "bg-amber-100 text-amber-700",
    analyzed: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };

  return (
    <Card className="cursor-pointer hover:shadow-md transition-all border-border group" onClick={handleSelect}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Store className="w-4 h-4 text-primary flex-shrink-0" />
              <p className="font-semibold text-sm truncate">{store.name}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">{store.domain}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[store.status] ?? "bg-muted text-muted-foreground"}`}>
                {store.status}
              </span>
              {store.productCount && <span className="text-[10px] text-muted-foreground">{store.productCount} products</span>}
            </div>
          </div>
          {store.status === "analyzed" && summary && (
            <ScoreRing score={summary.overallScore} size={52} />
          )}
          {store.status === "analyzing" && (
            <Loader2 className="w-5 h-5 text-amber-500 animate-spin mt-1" />
          )}
        </div>
        <div className="mt-3 flex items-center text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          Open dashboard <ArrowRight className="w-3 h-3 ml-1" />
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectStoreForm({ existingStores }: { existingStores?: Array<{ id: string; domain: string }> }) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [domain, setDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const connectStore = useConnectStore();
  const { setActiveStoreId } = useStore();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  function normalize(raw: string): string {
    return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  }

  function validateDomain(raw: string): string | null {
    const normalized = normalize(raw);
    if (!normalized) return "Enter your Shopify store domain";
    if (!normalized.endsWith(".myshopify.com")) return "Use your myshopify.com domain — e.g. my-store.myshopify.com";
    return null;
  }

  function checkExisting(normalized: string): boolean {
    const existing = existingStores?.find(s => normalize(s.domain) === normalized);
    if (existing) {
      setActiveStoreId(existing.id);
      navigate("/dashboard");
      return true;
    }
    return false;
  }

  function handleOAuthConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validateDomain(domain);
    if (err) { setError(err); return; }
    const normalized = normalize(domain);
    if (checkExisting(normalized)) return;
    const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
    window.location.assign(`${apiBase}/shopify/install?shop=${encodeURIComponent(normalized)}`);
  }

  async function handleTokenConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const err = validateDomain(domain);
    if (err) { setError(err); return; }
    if (!accessToken.trim()) { setError("Enter the Admin API access token"); return; }
    const normalized = normalize(domain);
    if (checkExisting(normalized)) return;
    setIsPending(true);
    try {
      const store = await connectStore.mutateAsync({
        data: { domain: normalized, accessToken: accessToken.trim(), name: normalized },
      });
      queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      setActiveStoreId(store.id);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect. Check your domain and token.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Domain field — always visible */}
      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">Store domain</label>
        <Input
          placeholder="my-store.myshopify.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="text-sm"
          autoFocus
        />
      </div>

      {/* Primary action: OAuth */}
      <form onSubmit={handleOAuthConnect}>
        {error && !showAdvanced && (
          <div className="flex items-center gap-2 text-destructive text-xs mb-2">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {error}
          </div>
        )}
        <Button type="submit" className="w-full" size="sm">
          <Zap className="w-3.5 h-3.5 mr-1.5" />
          Connect with Shopify
        </Button>
      </form>

      {/* Advanced: Admin Token (collapsed) */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mx-auto"
      >
        <Key className="w-3 h-3" />
        Advanced: use Admin API token
        <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? "" : "-rotate-90"}`} />
      </button>

      {showAdvanced && (
        <form onSubmit={handleTokenConnect} className="space-y-2 pt-1 border-t border-border">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Admin API Access Token</label>
            <Input
              type="password"
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              From your store admin: <strong>Settings → Apps → Develop apps</strong>. Required scopes: <code className="bg-muted px-1 rounded">read_products</code> <code className="bg-muted px-1 rounded">write_products</code>
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" variant="outline" size="sm" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Key className="w-3.5 h-3.5 mr-1.5" />}
            Connect with token
          </Button>
        </form>
      )}
    </div>
  );
}

export default function Home() {
  const { data: stores, isLoading } = useListStores();
  const { setActiveStoreId } = useStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showConnect, setShowConnect] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("shopify");
    if (!oauthStatus) return;

    const storeId = params.get("storeId");
    const message = params.get("message");
    window.history.replaceState({}, "", `${import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}`);

    if (oauthStatus === "success" && storeId) {
      queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      setActiveStoreId(storeId);
      toast({ title: "Store connected", description: "Shopify OAuth completed successfully." });
      navigate("/dashboard");
      return;
    }

    toast({
      title: "Shopify install failed",
      description: message ?? "The Shopify OAuth flow did not complete successfully.",
      variant: "destructive",
    });
  }, [navigate, queryClient, setActiveStoreId, toast]);

  function handleDemoMode() {
    const demoStore = stores?.find(s => s.domain === "demo-store.myshopify.com");
    if (demoStore) {
      setActiveStoreId(demoStore.id);
      navigate("/dashboard");
    }
  }

  const demoStore = stores?.find(s => s.domain === "demo-store.myshopify.com");
  const realStores = stores?.filter(s => s.domain !== "demo-store.myshopify.com") ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary/8 via-background to-background border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-primary">AI Readiness Analyzer</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2 leading-tight">
            How do AI agents perceive your Shopify store?
          </h1>
          <p className="text-muted-foreground text-base mb-6 max-w-lg">
            Find exactly what's preventing AI shopping assistants from recommending your products — with evidence-backed analysis and one-click fixes.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { icon: Sparkles, label: "Hybrid rule + AI scoring" },
              { icon: AlertCircle, label: "Evidence-backed gaps" },
              { icon: Zap, label: "Auto-fix generation" },
              { icon: Shield, label: "Benchmark comparison" },
              { icon: CheckCircle, label: "Shopify write-back" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1 text-foreground">
                <Icon className="w-3 h-3 text-primary" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: store list + connect */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground text-sm">
                {realStores.length > 0 ? "Your Stores" : "Connect a store"}
              </h2>
              {realStores.length > 0 && (
                <button
                  onClick={() => setShowConnect(!showConnect)}
                  className="text-xs text-primary hover:underline"
                >
                  + Add another
                </button>
              )}
            </div>

            {/* Connect form — shown inline when no stores or toggled */}
            {(showConnect || realStores.length === 0) && (
              <Card className={`mb-4 ${realStores.length === 0 ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                <CardContent className="p-4">
                  {realStores.length === 0 && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Connect your Shopify store to get started. OAuth is the easiest option.
                    </p>
                  )}
                  <ConnectStoreForm existingStores={stores} />
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-sm">Loading stores…</span>
              </div>
            ) : (
              <div className="space-y-2">
                {realStores.map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
              </div>
            )}
          </div>

          {/* Right: how it works + demo */}
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">How it works</h3>
              <div className="space-y-3">
                {[
                  { step: "1", title: "Connect your store", desc: "One-click Shopify OAuth or paste an Admin API token" },
                  { step: "2", title: "Hybrid analysis runs", desc: "Rule engine + AI evaluates clarity, completeness, and trust signals" },
                  { step: "3", title: "Get evidence-backed gaps", desc: "Each issue shows exactly what was found and why it matters" },
                  { step: "4", title: "Apply AI-generated fixes", desc: "Edit and push improvements directly to Shopify" },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{title}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {demoStore && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Try the demo</h3>
                <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background cursor-pointer" onClick={handleDemoMode}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Artisan Home Demo Store</p>
                        <p className="text-xs text-muted-foreground">Pre-analyzed with real AI insights</p>
                      </div>
                    </div>
                    <Button size="sm" className="w-full">
                      Explore Demo <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
