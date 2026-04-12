import { useState, useCallback, useEffect } from "react";
import { useTelegram } from "./providers/TelegramProvider";
import { TabBar } from "./components/TabBar";
import { ScreenLoader } from "./components/LoadingSpinner";
import { Dashboard } from "./pages/Dashboard";
import { IssueList } from "./pages/IssueList";
import { QuickCreate } from "./pages/QuickCreate";
import { IssueDetail } from "./pages/IssueDetail";
import { Approvals } from "./pages/Approvals";

type Screen =
  | { type: "dashboard" }
  | { type: "issues" }
  | { type: "create" }
  | { type: "approvals" }
  | { type: "issue-detail"; issueId: string };

const TABS = [
  { key: "dashboard", label: "Home", icon: <HomeIcon /> },
  { key: "issues", label: "Issues", icon: <ListIcon /> },
  { key: "create", label: "Create", icon: <PlusIcon /> },
  { key: "approvals", label: "Approvals", icon: <CheckIcon /> },
];

export function MiniApp() {
  const { isReady, isAuthenticated, error, companyId } = useTelegram();
  const [screen, setScreen] = useState<Screen>({ type: "dashboard" });
  const [history, setHistory] = useState<Screen[]>([]);

  const navigate = useCallback((next: Screen) => {
    setHistory((h) => [...h, screen]);
    setScreen(next);
  }, [screen]);

  const goBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setScreen(prev);
      return h.slice(0, -1);
    });
  }, []);

  // Telegram BackButton integration
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    if (history.length > 0) {
      tg.BackButton.show();
      tg.BackButton.onClick(goBack);
    } else {
      tg.BackButton.hide();
    }

    return () => {
      tg.BackButton.offClick(goBack);
    };
  }, [history.length, goBack]);

  if (!isReady) {
    return <ScreenLoader />;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
        <p className="text-sm text-[var(--tg-theme-hint-color)]">
          {error || "Open this app from a Telegram bot to get started."}
        </p>
      </div>
    );
  }

  const activeTab = screen.type === "issue-detail" ? "issues" : screen.type;

  function handleTabChange(key: string) {
    setHistory([]);
    setScreen({ type: key } as Screen);
  }

  function renderScreen() {
    switch (screen.type) {
      case "dashboard":
        return <Dashboard companyId={companyId!} onIssueClick={(id) => navigate({ type: "issue-detail", issueId: id })} />;
      case "issues":
        return <IssueList companyId={companyId!} onIssueClick={(id) => navigate({ type: "issue-detail", issueId: id })} />;
      case "create":
        return <QuickCreate companyId={companyId!} onCreated={(id) => navigate({ type: "issue-detail", issueId: id })} />;
      case "approvals":
        return <Approvals companyId={companyId!} />;
      case "issue-detail":
        return <IssueDetail issueId={screen.issueId} />;
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pb-16 overflow-y-auto">
        {renderScreen()}
      </div>
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

// Simple SVG icons for the tab bar
function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}
