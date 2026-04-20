import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface StoreContextValue {
  activeStoreId: string | null;
  setActiveStoreId: (id: string | null) => void;
}

const StoreContext = createContext<StoreContextValue>({
  activeStoreId: null,
  setActiveStoreId: () => {},
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [activeStoreId, setActiveStoreIdState] = useState<string | null>(() => {
    return localStorage.getItem("activeStoreId") ?? null;
  });

  function setActiveStoreId(id: string | null) {
    setActiveStoreIdState(id);
    if (id) {
      localStorage.setItem("activeStoreId", id);
    } else {
      localStorage.removeItem("activeStoreId");
    }
  }

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === "activeStoreId") {
        setActiveStoreIdState(event.newValue);
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <StoreContext.Provider value={{ activeStoreId, setActiveStoreId }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
