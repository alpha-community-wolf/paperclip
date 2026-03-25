import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { skillService } from "./skills.js";
import { discoverHermesSkills } from "../adapters/hermes/skills.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR_CANDIDATES = [
  path.resolve(__moduleDir, "../../skills"),
  path.resolve(__moduleDir, "../../../skills"),
];

async function resolveSkillsDir(): Promise<string | null> {
  for (const candidate of SKILLS_DIR_CANDIDATES) {
    const isDir = await fs.stat(candidate).then((s) => s.isDirectory()).catch(() => false);
    if (isDir) return candidate;
  }
  return null;
}

export async function readSkillFrontmatter(skillDir: string): Promise<{ name: string; description: string }> {
  const skillMd = path.join(skillDir, "SKILL.md");
  const name = path.basename(skillDir);
  try {
    const content = await fs.readFile(skillMd, "utf-8");
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const fm = frontmatterMatch[1]!;
      const descMatch = fm.match(/description:\s*>?\s*\n([\s\S]*?)(?=\n\w|\n---)/);
      if (descMatch) {
        return { name, description: descMatch[1]!.replace(/\n\s+/g, " ").trim() };
      }
      const inlineDescMatch = fm.match(/description:\s*(.+)/);
      if (inlineDescMatch) {
        return { name, description: inlineDescMatch[1]!.trim() };
      }
    }
    return { name, description: "" };
  } catch {
    return { name, description: "" };
  }
}

const CORE_BUILT_IN_SKILLS = new Set(["paperclip", "paperclip-create-agent", "para-memory-files"]);

export interface BuiltInSkillDef {
  name: string;
  description: string;
  path: string;
  defaultEnabled: boolean;
}

export async function discoverBuiltInSkills(): Promise<BuiltInSkillDef[]> {
  const skillsDir = await resolveSkillsDir();
  if (!skillsDir) return [];

  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const result: BuiltInSkillDef[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name);
    const hasSKILL = await fs.stat(path.join(skillPath, "SKILL.md")).catch(() => null);
    if (!hasSKILL) continue;
    const meta = await readSkillFrontmatter(skillPath);
    result.push({
      name: meta.name,
      description: meta.description,
      path: skillPath,
      defaultEnabled: CORE_BUILT_IN_SKILLS.has(meta.name),
    });
  }
  return result;
}

export async function seedBuiltInSkillsForAllCompanies(db: Db): Promise<{ seeded: number }> {
  const [paperclipSkills, hermesSkills] = await Promise.all([
    discoverBuiltInSkills(),
    discoverHermesSkills().catch(() => []),
  ]);
  const builtInSkills = [...paperclipSkills, ...hermesSkills];
  if (builtInSkills.length === 0) return { seeded: 0 };

  const allCompanies = await db.select({ id: companies.id }).from(companies);
  const svc = skillService(db);
  let seeded = 0;

  for (const company of allCompanies) {
    await svc.seedBuiltInSkills(company.id, builtInSkills);
    seeded++;
  }

  return { seeded };
}

export async function seedBuiltInSkillsForCompany(db: Db, companyId: string): Promise<void> {
  const [paperclipSkills, hermesSkills] = await Promise.all([
    discoverBuiltInSkills(),
    discoverHermesSkills().catch(() => []),
  ]);
  const builtInSkills = [...paperclipSkills, ...hermesSkills];
  if (builtInSkills.length === 0) return;
  const svc = skillService(db);
  await svc.seedBuiltInSkills(companyId, builtInSkills);
}
