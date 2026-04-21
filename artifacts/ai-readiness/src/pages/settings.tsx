import { useState } from "react";
import { useStore } from "@/context/store-context";
import { useAuth } from "@/context/auth-context";
import { useListStores, getListStoresQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Store, Trash2, Plus, User, Mail, ExternalLink } from "lucide-react";
import { deleteStore } from "@/lib/quick-fix-api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Settings() {
  const { activeStoreId, setActiveStoreId } = useStore();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: stores = [] } = useListStores({ query: { staleTime: 30_000, queryKey: getListStoresQueryKey() } });

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
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your account and connected stores</p>
        </div>

        {/* Account */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" /> Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {user ? (
              <div className="flex items-center gap-3">
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt={user.name ?? "Avatar"} className="w-10 h-10 rounded-full" />
                )}
                <div>
                  {user.name && <p className="text-sm font-medium text-slate-900">{user.name}</p>}
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Mail className="w-3 h-3" />{user.email}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Not signed in</p>
            )}
          </CardContent>
        </Card>

        {/* Stores */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="w-4 h-4 text-indigo-500" /> Connected stores
              </CardTitle>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => navigate("/connect")}>
                <Plus className="w-3 h-3" /> Add store
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {(stores as Array<{ id: string; name: string; domain: string }>).length === 0 ? (
              <div className="text-center py-8">
                <Store className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No stores connected yet</p>
                <Button size="sm" className="mt-3 bg-indigo-600 hover:bg-indigo-700 gap-1.5" onClick={() => navigate("/connect")}>
                  <Plus className="w-3 h-3" /> Connect your first store
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {(stores as Array<{ id: string; name: string; domain: string }>).map((store) => (
                  <div key={store.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{store.name}</p>
                        {store.id === activeStoreId && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 bg-indigo-100 text-indigo-700">Active</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                        <ExternalLink className="w-3 h-3" />
                        <a href={`https://${store.domain}`} target="_blank" rel="noreferrer" className="hover:text-indigo-600">
                          {store.domain}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {store.id !== activeStoreId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-slate-500"
                          onClick={() => setActiveStoreId(store.id)}
                        >
                          Set active
                        </Button>
                      )}
                      {confirmDeleteId === store.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-600">Sure?</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            disabled={deletingId === store.id}
                            onClick={() => handleDelete(store.id)}
                          >
                            Yes, remove
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                          onClick={() => handleDelete(store.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 mb-0.5">Environment variables required</p>
                <p className="text-xs text-amber-700">
                  Ensure <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code>,{" "}
                  <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code>,{" "}
                  <code className="bg-amber-100 px-1 rounded">GOOGLE_REDIRECT_URI</code>, and{" "}
                  <code className="bg-amber-100 px-1 rounded">SESSION_SECRET</code> are set on the API server.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
