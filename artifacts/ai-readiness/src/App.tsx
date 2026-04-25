import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { ErrorBoundary } from "react-error-boundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/context/store-context";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { Loader2, AlertCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, type ComponentType } from "react";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import ProductDetail from "@/pages/product-detail";
import Issues from "@/pages/issues";
import Fixes from "@/pages/fixes";
import AiReadiness from "@/pages/ai-readiness-page";
import ContentPage from "@/pages/content-page";
import ToolsPage from "@/pages/tools-page";
import ConnectStore from "@/pages/connect";
import Settings from "@/pages/settings";
import AeoScorePage from "@/pages/aeo-score";
import SeoAuditPage from "@/pages/seo-audit";
import GeoTrackerPage from "@/pages/geo-tracker";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function ProtectedRoute({ component: Component, ...props }: { component: ComponentType<any> } & any) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white dark:bg-black gap-4">
        <div className="relative">
           <div className="w-12 h-12 rounded-2xl border-4 border-slate-100 dark:border-white/5 border-t-emerald-500 animate-spin" />
           <Zap className="absolute inset-0 m-auto w-5 h-5 text-emerald-500 animate-pulse" />
        </div>
        <p className="text-[13px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest animate-pulse">Initializing Intelligence...</p>
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  return <Component {...props} />;
}

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] p-6 font-sans">
      <div className="max-w-[480px] w-full bg-white rounded-[16px] border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6 border border-red-100/50">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          
          <h2 className="text-[20px] font-bold text-slate-900 tracking-tight mb-2">Unexpected Error</h2>
          <p className="text-[14px] text-slate-500 leading-relaxed mb-8">
            You encountered a technical issue. You can try refreshing or contact support if the issue persists.
          </p>

          <div className="flex flex-col gap-3">
            <Button 
              onClick={resetErrorBoundary} 
              className="h-11 rounded-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[14px] shadow-sm transition-all"
            >
              Try to Resume
            </Button>
            <div className="flex gap-3">
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline" 
                className="flex-1 h-11 rounded-[10px] border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-50"
              >
                Reload App
              </Button>
              <Button 
                onClick={() => window.location.href = "/"} 
                variant="outline" 
                className="flex-1 h-11 rounded-[10px] border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-50"
              >
                Return Home
              </Button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors mx-auto"
          >
            {showDetails ? "Hide" : "Show"} Technical Details
          </button>
          
          {showDetails && (
            <div className="mt-4 p-4 bg-slate-900 rounded-[8px] text-left overflow-auto max-h-[200px]">
              <pre className="text-[11px] font-mono text-emerald-400/90 leading-normal">
                {error.name}: {error.message}
                {"\n\n"}
                {error.stack}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Router() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={() => queryClient.resetQueries()}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} />}
        </Route>
        <Route path="/products">
          {() => <ProtectedRoute component={Products} />}
        </Route>
        <Route path="/products/:productId">
          {(params) => <ProtectedRoute component={ProductDetail} params={params} />}
        </Route>
        <Route path="/issues">
          {() => <ProtectedRoute component={Issues} />}
        </Route>
        <Route path="/fixes">
          {() => <ProtectedRoute component={Fixes} />}
        </Route>
        <Route path="/ai-readiness">
          {() => <ProtectedRoute component={AiReadiness} />}
        </Route>
        <Route path="/content">
          {() => <ProtectedRoute component={ContentPage} />}
        </Route>
        <Route path="/tools">
          {() => <ProtectedRoute component={ToolsPage} />}
        </Route>
        <Route path="/intelligence/aeo">
          {() => <ProtectedRoute component={AeoScorePage} />}
        </Route>
        <Route path="/intelligence/seo">
          {() => <ProtectedRoute component={SeoAuditPage} />}
        </Route>
        <Route path="/intelligence/geo">
          {() => <ProtectedRoute component={GeoTrackerPage} />}
        </Route>
        <Route path="/connect">
          {() => <ProtectedRoute component={ConnectStore} />}
        </Route>
        <Route path="/settings">
          {() => <ProtectedRoute component={Settings} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

import { ThemeProvider } from "@/context/theme-context";

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="kasparro-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <StoreProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
            </StoreProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
