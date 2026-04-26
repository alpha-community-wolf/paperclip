import { describe, expect, it } from "vitest";
import { assertTransition, ALLOWED_TRANSITIONS } from "../services/issues.js";

describe("assertTransition — status state machine", () => {
  it("allows identity transitions (no-op)", () => {
    for (const status of Object.keys(ALLOWED_TRANSITIONS)) {
      expect(() => assertTransition(status, status)).not.toThrow();
    }
  });

  it("allows all explicitly listed transitions", () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  it("rejects unknown target statuses", () => {
    expect(() => assertTransition("todo", "nonexistent")).toThrow(/Unknown issue status/);
  });

  // Illegal transitions that must be rejected
  const illegalTransitions: [string, string][] = [
    ["backlog", "done"],
    ["backlog", "in_progress"],
    ["backlog", "in_review"],
    ["backlog", "blocked"],
    ["cancelled", "done"],
    ["cancelled", "in_progress"],
    ["cancelled", "in_review"],
    ["cancelled", "blocked"],
    ["done", "in_progress"],
    ["done", "in_review"],
    ["done", "blocked"],
    ["done", "cancelled"],
    ["done", "backlog"],
    ["blocked", "done"],
    ["blocked", "in_review"],
    ["blocked", "backlog"],
    ["todo", "done"],
    ["todo", "in_review"],
  ];

  for (const [from, to] of illegalTransitions) {
    it(`rejects ${from} → ${to}`, () => {
      expect(() => assertTransition(from, to)).toThrow(/Invalid status transition/);
    });
  }

  // Key scenarios from the COM-894 reflection
  it("prevents skipping in_progress to go directly to done from todo", () => {
    expect(() => assertTransition("todo", "done")).toThrow(/Invalid status transition/);
  });

  it("prevents cancelled → done (must resurrect via todo first)", () => {
    expect(() => assertTransition("cancelled", "done")).toThrow(/Invalid status transition/);
  });

  it("prevents backlog → done (must go through todo/in_progress)", () => {
    expect(() => assertTransition("backlog", "done")).toThrow(/Invalid status transition/);
  });

  it("allows done → todo (reopen)", () => {
    expect(() => assertTransition("done", "todo")).not.toThrow();
  });

  it("allows cancelled → todo (resurrect)", () => {
    expect(() => assertTransition("cancelled", "todo")).not.toThrow();
  });

  it("allows in_progress → done (normal completion)", () => {
    expect(() => assertTransition("in_progress", "done")).not.toThrow();
  });

  it("allows in_review → done (review approval)", () => {
    expect(() => assertTransition("in_review", "done")).not.toThrow();
  });

  it("every status has a defined set of transitions", () => {
    const allStatuses = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"];
    for (const status of allStatuses) {
      expect(ALLOWED_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(ALLOWED_TRANSITIONS[status])).toBe(true);
    }
  });

  it("transition graph has no self-loops in the allowed lists", () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(targets).not.toContain(from);
    }
  });
});
