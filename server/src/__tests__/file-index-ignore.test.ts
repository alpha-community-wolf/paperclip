import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isNestedAgentWorkspaceReposPath,
  isPathExcluded,
  loadIgnorePatterns,
} from "../services/file-index.ts";

describe("isNestedAgentWorkspaceReposPath", () => {
  it("matches monorepo-root cwd layout (agents/<id>/workspace/repos/…)", () => {
    expect(isNestedAgentWorkspaceReposPath("agents/tony/workspace/repos/wolf-website/a.md")).toBe(true);
    expect(isNestedAgentWorkspaceReposPath("agents/tony/workspace/repositories/foo/a.md")).toBe(true);
    expect(isNestedAgentWorkspaceReposPath("workspace/repos/wolf-website/a.md")).toBe(false);
    expect(isNestedAgentWorkspaceReposPath("agents/tony/MEMORY.md")).toBe(false);
  });
});

describe("isPathExcluded", () => {
  it("matches workspace/repos layout (agent cwd = agent home)", () => {
    const patterns = ["workspace/repos/**"];
    expect(isPathExcluded("workspace/repos/foo/a.md", patterns)).toBe(true);
    expect(isPathExcluded("workspace/notes/a.md", patterns)).toBe(false);
  });

  it("matches repos layout (agent cwd = …/workspace)", () => {
    const patterns = ["repos/**"];
    expect(isPathExcluded("repos/foo/a.md", patterns)).toBe(true);
    expect(isPathExcluded("notes/a.md", patterns)).toBe(false);
  });
});

describe("loadIgnorePatterns", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pc-file-index-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("includes built-in repo exclusions without any file", async () => {
    const patterns = await loadIgnorePatterns(tmp);
    expect(patterns).toContain("workspace/repos/**");
    expect(patterns).toContain("repos/**");
  });

  it("merges agent-root .fileindex-ignore when cwd ends with workspace", async () => {
    const agentRoot = path.join(tmp, "agent");
    const ws = path.join(agentRoot, "workspace");
    await fs.mkdir(ws, { recursive: true });
    await fs.writeFile(
      path.join(agentRoot, ".fileindex-ignore"),
      "# comment\nscratch/\n",
      "utf-8",
    );
    const patterns = await loadIgnorePatterns(ws);
    expect(patterns).toContain("scratch/");
    expect(patterns).toContain("repos/**");
  });

  it("merges cwd .fileindex-ignore when cwd is agent home", async () => {
    const agentRoot = path.join(tmp, "agent");
    await fs.mkdir(agentRoot, { recursive: true });
    await fs.writeFile(path.join(agentRoot, ".fileindex-ignore"), "vendor/\n", "utf-8");
    const patterns = await loadIgnorePatterns(agentRoot);
    expect(patterns).toContain("vendor/");
 });

  it("merges both parent and workspace .fileindex-ignore when cwd is …/workspace", async () => {
    const agentRoot = path.join(tmp, "agent");
    const ws = path.join(agentRoot, "workspace");
    await fs.mkdir(ws, { recursive: true });
    await fs.writeFile(path.join(agentRoot, ".fileindex-ignore"), "from-parent/\n", "utf-8");
    await fs.writeFile(path.join(ws, ".fileindex-ignore"), "from-ws/\n", "utf-8");
    const patterns = await loadIgnorePatterns(ws);
    expect(patterns).toContain("from-parent/");
    expect(patterns).toContain("from-ws/");
  });
});
