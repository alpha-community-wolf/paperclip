import type { StdoutLineParser, TranscriptEntry } from "@paperclipai/adapter-utils";
import { parseClaudeStdoutLine } from "@paperclipai/adapter-claude-local/ui";
import { parseCodexStdoutLine } from "@paperclipai/adapter-codex-local/ui";
import { parseCursorStdoutLine } from "@paperclipai/adapter-cursor-local/ui";
import { parseOpenCodeStdoutLine } from "@paperclipai/adapter-opencode-local/ui";
import { parsePiStdoutLine } from "@paperclipai/adapter-pi-local/ui";
import { parseOpenClawGatewayStdoutLine } from "@paperclipai/adapter-openclaw-gateway/ui";

export type ChatLogChunk = {
  ts: string;
  stream: "stdout" | "stderr" | "system";
  chunk: string;
};

export function resolveStdoutParser(adapterType: string | null | undefined): StdoutLineParser {
  switch (adapterType) {
    case "claude_local":
      return parseClaudeStdoutLine;
    case "codex_local":
      return parseCodexStdoutLine;
    case "cursor":
      return parseCursorStdoutLine;
    case "opencode_local":
      return parseOpenCodeStdoutLine;
    case "pi_local":
      return parsePiStdoutLine;
    case "openclaw_gateway":
      return parseOpenClawGatewayStdoutLine;
    default:
      return (line, ts) => [{ kind: "stdout", ts, text: line }];
  }
}

export function appendTranscriptEntry(entries: TranscriptEntry[], entry: TranscriptEntry) {
  if ((entry.kind === "thinking" || entry.kind === "assistant") && entry.delta) {
    const last = entries[entries.length - 1];
    if (last && last.kind === entry.kind && last.delta) {
      last.text += entry.text;
      last.ts = entry.ts;
      return;
    }
  }
  entries.push(entry);
}

export function buildTranscript(chunks: ChatLogChunk[], parser: StdoutLineParser): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let stdoutBuffer = "";

  for (const chunk of chunks) {
    if (chunk.stream === "stderr") {
      entries.push({ kind: "stderr", ts: chunk.ts, text: chunk.chunk });
      continue;
    }
    if (chunk.stream === "system") {
      entries.push({ kind: "system", ts: chunk.ts, text: chunk.chunk });
      continue;
    }

    const combined = stdoutBuffer + chunk.chunk;
    const lines = combined.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      for (const entry of parser(trimmed, chunk.ts)) {
        appendTranscriptEntry(entries, entry);
      }
    }
  }

  const trailing = stdoutBuffer.trim();
  if (trailing) {
    const ts = chunks.length > 0 ? chunks[chunks.length - 1]!.ts : new Date().toISOString();
    for (const entry of parser(trailing, ts)) {
      appendTranscriptEntry(entries, entry);
    }
  }

  return entries;
}

export function parseLogLines(input: string, pending: string) {
  const combined = pending + input;
  const lines = combined.split("\n");
  const remainder = lines.pop() ?? "";
  const chunks: ChatLogChunk[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ChatLogChunk;
      if (
        parsed &&
        typeof parsed.ts === "string" &&
        (parsed.stream === "stdout" || parsed.stream === "stderr" || parsed.stream === "system") &&
        typeof parsed.chunk === "string"
      ) {
        chunks.push(parsed);
      }
    } catch {
      // Ignore malformed lines in the live stream.
    }
  }

  return { chunks, remainder };
}

export function buildAssistantReply(entries: TranscriptEntry[], run: { status: string; error: string | null }) {
  const assistantText = entries
    .filter((entry): entry is Extract<TranscriptEntry, { kind: "assistant" }> => entry.kind === "assistant")
    .map((entry) => entry.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (assistantText) return assistantText;

  if (run.status === "failed") {
    return run.error?.trim() ? `Run failed: ${run.error.trim()}` : "Run failed before producing a response.";
  }
  if (run.status === "timed_out") {
    return "Run timed out before producing a response.";
  }
  if (run.status === "cancelled") {
    return "Run was cancelled before producing a response.";
  }

  return "";
}

export function isTerminalRunStatus(status: string | null | undefined) {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "timed_out";
}
