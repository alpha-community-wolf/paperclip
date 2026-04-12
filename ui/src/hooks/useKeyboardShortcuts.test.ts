import { describe, expect, it } from "vitest";
import { resolveShortcutAction } from "./useKeyboardShortcuts";

function keyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: "",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("resolveShortcutAction", () => {
  it("returns null for regular keys inside editable targets", () => {
    const action = resolveShortcutAction(
      keyEvent({ key: "[" }),
      { tagName: "INPUT", isContentEditable: false },
    );

    expect(action).toBeNull();
  });

  it("maps Cmd/Ctrl+Shift+A to agent sidebar toggle", () => {
    const action = resolveShortcutAction(
      keyEvent({ key: "A", metaKey: true, shiftKey: true }),
      { tagName: "DIV", isContentEditable: false },
    );

    expect(action).toBe("toggleAgentsSidebar");
  });

  it("maps bracket shortcuts to sidebar and panel actions", () => {
    const sidebarAction = resolveShortcutAction(
      keyEvent({ key: "[" }),
      { tagName: "DIV", isContentEditable: false },
    );
    const panelAction = resolveShortcutAction(
      keyEvent({ key: "]" }),
      { tagName: "DIV", isContentEditable: false },
    );

    expect(sidebarAction).toBe("toggleSidebar");
    expect(panelAction).toBe("togglePanel");
  });
});
