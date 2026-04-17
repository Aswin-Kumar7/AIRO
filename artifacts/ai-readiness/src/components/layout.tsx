import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  AlertTriangle,
  CheckSquare,
  BarChart3,
  Shuffle,
  Store,
  ChevronRight,
} from "lucide-react";
import { useStore } from "@/context/store-context";
import { Badge } from "@/components/ui/badge";
import { useGetStoreSummary, getGetStoreSummaryQueryKey } from "@workspace/api-client-react";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/gaps", label: "Gap Analysis", icon: AlertTriangle },
  { href: "/fixes", label: "Quick Fixes", icon: CheckSquare },
  { href: "/consistency", label: "Consistency", icon: Shuffle },
  { href: "/benchmark", label: "Benchmark", icon: BarChart3 },
];

function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-border" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={4} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
    </svg>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { activeStoreId } = useStore();
  const { data: summary } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        {/* Brand */}
        <div className="px-5 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground">AI Readiness</p>
              <p className="text-xs text-muted-foreground">Shopify Analyzer</p>
            </div>
          </div>
        </div>

        {/* Store Score Widget */}
        {summary && (
          <div className="mx-4 mt-4 p-3 rounded-xl bg-sidebar-accent border border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="relative">
                <ScoreRing score={Math.round(summary.overallScore)} size={44} />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground" style={{ transform: "translate(-50%, -50%)", position: "absolute", top: "50%", left: "50%" }}>
                  {Math.round(summary.overallScore)}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-sidebar-foreground">AI Readiness</p>
                <p className="text-[11px] text-muted-foreground">{summary.criticalIssues} critical issues</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                  {item.href === "/fixes" && summary && summary.pendingFixes > 0 && !isActive && (
                    <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1.5">{summary.pendingFixes}</Badge>
                  )}
                  {item.href === "/gaps" && summary && summary.criticalIssues > 0 && !isActive && (
                    <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1.5">{summary.criticalIssues}</Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Store Switcher */}
        <div className="px-3 py-3 border-t border-sidebar-border">
          <Link href="/">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer transition-colors">
              <Store className="w-4 h-4" />
              <span>Switch Store</span>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
