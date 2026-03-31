import { describe, it, expect } from "vitest";
import { sanitizeCommentBody } from "@paperclipai/shared";

describe("sanitizeCommentBody", () => {
  it("converts literal \\n to real newlines", () => {
    const input = "PR opened: https://github.com/org/repo/pull/46\\n\\n**Root cause:** something";
    const result = sanitizeCommentBody(input);
    expect(result).toBe("PR opened: https://github.com/org/repo/pull/46\n\n**Root cause:** something");
  });

  it("converts literal \\r and \\t", () => {
    expect(sanitizeCommentBody("line1\\r\\nline2")).toBe("line1\r\nline2");
    expect(sanitizeCommentBody("col1\\tcol2")).toBe("col1\tcol2");
  });

  it("preserves real newlines", () => {
    const input = "line1\nline2\n";
    expect(sanitizeCommentBody(input)).toBe(input);
  });

  it("handles the exact broken link example from COM-319", () => {
    const input =
      "https://github.com/alpha-community-wolf/paperclip/pull/46\\n\\n**Root cause analysis:**";
    const result = sanitizeCommentBody(input);
    expect(result).toBe(
      "https://github.com/alpha-community-wolf/paperclip/pull/46\n\n**Root cause analysis:**"
    );
    // URL should now be cleanly separated from surrounding text
    expect(result).toContain("pull/46\n");
    expect(result).not.toContain("\\n");
  });

  it("returns empty string unchanged", () => {
    expect(sanitizeCommentBody("")).toBe("");
  });

  it("returns text without escape sequences unchanged", () => {
    const input = "Just a normal comment with a [link](https://example.com).";
    expect(sanitizeCommentBody(input)).toBe(input);
  });
});
