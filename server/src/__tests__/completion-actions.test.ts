import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processCompletionActions,
  extractCompletionActions,
  type CompletionAction,
  type CompletionIssue,
  type ActionContext,
} from "../services/completion-actions.js";

function makeIssue(overrides: Partial<CompletionIssue> = {}): CompletionIssue {
  return {
    id: "issue-1",
    companyId: "company-1",
    identifier: "COM-100",
    title: "Test issue",
    description: "A test issue",
    status: "done",
    priority: "medium",
    type: "task",
    parentId: "parent-1",
    projectId: "project-1",
    goalId: "goal-1",
    assigneeAgentId: "agent-1",
    assigneeUserId: null,
    executionAgentNameKey: "nexus",
    metadata: {
      summary: "Task completed successfully",
      outcome: "escalate",
      nextAgentId: "agent-2",
    },
    ...overrides,
  };
}

function makeCtx(): ActionContext & {
  createdIssues: Record<string, unknown>[];
  updatedIssues: { id: string; data: Record<string, unknown> }[];
  comments: { issueId: string; body: string }[];
  wakeups: { agentId: string; opts: Record<string, unknown> }[];
  activities: Record<string, unknown>[];
} {
  const state = {
    createdIssues: [] as Record<string, unknown>[],
    updatedIssues: [] as { id: string; data: Record<string, unknown> }[],
    comments: [] as { issueId: string; body: string }[],
    wakeups: [] as { agentId: string; opts: Record<string, unknown> }[],
    activities: [] as Record<string, unknown>[],
  };

  return {
    ...state,
    issueService: {
      create: vi.fn(async (_companyId: string, data: Record<string, unknown>) => {
        const created = { id: `created-${state.createdIssues.length + 1}`, ...data };
        state.createdIssues.push(created);
        return created;
      }),
      update: vi.fn(async (id: string, data: Record<string, unknown>) => {
        state.updatedIssues.push({ id, data });
        return { id, ...data };
      }),
      addComment: vi.fn(async (issueId: string, body: string) => {
        state.comments.push({ issueId, body });
        return { id: "comment-1", issueId, body };
      }),
    },
    heartbeat: {
      wakeup: vi.fn(async (agentId: string, opts: Record<string, unknown>) => {
        state.wakeups.push({ agentId, opts });
        return {};
      }),
    },
    logActivity: vi.fn(async (details: Record<string, unknown>) => {
      state.activities.push(details);
    }),
    actor: {
      actorType: "agent",
      actorId: "agent-1",
      agentId: "agent-1",
      runId: "run-1",
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as ActionContext["logger"],
  };
}

describe("extractCompletionActions", () => {
  it("returns null for null metadata", () => {
    expect(extractCompletionActions(null)).toBeNull();
  });

  it("returns null for metadata without completionActions", () => {
    expect(extractCompletionActions({ foo: "bar" })).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(extractCompletionActions({ completionActions: [] })).toBeNull();
  });

  it("returns null for non-array", () => {
    expect(extractCompletionActions({ completionActions: "not an array" })).toBeNull();
  });

  it("filters out invalid actions", () => {
    const result = extractCompletionActions({
      completionActions: [
        { type: "create_issue", template: { title: "Test" } },
        { noType: true },
        "invalid",
      ],
    });
    expect(result).toHaveLength(1);
    expect(result![0].type).toBe("create_issue");
  });

  it("returns valid actions", () => {
    const actions = [
      { type: "create_issue", template: { title: "Test" } },
      { type: "post_comment", targetIssueId: "x", body: "hello" },
    ];
    const result = extractCompletionActions({ completionActions: actions });
    expect(result).toHaveLength(2);
  });
});

describe("processCompletionActions", () => {
  describe("create_issue", () => {
    it("creates an issue with interpolated template", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "create_issue",
          template: {
            title: "Follow up: {{identifier}}",
            description: "Findings: {{metadata.summary}}",
            assigneeAgentId: "{{metadata.nextAgentId}}",
            status: "todo",
            parentId: "{{parentId}}",
          },
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
      expect(result.errors).toBe(0);
      expect(ctx.createdIssues).toHaveLength(1);
      expect(ctx.createdIssues[0]).toMatchObject({
        title: "Follow up: COM-100",
        description: "Findings: Task completed successfully",
        assigneeAgentId: "agent-2",
        status: "todo",
        parentId: "parent-1",
      });
    });

    it("nullifies empty-string ID fields", async () => {
      const issue = makeIssue({ metadata: {} });
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "create_issue",
          template: {
            title: "Test",
            assigneeAgentId: "{{metadata.nonexistent}}",
            assigneeUserId: null,
          },
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
      expect(ctx.createdIssues[0].assigneeAgentId).toBeNull();
    });

    it("inherits priority/project/goal from source issue", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "create_issue",
          template: { title: "Inherit test" },
        },
      ];

      await processCompletionActions(actions, issue, ctx);
      expect(ctx.createdIssues[0]).toMatchObject({
        priority: "medium",
        projectId: "project-1",
        goalId: "goal-1",
      });
    });
  });

  describe("update_issue", () => {
    it("updates a target issue with interpolated patch", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "update_issue",
          targetIssueId: "{{parentId}}",
          patch: { status: "in_review", metadata: { completedBy: "{{identifier}}" } },
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
      expect(ctx.updatedIssues[0]).toEqual({
        id: "parent-1",
        data: { status: "in_review", metadata: { completedBy: "COM-100" } },
      });
    });

    it("skips with error on empty targetIssueId", async () => {
      const issue = makeIssue({ parentId: null });
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "update_issue",
          targetIssueId: "{{parentId}}",
          patch: { status: "done" },
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.errors).toBe(1);
      expect(result.executed).toBe(0);
    });
  });

  describe("post_comment", () => {
    it("posts a comment with interpolated body", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "post_comment",
          targetIssueId: "{{parentId}}",
          body: "Step done by {{executionAgentNameKey}}: {{metadata.summary}}",
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
      expect(ctx.comments[0]).toEqual({
        issueId: "parent-1",
        body: "Step done by nexus: Task completed successfully",
      });
    });
  });

  describe("wake_agent", () => {
    it("wakes an agent with payload", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "wake_agent",
          agentId: "{{metadata.nextAgentId}}",
          reason: "follow_up",
          payload: { sourceIssue: "{{identifier}}" },
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
      expect(ctx.wakeups[0].agentId).toBe("agent-2");
      expect(ctx.wakeups[0].opts).toMatchObject({
        source: "automation",
        reason: "follow_up",
        payload: {
          sourceIssue: "COM-100",
          triggeredByIssueId: "issue-1",
          triggeredByIdentifier: "COM-100",
        },
      });
    });
  });

  describe("conditional", () => {
    it("executes then-branch when condition matches (eq)", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "conditional",
          condition: { field: "metadata.outcome", eq: "escalate" },
          then: [
            {
              type: "post_comment",
              targetIssueId: "{{parentId}}",
              body: "ESCALATION: {{title}}",
            },
          ],
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
      expect(ctx.comments[0].body).toBe("ESCALATION: Test issue");
    });

    it("skips then-branch when condition does not match", async () => {
      const issue = makeIssue({ metadata: { outcome: "normal" } });
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "conditional",
          condition: { field: "metadata.outcome", eq: "escalate" },
          then: [
            { type: "post_comment", targetIssueId: "parent-1", body: "Should not fire" },
          ],
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(0);
      expect(ctx.comments).toHaveLength(0);
    });

    it("supports neq condition", async () => {
      const issue = makeIssue({ metadata: { outcome: "success" } });
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "conditional",
          condition: { field: "metadata.outcome", neq: "escalate" },
          then: [
            { type: "post_comment", targetIssueId: "parent-1", body: "Not escalated" },
          ],
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
    });

    it("supports exists condition", async () => {
      const issue = makeIssue({ metadata: { summary: "found" } });
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "conditional",
          condition: { field: "metadata.summary", exists: true },
          then: [
            { type: "post_comment", targetIssueId: "parent-1", body: "Has summary" },
          ],
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
    });
  });

  describe("chain depth guard", () => {
    it("stops processing at max depth", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        { type: "post_comment", targetIssueId: "parent-1", body: "Too deep" },
      ];

      const result = await processCompletionActions(actions, issue, ctx, 6);
      expect(result.executed).toBe(0);
      expect(ctx.comments).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("continues processing after one action fails", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      // Make the first create fail
      (ctx.issueService.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("DB error"),
      );

      const actions: CompletionAction[] = [
        { type: "create_issue", template: { title: "Will fail" } },
        { type: "post_comment", targetIssueId: "parent-1", body: "Should succeed" },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(1);
      expect(result.errors).toBe(1);
      expect(ctx.comments).toHaveLength(1);
    });

    it("handles unknown action types gracefully", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions = [{ type: "unknown_type" }] as unknown as CompletionAction[];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.errors).toBe(1);
    });
  });

  describe("multiple actions in sequence", () => {
    it("executes all actions in order", async () => {
      const issue = makeIssue();
      const ctx = makeCtx();
      const actions: CompletionAction[] = [
        {
          type: "create_issue",
          template: { title: "Follow up from {{identifier}}", assigneeAgentId: "agent-2" },
        },
        {
          type: "post_comment",
          targetIssueId: "{{parentId}}",
          body: "Completed: {{title}}",
        },
        {
          type: "wake_agent",
          agentId: "agent-3",
        },
      ];

      const result = await processCompletionActions(actions, issue, ctx);
      expect(result.executed).toBe(3);
      expect(result.errors).toBe(0);
      expect(ctx.createdIssues).toHaveLength(1);
      expect(ctx.comments).toHaveLength(1);
      expect(ctx.wakeups).toHaveLength(1);
    });
  });
});
