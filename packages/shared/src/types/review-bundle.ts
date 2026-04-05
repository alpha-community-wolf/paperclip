export type ReviewBundleRequirementMode = "optional" | "required";

export type IssueReviewBundleMode = "inherit" | ReviewBundleRequirementMode;

export interface ProjectReviewBundlePolicy {
  enabled: boolean;
  defaultMode?: ReviewBundleRequirementMode;
  allowIssueOverride?: boolean;
}

export type IssueReviewBundleStatus = "draft" | "submitted" | "changes_requested" | "approved";

export interface IssueReviewBundleExternalLink {
  label: string;
  url: string;
}

export interface IssueReviewBundleEvidence {
  attachments?: string[];
  pullRequestUrl?: string | null;
  commitShas?: string[];
  externalLinks?: IssueReviewBundleExternalLink[];
}

export interface IssueReviewBundle {
  id: string;
  companyId: string;
  issueId: string;
  status: IssueReviewBundleStatus;
  requestedReviewerUserId: string | null;
  submittedByAgentId: string | null;
  submittedByUserId: string | null;
  decidedByUserId: string | null;
  decidedByAgentId: string | null;
  summary: string;
  deliverable: string;
  testingNotes: string | null;
  riskNotes: string | null;
  followUpNotes: string | null;
  evidence: IssueReviewBundleEvidence | null;
  linkedRunId: string | null;
  decisionNote: string | null;
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
