import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getCsrfToken, clearCsrfToken } from "@/lib/csrf-service";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  logout: async () => {},
  refetch: async () => {},
});

const API_BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as AuthUser;
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  const logout = useCallback(async () => {
    const sendLogout = async (): Promise<Response> => {
      const csrfToken = await getCsrfToken();
      return fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken },
      });
    };

    let response = await sendLogout();
    if (response.status === 403) {
      // Retry once with a fresh CSRF token in case the cached token expired.
      clearCsrfToken();
      response = await sendLogout();
    }
    if (!response.ok) {
      throw new Error(`Logout failed (HTTP ${response.status})`);
    }

    clearCsrfToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, logout, refetch: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
