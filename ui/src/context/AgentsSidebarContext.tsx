import { createContext, useCallback, useContext, useMemo, useState, useEffect, type ReactNode } from "react";

interface AgentsSidebarContextValue {
  agentsSidebarOpen: boolean;
  setAgentsSidebarOpen: (open: boolean) => void;
  toggleAgentsSidebar: () => void;
}

const AgentsSidebarContext = createContext<AgentsSidebarContextValue | null>(null);

const STORAGE_KEY = "outpost.agentsSidebarOpen";
const COMFORT_BREAKPOINT = 1100;

export function AgentsSidebarProvider({ children }: { children: ReactNode }) {
  const [agentsSidebarOpen, setAgentsSidebarOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) return stored === "true";
    } catch {}
    return window.innerWidth >= COMFORT_BREAKPOINT;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${COMFORT_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          setAgentsSidebarOpen(stored !== null ? stored === "true" : true);
        } catch {
          setAgentsSidebarOpen(true);
        }
      }
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(agentsSidebarOpen)); } catch {}
  }, [agentsSidebarOpen]);

  const toggleAgentsSidebar = useCallback(() => setAgentsSidebarOpen((v) => !v), []);

  const value = useMemo<AgentsSidebarContextValue>(
    () => ({ agentsSidebarOpen, setAgentsSidebarOpen, toggleAgentsSidebar }),
    [agentsSidebarOpen, toggleAgentsSidebar],
  );

  return (
    <AgentsSidebarContext.Provider value={value}>
      {children}
    </AgentsSidebarContext.Provider>
  );
}

export function useAgentsSidebar() {
  const ctx = useContext(AgentsSidebarContext);
  if (!ctx) {
    throw new Error("useAgentsSidebar must be used within AgentsSidebarProvider");
  }
  return ctx;
}
