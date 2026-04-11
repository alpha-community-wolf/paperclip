import { describe, expect, it } from "vitest";
import { agentSwitchUrl, deriveFlowIssueTitle } from "./utils";

const targetAgent = {
  id: "agent-2",
  name: "Agent Two",
  urlKey: "agent-two",
};

describe("agentSwitchUrl", () => {
  it("preserves supported tabs across company-prefixed routes", () => {
    expect(agentSwitchUrl("/ABC/agents/agent-one/configuration", targetAgent)).toBe(
      "/agents/agent-two/configuration",
    );
  });

  it("converts run detail routes to the target agent runs tab", () => {
    expect(agentSwitchUrl("/agents/agent-one/runs/run-123", targetAgent)).toBe(
      "/agents/agent-two/runs",
    );
  });

  it("falls back to dashboard outside agent detail routes", () => {
    expect(agentSwitchUrl("/agents/all", targetAgent)).toBe("/agents/agent-two/dashboard");
  });
});

describe("deriveFlowIssueTitle", () => {
  it("replaces Explore prefix when creating a plan title", () => {
    expect(deriveFlowIssueTitle("Plan", "Explore: Improve issue naming")).toBe(
      "Plan: Improve issue naming",
    );
  });

  it("replaces Plan prefix when creating a build title", () => {
    expect(deriveFlowIssueTitle("Build", "Plan: Improve issue naming")).toBe(
      "Build: Improve issue naming",
    );
  });

  it("normalizes legacy build-plan title prefixes", () => {
    expect(deriveFlowIssueTitle("Build", "Build plan COM-123")).toBe("Build: COM-123");
  });
});
