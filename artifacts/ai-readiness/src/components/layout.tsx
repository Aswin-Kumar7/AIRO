import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, Wrench, CheckSquare,
  Brain, GitBranch, Settings, BarChart3, Store,
  ChevronDown, LogOut, Plus, Check, Search, LineChart, Globe,
} from "lucide-react";
import { useStore } from "@/context/store-context";
import { useAuth } from "@/context/auth-context";
import { useListStores, useGetStoreSummary, getGetStoreSummaryQueryKey } from "@workspace/api-client-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ─── Score badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return null;
  const s = Math.round(score);
  const cls =
    s >= 75 ? "bg-emerald-100 text-emerald-700"
    : s >= 50 ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";
  return (
    <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${cls}`}>
      {s}
    </span>
  );
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const navGroups = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard },
      { href: "/products", label: "Products", icon: Package },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/issues", label: "Issues", icon: Wrench },
      { href: "/fixes", label: "Quick Fixes", icon: CheckSquare },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/intelligence/aeo", label: "AEO Score", icon: Search, isNew: true },
      { href: "/intelligence/seo", label: "SEO Audit", icon: LineChart },
      { href: "/intelligence/geo", label: "GEO Tracker", icon: Globe, isNew: true },
    ],
  },
  {
    label: "Optimize",
    items: [
      { href: "/ai-readiness", label: "AI Readiness", icon: Brain },
      { href: "/content", label: "Content", icon: GitBranch },
      { href: "/tools", label: "Tools", icon: BarChart3 },
    ],
  },
];

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  href, label, icon: Icon, badge, isNew,
}: {
  href: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
  isNew?: boolean;
}) {
  const [location] = useLocation();
  const isActive =
    location === href || (href !== "/dashboard" && location.startsWith(href));

  return (
    <Link href={href}>
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] font-medium transition-colors cursor-pointer group",
          isActive
            ? "bg-emerald-50 text-emerald-700 font-semibold"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
        )}
      >
        <Icon
          className={cn(
            "w-[15px] h-[15px] flex-shrink-0",
            isActive
              ? "text-emerald-600"
              : "text-slate-400 group-hover:text-slate-500",
          )}
        />
        <span className="flex-1">{label}</span>
        {badge !== undefined && badge > 0 && !isActive && (
          <Badge
            variant="destructive"
            className="ml-auto text-[10px] h-4 px-1.5 font-semibold"
          >
            {badge}
          </Badge>
        )}
        {isNew && (
          <span className="ml-auto text-[9px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
            New
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Store selector ───────────────────────────────────────────────────────────

function StoreSelector() {
  const { activeStoreId, setActiveStoreId } = useStore();
  const { data: stores } = useListStores();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (stores && stores.length > 0) {
      const isValid = stores.some((s) => s.id === activeStoreId);
      if (activeStoreId && !isValid) {
        setActiveStoreId(stores[0].id);
        toast({ title: "Store changed", description: "Your previously active store is no longer available." });
      } else if (!activeStoreId) {
        setActiveStoreId(stores[0].id);
      }
    }
  }, [stores, activeStoreId, setActiveStoreId, toast]);

  const activeStore = stores?.find((s) => s.id === activeStoreId);
  const { data: summary } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 transition-colors max-w-[240px] focus:outline-none focus:ring-2 focus:ring-emerald-200 group">
          <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          <span className="truncate text-slate-700 text-xs font-medium">
            {activeStore?.name ?? activeStore?.domain ?? "Select store"}
          </span>
          <ScoreBadge score={summary?.overallScore} />
          <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0 ml-0.5 group-hover:text-slate-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide px-2 py-1.5">
          Stores
        </DropdownMenuLabel>
        {stores?.map((store) => (
          <DropdownMenuItem
            key={store.id}
            className="gap-2 cursor-pointer text-sm"
            onClick={() => { setActiveStoreId(store.id); navigate("/dashboard"); }}
          >
            <Store className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate flex-1">{store.name ?? store.domain}</span>
            {store.id === activeStoreId && (
              <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer text-emerald-600 text-sm"
          onClick={() => navigate("/connect")}
        >
          <Plus className="w-3.5 h-3.5" />
          Add store
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── User menu ────────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const initials =
    user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ??
    user?.email?.[0]?.toUpperCase() ??
    "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center focus:outline-none focus:ring-2 focus:ring-emerald-200 rounded-full">
          <Avatar className="w-7 h-7">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-[10px] bg-slate-100 text-slate-600 font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal py-2">
          <p className="text-sm font-medium text-slate-900 truncate">{user?.name ?? "User"}</p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer text-slate-600 text-sm"
          onClick={async () => {
            try {
              await logout();
              localStorage.removeItem("activeStoreId");
              navigate("/");
            } catch (err) {
              toast({
                title: "Sign out failed",
                description: err instanceof Error ? err.message : "Please try again.",
                variant: "destructive",
              });
            }
          }}
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── App layout ───────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: ReactNode }) {
  const { activeStoreId } = useStore();
  const { data: summary } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });

  return (
    <div className="h-screen flex flex-col bg-[#f4f6f8] overflow-hidden">

      {/* ── Fixed top header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-13 bg-white border-b border-slate-200 flex items-center px-5 gap-4" style={{ height: "52px" }}>
        {/* Logo */}
        <Link href="/dashboard">
          <div className="flex items-center gap-2.5 cursor-pointer flex-shrink-0 mr-3">
            <div className="w-7 h-7 rounded-md bg-slate-900 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-black tracking-tighter">K</span>
            </div>
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-[13px] font-bold text-slate-900 tracking-tight">Kasparro</span>
              <span className="text-[9px] text-slate-400 tracking-widest uppercase font-medium">
                AI Representation Optimizer
              </span>
            </div>
          </div>
        </Link>

        {/* Store selector */}
        <div className="flex-1 flex items-center">
          <StoreSelector />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5">
          <Link href="/settings">
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <Settings className="w-[15px] h-[15px]" />
            </button>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-[52px]">

        {/* ── Fixed sidebar ── */}
        <aside className="fixed left-0 top-[52px] bottom-0 w-[212px] bg-white border-r border-slate-200 flex flex-col overflow-y-auto z-40">
          <nav className="flex-1 px-3 py-4 space-y-5">
            {navGroups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-1.5">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isNew={"isNew" in item ? item.isNew : undefined}
                      badge={
                        item.href === "/fixes"
                          ? (summary?.pendingFixes ?? undefined)
                          : item.href === "/issues"
                          ? (summary?.criticalIssues ?? undefined)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom nav */}
          <div className="px-3 py-3 border-t border-slate-100">
            <NavItem href="/settings" label="Settings" icon={Settings} />
          </div>
        </aside>

        {/* ── Scrollable content ── */}
        <main className="flex-1 ml-[212px] overflow-y-auto bg-[#f4f6f8]">
          {children}
        </main>
      </div>
    </div>
  );
}
