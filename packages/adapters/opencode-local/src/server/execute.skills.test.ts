import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureOpencodeSkillsInjected } from "./execute.js";

type LogEntry = { stream: string; chunk: string };

function makeOnLog() {
  const entries: LogEntry[] = [];
  const onLog = async (stream: string, chunk: string) => {
    entries.push({ stream, chunk });
  };
  return { onLog, entries };
}

describe("ensureOpencodeSkillsInjected", () => {
  let tmpRoot: string;
  let cwd: string;
  let sourceA: string;
  let sourceB: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-skills-test-"));
    cwd = path.join(tmpRoot, "agent-home");
    await fs.mkdir(cwd, { recursive: true });

    sourceA = path.join(tmpRoot, "source-skills", "paperclip-create-agent");
    sourceB = path.join(tmpRoot, "source-skills", "paperclip");
    await fs.mkdir(sourceA, { recursive: true });
    await fs.mkdir(sourceB, { recursive: true });
    await fs.writeFile(path.join(sourceA, "SKILL.md"), "---\nname: paperclip-create-agent\ndescription: x\n---\n");
    await fs.writeFile(path.join(sourceB, "SKILL.md"), "---\nname: paperclip\ndescription: y\n---\n");
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("symlinks each ctx.skill into <cwd>/.agents/skills/<name>", async () => {
    const { onLog, entries } = makeOnLog();

    await ensureOpencodeSkillsInjected(onLog, {
      cwd,
      skills: [
        { name: "paperclip-create-agent", tier: "global", path: sourceA },
        { name: "paperclip", tier: "global", path: sourceB },
      ],
    });

    const linkA = path.join(cwd, ".agents", "skills", "paperclip-create-agent");
    const linkB = path.join(cwd, ".agents", "skills", "paperclip");
    expect(await fs.readlink(linkA)).toBe(sourceA);
    expect(await fs.readlink(linkB)).toBe(sourceB);
    expect(entries.some((e) => e.chunk.includes("paperclip-create-agent"))).toBe(true);
  });

  it("is idempotent: does not overwrite an existing entry", async () => {
    const skillsHome = path.join(cwd, ".agents", "skills");
    await fs.mkdir(skillsHome, { recursive: true });
    const existing = path.join(skillsHome, "here-now");
    await fs.mkdir(existing, { recursive: true });
    await fs.writeFile(path.join(existing, "SKILL.md"), "---\nname: here-now\ndescription: user-authored\n---\n");

    const { onLog } = makeOnLog();
    await ensureOpencodeSkillsInjected(onLog, {
      cwd,
      skills: [
        { name: "here-now", tier: "global", path: sourceA },
        { name: "paperclip-create-agent", tier: "global", path: sourceA },
      ],
    });

    const hereNowStat = await fs.lstat(existing);
    expect(hereNowStat.isDirectory()).toBe(true);
    const injected = path.join(skillsHome, "paperclip-create-agent");
    expect(await fs.readlink(injected)).toBe(sourceA);
  });

  it("falls back to repo skills/ when ctx.skills is empty (backward compat)", async () => {
    const { onLog } = makeOnLog();
    await ensureOpencodeSkillsInjected(onLog, { cwd, skills: [] });

    const skillsHome = path.join(cwd, ".agents", "skills");
    const injected = await fs.readdir(skillsHome).catch(() => [] as string[]);
    expect(injected.length).toBeGreaterThan(0);
  });

  it("skips entries whose source directory does not exist", async () => {
    const { onLog } = makeOnLog();
    const missing = path.join(tmpRoot, "missing");
    await ensureOpencodeSkillsInjected(onLog, {
      cwd,
      skills: [{ name: "missing-skill", tier: "global", path: missing }],
    });

    const target = path.join(cwd, ".agents", "skills", "missing-skill");
    const existed = await fs
      .lstat(target)
      .then(() => true)
      .catch(() => false);
    expect(existed).toBe(false);
  });
});
