import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, Wrench, CheckSquare,
  Brain, GitBranch, Settings, BarChart3, Store,
  ChevronDown, LogOut, Plus, Check,
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
  const cls = s >= 75 ? "bg-emerald-100 text-emerald-700" : s >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cls}`}>{s}</span>;
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const navGroups = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
    label: "AI",
    items: [
      { href: "/ai-readiness", label: "AI Readiness", icon: Brain },
      { href: "/content", label: "Content", icon: GitBranch },
      { href: "/tools", label: "Tools", icon: BarChart3 },
    ],
  },
];

// ─── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  href, label, icon: Icon, badge,
}: { href: string; label: string; icon: React.FC<{ className?: string }>; badge?: number }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
  return (
    <Link href={href}>
      <div className={cn(
        "flex items-center gap-2.5 px-3 py-[7px] rounded-md text-[13px] font-medium transition-colors cursor-pointer group",
        isActive
          ? "bg-indigo-50 text-indigo-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
      )}>
        <Icon className={cn("w-[15px] h-[15px] flex-shrink-0", isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
        <span>{label}</span>
        {badge !== undefined && badge > 0 && !isActive && (
          <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1.5">{badge}</Badge>
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
        const fallback = stores[0].id;
        setActiveStoreId(fallback);
        toast({
          title: "Store changed",
          description: "Your previously active store is no longer available.",
        });
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
        <button className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors max-w-[220px] focus:outline-none focus:ring-2 focus:ring-indigo-200">
          <Store className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span className="truncate text-slate-700 text-xs font-medium">
            {activeStore?.name ?? activeStore?.domain ?? "Select store"}
          </span>
          <ScoreBadge score={summary?.overallScore} />
          <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0 ml-0.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal py-1.5">Your stores</DropdownMenuLabel>
        {stores?.map((store) => (
          <DropdownMenuItem
            key={store.id}
            className="gap-2 cursor-pointer"
            onClick={() => { setActiveStoreId(store.id); navigate("/dashboard"); }}
          >
            <Store className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span className="truncate text-sm flex-1">{store.name ?? store.domain}</span>
            {store.id === activeStoreId && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 cursor-pointer text-indigo-600" onClick={() => navigate("/connect")}>
          <Plus className="w-3.5 h-3.5" />
          <span className="text-sm">Add store</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── User menu ────────────────────────────────────────────────────────────────

function UserMenu() {
  const { user, logout } = useAuth();
  const initials = user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded-full">
          <Avatar className="w-7 h-7">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal py-2">
          <p className="text-sm font-medium text-slate-900 truncate">{user?.name ?? "User"}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer text-slate-600"
          onClick={() => logout().then(() => window.location.assign("/"))}
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="text-sm">Sign out</span>
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
    <div className="h-screen flex flex-col bg-[#F8FAFC] overflow-hidden">
      {/* ── Fixed top header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white border-b border-slate-200 flex items-center px-5 gap-4">
        <Link href="/dashboard">
          <div className="flex items-center gap-2.5 cursor-pointer flex-shrink-0 mr-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900 hidden md:block">AI Readiness</span>
          </div>
        </Link>

        <div className="flex-1 flex items-center">
          <StoreSelector />
        </div>

        <div className="flex items-center gap-2">
          <Link href="/settings">
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <Settings className="w-[15px] h-[15px]" />
            </button>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-14">
        {/* ── Fixed sidebar ── */}
        <aside className="fixed left-0 top-14 bottom-0 w-[220px] bg-white border-r border-slate-200 flex flex-col overflow-y-auto z-40">
          <nav className="flex-1 px-3 py-4 space-y-4">
            {navGroups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-1">{group.label}</p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      badge={
                        item.href === "/fixes" ? (summary?.pendingFixes ?? undefined) :
                        item.href === "/issues" ? (summary?.criticalIssues ?? undefined) :
                        undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Scrollable content ── */}
        <main className="flex-1 ml-[220px] overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
