import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueReviewBundles, issues, projects } from "@paperclipai/db";
import type {
  IssueReviewBundleEvidence,
  IssueReviewBundleStatus,
  ProjectReviewBundlePolicy,
} from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import {
  parseIssueReviewBundleMode,
  parseProjectReviewBundlePolicy,
  resolveReviewBundleRequirement,
} from "./review-bundle-policy.js";

type IssueReviewBundleRow = typeof issueReviewBundles.$inferSelect;

function toIssueReviewBundle(row: IssueReviewBundleRow) {
  return {
    ...row,
    status: row.status as IssueReviewBundleStatus,
    evidence: (row.evidence as IssueReviewBundleEvidence | null | undefined) ?? null,
  };
}

function assertCanResolve(status: IssueReviewBundleStatus) {
  if (status !== "submitted") {
    throw unprocessable("Only submitted review bundles can be resolved");
  }
}

export function reviewBundleService(db: Db) {
  return {
    getByIssueId: async (issueId: string) => {
      const row = await db
        .select()
        .from(issueReviewBundles)
        .where(eq(issueReviewBundles.issueId, issueId))
        .then((rows) => rows[0] ?? null);
      return row ? toIssueReviewBundle(row) : null;
    },

    hasApprovedBundleForIssue: async (issueId: string) => {
      const row = await db
        .select({ id: issueReviewBundles.id })
        .from(issueReviewBundles)
        .where(
          and(
            eq(issueReviewBundles.issueId, issueId),
            eq(issueReviewBundles.status, "approved"),
          ),
        )
        .then((rows) => rows[0] ?? null);
      return Boolean(row);
    },

    upsertDraft: async (
      issueId: string,
      actor: { agentId?: string | null; userId?: string | null },
      data: {
        summary: string;
        deliverable: string;
        testingNotes?: string | null;
        riskNotes?: string | null;
        followUpNotes?: string | null;
        requestedReviewerUserId?: string | null;
        evidence?: IssueReviewBundleEvidence | null;
        linkedRunId?: string | null;
      },
    ) => {
      const issue = await db
        .select({ id: issues.id, companyId: issues.companyId })
        .from(issues)
        .where(eq(issues.id, issueId))
        .then((rows) => rows[0] ?? null);
      if (!issue) throw notFound("Issue not found");

      const now = new Date();
      const [row] = await db
        .insert(issueReviewBundles)
        .values({
          companyId: issue.companyId,
          issueId,
          status: "draft",
          summary: data.summary,
          deliverable: data.deliverable,
          testingNotes: data.testingNotes ?? null,
          riskNotes: data.riskNotes ?? null,
          followUpNotes: data.followUpNotes ?? null,
          requestedReviewerUserId: data.requestedReviewerUserId ?? null,
          evidence: (data.evidence ?? null) as Record<string, unknown> | null,
          linkedRunId: data.linkedRunId ?? null,
          submittedByAgentId: actor.agentId ?? null,
          submittedByUserId: actor.userId ?? null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [issueReviewBundles.issueId],
          set: {
            status: "draft",
            summary: data.summary,
            deliverable: data.deliverable,
            testingNotes: data.testingNotes ?? null,
            riskNotes: data.riskNotes ?? null,
            followUpNotes: data.followUpNotes ?? null,
            requestedReviewerUserId: data.requestedReviewerUserId ?? null,
            evidence: (data.evidence ?? null) as Record<string, unknown> | null,
            linkedRunId: data.linkedRunId ?? null,
            submittedByAgentId: actor.agentId ?? null,
            submittedByUserId: actor.userId ?? null,
            decisionNote: null,
            decidedByUserId: null,
            decidedByAgentId: null,
            decidedAt: null,
            submittedAt: null,
            updatedAt: now,
          },
        })
        .returning();

      return toIssueReviewBundle(row);
    },

    submit: async (
      issueId: string,
      actor: { agentId?: string | null; userId?: string | null },
      patch: {
        summary?: string;
        deliverable?: string;
        testingNotes?: string | null;
        riskNotes?: string | null;
        followUpNotes?: string | null;
        requestedReviewerUserId?: string | null;
        evidence?: IssueReviewBundleEvidence | null;
        linkedRunId?: string | null;
      },
    ) => {
      const existing = await db
        .select()
        .from(issueReviewBundles)
        .where(eq(issueReviewBundles.issueId, issueId))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("Review bundle not found");

      const nextSummary = patch.summary ?? existing.summary;
      const nextDeliverable = patch.deliverable ?? existing.deliverable;
      if (!nextSummary.trim() || !nextDeliverable.trim()) {
        throw unprocessable("Review bundle summary and deliverable are required before submit");
      }

      const now = new Date();
      const [updated] = await db
        .update(issueReviewBundles)
        .set({
          status: "submitted",
          summary: nextSummary,
          deliverable: nextDeliverable,
          testingNotes: patch.testingNotes === undefined ? existing.testingNotes : patch.testingNotes,
          riskNotes: patch.riskNotes === undefined ? existing.riskNotes : patch.riskNotes,
          followUpNotes: patch.followUpNotes === undefined ? existing.followUpNotes : patch.followUpNotes,
          requestedReviewerUserId:
            patch.requestedReviewerUserId === undefined ? existing.requestedReviewerUserId : patch.requestedReviewerUserId,
          evidence:
            patch.evidence === undefined
              ? existing.evidence
              : ((patch.evidence ?? null) as Record<string, unknown> | null),
          linkedRunId: patch.linkedRunId === undefined ? existing.linkedRunId : patch.linkedRunId,
          submittedByAgentId: actor.agentId ?? null,
          submittedByUserId: actor.userId ?? null,
          submittedAt: now,
          decisionNote: null,
          decidedByUserId: null,
          decidedByAgentId: null,
          decidedAt: null,
          updatedAt: now,
        })
        .where(eq(issueReviewBundles.issueId, issueId))
        .returning();

      return toIssueReviewBundle(updated);
    },

    approve: async (issueId: string, input: { decidedByUserId: string; decidedByAgentId?: string | null; decisionNote?: string | null }) => {
      const existing = await db
        .select()
        .from(issueReviewBundles)
        .where(eq(issueReviewBundles.issueId, issueId))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("Review bundle not found");
      assertCanResolve(existing.status as IssueReviewBundleStatus);

      const now = new Date();
      const [updated] = await db
        .update(issueReviewBundles)
        .set({
          status: "approved",
          decidedByUserId: input.decidedByUserId,
          decidedByAgentId: input.decidedByAgentId ?? null,
          decisionNote: input.decisionNote ?? null,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(issueReviewBundles.issueId, issueId))
        .returning();

      return toIssueReviewBundle(updated);
    },

    requestChanges: async (issueId: string, input: { decidedByUserId: string; decidedByAgentId?: string | null; decisionNote?: string | null }) => {
      const existing = await db
        .select()
        .from(issueReviewBundles)
        .where(eq(issueReviewBundles.issueId, issueId))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("Review bundle not found");
      assertCanResolve(existing.status as IssueReviewBundleStatus);

      const now = new Date();
      const [updated] = await db
        .update(issueReviewBundles)
        .set({
          status: "changes_requested",
          decidedByUserId: input.decidedByUserId,
          decidedByAgentId: input.decidedByAgentId ?? null,
          decisionNote: input.decisionNote ?? null,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(issueReviewBundles.issueId, issueId))
        .returning();

      return toIssueReviewBundle(updated);
    },

    isCompletionAllowedForIssue: async (input: {
      issueId: string;
      companyId: string;
      projectId: string | null;
      reviewBundleMode: string | null;
    }) => {
      let projectPolicy: ProjectReviewBundlePolicy | null = null;
      if (input.projectId) {
        const project = await db
          .select({ reviewBundlePolicy: projects.reviewBundlePolicy })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.companyId, input.companyId)))
          .then((rows) => rows[0] ?? null);
        projectPolicy = parseProjectReviewBundlePolicy(project?.reviewBundlePolicy);
      }

      const requirement = resolveReviewBundleRequirement({
        projectPolicy,
        issueMode: parseIssueReviewBundleMode(input.reviewBundleMode),
      });
      if (!requirement.enabled || requirement.mode === "optional") {
        return { allowed: true as const, requirement };
      }

      const approved = await db
        .select({ id: issueReviewBundles.id })
        .from(issueReviewBundles)
        .where(
          and(
            eq(issueReviewBundles.issueId, input.issueId),
            eq(issueReviewBundles.status, "approved"),
          ),
        )
        .then((rows) => rows[0] ?? null);

      return {
        allowed: Boolean(approved),
        requirement,
      };
    },
  };
}
