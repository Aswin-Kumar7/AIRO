import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/context/store-context";
import { AuthProvider, useAuth } from "@/context/auth-context";
import { Loader2 } from "lucide-react";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function ProtectedRoute({ component: Component }: { component: ComponentType }) {
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

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/products">
        {() => <ProtectedRoute component={Products} />}
      </Route>
      <Route path="/products/:productId">
        {() => <ProtectedRoute component={ProductDetail} />}
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
      <Route path="/connect">
        {() => <ProtectedRoute component={ConnectStore} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
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
