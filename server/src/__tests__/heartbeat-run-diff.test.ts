import { describe, expect, it } from "vitest";
import { extractGithubPullRequestsFromRunResult } from "../services/heartbeat.ts";

describe("extractGithubPullRequestsFromRunResult", () => {
  it("extracts PR links from run result text fields", () => {
    const result = extractGithubPullRequestsFromRunResult({
      result:
        "Done. PR [#174](https://github.com/alpha-community-wolf/paperclip/pull/174) and mirror https://github.com/alpha-community-wolf/community-wolf-paperclip/pull/22",
      summary:
        "Follow-up: https://github.com/alpha-community-wolf/paperclip/pull/174",
    });

    expect(result).toEqual([
      {
        url: "https://github.com/alpha-community-wolf/paperclip/pull/174",
        owner: "alpha-community-wolf",
        repo: "paperclip",
        number: 174,
      },
      {
        url: "https://github.com/alpha-community-wolf/community-wolf-paperclip/pull/22",
        owner: "alpha-community-wolf",
        repo: "community-wolf-paperclip",
        number: 22,
      },
    ]);
  });

  it("returns an empty list when no PR links are present", () => {
    const result = extractGithubPullRequestsFromRunResult({ result: "No PR in this run" });
    expect(result).toEqual([]);
  });
});
