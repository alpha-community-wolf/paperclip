/**
 * Issue Completion Hooks — processes `metadata.completionActions` when an issue
 * transitions to `done`. Enables autonomous multi-agent pipelines without
 * workflow templates.
 *
 * Action types: create_issue, update_issue, post_comment, wake_agent, conditional
 */

import type { Logger } from "pino";

// ---------------------------------------------------------------------------
// Template interpolation (same logic as event-routing.ts)
// ---------------------------------------------------------------------------

function getByPath(source: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return source[path];
  const chunks = path.split(".");
  let current: unknown = source;
  for (const chunk of chunks) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[chunk];
  }
  return current;
}

function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_all, path) => {
    const value = getByPath(context, String(path).trim());
    if (value === undefined || value === null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value);
  });
}

/**
 * Deep-interpolate all string values in an object tree.
 */
function deepInterpolate<T>(obj: T, context: Record<string, unknown>): T {
  if (typeof obj === "string") return renderTemplate(obj, context) as unknown as T;
  if (Array.isArray(obj)) return obj.map((item) => deepInterpolate(item, context)) as unknown as T;
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepInterpolate(value, context);
    }
    return result as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateIssueAction {
  type: "create_issue";
  template: {
    title: string;
    description?: string;
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
    status?: string;
    priority?: string;
    parentId?: string | null;
    projectId?: string | null;
    goalId?: string | null;
    metadata?: Record<string, unknown>;
  };
}

interface UpdateIssueAction {
  type: "update_issue";
  targetIssueId: string;
  patch: Record<string, unknown>;
}

interface PostCommentAction {
  type: "post_comment";
  targetIssueId: string;
  body: string;
}

interface WakeAgentAction {
  type: "wake_agent";
  agentId: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

interface ConditionalAction {
  type: "conditional";
  condition: {
    field: string;
    eq?: unknown;
    neq?: unknown;
    exists?: boolean;
  };
  then: CompletionAction[];
}

export type CompletionAction =
  | CreateIssueAction
  | UpdateIssueAction
  | PostCommentAction
  | WakeAgentAction
  | ConditionalAction;

/**
 * The issue object shape passed to the processor. We only need the fields
 * relevant for template interpolation and action execution.
 */
export interface CompletionIssue {
  id: string;
  companyId: string;
  identifier: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string;
  parentId: string | null;
  projectId: string | null;
  goalId: string | null;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  executionAgentNameKey: string | null;
  metadata: Record<string, unknown> | null;
  ancestors?: Array<Record<string, unknown>>;
  project?: Record<string, unknown> | null;
}

export interface ActionContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  issueService: {
    create: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    addComment: (...args: any[]) => Promise<any>;
  };
  heartbeat: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wakeup: (...args: any[]) => Promise<any>;
  };
  logActivity: (details: {
    companyId: string;
    actorType: "agent" | "user" | "system";
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    agentId?: string | null;
    runId?: string | null;
    details?: Record<string, unknown> | null;
  }) => Promise<void>;
  actor: {
    actorType: "agent" | "user" | "system";
    actorId: string;
    agentId?: string | null;
    runId?: string | null;
  };
  logger: Logger;
}

const MAX_CHAIN_DEPTH = 5;

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function evaluateCondition(
  issue: Record<string, unknown>,
  condition: ConditionalAction["condition"],
): boolean {
  const value = getByPath(issue, condition.field);

  if (condition.exists !== undefined) {
    const exists = value !== undefined && value !== null;
    return condition.exists ? exists : !exists;
  }
  if (condition.eq !== undefined) {
    return String(value) === String(condition.eq);
  }
  if (condition.neq !== undefined) {
    return String(value) !== String(condition.neq);
  }
  // No recognized operator — treat as truthy check
  return value !== undefined && value !== null && value !== false && value !== "" && value !== 0;
}

// ---------------------------------------------------------------------------
// Core processor
// ---------------------------------------------------------------------------

/**
 * Build the template context from the completing issue.
 * All {{field}} references resolve against this object.
 */
function buildTemplateContext(issue: CompletionIssue): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    id: issue.id,
    companyId: issue.companyId,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? "",
    status: issue.status,
    priority: issue.priority,
    type: issue.type,
    parentId: issue.parentId ?? "",
    projectId: issue.projectId ?? "",
    goalId: issue.goalId ?? "",
    assigneeAgentId: issue.assigneeAgentId ?? "",
    assigneeUserId: issue.assigneeUserId ?? "",
    executionAgentNameKey: issue.executionAgentNameKey ?? "",
    metadata: issue.metadata ?? {},
  };

  // Expose ancestors for {{ancestors.0.title}} etc.
  if (issue.ancestors?.length) {
    const ancestors: Record<string, unknown> = {};
    for (let i = 0; i < issue.ancestors.length; i++) {
      ancestors[String(i)] = issue.ancestors[i];
    }
    ctx.ancestors = ancestors;
  }

  // Expose project for {{project.name}} etc.
  if (issue.project) {
    ctx.project = issue.project;
  }

  return ctx;
}

/**
 * Process an array of completion actions for a just-completed issue.
 * Each action is individually try/caught so one failure doesn't block the rest.
 */
export async function processCompletionActions(
  actions: CompletionAction[],
  issue: CompletionIssue,
  ctx: ActionContext,
  depth = 0,
): Promise<{ executed: number; errors: number }> {
  if (depth > MAX_CHAIN_DEPTH) {
    ctx.logger.warn(
      { issueId: issue.id, depth },
      "completion action chain depth exceeded, skipping",
    );
    return { executed: 0, errors: 0 };
  }

  const templateCtx = buildTemplateContext(issue);
  let executed = 0;
  let errors = 0;

  for (const action of actions) {
    try {
      switch (action.type) {
        case "create_issue": {
          const resolved = deepInterpolate(action.template, templateCtx);

          // Clean up empty-string → null for optional ID fields
          const nullableFields = ["assigneeAgentId", "assigneeUserId", "parentId", "projectId", "goalId"] as const;
          for (const f of nullableFields) {
            if (resolved[f] === "" || resolved[f] === "null") {
              resolved[f] = null;
            }
          }

          const created = await ctx.issueService.create(issue.companyId, {
            title: resolved.title,
            description: resolved.description ?? null,
            assigneeAgentId: resolved.assigneeAgentId ?? null,
            assigneeUserId: resolved.assigneeUserId ?? null,
            status: resolved.status ?? "todo",
            priority: resolved.priority ?? issue.priority,
            parentId: resolved.parentId ?? null,
            projectId: resolved.projectId ?? issue.projectId,
            goalId: resolved.goalId ?? issue.goalId,
            metadata: resolved.metadata ?? null,
          });

          await ctx.logActivity({
            companyId: issue.companyId,
            actorType: ctx.actor.actorType,
            actorId: ctx.actor.actorId,
            agentId: ctx.actor.agentId,
            runId: ctx.actor.runId,
            action: "issue.completion_action",
            entityType: "issue",
            entityId: issue.id,
            details: {
              actionType: "create_issue",
              createdIssueId: (created as Record<string, unknown>).id,
              sourceIdentifier: issue.identifier,
            },
          });

          executed++;
          break;
        }

        case "update_issue": {
          const targetId = renderTemplate(action.targetIssueId, templateCtx);
          if (!targetId) {
            ctx.logger.warn({ issueId: issue.id }, "update_issue: empty targetIssueId, skipping");
            errors++;
            break;
          }

          const resolvedPatch = deepInterpolate(action.patch, templateCtx);
          await ctx.issueService.update(targetId, resolvedPatch);

          await ctx.logActivity({
            companyId: issue.companyId,
            actorType: ctx.actor.actorType,
            actorId: ctx.actor.actorId,
            agentId: ctx.actor.agentId,
            runId: ctx.actor.runId,
            action: "issue.completion_action",
            entityType: "issue",
            entityId: issue.id,
            details: {
              actionType: "update_issue",
              targetIssueId: targetId,
              sourceIdentifier: issue.identifier,
            },
          });

          executed++;
          break;
        }

        case "post_comment": {
          const targetId = renderTemplate(action.targetIssueId, templateCtx);
          const body = renderTemplate(action.body, templateCtx);
          if (!targetId || !body) {
            ctx.logger.warn({ issueId: issue.id }, "post_comment: empty target or body, skipping");
            errors++;
            break;
          }

          await ctx.issueService.addComment(
            targetId,
            body,
            {
              agentId: ctx.actor.agentId ?? undefined,
              userId: ctx.actor.actorType === "user" ? ctx.actor.actorId : undefined,
            },
          );

          await ctx.logActivity({
            companyId: issue.companyId,
            actorType: ctx.actor.actorType,
            actorId: ctx.actor.actorId,
            agentId: ctx.actor.agentId,
            runId: ctx.actor.runId,
            action: "issue.completion_action",
            entityType: "issue",
            entityId: issue.id,
            details: {
              actionType: "post_comment",
              targetIssueId: targetId,
              sourceIdentifier: issue.identifier,
            },
          });

          executed++;
          break;
        }

        case "wake_agent": {
          const agentId = renderTemplate(action.agentId, templateCtx);
          if (!agentId) {
            ctx.logger.warn({ issueId: issue.id }, "wake_agent: empty agentId, skipping");
            errors++;
            break;
          }

          const reason = action.reason
            ? renderTemplate(action.reason, templateCtx)
            : "completion_action";
          const payload = action.payload
            ? deepInterpolate(action.payload, templateCtx)
            : {};

          await ctx.heartbeat.wakeup(agentId, {
            source: "automation",
            triggerDetail: "system",
            reason,
            payload: {
              ...payload,
              triggeredByIssueId: issue.id,
              triggeredByIdentifier: issue.identifier,
            },
            requestedByActorType: ctx.actor.actorType,
            requestedByActorId: ctx.actor.actorId,
            contextSnapshot: {
              issueId: issue.id,
              taskId: issue.id,
              wakeReason: reason,
              source: "issue.completion_action",
            },
          });

          await ctx.logActivity({
            companyId: issue.companyId,
            actorType: ctx.actor.actorType,
            actorId: ctx.actor.actorId,
            agentId: ctx.actor.agentId,
            runId: ctx.actor.runId,
            action: "issue.completion_action",
            entityType: "issue",
            entityId: issue.id,
            details: {
              actionType: "wake_agent",
              targetAgentId: agentId,
              sourceIdentifier: issue.identifier,
            },
          });

          executed++;
          break;
        }

        case "conditional": {
          const issueAsRecord = templateCtx;
          if (evaluateCondition(issueAsRecord, action.condition)) {
            const sub = await processCompletionActions(action.then, issue, ctx, depth + 1);
            executed += sub.executed;
            errors += sub.errors;
          }
          break;
        }

        default: {
          ctx.logger.warn(
            { issueId: issue.id, actionType: (action as { type: string }).type },
            "unknown completion action type, skipping",
          );
          errors++;
        }
      }
    } catch (err) {
      ctx.logger.warn(
        { err, issueId: issue.id, actionType: action.type },
        "completion action failed",
      );
      errors++;
    }
  }

  return { executed, errors };
}

/**
 * Extract completionActions from issue metadata. Returns null if none found
 * or if the value is not a valid array.
 */
export function extractCompletionActions(
  metadata: Record<string, unknown> | null | undefined,
): CompletionAction[] | null {
  if (!metadata) return null;
  const actions = metadata.completionActions;
  if (!Array.isArray(actions) || actions.length === 0) return null;

  // Basic shape validation — each action must have a string `type`
  const valid = actions.filter(
    (a: unknown) =>
      a &&
      typeof a === "object" &&
      typeof (a as Record<string, unknown>).type === "string",
  );

  return valid.length > 0 ? (valid as CompletionAction[]) : null;
}
