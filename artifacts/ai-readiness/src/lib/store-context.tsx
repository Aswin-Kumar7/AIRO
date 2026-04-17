import React, { createContext, useContext, useState, useEffect } from "react";

interface StoreContextType {
  activeStoreId: string | null;
  setActiveStoreId: (id: string | null) => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [activeStoreId, setActiveStoreId] = useState<string | null>(() => {
    return localStorage.getItem("activeStoreId");
  });

  useEffect(() => {
    if (activeStoreId) {
      localStorage.setItem("activeStoreId", activeStoreId);
    } else {
      localStorage.removeItem("activeStoreId");
    }
  }, [activeStoreId]);

  return (
    <StoreContext.Provider value={{ activeStoreId, setActiveStoreId }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStoreContext() {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error("useStoreContext must be used within a StoreProvider");
  }
  return context;
}
