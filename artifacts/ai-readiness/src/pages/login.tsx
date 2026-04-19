import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useStore } from "@/context/store-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, Sparkles, Zap, Shield, CheckCircle } from "lucide-react";

const API_BASE = `${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api`;

export default function Login() {
  const { user, isLoading } = useAuth();
  const { setActiveStoreId } = useStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && user) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/";

    // Shopify OAuth success — store was connected, set it active and go to dashboard
    const shopifyStatus = params.get("shopify");
    if (shopifyStatus === "success") {
      const storeId = params.get("storeId");
      if (storeId) setActiveStoreId(storeId);
      window.history.replaceState({}, "", base);
      navigate("/dashboard");
      return;
    }
    if (shopifyStatus === "error") {
      window.history.replaceState({}, "", base);
      const message = params.get("message") ?? "Shopify connection failed.";
      toast({ title: "Shopify connection failed", description: decodeURIComponent(message), variant: "destructive" });
      return;
    }

    // Google OAuth result
    const authStatus = params.get("auth");
    if (!authStatus) return;
    window.history.replaceState({}, "", base);
    if (authStatus === "error") {
      const message = params.get("message") ?? "Sign-in failed. Please try again.";
      toast({ title: "Sign-in failed", description: decodeURIComponent(message), variant: "destructive" });
    }
  }, [toast, navigate, setActiveStoreId]);

  function handleGoogleLogin() {
    window.location.assign(`${API_BASE}/auth/google`);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Minimal header */}
      <header className="px-8 py-5 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
          <BarChart3 className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-slate-900">AI Readiness Analyzer</span>
      </header>

      {/* Center content */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
            <Sparkles className="w-3 h-3" />
            For Shopify merchants
          </div>

          <h1 className="text-[28px] font-bold text-slate-900 leading-tight mb-2">
            Is your store ready for AI shopping?
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">
            Analyze how AI assistants see your products and get one-click fixes to get recommended more often.
          </p>

          {/* Google sign-in */}
          <Button
            onClick={handleGoogleLogin}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium gap-3 text-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-xs text-slate-400 mt-4">
            Free to get started · No credit card required
          </p>

          {/* Features */}
          <div className="mt-10 pt-8 border-t border-slate-100 space-y-3">
            {[
              { icon: Zap, text: "Rule engine + AI scoring for every product" },
              { icon: CheckCircle, text: "One-click fixes pushed directly to Shopify" },
              { icon: Shield, text: "Benchmark against AI-ready stores" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 text-xs text-slate-500">
                <Icon className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                {text}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
