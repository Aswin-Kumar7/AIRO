import { useState } from "react";
import { useLocation } from "wouter";
import { useStore } from "@/context/store-context";
import { useConnectStore } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, Zap, Key, AlertCircle, Loader2, Globe, ArrowRight, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { id: "connect", label: "Connect store" },
  { id: "done", label: "Ready" },
];

const API_BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

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
        <div className="px-8 py-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100/50 flex items-center justify-center mx-auto mb-4">
            <Store className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight">Connect your store</h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">Start by linking your Shopify store to Kasparro.</p>
          
          {/* Subtle Stepper */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  step === s.id ? "w-6 bg-indigo-600" :
                    (STEPS.findIndex(x => x.id === step) > i) ? "w-2 bg-emerald-500" : "w-2 bg-slate-200"
                )} />
                {i < STEPS.length - 1 && <div className="w-4 h-px bg-slate-100 dark:bg-white/10 mx-1" />}
              </div>
            ))}
          </div>
        </div>        {/* Body */}
        <div className="px-8 pb-8">
          {step === "connect" && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest block">Store domain</label>
                  <div className="relative">
                    <Input
                      placeholder="my-store.myshopify.com"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="h-11 px-4 rounded-[10px] text-[13px] border-slate-200 dark:border-white/10 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-300"
                      autoFocus
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Globe className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  </div>
                </div>

                <form onSubmit={handleOAuth}>
                  {error && !showAdvanced && (
                    <div className="flex items-center gap-2 text-red-500 dark:text-red-400 font-semibold ml-2 tabular-nums bg-red-50 dark:bg-red-500/10/50 rounded-[8px] border border-red-100/50">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
                    </div>
                  )}
                  <Button type="submit" className="w-full h-11 rounded-[10px] gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[14px] shadow-sm shadow-indigo-200/50 transition-all">
                    <Zap className="w-3.5 h-3.5" />Connect via Shopify
                  </Button>
                </form>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-slate-100 dark:border-white/5"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-300 uppercase tracking-widest">or use token</span>
                  <div className="flex-grow border-t border-slate-100 dark:border-white/5"></div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-400 hover:text-indigo-600 transition-colors mx-auto uppercase tracking-wider"
                >
                  <Key className="w-3 h-3" />
                  {showAdvanced ? "Hide Advanced Options" : "I have an Admin API token"}
                </button>

                {showAdvanced && (
                  <form onSubmit={handleToken} className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-widest block">Admin API Access Token</label>
                      <Input type="password" placeholder="shpat_xxxxxxxxxxxx" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="h-11 rounded-[10px] text-[13px] font-mono" />
                    </div>
                    {error && <div className="flex items-center gap-2 text-red-500 dark:text-red-400 font-semibold ml-2 tabular-nums bg-red-50 dark:bg-red-500/10/50 rounded-[8px] border border-red-100/50"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}
                    <Button type="submit" variant="outline" className="w-full h-11 rounded-[10px] gap-2 border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-200 font-bold" disabled={isPending}>
                      {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}Authorize with Token
                    </Button>
                  </form>
                )}
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-6 animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center mx-auto mb-6 relative">
                 <div className="absolute inset-0 bg-emerald-400/10 rounded-full animate-ping duration-1000" />
                 <CheckCircle className="w-10 h-10 text-emerald-500 relative z-10" />
              </div>
              <h3 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight mb-2">Connection successful</h3>
              <p className="text-[13px] text-slate-500 dark:text-zinc-300 mb-8 max-w-[280px] mx-auto">
                Your store is now linked. We're currently importing your products and analyzing your AI readiness.
              </p>
              <Button onClick={handleFinish} className="w-full h-11 rounded-[10px] gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[14px] shadow-sm shadow-emerald-200/50 transition-all">
                Enter Dashboard <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
