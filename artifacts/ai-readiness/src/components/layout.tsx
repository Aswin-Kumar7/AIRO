import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  CheckSquare,
  BarChart3,
  Shuffle,
  Store,
  AlertTriangle,
  Eye,
  FileQuestion,
  Layers,
  Tag,
  ChevronDown,
  ListChecks,
  Zap,
  BookOpen,
  Link2,
  HelpCircle,
  FileText,
} from "lucide-react";
import { useStore } from "@/context/store-context";
import { Badge } from "@/components/ui/badge";
import { useGetStoreSummary, getGetStoreSummaryQueryKey } from "@workspace/api-client-react";
import type { ReactNode } from "react";
import { useState } from "react";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/fixes", label: "Quick Fixes", icon: CheckSquare },
];

const analysisNav = [
  { href: "/action-plan", label: "Action Plan", icon: ListChecks },
  { href: "/gaps", label: "Gap Analysis", icon: AlertTriangle },
  { href: "/consistency", label: "Consistency", icon: Shuffle },
  { href: "/benchmark", label: "Benchmark", icon: BarChart3 },
];

const insightsNav = [
  { href: "/perception", label: "AI Perception", icon: Eye },
  { href: "/faq-health", label: "FAQ & Policies", icon: FileQuestion },
  { href: "/structured-data", label: "Structured Data", icon: Layers },
  { href: "/tags", label: "Tag Optimizer", icon: Tag },
];

const toolsNav = [
  { href: "/query-test", label: "Query Simulation", icon: Zap },
  { href: "/topical-authority", label: "Topical Authority", icon: BookOpen },
  { href: "/internal-links", label: "Internal Links", icon: Link2 },
  { href: "/faq-schema", label: "FAQ Schema", icon: HelpCircle },
  { href: "/llms-txt", label: "LLMs.txt", icon: FileText },
];

function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
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

function NavItem({ href, label, icon: Icon, badge }: { href: string; label: string; icon: React.FC<{ className?: string }>; badge?: number }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
  return (
    <Link href={href}>
      <div className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
      )}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span>{label}</span>
        {badge !== undefined && badge > 0 && !isActive && (
          <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1.5">{badge}</Badge>
        )}
      </div>
    </Link>
  );
}

function NavSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {title}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { activeStoreId } = useStore();
  const { data: summary } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-sidebar flex flex-col flex-shrink-0">
        {/* Brand */}
        <div className="px-4 py-3.5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs font-semibold text-sidebar-foreground leading-none">AI Readiness</p>
              <p className="text-[10px] text-muted-foreground">Shopify Analyzer</p>
            </div>
          </div>
        </div>

        {/* Store Score Widget */}
        {summary && (
          <div className="mx-3 mt-3 p-2.5 rounded-lg bg-sidebar-accent border border-sidebar-border">
            <div className="flex items-center gap-2.5">
              <div className="relative flex-shrink-0">
                <ScoreRing score={Math.round(summary.overallScore)} size={40} />
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-foreground">
                  {Math.round(summary.overallScore)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-sidebar-foreground leading-none mb-0.5">AI Readiness</p>
                <p className="text-[10px] text-muted-foreground">{summary.criticalIssues} critical · {summary.pendingFixes} fixes</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-3 overflow-y-auto">
          {/* Main */}
          <div className="space-y-0.5">
            {mainNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                badge={item.href === "/fixes" ? summary?.pendingFixes : undefined}
              />
            ))}
          </div>

          <NavSection title="Analysis">
            {analysisNav.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                badge={item.href === "/gaps" ? summary?.criticalIssues : undefined}
              />
            ))}
          </NavSection>

          <NavSection title="Insights" defaultOpen={false}>
            {insightsNav.map((item) => (
              <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
          </NavSection>

          <NavSection title="Tools" defaultOpen={false}>
            {toolsNav.map((item) => (
              <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
          </NavSection>
        </nav>

        {/* Store Switcher */}
        <div className="px-2 py-2.5 border-t border-sidebar-border">
          <Link href="/">
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent cursor-pointer transition-colors">
              <Store className="w-3.5 h-3.5" />
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
