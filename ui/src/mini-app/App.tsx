import { useState, useCallback, useEffect } from "react";
import { Home, List, Plus, CheckSquare, Lock } from "lucide-react";
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
  { key: "dashboard", label: "Home", icon: <Home className="size-5" /> },
  { key: "issues", label: "Issues", icon: <List className="size-5" /> },
  { key: "create", label: "Create", icon: <Plus className="size-5" /> },
  { key: "approvals", label: "Approvals", icon: <CheckSquare className="size-5" /> },
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
        <Lock className="size-10 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
        <p className="text-sm text-muted-foreground">
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
    <div className="flex flex-col min-h-screen bg-background">
      <div className="flex-1 pb-16 overflow-y-auto">
        {renderScreen()}
      </div>
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
