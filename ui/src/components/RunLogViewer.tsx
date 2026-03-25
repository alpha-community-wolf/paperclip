import { useEffect, useMemo, useRef, useState } from "react";
import { heartbeatsApi } from "../api/heartbeats";
import { getUIAdapter, buildTranscript } from "../adapters";
import { TranscriptRenderer } from "./TranscriptRenderer";
import type { HeartbeatRun } from "@paperclipai/shared";

type LogChunk = { ts: string; stream: "stdout" | "stderr" | "system"; chunk: string };

function parseLogContent(content: string): LogChunk[] {
  const parsed: LogChunk[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const raw = JSON.parse(trimmed) as { ts?: unknown; stream?: unknown; chunk?: unknown };
      const stream =
        raw.stream === "stderr" || raw.stream === "system" ? raw.stream : "stdout";
      const chunk = typeof raw.chunk === "string" ? raw.chunk : "";
      const ts = typeof raw.ts === "string" ? raw.ts : new Date().toISOString();
      if (!chunk) continue;
      parsed.push({ ts, stream, chunk });
    } catch {
      // skip malformed lines
    }
  }
  return parsed;
}

interface RunLogViewerProps {
  run: HeartbeatRun;
  adapterType: string;
  compact?: boolean;
  maxHeight?: string;
}

export function RunLogViewer({ run, adapterType, compact = true, maxHeight = "32rem" }: RunLogViewerProps) {
  const [logLines, setLogLines] = useState<LogChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [logError, setLogError] = useState<string | null>(null);
  const logOffsetRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isLive = run.status === "running" || run.status === "queued";

  // Initial log fetch
  useEffect(() => {
    let cancelled = false;
    setLogLines([]);
    setLogError(null);
    setLoading(true);
    logOffsetRef.current = 0;

    if (!run.logRef && !isLive) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    const load = async () => {
      try {
        const limit =
          typeof run.logBytes === "number" && run.logBytes > 0
            ? Math.min(Math.max(run.logBytes + 1024, 256_000), 2_000_000)
            : 256_000;
        let offset = 0;
        let first = true;
        while (!cancelled) {
          const result = await heartbeatsApi.log(run.id, offset, first ? limit : 256_000);
          if (cancelled) break;
          const parsed = parseLogContent(result.content);
          if (parsed.length > 0) {
            setLogLines((prev) => [...prev, ...parsed]);
          }
          const next = result.nextOffset ?? offset + result.content.length;
          logOffsetRef.current = next;
          offset = next;
          first = false;
          if (result.nextOffset === undefined || isLive) break;
        }
      } catch (err) {
        if (!cancelled && !(isLive && err instanceof Error && err.message.includes("404"))) {
          setLogError(err instanceof Error ? err.message : "Failed to load log");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [run.id, run.logRef, run.logBytes, isLive]);

  // Poll for live updates
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(async () => {
      try {
        const result = await heartbeatsApi.log(run.id, logOffsetRef.current, 256_000);
        if (result.content) {
          const parsed = parseLogContent(result.content);
          if (parsed.length > 0) {
            setLogLines((prev) => [...prev, ...parsed]);
          }
        }
        if (result.nextOffset !== undefined) {
          logOffsetRef.current = result.nextOffset;
        } else if (result.content.length > 0) {
          logOffsetRef.current += result.content.length;
        }
      } catch {
        // ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [run.id, isLive]);

  // Auto-scroll to bottom on new content for live runs
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [logLines.length, isLive]);

  const adapter = useMemo(() => getUIAdapter(adapterType), [adapterType]);
  const transcript = useMemo(() => buildTranscript(logLines, adapter.parseStdoutLine), [logLines, adapter]);

  if (loading) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3 text-xs text-muted-foreground font-mono">
        Loading log...
      </div>
    );
  }

  if (logError) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3 text-xs text-red-600 dark:text-red-300 font-mono">
        {logError}
      </div>
    );
  }

  if (transcript.length === 0 && !isLive) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3 text-xs text-neutral-500 font-mono">
        No transcript for this run.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Transcript ({transcript.length})
        </span>
        {isLive && (
          <span className="flex items-center gap-1 text-xs text-cyan-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            Live
          </span>
        )}
      </div>
      <div
        className="bg-neutral-100 dark:bg-neutral-950 rounded-lg p-3 font-mono text-xs space-y-0.5 overflow-x-hidden overflow-y-auto"
        style={{ maxHeight }}
      >
        <TranscriptRenderer entries={transcript} compact={compact} />
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
