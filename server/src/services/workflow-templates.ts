import { and, asc, eq, desc } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { workflowTemplates, companies } from "@paperclipai/db";
import type { CreateWorkflowTemplate, UpdateWorkflowTemplate, RunWorkflowTemplate } from "@paperclipai/shared";
import { issueService } from "./issues.js";
import { issueLinkService } from "./issue-links.js";
import { unprocessable } from "../errors.js";

interface StepDef {
  key: string;
  title: string;
  type: "explore" | "plan" | "task";
  description?: string;
  assigneeAgentId?: string;
  priority?: "critical" | "high" | "medium" | "low";
  dependsOn?: string[];
  metadata?: Record<string, unknown>;
}

interface VariableDecl {
  type: "string" | "uuid";
  required?: boolean;
  default?: string;
  description?: string;
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

/**
 * Interpolate {{ variable }} placeholders in a string.
 */
function interpolate(template: string, bindings: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, varName) => {
    return bindings[varName] ?? _match;
  });
}

/**
 * Interpolate all string fields in a step definition.
 */
function interpolateStep(step: StepDef, bindings: Record<string, string>): StepDef {
  return {
    ...step,
    title: interpolate(step.title, bindings),
    description: step.description ? interpolate(step.description, bindings) : undefined,
    assigneeAgentId: step.assigneeAgentId ? interpolate(step.assigneeAgentId, bindings) : undefined,
  };
}

export function workflowTemplateService(db: Db) {
  const issueSvc = issueService(db);
  const linkSvc = issueLinkService(db);

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
        variables: data.variables ?? {},
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
      patch.version = db
        .select({ v: workflowTemplates.version })
        .from(workflowTemplates)
        .where(eq(workflowTemplates.id, id));
    }
    if (data.variables !== undefined) patch.variables = data.variables;

    // For version bump, use raw SQL
    if (data.steps !== undefined) {
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
    const variableDecls = (template.variables ?? {}) as Record<string, VariableDecl>;
    const bindings = data.variables ?? {};

    // Validate required variables
    for (const [name, decl] of Object.entries(variableDecls)) {
      if (decl.required !== false && !bindings[name] && !decl.default) {
        throw unprocessable(`Required variable "${name}" is missing`);
      }
      if (!bindings[name] && decl.default) {
        bindings[name] = decl.default;
      }
    }

    // Sort steps in topological order
    const sortedSteps = topologicalSort(steps);

    // Build variable summary for root issue title
    const varSummary = Object.entries(bindings)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const rootTitle = varSummary
      ? `${template.name} (${varSummary})`
      : template.name;

    // Determine root issue assignee — prefer explicit, fall back to actor
    const rootAssigneeAgentId = data.assigneeAgentId ?? actor?.agentId ?? null;
    const rootAssigneeUserId = !rootAssigneeAgentId ? (actor?.userId ?? null) : null;
    const hasAssignee = !!rootAssigneeAgentId || !!rootAssigneeUserId;

    // Create root issue — only in_progress if there's an assignee
    const rootIssue = await issueSvc.create(template.companyId, {
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
        workflowVariableBindings: bindings,
      },
    });

    // Create step issues
    const stepIssues: Array<{ key: string; issueId: string; status: string }> = [];
    const keyToIssueId = new Map<string, string>();

    for (const step of sortedSteps) {
      const interpolated = interpolateStep(step, bindings);
      const hasDependencies = step.dependsOn && step.dependsOn.length > 0;
      const status = hasDependencies ? "backlog" : "todo";

      const stepIssue = await issueSvc.create(template.companyId, {
        title: interpolated.title,
        description: interpolated.description ?? null,
        type: interpolated.type,
        status,
        priority: interpolated.priority ?? "medium",
        parentId: rootIssue.id,
        projectId: data.projectId ?? null,
        goalId: data.goalId ?? null,
        assigneeAgentId: interpolated.assigneeAgentId ?? data.assigneeAgentId ?? null,
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

    return {
      rootIssueId: rootIssue.id,
      rootIssueIdentifier: rootIssue.identifier,
      stepIssues,
    };
  }

  async function seedForCompany(companyId: string) {
    const existing = await list(companyId, true);
    const existingNames = new Set(existing.map((t) => t.name));

    const builtInTemplates: Array<{ name: string; description: string; steps: StepDef[]; variables: Record<string, VariableDecl> }> = [
      {
        name: "Explore → Plan → Build",
        description: "Standard research-to-implementation pipeline: explore a topic, create an implementation plan, then execute it.",
        steps: [
          { key: "explore", title: "Explore: {{ topic }}", type: "explore", assigneeAgentId: "{{ agentId }}", priority: "medium" },
          { key: "plan", title: "Plan: {{ topic }}", type: "plan", assigneeAgentId: "{{ agentId }}", priority: "medium", dependsOn: ["explore"] },
          { key: "build", title: "Build: {{ topic }}", type: "task", assigneeAgentId: "{{ agentId }}", priority: "medium", dependsOn: ["plan"] },
        ],
        variables: {
          topic: { type: "string", required: true, description: "The topic or feature to explore, plan, and build" },
          agentId: { type: "uuid", required: false, description: "Agent to assign all steps to" },
        },
      },
      {
        name: "Explore → Report",
        description: "Research-only pipeline: explore a topic, then write up a findings report.",
        steps: [
          { key: "explore", title: "Explore: {{ topic }}", type: "explore", assigneeAgentId: "{{ agentId }}", priority: "medium" },
          { key: "report", title: "Report: {{ topic }}", type: "task", assigneeAgentId: "{{ agentId }}", priority: "medium", dependsOn: ["explore"], description: "Write up findings from the exploration into a clear report." },
        ],
        variables: {
          topic: { type: "string", required: true, description: "The topic to research and report on" },
          agentId: { type: "uuid", required: false, description: "Agent to assign all steps to" },
        },
      },
      {
        name: "Plan → Build → Review",
        description: "Implementation with a review gate: create a plan, execute it, then review the work.",
        steps: [
          { key: "plan", title: "Plan: {{ topic }}", type: "plan", assigneeAgentId: "{{ agentId }}", priority: "medium" },
          { key: "build", title: "Build: {{ topic }}", type: "task", assigneeAgentId: "{{ agentId }}", priority: "medium", dependsOn: ["plan"] },
          { key: "review", title: "Review: {{ topic }}", type: "task", assigneeAgentId: "{{ reviewerAgentId }}", priority: "medium", dependsOn: ["build"], description: "Review the implementation and verify it meets the plan requirements." },
        ],
        variables: {
          topic: { type: "string", required: true, description: "The feature or task to plan, build, and review" },
          agentId: { type: "uuid", required: false, description: "Agent to assign plan and build steps to" },
          reviewerAgentId: { type: "uuid", required: false, description: "Agent to assign the review step to" },
        },
      },
    ];

    let seeded = 0;
    for (const tmpl of builtInTemplates) {
      if (existingNames.has(tmpl.name)) continue;
      await create(companyId, {
        name: tmpl.name,
        description: tmpl.description,
        steps: tmpl.steps,
        variables: tmpl.variables as CreateWorkflowTemplate["variables"],
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
