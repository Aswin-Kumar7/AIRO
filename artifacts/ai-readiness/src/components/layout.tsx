import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Package, Wrench, CheckSquare,
  Brain, GitBranch, Settings, BarChart3, Store,
  ChevronDown, LogOut, Plus, Check, Search, LineChart, Globe, CalendarClock, Swords
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ─── Kasparro Logo Component ──────────────────────────────────────────────────
function KasparroLogo({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="8" y="4" width="4" height="24" rx="2" fill="#10B981"/>
      <path d="M14 16L26 4H21L13 13V16V19L21 28H26L14 16Z" fill="#10B981"/>
    </svg>
  );
}


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
      { href: "/listing-readiness", label: "Listing Readiness", icon: Store },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/intelligence/aeo", label: "AI Score", icon: Search },
      { href: "/intelligence/seo", label: "SEO Audit", icon: LineChart },
      { href: "/intelligence/geo", label: "GEO Tracker", icon: Globe },
      { href: "/competitors", label: "Competitor Gap", icon: Swords },
    ],
  },
  {
    label: "Optimize",
    items: [
      { href: "/ai-readiness", label: "AI Readiness", icon: Brain },
      { href: "/content", label: "Content", icon: GitBranch },
      { href: "/tools", label: "Tools", icon: BarChart3 },
      { href: "/schedule", label: "Schedule", icon: CalendarClock },
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
          "flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] transition-all cursor-pointer group select-none",
          isActive
            ? "bg-white dark:bg-[#27272a] text-slate-900 dark:text-white font-semibold shadow-sm border border-slate-200/60 dark:border-white/10 ring-1 ring-black/[0.02] dark:ring-0"
            : "text-slate-500 dark:text-zinc-300 font-medium hover:bg-slate-200/30 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white",
        )}
      >
        <Icon
          className={cn(
            "w-[16px] h-[16px] flex-shrink-0 transition-colors",
            isActive
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-400 dark:text-zinc-400 dark:text-zinc-300 group-hover:text-slate-500 dark:group-hover:text-slate-400 dark:text-zinc-400",
          )}
        />
        <span className="flex-1 tracking-tight">{label}</span>
        {badge !== undefined && badge > 0 && !isActive && (
          <Badge
            variant="destructive"
            className="ml-auto text-[10px] h-4.5 px-1.5 font-bold rounded-full shadow-none bg-red-500/90"
          >
            {badge}
          </Badge>
        )}
        {isNew && (
          <span className="ml-auto text-[9px] font-extrabold uppercase tracking-widest bg-emerald-100/80 text-emerald-700 px-1.5 py-0.5 rounded-[4px]">
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
        <button className="flex items-center gap-2.5 px-3 py-1.5 rounded-[10px] hover:bg-slate-50 dark:hover:bg-[#1A1A1A] border border-transparent hover:border-slate-100 dark:hover:border-[#333] transition-all focus:outline-none group">
          <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-[#050505] border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden">
            <Store className="w-3 h-3 text-slate-500 dark:text-zinc-300" />
          </div>
          <span className="text-[13px] font-bold text-slate-700 dark:text-white tracking-tight">
            {activeStore?.name ?? activeStore?.domain ?? "Select store"}
          </span>
          {activeStore?.isDemo && (
            <span className="text-[9px] font-extrabold uppercase tracking-widest bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-[4px]">
              Demo
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 dark:text-zinc-300 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[10px] text-slate-400 dark:text-zinc-400 font-semibold uppercase tracking-wide px-2 py-1.5">
          Stores
        </DropdownMenuLabel>
        {stores?.map((store) => (
          <DropdownMenuItem
            key={store.id}
            className="gap-2 cursor-pointer text-sm"
            onClick={() => { setActiveStoreId(store.id); navigate("/dashboard"); }}
          >
            <Store className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 flex-shrink-0" />
            <span className="truncate flex-1">{store.name ?? store.domain}</span>
            {store.isDemo && (
              <span className="text-[9px] font-extrabold uppercase tracking-widest bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-[4px] flex-shrink-0">
                Demo
              </span>
            )}
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
            <AvatarFallback className="text-[10px] bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-200 font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal py-2">
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{user?.name ?? "User"}</p>
          <p className="text-xs text-slate-400 dark:text-zinc-400 truncate mt-0.5">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 cursor-pointer text-slate-600 dark:text-zinc-200 text-sm"
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
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: summary } = useGetStoreSummary(activeStoreId!, {
    query: { enabled: !!activeStoreId, queryKey: getGetStoreSummaryQueryKey(activeStoreId!) },
  });

  return (
    <div className="h-screen flex flex-col bg-[#f4f6f8] dark:bg-[#050505] overflow-hidden transition-colors duration-200">

      {/* ── Fixed top header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-[56px] bg-white dark:bg-[#080808] border-b border-slate-200/60 dark:border-white/10 flex items-center px-4 gap-4 transition-colors duration-200">
        {/* Logo */}
        <Link href="/dashboard">
          <div className="flex items-center gap-3 cursor-pointer group px-2 py-1.5 rounded-[10px] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <KasparroLogo className="group-hover:scale-105 transition-transform duration-200" />
            <span className="text-[14px] font-bold text-slate-900 dark:text-white tracking-tighter hidden md:block">Kasparro</span>
          </div>
        </Link>

        <div className="w-px h-4 bg-slate-200 dark:bg-white/10" />

        {/* Store selector / Breadcrumb style */}
        <div className="flex items-center">
          <StoreSelector />
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3 pr-2">
          {/* Header remains clean, actions moved to sidebar */}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden pt-[56px]">

        {/* ── Fixed sidebar ── */}
        <aside className="fixed left-0 top-[56px] bottom-0 w-[240px] bg-[#fcfcfc] dark:bg-[#080808] border-r border-slate-200/60 dark:border-white/10 flex flex-col overflow-y-auto z-40 transition-colors duration-200">
          <nav className="flex-1 px-4 py-6 space-y-7">
            {navGroups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <p className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 dark:text-zinc-300 uppercase tracking-widest px-3 mb-2">
                    {group.label}
                  </p>
                )}
                <div className="space-y-1">
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
          <div className="p-2 border-t border-slate-200/60 dark:border-white/10 bg-[#fcfcfc]/80 dark:bg-transparent backdrop-blur-sm transition-colors duration-200">
            <NavItem href="/settings" label="Settings" icon={Settings} />
            
            <div className="mt-2 pt-2 border-t border-slate-100/80 dark:border-white/5">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] hover:bg-red-50/50 dark:hover:bg-red-950/30 group transition-all cursor-pointer border border-transparent hover:border-red-100/50 dark:hover:border-red-900/30">
                    <Avatar className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/10 shadow-sm flex-shrink-0 group-hover:border-red-200 dark:group-hover:border-red-800 transition-colors">
                      <AvatarImage src={user?.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-[10px] bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-zinc-200 font-bold">
                        {user?.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate tracking-tight leading-none group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors">{user?.name ?? "User"}</p>
                      <p className="text-[11px] text-slate-400 dark:text-zinc-400 dark:text-zinc-300 truncate tracking-tight mt-1 leading-none group-hover:text-red-400 dark:group-hover:text-red-500 transition-colors">{user?.email}</p>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                      <LogOut className="w-4 h-4 text-red-500 dark:text-red-400" />
                    </div>
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[16px] border-slate-200 dark:border-white/10 shadow-xl dark:bg-[#080808]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-slate-900 dark:text-white font-bold">Sign out of Kasparro?</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-500 dark:text-zinc-300 text-[13px]">
                      You will need to sign back in to access your store analysis and AEO optimizations.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="mt-4">
                    <AlertDialogCancel className="rounded-[10px] border-slate-200 dark:border-white/10 text-[13px] font-medium">Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={async () => {
                        try {
                          await logout();
                          localStorage.removeItem("activeStoreId");
                          navigate("/");
                        } catch (err) {
                          toast({ title: "Sign out failed", variant: "destructive" });
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white rounded-[10px] text-[13px] font-bold"
                    >
                      Sign Out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </aside>

        {/* ── Scrollable content ── */}
        <main className="flex-1 ml-[240px] overflow-y-auto bg-[#fafafa] dark:bg-[#050505] transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}
