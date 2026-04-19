import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StoreProvider } from "@/context/store-context";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import ProductDetail from "@/pages/product-detail";
import Gaps from "@/pages/gaps";
import Fixes from "@/pages/fixes";
import Consistency from "@/pages/consistency";
import Benchmark from "@/pages/benchmark";
import Perception from "@/pages/perception";
import FaqHealth from "@/pages/faq-health";
import StructuredData from "@/pages/structured-data";
import Tags from "@/pages/tags";
import ActionPlan from "@/pages/action-plan";
import LlmsTxt from "@/pages/llms-txt";
import QueryTest from "@/pages/query-test";
import TopicalAuthority from "@/pages/topical-authority";
import InternalLinks from "@/pages/internal-links";
import FaqSchema from "@/pages/faq-schema";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/products" component={Products} />
      <Route path="/products/:productId" component={ProductDetail} />
      <Route path="/gaps" component={Gaps} />
      <Route path="/fixes" component={Fixes} />
      <Route path="/consistency" component={Consistency} />
      <Route path="/benchmark" component={Benchmark} />
      <Route path="/perception" component={Perception} />
      <Route path="/faq-health" component={FaqHealth} />
      <Route path="/structured-data" component={StructuredData} />
      <Route path="/tags" component={Tags} />
      <Route path="/action-plan" component={ActionPlan} />
      <Route path="/llms-txt" component={LlmsTxt} />
      <Route path="/query-test" component={QueryTest} />
      <Route path="/topical-authority" component={TopicalAuthority} />
      <Route path="/internal-links" component={InternalLinks} />
      <Route path="/faq-schema" component={FaqSchema} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StoreProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </StoreProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
