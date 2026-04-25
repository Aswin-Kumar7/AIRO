import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useAuth } from "@/context/auth-context";
import { useListStores, getListStoresQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useTheme } from "@/context/theme-context";
import { AppLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Store, Trash2, User, ShieldCheck, Zap, Globe,
  CheckCircle
} from "lucide-react";
import { deleteStore, deleteAccount } from "@/lib/quick-fix-api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
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

export default function Settings() {
  const { activeStoreId, setActiveStoreId } = useStore();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();

  const { data: stores = [] } = useListStores({ query: { staleTime: 30_000, queryKey: getListStoresQueryKey() } });

  async function handleDeleteAccount() {
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      toast({ title: "Account deleted", description: "Your data has been permanently removed." });
      await logout();
      navigate("/");
    } catch (err) {
      toast({ 
        title: "Deletion failed", 
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive" 
      });
    } finally {
      setIsDeletingAccount(false);
    }
  }

  async function handleDelete(storeId: string) {
    if (confirmDeleteId !== storeId) {
      setConfirmDeleteId(storeId);
      return;
    }
    setDeletingId(storeId);
    try {
      await deleteStore(storeId);
      if (activeStoreId === storeId) {
        const next = (stores as Array<{ id: string }>).find((s) => s.id !== storeId);
        setActiveStoreId(next?.id ?? null);
      }
      queryClient.invalidateQueries({ queryKey: getListStoresQueryKey() });
      toast({ title: "Store removed" });
      setConfirmDeleteId(null);
    } catch {
      toast({ title: "Failed to remove store", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-[1000px] mx-auto space-y-10 pb-20">
        {/* ── Page Header ── */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Settings</h1>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-zinc-300 text-[10px] font-bold uppercase tracking-widest border border-slate-200/60 dark:border-white/10">Beta</span>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-zinc-300">Manage your workspace settings and preferences.</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* ── Section: Profile ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Profile</h2>
              <p className="text-[13px] text-slate-500 dark:text-zinc-300">Your public identity on the platform.</p>
            </div>
            <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div className="p-6 flex items-center gap-6">
                <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center overflow-hidden">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider">Full Name</label>
                      <p className="text-[13px] font-medium text-slate-900 dark:text-white">{user?.name ?? "—"}</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider">Email Address</label>
                      <p className="text-[13px] font-medium text-slate-900 dark:text-white">{user?.email ?? "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-3 bg-slate-50/50 dark:bg-white/5 border-t border-slate-200 dark:border-white/10 flex justify-between items-center">
                <p className="text-[12px] text-slate-400 dark:text-zinc-400 font-medium">Avatar provided by Google Auth.</p>
                <Button variant="outline" className="h-8 px-3 text-[11px] font-bold rounded-[6px] bg-white dark:bg-[#111214] border-slate-200 dark:border-white/10 hover:dark:bg-white/10">Update Profile</Button>
              </div>
              </div>
            </section>
              {/* ── Section: Plan ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Subscription Plan</h2>
              <p className="text-[13px] text-slate-500 dark:text-zinc-300">You are currently on the Early Access program.</p>
            </div>
            <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Early Access</h3>
                    <span className="px-1.5 py-0.5 rounded-[4px] bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold border border-emerald-100 dark:border-emerald-500/20 uppercase tracking-tight">Unlimited</span>
                  </div>
                  <p className="text-[13px] text-slate-500 dark:text-zinc-300">Thank you for being an early adopter. All features are unlocked.</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tighter">$0<span className="text-sm font-normal text-slate-400 dark:text-zinc-400">/mo</span></p>
                </div>
              </div>
              
              <div className="px-6 py-6 border-t border-slate-100 dark:border-white/5 bg-slate-50/20 dark:bg-white/5 grid grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Analysis Usage</p>
                      <p className="text-[14px] font-bold text-slate-900 dark:text-white">Unlimited</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                       <Zap className="w-4 h-4 text-emerald-500" fill="currentColor" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-slate-400 dark:text-zinc-400 uppercase tracking-wider mb-0.5">Store Slots</p>
                      <p className="text-[14px] font-bold text-slate-900 dark:text-white">Unlimited</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                       <Store className="w-4 h-4 text-emerald-500" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col justify-center border-l border-slate-100 dark:border-white/5 pl-10">
                   <ul className="space-y-2">
                      {[
                        "Unlimited Active Stores",
                        "Unlimited AI Analyses",
                        "Pro Content Editor Unlocked",
                        "Bulk Fix Generation Unlocked",
                        "Priority Support",
                      ].map((label, i) => (
                        <li key={i} className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-zinc-200">
                           <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                           {label}
                        </li>
                      ))}
                   </ul>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 dark:bg-white/5 border-t border-slate-200 dark:border-white/10 flex justify-between items-center">
                <p className="text-[12px] text-slate-500 dark:text-zinc-300 font-medium italic">Your early access status is permanent as a founding member.</p>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  <span className="text-[11px] font-bold text-slate-900 dark:text-white uppercase">Legacy Status</span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section: Stores ── */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Connected Stores</h2>
                <p className="text-[13px] text-slate-500 dark:text-zinc-300">The Shopify properties connected to this account.</p>
              </div>
              <Button size="sm" variant="outline" className="h-8 rounded-[6px] border-slate-200 dark:border-white/10 text-[12px] font-bold" onClick={() => navigate("/connect")}>
                 Connect Store
              </Button>
            </div>
            <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              {(stores as any[]).length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-[13px] text-slate-400 dark:text-zinc-400">No stores connected yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {(stores as any[]).map((store) => (
                    <div key={store.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-[6px] bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-slate-400 dark:text-zinc-400" />
                        </div>
                        <div>
                          <p className="text-[14px] font-bold text-slate-900 dark:text-white">{store.name}</p>
                          <p className="text-[12px] text-slate-400 dark:text-zinc-400 font-mono">{store.domain}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                       {store.id === activeStoreId ? (
                           <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-[4px] border border-emerald-100 dark:border-emerald-500/20">ACTIVE</span>
                        ) : (
                          <button 
                            onClick={() => setActiveStoreId(store.id)}
                            className="text-[12px] font-medium text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:text-white transition-colors"
                          >
                            Switch to
                          </button>
                        )}
                        <button 
                          onClick={() => setConfirmDeleteId(store.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        >
                          {confirmDeleteId === store.id ? (
                            <span className="text-[11px] font-bold text-red-600" onClick={(e) => { e.stopPropagation(); handleDelete(store.id); }}>CONFIRM</span>
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── Section: Appearance ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Appearance</h2>
              <p className="text-[13px] text-slate-500 dark:text-zinc-300">Customize the UI theme of the application.</p>
            </div>
            <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div className="p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Dark Mode</h3>
                  <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">Switch between Light, Dark, or System themes.</p>
                </div>
                <div className="flex bg-slate-100/50 dark:bg-white/5 p-1 rounded-[10px] border border-slate-200/50 dark:border-white/5">
                  {(["light", "dark", "system"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-4 py-1.5 rounded-[6px] text-[12px] font-bold capitalize transition-all ${
                        theme === t 
                          ? "bg-white dark:bg-[#111214] text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-white/10" 
                          : "text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:text-slate-200 border border-transparent"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
          
          {/* ── Section: Session ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Session</h2>
              <p className="text-[13px] text-slate-500 dark:text-zinc-300">Manage your active session on this device.</p>
            </div>
            <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div className="p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Sign Out</h3>
                  <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">Sign out of your account on this browser.</p>
                </div>
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    try {
                      await logout();
                      navigate("/");
                    } catch {
                      toast({ title: "Sign out failed", variant: "destructive" });
                    }
                  }}
                  className="h-9 px-4 rounded-[6px] border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-200 hover:text-slate-900 dark:text-white font-bold text-[13px]"
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </section>

          {/* ── Section: Danger Zone ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-[16px] font-bold text-red-600 tracking-tight">Danger Zone</h2>
              <p className="text-[13px] text-slate-500 dark:text-zinc-300">Irreversible actions for your account and data.</p>
            </div>
            <div className="bg-white dark:bg-[#080808] rounded-[16px] border border-red-100 dark:border-red-500/20 overflow-hidden shadow-sm">
              <div className="p-6 flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Delete Account</h3>
                  <p className="text-[13px] text-slate-500 dark:text-zinc-300 mt-1">Permanently remove your account and all associated store data.</p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="h-9 px-4 rounded-[6px] bg-red-600 hover:bg-red-700 text-[13px] font-bold shadow-sm">
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[16px] border-slate-200 dark:border-white/10 shadow-xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-slate-900 dark:text-white font-bold">Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription className="text-slate-500 dark:text-zinc-300">
                        This action cannot be undone. This will permanently delete your
                        account and remove all your store data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-4">
                      <AlertDialogCancel className="rounded-[6px] border-slate-200 dark:border-white/10">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDeleteAccount}
                        disabled={isDeletingAccount}
                        className="bg-red-600 hover:bg-red-700 text-white rounded-[6px] font-bold"
                      >
                        {isDeletingAccount ? "Deleting..." : "Yes, Delete Everything"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
