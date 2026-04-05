import type { IssueReviewBundleMode, ProjectReviewBundlePolicy, ReviewBundleRequirementMode } from "@paperclipai/shared";
import { asString, parseObject } from "../adapters/utils.js";

export interface EffectiveReviewBundleRequirement {
  enabled: boolean;
  mode: ReviewBundleRequirementMode;
  source: "project" | "issue";
}

export function parseProjectReviewBundlePolicy(raw: unknown): ProjectReviewBundlePolicy | null {
  const parsed = parseObject(raw);
  if (Object.keys(parsed).length === 0) return null;
  const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : false;
  const defaultMode = asString(parsed.defaultMode, "");
  const allowIssueOverride = typeof parsed.allowIssueOverride === "boolean" ? parsed.allowIssueOverride : undefined;
  const defaultReviewerAgentId = asString(parsed.defaultReviewerAgentId, "") || null;
  const defaultApproverAgentId = asString(parsed.defaultApproverAgentId, "") || null;
  const useManagerAsReviewer = typeof parsed.useManagerAsReviewer === "boolean" ? parsed.useManagerAsReviewer : undefined;
  return {
    enabled,
    ...(defaultMode === "optional" || defaultMode === "required" ? { defaultMode } : {}),
    ...(allowIssueOverride !== undefined ? { allowIssueOverride } : {}),
    ...(defaultReviewerAgentId ? { defaultReviewerAgentId } : {}),
    ...(defaultApproverAgentId ? { defaultApproverAgentId } : {}),
    ...(useManagerAsReviewer !== undefined ? { useManagerAsReviewer } : {}),
  };
}

export function parseIssueReviewBundleMode(raw: unknown): IssueReviewBundleMode {
  const value = asString(raw, "");
  if (value === "required" || value === "optional") return value;
  return "inherit";
}

export function resolveReviewBundleRequirement(input: {
  projectPolicy: ProjectReviewBundlePolicy | null;
  issueMode: IssueReviewBundleMode;
}): EffectiveReviewBundleRequirement {
  const projectPolicy = input.projectPolicy;
  const allowIssueOverride = projectPolicy?.allowIssueOverride ?? true;
  if (allowIssueOverride && input.issueMode !== "inherit") {
    return {
      enabled: true,
      mode: input.issueMode,
      source: "issue",
    };
  }

  if (!projectPolicy?.enabled) {
    return {
      enabled: false,
      mode: "optional",
      source: "project",
    };
  }

  return {
    enabled: true,
    mode: projectPolicy.defaultMode === "required" ? "required" : "optional",
    source: "project",
  };
}
