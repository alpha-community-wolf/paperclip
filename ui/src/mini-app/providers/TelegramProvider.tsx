import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MiniAppAuthResponse } from "@paperclipai/shared";
import { miniAppApi } from "../api/client";

interface TelegramContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  user: MiniAppAuthResponse["user"] | null;
  companyId: string | null;
  colorScheme: "light" | "dark";
  error: string | null;
}

const TelegramContext = createContext<TelegramContextValue>({
  isReady: false,
  isAuthenticated: false,
  user: null,
  companyId: null,
  colorScheme: "dark",
  error: null,
});

export function useTelegram() {
  return useContext(TelegramContext);
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TelegramContextValue>({
    isReady: false,
    isAuthenticated: false,
    user: null,
    companyId: null,
    colorScheme: "dark",
    error: null,
  });

  useEffect(() => {
    async function init() {
      const tg = window.Telegram?.WebApp;

      if (!tg) {
        // Dev mode — no Telegram context
        setState((s) => ({ ...s, isReady: true, error: "Not running inside Telegram" }));
        return;
      }

      tg.ready();
      tg.expand();

      const colorScheme = tg.colorScheme || "dark";
      const initData = tg.initData;

      if (!initData) {
        setState((s) => ({ ...s, isReady: true, colorScheme, error: "No initData available" }));
        return;
      }

      // Extract bot ID from initData or use a fallback method
      // The bot_id isn't in initData directly; we derive it from the page URL or start_param
      const botId = new URLSearchParams(window.location.search).get("bot_id") ?? "";

      try {
        const result = await miniAppApi.auth(initData, botId);
        miniAppApi.setToken(result.token);
        setState({
          isReady: true,
          isAuthenticated: true,
          user: result.user,
          companyId: result.companyId,
          colorScheme,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Authentication failed";
        setState((s) => ({ ...s, isReady: true, colorScheme, error: message }));
      }
    }

    init();
  }, []);

  return (
    <TelegramContext.Provider value={state}>
      {children}
    </TelegramContext.Provider>
  );
}
