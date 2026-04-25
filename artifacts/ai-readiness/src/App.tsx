import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { ErrorBoundary } from "react-error-boundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/context/store-context";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComponentType } from "react";

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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
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
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-2">Something went wrong</h2>
      <p className="text-sm text-slate-500 max-w-md mb-6">{error.message || "An unexpected error occurred."}</p>
      <div className="flex gap-3">
        <Button onClick={() => window.location.reload()} variant="outline">
          Reload Page
        </Button>
        <Button onClick={resetErrorBoundary} className="bg-indigo-600 hover:bg-indigo-700">
          Try again
        </Button>
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

function App() {
  return (
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
  );
}

export default App;
