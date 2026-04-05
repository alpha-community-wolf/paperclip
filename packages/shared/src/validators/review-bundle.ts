import { z } from "zod";

export const reviewBundleRequirementModeSchema = z.enum(["optional", "required"]);
export type ReviewBundleRequirementMode = z.infer<typeof reviewBundleRequirementModeSchema>;

export const issueReviewBundleModeSchema = z.enum(["inherit", "optional", "required"]);
export type IssueReviewBundleMode = z.infer<typeof issueReviewBundleModeSchema>;

export const projectReviewBundlePolicySchema = z
  .object({
    enabled: z.boolean(),
    defaultMode: reviewBundleRequirementModeSchema.optional(),
    allowIssueOverride: z.boolean().optional(),
  })
  .strict();

export type ProjectReviewBundlePolicy = z.infer<typeof projectReviewBundlePolicySchema>;

export const issueReviewBundleStatusSchema = z.enum(["draft", "submitted", "changes_requested", "approved"]);
export type IssueReviewBundleStatus = z.infer<typeof issueReviewBundleStatusSchema>;

export const issueReviewBundleExternalLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.string().url(),
});

export type IssueReviewBundleExternalLink = z.infer<typeof issueReviewBundleExternalLinkSchema>;

export const issueReviewBundleEvidenceSchema = z
  .object({
    attachments: z.array(z.string().uuid()).optional(),
    pullRequestUrl: z.string().url().nullable().optional(),
    commitShas: z.array(z.string().trim().min(4).max(128)).optional(),
    externalLinks: z.array(issueReviewBundleExternalLinkSchema).optional(),
  })
  .strict();

export type IssueReviewBundleEvidence = z.infer<typeof issueReviewBundleEvidenceSchema>;

const reviewBundleDraftFields = {
  summary: z.string().trim().min(1).max(8000),
  deliverable: z.string().trim().min(1).max(12000),
  testingNotes: z.string().trim().max(8000).optional().nullable(),
  riskNotes: z.string().trim().max(8000).optional().nullable(),
  followUpNotes: z.string().trim().max(8000).optional().nullable(),
  requestedReviewerUserId: z.string().optional().nullable(),
  evidence: issueReviewBundleEvidenceSchema.optional().nullable(),
  linkedRunId: z.string().uuid().optional().nullable(),
};

export const upsertIssueReviewBundleSchema = z.object(reviewBundleDraftFields);
export type UpsertIssueReviewBundle = z.infer<typeof upsertIssueReviewBundleSchema>;

export const submitIssueReviewBundleSchema = z.object({
  summary: reviewBundleDraftFields.summary.optional(),
  deliverable: reviewBundleDraftFields.deliverable.optional(),
  testingNotes: reviewBundleDraftFields.testingNotes,
  riskNotes: reviewBundleDraftFields.riskNotes,
  followUpNotes: reviewBundleDraftFields.followUpNotes,
  requestedReviewerUserId: reviewBundleDraftFields.requestedReviewerUserId,
  evidence: reviewBundleDraftFields.evidence,
  linkedRunId: reviewBundleDraftFields.linkedRunId,
}).partial();

export type SubmitIssueReviewBundle = z.infer<typeof submitIssueReviewBundleSchema>;

export const resolveIssueReviewBundleSchema = z.object({
  decisionNote: z.string().trim().max(4000).optional().nullable(),
  decidedByUserId: z.string().optional().default("board"),
  decidedByAgentId: z.string().uuid().optional().nullable(),
});

export type ResolveIssueReviewBundle = z.infer<typeof resolveIssueReviewBundleSchema>;
