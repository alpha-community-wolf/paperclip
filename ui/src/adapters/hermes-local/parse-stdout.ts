import type { TranscriptEntry } from "@paperclipai/adapter-utils";

const TOOL_OUTPUT_PREFIX = "┊ ";

function isToolLine(line: string): boolean {
  return line.startsWith(TOOL_OUTPUT_PREFIX);
}

function parseToolLine(line: string): { tool: string; content: string } | null {
  const stripped = line.slice(TOOL_OUTPUT_PREFIX.length).trim();
  const match = stripped.match(/^([a-z_]+)(?:\([^)]*\))?[:\s]+(.*)$/i);
  if (match) {
    return { tool: match[1], content: match[2] };
  }
  return { tool: "unknown", content: stripped };
}

function isThinkingLine(line: string): boolean {
  return (
    line.includes("💭") ||
    line.startsWith("<thinking>") ||
    line.startsWith("</thinking>") ||
    line.startsWith("Thinking:")
  );
}

export function parseHermesStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[hermes]")) {
    return [{ kind: "system", ts, text: trimmed }];
  }

  if (isToolLine(trimmed)) {
    const parsed = parseToolLine(trimmed);
    if (parsed) {
      return [{ kind: "stdout", ts, text: `[${parsed.tool}] ${parsed.content}` }];
    }
  }

  if (isThinkingLine(trimmed)) {
    return [
      {
        kind: "thinking",
        ts,
        text: trimmed.replace(/^💭\s*/, ""),
      },
    ];
  }

  if (
    trimmed.startsWith("Error:") ||
    trimmed.startsWith("ERROR:") ||
    trimmed.startsWith("Traceback")
  ) {
    return [{ kind: "stderr", ts, text: trimmed }];
  }

  return [{ kind: "assistant", ts, text: trimmed }];
}
