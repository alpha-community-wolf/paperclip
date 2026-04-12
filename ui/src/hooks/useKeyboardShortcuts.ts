import { useEffect } from "react";

interface ShortcutHandlers {
  onNewIssue?: () => void;
  onToggleSidebar?: () => void;
  onTogglePanel?: () => void;
  onToggleAgentsSidebar?: () => void;
  onToggleContentWidth?: () => void;
  onToggleChatPanel?: () => void;
  onSwitchCompany?: (index: number) => void;
}

export type ShortcutAction =
  | "newIssue"
  | "switchCompany"
  | "toggleSidebar"
  | "togglePanel"
  | "toggleAgentsSidebar"
  | "toggleContentWidth"
  | "toggleChatPanel";

type ShortcutTarget = {
  tagName?: string;
  isContentEditable?: boolean;
};

function isEditableTarget(target: ShortcutTarget | null): boolean {
  if (!target) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable === true;
}

export function resolveShortcutAction(e: KeyboardEvent, target: ShortcutTarget | null): ShortcutAction | null {
  const fromEditable = isEditableTarget(target);

  if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
    return "switchCompany";
  }

  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "C") {
    return "toggleChatPanel";
  }

  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "A") {
    return "toggleAgentsSidebar";
  }

  if ((e.metaKey || e.ctrlKey) && e.key === "n") {
    return "newIssue";
  }

  if (fromEditable) return null;

  if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return "newIssue";
  }

  if (e.key === "[" && !e.metaKey && !e.ctrlKey) {
    return "toggleSidebar";
  }

  if (e.key === "]" && !e.metaKey && !e.ctrlKey) {
    return "togglePanel";
  }

  if (e.key === "\\" && !e.metaKey && !e.ctrlKey) {
    return "toggleContentWidth";
  }

  return null;
}

export function useKeyboardShortcuts({
  onNewIssue,
  onToggleSidebar,
  onTogglePanel,
  onToggleAgentsSidebar,
  onToggleContentWidth,
  onToggleChatPanel,
  onSwitchCompany,
}: ShortcutHandlers) {
  useEffect(() => {
    function dispatchShortcut(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const action = resolveShortcutAction(e, target);
      if (!action) return;

      e.preventDefault();
      if (action === "newIssue") {
        onNewIssue?.();
        return;
      }
      if (action === "switchCompany") {
        onSwitchCompany?.(parseInt(e.key, 10) - 1);
        return;
      }
      if (action === "toggleSidebar") {
        onToggleSidebar?.();
        return;
      }
      if (action === "togglePanel") {
        onTogglePanel?.();
        return;
      }
      if (action === "toggleAgentsSidebar") {
        onToggleAgentsSidebar?.();
        return;
      }
      if (action === "toggleContentWidth") {
        onToggleContentWidth?.();
        return;
      }
      if (action === "toggleChatPanel") {
        onToggleChatPanel?.();
      }
    }

    document.addEventListener("keydown", dispatchShortcut);
    return () => {
      document.removeEventListener("keydown", dispatchShortcut);
    };
  }, [
    onNewIssue,
    onToggleSidebar,
    onTogglePanel,
    onToggleAgentsSidebar,
    onToggleContentWidth,
    onToggleChatPanel,
    onSwitchCompany,
  ]);
}
