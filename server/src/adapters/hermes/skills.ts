import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { BuiltInSkillDef } from "../../services/skill-seeding.js";

function hermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes");
}

/**
 * Read a Hermes SKILL.md frontmatter, extracting the `name:` field
 * (which is what Hermes uses for the `-s` flag) and `description:`.
 * Falls back to directory basename if name is missing from frontmatter.
 */
async function readHermesSkillMeta(skillDir: string): Promise<{ name: string; description: string }> {
  const skillMd = path.join(skillDir, "SKILL.md");
  const dirName = path.basename(skillDir);
  try {
    const content = await fs.readFile(skillMd, "utf-8");
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return { name: dirName, description: "" };

    const fm = frontmatterMatch[1]!;

    const nameMatch = fm.match(/^name:\s*(.+)/m);
    const name = nameMatch?.[1]?.trim() || dirName;

    let description = "";
    const multiLineDesc = fm.match(/description:\s*>?\s*\n([\s\S]*?)(?=\n\w|\n---)/);
    if (multiLineDesc) {
      description = multiLineDesc[1]!.replace(/\n\s+/g, " ").trim();
    } else {
      const inlineDesc = fm.match(/description:\s*"?([^"\n]+)"?/);
      if (inlineDesc) description = inlineDesc[1]!.trim();
    }

    return { name, description };
  } catch {
    return { name: dirName, description: "" };
  }
}

/**
 * Discover all skills installed in the Hermes skills directory.
 * Hermes stores skills in a nested category/skill-name/ structure:
 *   ~/.hermes/skills/software-development/code-review/SKILL.md
 *   ~/.hermes/skills/research/arxiv/SKILL.md
 *
 * Skills are prefixed with `hermes/` in the Paperclip DB. At execution time,
 * the prefix is stripped and the native name is passed to `hermes chat -s`.
 */
export async function discoverHermesSkills(): Promise<BuiltInSkillDef[]> {
  const skillsDir = path.join(hermesHome(), "skills");
  const isDir = await fs.stat(skillsDir).then((s) => s.isDirectory()).catch(() => false);
  if (!isDir) return [];

  const result: BuiltInSkillDef[] = [];
  const seen = new Set<string>();
  const categories = await fs.readdir(skillsDir, { withFileTypes: true });

  for (const category of categories) {
    if (!category.isDirectory()) continue;
    const categoryPath = path.join(skillsDir, category.name);

    const directSkill = await fs.stat(path.join(categoryPath, "SKILL.md")).catch(() => null);
    if (directSkill) {
      const meta = await readHermesSkillMeta(categoryPath);
      const key = `hermes/${meta.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          name: key,
          description: meta.description,
          path: categoryPath,
          defaultEnabled: false,
        });
      }
    }

    const entries = await fs.readdir(categoryPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(categoryPath, entry.name);
      const hasSkillMd = await fs.stat(path.join(skillPath, "SKILL.md")).catch(() => null);
      if (!hasSkillMd) continue;

      const meta = await readHermesSkillMeta(skillPath);
      const key = `hermes/${meta.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          name: key,
          description: meta.description,
          path: skillPath,
          defaultEnabled: false,
        });
      }
    }
  }

  return result;
}
