import { and, asc, eq, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { workflowTemplates, companies } from "@paperclipai/db";
import type { CreateWorkflowTemplate, UpdateWorkflowTemplate, RunWorkflowTemplate } from "@paperclipai/shared";
import { issueService } from "./issues.js";
import { issueLinkService } from "./issue-links.js";
import { heartbeatService } from "./heartbeat.js";
import { unprocessable } from "../errors.js";

interface StepDef {
  key: string;
  type: "explore" | "plan" | "task";
  description?: string;
  assigneeAgentId?: string;
  priority?: "critical" | "high" | "medium" | "low";
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Topological sort of steps; throws if cycle detected.
 */
function topologicalSort(steps: StepDef[]): StepDef[] {
  const keyToStep = new Map(steps.map((s) => [s.key, s]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.key, 0);
    adjacency.set(step.key, []);
  }

  for (const step of steps) {
    if (step.dependsOn) {
      for (const dep of step.dependsOn) {
        if (!keyToStep.has(dep)) {
          throw unprocessable(`Step "${step.key}" depends on unknown step "${dep}"`);
        }
        adjacency.get(dep)!.push(step.key);
        inDegree.set(step.key, (inDegree.get(step.key) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [key, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(key);
  }

  const sorted: StepDef[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    sorted.push(keyToStep.get(key)!);
    for (const neighbor of adjacency.get(key) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== steps.length) {
    throw unprocessable("Workflow steps contain a circular dependency");
  }

  return sorted;
}

/**
 * Validate unique step keys.
 */
function validateStepKeys(steps: StepDef[]) {
  const keys = new Set<string>();
  for (const step of steps) {
    if (keys.has(step.key)) {
      throw unprocessable(`Duplicate step key: "${step.key}"`);
    }
    keys.add(step.key);
  }
}

export function workflowTemplateService(db: Db) {
  const issueSvc = issueService(db);
  const linkSvc = issueLinkService(db);
  const heartbeat = heartbeatService(db);

  async function list(companyId: string, includeInactive = false) {
    const conditions = [eq(workflowTemplates.companyId, companyId)];
    if (!includeInactive) {
      conditions.push(eq(workflowTemplates.isActive, true));
    }
    return db
      .select()
      .from(workflowTemplates)
      .where(and(...conditions))
      .orderBy(asc(workflowTemplates.name));
  }

  async function getById(id: string) {
    return db
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, id))
      .then((rows) => rows[0] ?? null);
  }

  async function create(
    companyId: string,
    data: CreateWorkflowTemplate,
    actor?: { agentId?: string | null; userId?: string | null },
  ) {
    const steps = data.steps as StepDef[];
    validateStepKeys(steps);
    topologicalSort(steps);

    return db
      .insert(workflowTemplates)
      .values({
        companyId,
        name: data.name.trim(),
        description: data.description?.trim() ?? null,
        steps: data.steps,
        createdByAgentId: actor?.agentId ?? null,
        createdByUserId: actor?.userId ?? null,
      })
      .returning()
      .then((rows) => rows[0]!);
  }

  async function update(id: string, data: UpdateWorkflowTemplate) {
    if (data.steps) {
      const steps = data.steps as StepDef[];
      validateStepKeys(steps);
      topologicalSort(steps);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() ?? null;
    if (data.steps !== undefined) {
      patch.steps = data.steps;
      // Bump version when steps change
      const existing = await getById(id);
      if (!existing) return null;
      patch.version = existing.version + 1;
    }

    return db
      .update(workflowTemplates)
      .set(patch)
      .where(eq(workflowTemplates.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function archive(id: string) {
    return db
      .update(workflowTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(workflowTemplates.id, id))
      .returning()
      .then((rows) => rows[0] ?? null);
  }

  async function run(
    id: string,
    data: RunWorkflowTemplate,
    actor?: { agentId?: string | null; userId?: string | null },
  ) {
    const template = await getById(id);
    if (!template) throw unprocessable("Workflow template not found");
    if (!template.isActive) throw unprocessable("Workflow template is archived");

    const steps = template.steps as StepDef[];

    // Sort steps in topological order
    const sortedSteps = topologicalSort(steps);

    // B1: When rootIssueId is provided, use an existing issue as root
    let rootIssue: { id: string; identifier: string; title: string };

    if (data.rootIssueId) {
      const existing = await issueSvc.getById(data.rootIssueId);
      if (!existing) throw unprocessable("Root issue not found");
      if (existing.companyId !== template.companyId) {
        throw unprocessable("Root issue must belong to the same company as the template");
      }
      const existingMeta = (existing.metadata ?? {}) as Record<string, unknown>;
      if (existingMeta.workflowTemplateId) {
        throw unprocessable("Issue already has a workflow attached");
      }
      if (existing.status === "done" || existing.status === "cancelled") {
        throw unprocessable("Cannot attach workflow to a completed or cancelled issue");
      }

      // Merge workflow metadata onto existing issue
      await issueSvc.update(data.rootIssueId, {
        metadata: {
          ...existingMeta,
          workflowTemplateId: template.id,
          workflowTemplateVersion: template.version,
        },
      });

      rootIssue = { id: existing.id, identifier: existing.identifier!, title: existing.title };
    } else {
      // Original behavior: create a new root issue from template
      const rootTitle = template.name;

      const rootAssigneeAgentId = data.assigneeAgentId ?? actor?.agentId ?? null;
      const rootAssigneeUserId = !rootAssigneeAgentId ? (actor?.userId ?? null) : null;
      const hasAssignee = !!rootAssigneeAgentId || !!rootAssigneeUserId;

      const created = await issueSvc.create(template.companyId, {
        title: rootTitle.slice(0, 500),
        description: template.description ?? `Workflow: ${template.name}`,
        type: "task",
        status: hasAssignee ? "in_progress" : "todo",
        priority: "medium",
        parentId: null,
        projectId: data.projectId ?? null,
        goalId: data.goalId ?? null,
        assigneeAgentId: rootAssigneeAgentId,
        assigneeUserId: rootAssigneeUserId,
        metadata: {
          workflowTemplateId: template.id,
          workflowTemplateVersion: template.version,
        },
      });

      rootIssue = { id: created.id, identifier: created.identifier!, title: rootTitle };
    }

    // Create step issues with auto-generated titles
    const stepIssues: Array<{ key: string; issueId: string; status: string }> = [];
    const keyToIssueId = new Map<string, string>();

    for (let i = 0; i < sortedSteps.length; i++) {
      const step = sortedSteps[i];
      const hasDependencies = step.dependsOn && step.dependsOn.length > 0;
      const status = hasDependencies ? "backlog" : "todo";

      // Auto-generate step title: "{RootIssueTitle}: {StepType} (Step {N})"
      const stepTitle = `${rootIssue.title}: ${step.type.charAt(0).toUpperCase() + step.type.slice(1)} (Step ${i + 1})`;

      // Pass model override from step metadata to assigneeAdapterOverrides if present
      const stepMetadata = step.metadata as Record<string, unknown> | undefined;
      const modelOverride = stepMetadata?.modelOverride as Record<string, unknown> | undefined;

      const stepIssue = await issueSvc.create(template.companyId, {
        title: stepTitle,
        description: step.description ?? null,
        type: step.type,
        status,
        priority: step.priority ?? "medium",
        parentId: rootIssue.id,
        projectId: data.projectId ?? null,
        goalId: data.goalId ?? null,
        assigneeAgentId: step.assigneeAgentId ?? data.assigneeAgentId ?? null,
        ...(modelOverride ? { assigneeAdapterOverrides: modelOverride } : {}),
        metadata: {
          workflowTemplateId: template.id,
          workflowStepKey: step.key,
          workflowRootIssueId: rootIssue.id,
          ...(step.metadata ?? {}),
        },
      });

      keyToIssueId.set(step.key, stepIssue.id);
      stepIssues.push({ key: step.key, issueId: stepIssue.id, status });
    }

    // Create trigger links for dependencies
    for (const step of sortedSteps) {
      if (step.dependsOn) {
        for (const depKey of step.dependsOn) {
          const sourceId = keyToIssueId.get(depKey);
          const targetId = keyToIssueId.get(step.key);
          if (sourceId && targetId) {
            await linkSvc.create(sourceId, { targetId, linkType: "triggers" }, actor);
          }
        }
      }
    }

    // A1: Auto-wake entry steps (no dependencies) that have an assignee
    for (const step of sortedSteps) {
      const hasDependencies = step.dependsOn && step.dependsOn.length > 0;
      if (hasDependencies) continue;

      const stepIssueId = keyToIssueId.get(step.key);
      if (!stepIssueId) continue;

      const assigneeAgentId = step.assigneeAgentId ?? data.assigneeAgentId ?? null;
      if (!assigneeAgentId) continue;

      heartbeat
        .wakeup(assigneeAgentId, {
          source: "automation",
          triggerDetail: "dependency_trigger",
          reason: "workflow_instantiation",
          payload: {
            issueId: stepIssueId,
            workflowTemplateId: template.id,
            workflowRootIssueId: rootIssue.id,
          },
          contextSnapshot: {
            issueId: stepIssueId,
            taskId: stepIssueId,
            wakeReason: "workflow_instantiation",
            source: "workflow.instantiation",
          },
        })
        .catch(() => {}); // best-effort; execution lock prevents duplicates
    }

    return {
      rootIssueId: rootIssue.id,
      rootIssueIdentifier: rootIssue.identifier,
      stepIssues,
    };
  }

  async function seedForCompany(companyId: string) {
    const existing = await list(companyId, true);
    const existingNames = new Set(existing.map((t) => t.name));

    const builtInTemplates: Array<{ name: string; description: string; steps: StepDef[] }> = [
      {
        name: "Explore → Plan → Build",
        description: "Standard research-to-implementation pipeline: explore a topic, create an implementation plan, then execute it.",
        steps: [
          { key: "explore", type: "explore", priority: "medium" },
          { key: "plan", type: "plan", priority: "medium", dependsOn: ["explore"] },
          { key: "build", type: "task", priority: "medium", dependsOn: ["plan"] },
        ],
      },
      {
        name: "Explore → Report",
        description: "Research-only pipeline: explore a topic, then write up a findings report.",
        steps: [
          { key: "explore", type: "explore", priority: "medium" },
          { key: "report", type: "task", priority: "medium", dependsOn: ["explore"], description: "Write up findings from the exploration into a clear report." },
        ],
      },
      {
        name: "Plan → Build → Review",
        description: "Implementation with a review gate: create a plan, execute it, then review the work.",
        steps: [
          { key: "plan", type: "plan", priority: "medium" },
          { key: "build", type: "task", priority: "medium", dependsOn: ["plan"] },
          { key: "review", type: "task", priority: "medium", dependsOn: ["build"], description: "Review the implementation and verify it meets the plan requirements." },
        ],
      },
    ];

    let seeded = 0;
    for (const tmpl of builtInTemplates) {
      if (existingNames.has(tmpl.name)) continue;
      await create(companyId, {
        name: tmpl.name,
        description: tmpl.description,
        steps: tmpl.steps,
      });
      seeded++;
    }
    return { seeded };
  }

  return {
    list,
    getById,
    create,
    update,
    archive,
    run,
    seedForCompany,
  };
}

export async function seedWorkflowTemplatesForAllCompanies(db: Db): Promise<{ seeded: number }> {
  const allCompanies = await db.select({ id: companies.id }).from(companies);
  const svc = workflowTemplateService(db);
  let total = 0;
  for (const company of allCompanies) {
    const result = await svc.seedForCompany(company.id);
    total += result.seeded;
  }
  return { seeded: total };
}
