import { useState } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/context/store-context";
import { useConnectStore } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart3, Store, Zap, Key, AlertCircle, Loader2, ChevronDown, ArrowRight, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { id: "connect", label: "Connect store" },
  { id: "done", label: "Ready" },
];

const API_BASE = `${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api`;

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState<"connect" | "done">("connect");
  const [domain, setDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const connectStore = useConnectStore();
  const { setActiveStoreId } = useStore();
  const [, navigate] = useLocation();

  function normalize(raw: string) {
    return raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  }

  function validateDomain(raw: string): string | null {
    const n = normalize(raw);
    if (!n) return "Enter your Shopify store domain";
    if (!n.endsWith(".myshopify.com")) return "Use the format: my-store.myshopify.com";
    return null;
  }

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
      const store = await connectStore.mutateAsync({ data: { domain: normalize(domain), accessToken: accessToken.trim(), name: normalize(domain) } });
      setActiveStoreId(store.id);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed — check your domain and token.");
    } finally {
      setIsPending(false);
    }
  }

  function handleFinish() {
    onClose();
    navigate("/dashboard");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Connect your store</DialogTitle>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center"><BarChart3 className="w-4 h-4 text-white" /></div>
            <span className="text-sm font-bold text-slate-900">Get started</span>
          </div>
          {/* Step indicators */}
          <div className="flex items-center gap-2 mt-3">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                  step === s.id ? "bg-indigo-600 text-white" :
                    (STEPS.findIndex(x => x.id === step) > i) ? "bg-green-500 text-white" : "bg-slate-100 text-slate-400"
                )}>
                  {(STEPS.findIndex(x => x.id === step) > i) ? "✓" : i + 1}
                </div>
                <span className={cn("text-xs", step === s.id ? "text-slate-900 font-medium" : "text-slate-400")}>{s.label}</span>
                {i < STEPS.length - 1 && <div className="w-8 h-px bg-slate-200 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {step === "connect" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-900 mb-1">Connect your Shopify store</p>
                <p className="text-xs text-slate-500">Use OAuth (recommended) or paste an Admin API token.</p>
              </div>

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
                    <Input type="password" placeholder="shpat_xxxxxxxxxxxx" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="text-sm font-mono" />
                    <p className="text-[10px] text-slate-400 mt-1">Settings → Apps → Develop apps</p>
                  </div>
                  {error && <div className="flex items-center gap-2 text-red-600 text-xs"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}
                  <Button type="submit" variant="outline" className="w-full gap-2" disabled={isPending}>
                    {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}Connect with token
                  </Button>
                </form>
              )}
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-sm font-semibold text-slate-900 mb-1">Store connected!</p>
              <p className="text-xs text-slate-500 mb-5">Your products are being fetched. Run an analysis to get your AI readiness score.</p>
              <Button onClick={handleFinish} className="gap-2 bg-indigo-600 hover:bg-indigo-700 w-full">
                Go to Dashboard <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
