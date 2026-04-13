/** Board UI draft key (browser session cookie auth). */
export const BOARD_ISSUE_DRAFT_KEY = "paperclip:issue-draft";

/** Telegram mini app draft key — isolated from board drafts. */
export const MINI_APP_ISSUE_DRAFT_KEY = "paperclip:issue-draft:mini-app";

export const DEBOUNCE_MS = 800;

// TODO(issue-worktree-support): re-enable this UI once the workflow is ready to ship.
export const SHOW_EXPERIMENTAL_ISSUE_WORKTREE_UI = false;

export interface IssueDraft {
  title: string;
  description: string;
  type: "task" | "plan" | "explore";
  status: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  assigneeModelOverride: string;
  assigneeThinkingEffort: string;
  assigneeChrome: boolean;
  useIsolatedExecutionWorkspace: boolean;
  reviewBundleMode: "inherit" | "optional" | "required";
  recurringEnabled: boolean;
  recurringName: string;
  recurringExpression: string;
  recurringTimezone: string;
  recurringIssueMode: "create_new" | "reuse_existing" | "reopen_existing";
}

export interface IssueCreateDefaults {
  title?: string;
  description?: string;
  type?: "task" | "plan" | "explore";
  status?: string;
  priority?: string;
  projectId?: string;
  assigneeAgentId?: string;
  attachedFile?: string;
}

/** Stable empty defaults for hosts that do not use DialogContext (e.g. mini app). */
export const EMPTY_ISSUE_CREATE_DEFAULTS: IssueCreateDefaults = {};

export const ISSUE_OVERRIDE_ADAPTER_TYPES = new Set(["claude_local", "codex_local", "opencode_local"]);

export const ISSUE_THINKING_EFFORT_OPTIONS = {
  claude_local: [
    { value: "", label: "Default" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  codex_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ],
  opencode_local: [
    { value: "", label: "Default" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
  ],
} as const;

export function buildAssigneeAdapterOverrides(input: {
  adapterType: string | null | undefined;
  modelOverride: string;
  thinkingEffortOverride: string;
  chrome: boolean;
}): Record<string, unknown> | null {
  const adapterType = input.adapterType ?? null;
  if (!adapterType || !ISSUE_OVERRIDE_ADAPTER_TYPES.has(adapterType)) {
    return null;
  }

  const adapterConfig: Record<string, unknown> = {};
  if (input.modelOverride) adapterConfig.model = input.modelOverride;
  if (input.thinkingEffortOverride) {
    if (adapterType === "codex_local") {
      adapterConfig.modelReasoningEffort = input.thinkingEffortOverride;
    } else if (adapterType === "opencode_local") {
      adapterConfig.variant = input.thinkingEffortOverride;
    } else if (adapterType === "claude_local") {
      adapterConfig.effort = input.thinkingEffortOverride;
    }
  }
  if (adapterType === "claude_local" && input.chrome) {
    adapterConfig.chrome = true;
  }

  const overrides: Record<string, unknown> = {};
  if (Object.keys(adapterConfig).length > 0) {
    overrides.adapterConfig = adapterConfig;
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}

/** Return black or white hex based on background luminance (WCAG perceptual weights). */
export function getContrastTextColor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

export function createDraftStorage(draftKey: string) {
  return {
    loadDraft(): IssueDraft | null {
      try {
        const raw = localStorage.getItem(draftKey);
        if (!raw) return null;
        return JSON.parse(raw) as IssueDraft;
      } catch {
        return null;
      }
    },
    saveDraft(draft: IssueDraft) {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    },
    clearDraft() {
      localStorage.removeItem(draftKey);
    },
  };
}

export function scopedQueryKey(cacheScope: "board" | "mini-app", key: readonly unknown[]): readonly unknown[] {
  if (cacheScope === "board") return key;
  return ["mini-app", "issue-create", ...key];
}
