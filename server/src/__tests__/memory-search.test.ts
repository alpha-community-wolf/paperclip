import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { memorySearchRoutes } from "../routes/memory-search.js";
import { errorHandler } from "../middleware/error-handler.js";

const AGENT_ID = "a0000000-0000-4000-a000-000000000001";
const COMPANY_ID = "b0000000-0000-4000-a000-000000000099";

// Minimal mock agent service — resolveAgent needs an agent with cwd
function mockAgentService(cwd: string) {
  return {
    getById: async (id: string) => {
      if (id === AGENT_ID) {
        return {
          id: AGENT_ID,
          companyId: COMPANY_ID,
          adapterConfig: { cwd },
        };
      }
      return null;
    },
    resolveByReference: async () => ({ agent: null, ambiguous: false }),
  };
}

describe("GET /agents/:id/memory/search", () => {
  let tmpDir: string;
  let app: express.Express;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mem-search-"));

    // Create MEMORY.md
    await fs.writeFile(
      path.join(tmpDir, "MEMORY.md"),
      "# Memory\n\nAlpha prefers short status updates.\nProject deadline is 2026-04-15.\n",
    );

    // Create memory/ dir with daily notes
    await fs.mkdir(path.join(tmpDir, "memory"), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, "memory", "2026-03-29.md"),
      "# 2026-03-29\n\nDeployed memory injection to production.\nFixed rate limiting bug in heartbeat.\n",
    );
    await fs.writeFile(
      path.join(tmpDir, "memory", "2026-03-28.md"),
      "# 2026-03-28\n\nReviewed PR #49 for memory injection.\nAlpha approved the memory plan.\n",
    );

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // Mock board actor with company access
      (req as any).actor = {
        type: "board",
        companyId: COMPANY_ID,
        companyIds: [COMPANY_ID],
      };
      next();
    });
    app.use(memorySearchRoutes(mockAgentService(tmpDir)));
    app.use(errorHandler);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns matching results from MEMORY.md", async () => {
    const res = await request(app).get(`/agents/${AGENT_ID}/memory/search?q=deadline`);
    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].content).toContain("deadline");
  });

  it("returns matching results from daily notes", async () => {
    const res = await request(app).get(`/agents/${AGENT_ID}/memory/search?q=rate+limiting`);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].file).toContain("2026-03-29");
  });

  it("returns 400 when q is missing", async () => {
    const res = await request(app).get(`/agents/${AGENT_ID}/memory/search`);
    expect(res.status).toBe(400);
  });

  it("returns empty results for no match", async () => {
    const res = await request(app).get(`/agents/${AGENT_ID}/memory/search?q=xyznonexistent`);
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it("returns 404 for unknown agent", async () => {
    const res = await request(app).get(`/agents/c0000000-0000-4000-a000-000000000099/memory/search?q=test`);
    expect(res.status).toBe(404);
  });

  it("respects limit parameter", async () => {
    const res = await request(app).get(`/agents/${AGENT_ID}/memory/search?q=memory&limit=1`);
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeLessThanOrEqual(1);
  });

  it("caps total response characters", async () => {
    const res = await request(app).get(`/agents/${AGENT_ID}/memory/search?q=memory`);
    expect(res.status).toBe(200);
    const totalChars = JSON.stringify(res.body).length;
    expect(totalChars).toBeLessThan(20000);
  });

  it("ranks filename matches above content matches", async () => {
    // "2026-03-29" appears in the filename of one note, and we search for it
    const res = await request(app).get(`/agents/${AGENT_ID}/memory/search?q=2026-03-29`);
    expect(res.status).toBe(200);
    if (res.body.results.length > 1) {
      // The file whose name matches should come first
      expect(res.body.results[0].file).toContain("2026-03-29");
    }
  });
});
