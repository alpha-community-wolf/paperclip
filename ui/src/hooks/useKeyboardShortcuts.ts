import { useEffect } from "react";

interface ShortcutHandlers {
  onNewIssue?: () => void;
  onToggleSidebar?: () => void;
  onTogglePanel?: () => void;
  onToggleContentWidth?: () => void;
  onToggleChatPanel?: () => void;
  onSwitchCompany?: (index: number) => void;
}

export function useKeyboardShortcuts({ onNewIssue, onToggleSidebar, onTogglePanel, onToggleContentWidth, onToggleChatPanel, onSwitchCompany }: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // Cmd+1..9 → Switch company
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        onSwitchCompany?.(parseInt(e.key, 10) - 1);
        return;
      }

      // C → New Issue (when not in input)
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onNewIssue?.();
      }

      // [ → Toggle Sidebar
      if (e.key === "[" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onToggleSidebar?.();
      }

      // ] → Toggle Panel
      if (e.key === "]" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onTogglePanel?.();
      }

      // \ → Toggle Content Width
      if (e.key === "\\" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onToggleContentWidth?.();
      }
    }

    function handleGlobalKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl+N → New Issue (works even from inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        onNewIssue?.();
      }

      // Cmd/Ctrl+Shift+C → Toggle Chat Panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "C") {
        e.preventDefault();
        onToggleChatPanel?.();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [onNewIssue, onToggleSidebar, onTogglePanel, onToggleContentWidth, onToggleChatPanel, onSwitchCompany]);
}
