import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY_OPEN = "paperclip:chatPanel.open";
const STORAGE_KEY_AGENT = "paperclip:chatPanel.agentId";
const STORAGE_KEY_WIDTH = "paperclip:chatPanel.width";

export const DEFAULT_PANEL_WIDTH = 400;
export const MIN_PANEL_WIDTH = 300;
export const MAX_PANEL_WIDTH = 600;

interface ChatSidePanelContextValue {
  isOpen: boolean;
  agentId: string | null;
  agentName: string | null;
  agentRouteId: string | null;
  adapterType: string | null;
  panelWidth: number;
  openChat: (agent: { id: string; name: string; routeId: string; adapterType: string }) => void;
  closeChat: () => void;
  toggleChat: (agent?: { id: string; name: string; routeId: string; adapterType: string }) => void;
  setPanelWidth: (width: number) => void;
}

const ChatSidePanelContext = createContext<ChatSidePanelContextValue | null>(null);

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

export function ChatSidePanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => readBool(STORAGE_KEY_OPEN, false));
  const [agentId, setAgentId] = useState<string | null>(() => readString(STORAGE_KEY_AGENT));
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentRouteId, setAgentRouteId] = useState<string | null>(null);
  const [adapterType, setAdapterType] = useState<string | null>(null);
  const [panelWidth, setPanelWidthState] = useState(() =>
    Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, readNumber(STORAGE_KEY_WIDTH, DEFAULT_PANEL_WIDTH))),
  );

  const openChat = useCallback(
    (agent: { id: string; name: string; routeId: string; adapterType: string }) => {
      setIsOpen(true);
      setAgentId(agent.id);
      setAgentName(agent.name);
      setAgentRouteId(agent.routeId);
      setAdapterType(agent.adapterType);
      write(STORAGE_KEY_OPEN, "true");
      write(STORAGE_KEY_AGENT, agent.id);
    },
    [],
  );

  const closeChat = useCallback(() => {
    setIsOpen(false);
    write(STORAGE_KEY_OPEN, "false");
  }, []);

  const toggleChat = useCallback(
    (agent?: { id: string; name: string; routeId: string; adapterType: string }) => {
      if (agent && agentId !== agent.id) {
        openChat(agent);
        return;
      }
      if (isOpen) {
        closeChat();
      } else if (agent) {
        openChat(agent);
      }
    },
    [agentId, isOpen, openChat, closeChat],
  );

  const setPanelWidth = useCallback((width: number) => {
    const clamped = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, width));
    setPanelWidthState(clamped);
    write(STORAGE_KEY_WIDTH, String(clamped));
  }, []);

  const value = useMemo<ChatSidePanelContextValue>(
    () => ({
      isOpen,
      agentId,
      agentName,
      agentRouteId,
      adapterType,
      panelWidth,
      openChat,
      closeChat,
      toggleChat,
      setPanelWidth,
    }),
    [isOpen, agentId, agentName, agentRouteId, adapterType, panelWidth, openChat, closeChat, toggleChat, setPanelWidth],
  );

  return <ChatSidePanelContext.Provider value={value}>{children}</ChatSidePanelContext.Provider>;
}

export function useChatSidePanel() {
  const ctx = useContext(ChatSidePanelContext);
  if (!ctx) {
    throw new Error("useChatSidePanel must be used within ChatSidePanelProvider");
  }
  return ctx;
}
