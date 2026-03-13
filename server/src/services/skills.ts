import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq, inArray } from "drizzle-orm";

const execFileAsync = promisify(execFile);
import type { Db } from "@paperclipai/db";
import { skills, agentSkillAssignments, agents } from "@paperclipai/db";
import type { ResolvedSkill, SkillTier, SkillSourceType } from "@paperclipai/shared";
import { readSkillFrontmatter } from "./skill-seeding.js";

type SkillRow = typeof skills.$inferSelect;

interface DiscoveredLocalSkill {
  name: string;
  description: string;
  path: string;
}

const AGENT_SKILLS_SUBDIRS = [".agents/skills", ".claude/skills"];

async function discoverLocalAgentSkills(agentCwd: string): Promise<DiscoveredLocalSkill[]> {
  const results: DiscoveredLocalSkill[] = [];
  const seen = new Set<string>();

  for (const subdir of AGENT_SKILLS_SUBDIRS) {
    const skillsRoot = path.join(agentCwd, subdir);
    const isDir = await fs.stat(skillsRoot).then((s) => s.isDirectory()).catch(() => false);
    if (!isDir) continue;

    const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue;
      const skillPath = path.join(skillsRoot, entry.name);
      const hasSKILL = await fs.stat(path.join(skillPath, "SKILL.md")).catch(() => null);
      if (!hasSKILL) continue;
      seen.add(entry.name);
      const meta = await readSkillFrontmatter(skillPath);
      results.push({ name: meta.name, description: meta.description, path: skillPath });
    }
  }

  return results;
}

interface CreateSkillInput {
  name: string;
  description?: string | null;
  tier: SkillTier;
  defaultEnabled?: boolean;
  agentId?: string | null;
  sourceType: SkillSourceType;
  sourceUrl?: string | null;
  installedPath: string;
  metadata?: Record<string, unknown> | null;
}

export function skillService(db: Db) {
  async function list(companyId: string): Promise<SkillRow[]> {
    return db.select().from(skills).where(eq(skills.companyId, companyId));
  }

  async function getById(id: string): Promise<SkillRow | null> {
    const rows = await db.select().from(skills).where(eq(skills.id, id));
    return rows[0] ?? null;
  }

  async function getByName(companyId: string, name: string): Promise<SkillRow | null> {
    const rows = await db
      .select()
      .from(skills)
      .where(and(eq(skills.companyId, companyId), eq(skills.name, name)));
    return rows[0] ?? null;
  }

  async function create(companyId: string, input: CreateSkillInput): Promise<SkillRow> {
    const [row] = await db
      .insert(skills)
      .values({
        companyId,
        name: input.name,
        description: input.description ?? null,
        tier: input.tier,
        defaultEnabled: input.defaultEnabled ?? true,
        agentId: input.agentId ?? null,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl ?? null,
        installedPath: input.installedPath,
        metadata: input.metadata ?? null,
      })
      .returning();
    return row!;
  }

  async function remove(id: string): Promise<boolean> {
    const rows = await db.delete(skills).where(eq(skills.id, id)).returning();
    return rows.length > 0;
  }

  function resolveAgentCwd(agent: typeof agents.$inferSelect): string | null {
    const config = agent.adapterConfig as Record<string, unknown> | null;
    if (!config) return null;
    const cwd = config.cwd;
    return typeof cwd === "string" && cwd.trim().length > 0 ? cwd.trim() : null;
  }

  function localSkillToRow(skill: DiscoveredLocalSkill, companyId: string, agentId: string): SkillRow {
    return {
      id: `local:${agentId}:${skill.name}`,
      companyId,
      name: skill.name,
      description: skill.description || null,
      tier: "agent",
      defaultEnabled: true,
      agentId,
      sourceType: "local",
      sourceUrl: null,
      installedPath: skill.path,
      metadata: { discoveredFromFilesystem: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async function listForAgent(agentId: string): Promise<SkillRow[]> {
    const agentRows = await db.select().from(agents).where(eq(agents.id, agentId));
    const agent = agentRows[0];
    if (!agent) return [];

    const companyId = agent.companyId;

    const allBuiltIn = await db
      .select()
      .from(skills)
      .where(and(eq(skills.companyId, companyId), eq(skills.tier, "built_in")));

    const coreBuiltIn = allBuiltIn.filter((s) => s.defaultEnabled);
    const optionalBuiltIn = allBuiltIn.filter((s) => !s.defaultEnabled);

    const assignments = await db
      .select({ skillId: agentSkillAssignments.skillId })
      .from(agentSkillAssignments)
      .where(eq(agentSkillAssignments.agentId, agentId));
    const assignedIds = new Set(assignments.map((a) => a.skillId));

    const assignedOptionalBuiltIn = optionalBuiltIn.filter((s) => assignedIds.has(s.id));

    let companyAssigned: SkillRow[] = [];
    const companyAssignedIds = assignments
      .map((a) => a.skillId)
      .filter((id) => !optionalBuiltIn.some((s) => s.id === id));
    if (companyAssignedIds.length > 0) {
      companyAssigned = await db
        .select()
        .from(skills)
        .where(and(eq(skills.tier, "company"), inArray(skills.id, companyAssignedIds)));
    }

    const agentDbSkills = await db
      .select()
      .from(skills)
      .where(and(eq(skills.tier, "agent"), eq(skills.agentId, agentId)));

    const dbSkillNames = new Set([
      ...coreBuiltIn.map((s) => s.name),
      ...assignedOptionalBuiltIn.map((s) => s.name),
      ...companyAssigned.map((s) => s.name),
      ...agentDbSkills.map((s) => s.name),
    ]);

    let localSkills: SkillRow[] = [];
    const agentCwd = resolveAgentCwd(agent);
    if (agentCwd) {
      const discovered = await discoverLocalAgentSkills(agentCwd);
      localSkills = discovered
        .filter((s) => !dbSkillNames.has(s.name))
        .map((s) => localSkillToRow(s, companyId, agentId));
    }

    return [...coreBuiltIn, ...assignedOptionalBuiltIn, ...companyAssigned, ...agentDbSkills, ...localSkills];
  }

  async function assignToAgent(agentId: string, skillId: string, companyId: string): Promise<void> {
    await db
      .insert(agentSkillAssignments)
      .values({ agentId, skillId, companyId })
      .onConflictDoNothing();
  }

  async function unassignFromAgent(agentId: string, skillId: string): Promise<void> {
    await db
      .delete(agentSkillAssignments)
      .where(
        and(
          eq(agentSkillAssignments.agentId, agentId),
          eq(agentSkillAssignments.skillId, skillId),
        ),
      );
  }

  async function listAssignmentsForAgent(agentId: string) {
    return db
      .select()
      .from(agentSkillAssignments)
      .where(eq(agentSkillAssignments.agentId, agentId));
  }

  async function resolveForExecution(agentId: string): Promise<ResolvedSkill[]> {
    const allSkills = await listForAgent(agentId);
    return allSkills.map((row) => ({
      name: row.name,
      tier: row.tier as ResolvedSkill["tier"],
      path: row.installedPath,
    }));
  }

  async function seedBuiltInSkills(companyId: string, builtInSkillDefs: { name: string; description: string; path: string; defaultEnabled?: boolean }[]): Promise<void> {
    for (const def of builtInSkillDefs) {
      const existing = await getByName(companyId, def.name);
      if (existing) {
        if (existing.defaultEnabled !== (def.defaultEnabled ?? true)) {
          await db
            .update(skills)
            .set({ defaultEnabled: def.defaultEnabled ?? true })
            .where(eq(skills.id, existing.id));
        }
        continue;
      }
      await create(companyId, {
        name: def.name,
        description: def.description,
        tier: "built_in",
        defaultEnabled: def.defaultEnabled ?? true,
        sourceType: "bundled",
        installedPath: def.path,
      });
    }
  }

  function resolveInstallDir(tier: string, agentId: string | null): string {
    if (tier === "agent" && agentId) {
      const agentRows = db.select().from(agents).where(eq(agents.id, agentId));
      // Synchronous path resolution isn't possible here, so we handle it in the async wrapper
      throw new Error("Use resolveInstallDirAsync for agent tier");
    }
    const paperclipHome = process.env.PAPERCLIP_DATA_DIR ||
      path.join(os.homedir(), ".paperclip", "instances", "default");
    return path.join(paperclipHome, "skills");
  }

  async function resolveInstallDirAsync(tier: string, agentId: string | null | undefined, explicitDir: string | null | undefined): Promise<string> {
    if (explicitDir && explicitDir.trim().length > 0) {
      const dir = explicitDir.trim();
      await fs.mkdir(dir, { recursive: true });
      return dir;
    }

    if (tier === "agent" && agentId) {
      const agentRows = await db.select().from(agents).where(eq(agents.id, agentId));
      const agent = agentRows[0];
      if (!agent) throw new Error(`Agent ${agentId} not found`);
      const cwd = resolveAgentCwd(agent);
      if (!cwd) throw new Error(`Agent ${agentId} has no working directory configured`);
      const dir = path.join(cwd, ".agents", "skills");
      await fs.mkdir(dir, { recursive: true });
      return dir;
    }

    const paperclipHome = process.env.PAPERCLIP_DATA_DIR ||
      path.join(os.homedir(), ".paperclip", "instances", "default");
    const dir = path.join(paperclipHome, "skills");
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async function scanForNewSkills(dir: string, knownBefore: Set<string>): Promise<{ name: string; description: string; path: string }[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    const results: { name: string; description: string; path: string }[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (knownBefore.has(entry.name)) continue;
      const skillPath = path.join(dir, entry.name);
      const hasSKILL = await fs.stat(path.join(skillPath, "SKILL.md")).catch(() => null);
      if (!hasSKILL) continue;
      const meta = await readSkillFrontmatter(skillPath);
      results.push({ name: meta.name, description: meta.description, path: skillPath });
    }
    return results;
  }

  async function installViaCommand(
    companyId: string,
    command: string,
    opts: { tier?: string; agentId?: string | null; targetDir?: string | null },
  ): Promise<{ installed: SkillRow[]; stdout: string; stderr: string }> {
    const tier = (opts.tier ?? "company") as SkillTier;
    const targetDir = await resolveInstallDirAsync(tier, opts.agentId, opts.targetDir);

    const existingEntries = await fs.readdir(targetDir, { withFileTypes: true }).catch(() => []);
    const knownBefore = new Set(existingEntries.filter((e) => e.isDirectory()).map((e) => e.name));

    const parts = command.trim().split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1);

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: targetDir,
      timeout: 60_000,
      env: { ...process.env, HOME: os.homedir(), PATH: process.env.PATH },
    });

    const newSkills = await scanForNewSkills(targetDir, knownBefore);

    const installed: SkillRow[] = [];
    for (const skill of newSkills) {
      const existing = await getByName(companyId, skill.name);
      if (existing) continue;
      const row = await create(companyId, {
        name: skill.name,
        description: skill.description,
        tier,
        agentId: opts.agentId ?? null,
        sourceType: "local",
        sourceUrl: command,
        installedPath: skill.path,
        metadata: { installedViaCommand: command },
      });
      installed.push(row);
    }

    return { installed, stdout, stderr };
  }

  return {
    list,
    getById,
    getByName,
    create,
    remove,
    listForAgent,
    assignToAgent,
    unassignFromAgent,
    listAssignmentsForAgent,
    resolveForExecution,
    seedBuiltInSkills,
    installViaCommand,
  };
}
