import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "@/lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CompanyProvider } from "./context/CompanyContext";
import { LiveUpdatesProvider } from "./context/LiveUpdatesProvider";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { PanelProvider } from "./context/PanelContext";
import { SidebarProvider } from "./context/SidebarContext";
import { AgentsSidebarProvider } from "./context/AgentsSidebarContext";
import { DialogProvider } from "./context/DialogContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@mdxeditor/editor/style.css";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CompanyProvider>
          <ToastProvider>
            <LiveUpdatesProvider>
              <BrowserRouter>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <SidebarProvider>
                      <AgentsSidebarProvider>
                      <PanelProvider>
                        <DialogProvider>
                          <ErrorBoundary>
                            <App />
                          </ErrorBoundary>
                        </DialogProvider>
                      </PanelProvider>
                      </AgentsSidebarProvider>
                    </SidebarProvider>
                  </BreadcrumbProvider>
                </TooltipProvider>
              </BrowserRouter>
            </LiveUpdatesProvider>
          </ToastProvider>
        </CompanyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
