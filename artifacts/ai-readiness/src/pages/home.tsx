import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useListStores, useConnectStore, useGetStoreSummary, getGetStoreSummaryQueryKey, getListStoresQueryKey } from "@workspace/api-client-react";
import { useStore } from "@/context/store-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/score-ring";
import { BarChart3, Plus, Store, ArrowRight, Loader2, AlertCircle, Sparkles, CheckCircle, Zap, Shield, Key } from "lucide-react";
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
            <ScoreRing score={summary.overallScore} size={56} />
          )}
          {store.status === "analyzing" && (
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin mt-1" />
          )}
        </div>
        <div className="mt-3 flex items-center text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View dashboard <ArrowRight className="w-3 h-3 ml-1" />
        </div>
      </CardContent>
    </Card>
  );
}

type ConnectMode = "token" | "oauth";

function ConnectStoreDialog({ existingStores }: { existingStores?: Array<{ id: string; domain: string }> }) {
  const [mode, setMode] = useState<ConnectMode>("token");
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
    if (!normalized.endsWith(".myshopify.com")) return "Use your myshopify.com domain, e.g. my-store.myshopify.com";
    return null;
  }

  function goToExistingOrContinue(normalized: string, onContinue: () => void) {
    const existing = existingStores?.find(s => normalize(s.domain) === normalized);
    if (existing) {
      setActiveStoreId(existing.id);
      navigate("/dashboard");
      return;
    }
    onContinue();
  }

  async function handleTokenConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const domainErr = validateDomain(domain);
    if (domainErr) { setError(domainErr); return; }
    if (!accessToken.trim()) { setError("Enter the Admin API access token"); return; }

    const normalized = normalize(domain);
    goToExistingOrContinue(normalized, async () => {
      setIsPending(true);
      try {
        const store = await connectStore.mutateAsync({
          // name is overwritten by the verified Shopify store name on the backend
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
    });
  }

  function handleOAuthConnect(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const domainErr = validateDomain(domain);
    if (domainErr) { setError(domainErr); return; }

    const normalized = normalize(domain);
    goToExistingOrContinue(normalized, () => {
      const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
      window.location.assign(`${apiBase}/shopify/install?shop=${encodeURIComponent(normalized)}`);
    });
  }

  return (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
        <button
          type="button"
          onClick={() => { setMode("token"); setError(""); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${
            mode === "token"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <Key className="w-3 h-3" />
          Admin Token
        </button>
        <button
          type="button"
          onClick={() => { setMode("oauth"); setError(""); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors border-l border-border ${
            mode === "oauth"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="w-3 h-3" />
          Shopify OAuth
        </button>
      </div>

      {/* Domain field — shared */}
      <div>
        <label className="text-xs font-medium text-foreground mb-1 block">Store Domain</label>
        <Input
          placeholder="my-store.myshopify.com"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="text-sm"
          autoFocus
        />
      </div>

      {mode === "token" ? (
        <form onSubmit={handleTokenConnect} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Admin API Access Token</label>
            <Input
              type="password"
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxx"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              Get this from your store admin: <strong>Settings → Apps → Develop apps</strong> → create an app → install it → copy the token. Required scopes: <code className="bg-muted px-1 rounded">read_products</code> <code className="bg-muted px-1 rounded">write_products</code> <code className="bg-muted px-1 rounded">read_content</code> <code className="bg-muted px-1 rounded">write_content</code>
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Key className="w-4 h-4 mr-2" />}
            Connect Store
          </Button>
        </form>
      ) : (
        <form onSubmit={handleOAuthConnect} className="space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            You'll be redirected to Shopify to authorize the app. Requires the redirect URL <code className="bg-muted px-1 rounded">http://localhost:4000/api/shopify/callback</code> to be registered in your Shopify Partners app settings.
          </p>
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" className="w-full">
            <Zap className="w-4 h-4 mr-2" />
            Connect with Shopify
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
    if (!oauthStatus) {
      return;
    }

    const storeId = params.get("storeId");
    const message = params.get("message");
    window.history.replaceState({}, "", `${import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}`);

    if (oauthStatus === "success" && storeId) {
      queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      setActiveStoreId(storeId);
      toast({
        title: "Store connected",
        description: "Shopify OAuth installation completed successfully.",
      });
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

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-primary">AI Readiness Analyzer</span>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3 leading-tight">
            How do AI agents perceive<br />your Shopify store?
          </h1>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl">
            Understand exactly what's preventing AI shopping assistants from confidently recommending your products — and fix it.
          </p>
          <div className="flex flex-wrap gap-2 mb-10">
            {[
              { icon: Sparkles, label: "AI-powered scoring" },
              { icon: AlertCircle, label: "Gap detection" },
              { icon: Zap, label: "Auto-fix generation" },
              { icon: Shield, label: "Benchmark comparison" },
              { icon: CheckCircle, label: "One-click apply" },
            ].map(({ icon: Icon, label }) => (
              <span key={label} className="flex items-center gap-1.5 text-xs font-medium bg-background border border-border rounded-full px-3 py-1 text-foreground">
                <Icon className="w-3 h-3 text-primary" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Connected Stores */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">Your Stores</h2>
              <Button variant="outline" size="sm" onClick={() => setShowConnect(!showConnect)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Connect Store
              </Button>
            </div>

            {showConnect && (
              <Card className="mb-4 border-primary/30 bg-primary/5">
                <CardHeader className="pb-3 pt-4 px-4">
                  <CardTitle className="text-sm">Connect Shopify Store</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ConnectStoreDialog existingStores={stores} />
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading stores...
              </div>
            ) : stores && stores.filter(s => s.domain !== "demo-store.myshopify.com").length > 0 ? (
              <div className="space-y-2">
                {stores.filter(s => s.domain !== "demo-store.myshopify.com").map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 border border-dashed border-border rounded-xl">
                <Store className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No stores connected yet</p>
                <Button variant="link" size="sm" className="mt-1" onClick={() => setShowConnect(true)}>
                  Connect your first store
                </Button>
              </div>
            )}
          </div>

          {/* Demo Mode */}
          <div>
            <h2 className="font-semibold text-foreground mb-4">Try with Demo Store</h2>
            {demoStore ? (
              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Artisan Home Demo Store</p>
                      <p className="text-xs text-muted-foreground">Pre-analyzed with real AI insights</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: "AI Score", value: "58/100" },
                      { label: "Products", value: "5" },
                      { label: "Issues", value: "12" },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center p-2 bg-background rounded-lg border border-border">
                        <p className="text-sm font-bold text-foreground">{value}</p>
                        <p className="text-[10px] text-muted-foreground">{label}</p>
                      </div>
                    ))}
                  </div>
                  <Button className="w-full" onClick={handleDemoMode}>
                    Explore Demo
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-5 text-center text-muted-foreground text-sm">
                  {isLoading ? "Loading..." : "Demo store unavailable"}
                </CardContent>
              </Card>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">How it works</h3>
              <div className="space-y-3">
                {[
                  { step: "1", title: "Connect your store", desc: "Authorize via Shopify Admin API" },
                  { step: "2", title: "AI analyzes your products", desc: "GPT evaluates clarity, completeness, and trust signals" },
                  { step: "3", title: "Get a ranked action plan", desc: "Prioritized issues with AI-generated fixes" },
                  { step: "4", title: "Apply fixes instantly", desc: "One-click or bulk apply improvements" },
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
          </div>
        </div>
      </div>
    </div>
  );
}
