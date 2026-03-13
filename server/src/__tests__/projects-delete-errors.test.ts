import { describe, expect, it } from "vitest";
import { isForeignKeyConstraintError } from "../services/projects.ts";

describe("isForeignKeyConstraintError", () => {
  it("matches postgres foreign key violations", () => {
    expect(isForeignKeyConstraintError({ code: "23503" })).toBe(true);
  });

  it("matches sqlite foreign key violations", () => {
    expect(isForeignKeyConstraintError({ code: "SQLITE_CONSTRAINT_FOREIGNKEY" })).toBe(true);
  });

  it("matches fallback foreign-key messages", () => {
    expect(isForeignKeyConstraintError({ message: "insert or update violates FOREIGN KEY constraint" })).toBe(
      true,
    );
  });

  it("ignores unrelated errors", () => {
    expect(isForeignKeyConstraintError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isForeignKeyConstraintError(new Error("boom"))).toBe(false);
    expect(isForeignKeyConstraintError(null)).toBe(false);
  });
});

