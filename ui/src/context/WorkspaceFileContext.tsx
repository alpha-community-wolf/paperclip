import { createContext, useContext, useMemo, type ReactNode } from "react";

export interface WorkspaceFileContextValue {
  agentRouteId: string;
  workspaceCwd: string | null;
}

const WorkspaceFileContext = createContext<WorkspaceFileContextValue | null>(null);

export function WorkspaceFileProvider({
  agentRouteId,
  workspaceCwd,
  children,
}: {
  agentRouteId: string;
  workspaceCwd?: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ agentRouteId, workspaceCwd: workspaceCwd ?? null }),
    [agentRouteId, workspaceCwd],
  );
  return (
    <WorkspaceFileContext.Provider value={value}>
      {children}
    </WorkspaceFileContext.Provider>
  );
}

export function useWorkspaceFile(): WorkspaceFileContextValue | null {
  return useContext(WorkspaceFileContext);
}
