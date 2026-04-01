import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { ChevronRight, GitBranch, FileText } from "lucide-react";

interface RunDiffViewerProps {
  runId: string;
}

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
  hunks: DiffHunk[];
}

interface DiffHunk {
  header: string;
  startLine: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  const diffBlocks = raw.split(/^diff --git /m).filter(Boolean);

  for (const block of diffBlocks) {
    const lines = block.split("\n");
    // Extract file path from "a/... b/..."
    const headerMatch = lines[0]?.match(/a\/(.*?) b\/(.*)/);
    const filePath = headerMatch?.[2] ?? headerMatch?.[1] ?? "unknown";

    let additions = 0;
    let deletions = 0;
    const allLines: DiffLine[] = [];
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("@@")) {
        const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
        oldLine = hunkMatch ? parseInt(hunkMatch[1], 10) : 0;
        newLine = hunkMatch ? parseInt(hunkMatch[2], 10) : 0;
        currentHunk = { header: line, startLine: newLine, lines: [] };
        hunks.push(currentHunk);
        const headerLine: DiffLine = { type: "header", content: line };
        allLines.push(headerLine);
        currentHunk.lines.push(headerLine);
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
        const diffLine: DiffLine = { type: "add", content: line.slice(1), newLineNum: newLine++ };
        allLines.push(diffLine);
        currentHunk?.lines.push(diffLine);
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        deletions++;
        const diffLine: DiffLine = { type: "remove", content: line.slice(1), oldLineNum: oldLine++ };
        allLines.push(diffLine);
        currentHunk?.lines.push(diffLine);
      } else if (line.startsWith(" ")) {
        const diffLine: DiffLine = { type: "context", content: line.slice(1), oldLineNum: oldLine++, newLineNum: newLine++ };
        allLines.push(diffLine);
        currentHunk?.lines.push(diffLine);
      }
      // Skip metadata lines (index, ---, +++)
    }

    files.push({ path: filePath, additions, deletions, lines: allLines, hunks });
  }

  return files;
}

function DiffFileView({ file }: { file: DiffFile }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-xs bg-muted/50 hover:bg-muted transition-colors text-left"
        onClick={() => setCollapsed((v) => !v)}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", !collapsed && "rotate-90")} />
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-foreground truncate">{file.path}</span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {file.additions > 0 && <span className="text-green-600 dark:text-green-400">+{file.additions}</span>}
          {file.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>}
        </span>
      </button>
      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs leading-5">
            <tbody>
              {file.lines.map((line, idx) => {
                if (line.type === "header") {
                  return (
                    <tr key={idx} className="bg-blue-50/80 dark:bg-blue-950/30">
                      <td colSpan={3} className="px-3 py-0.5 text-blue-600 dark:text-blue-400 select-none">
                        {line.content}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={idx}
                    className={cn(
                      line.type === "add" && "bg-green-50/80 dark:bg-green-950/20",
                      line.type === "remove" && "bg-red-50/80 dark:bg-red-950/20",
                    )}
                  >
                    <td className="w-[1px] px-2 text-right text-muted-foreground/50 select-none border-r border-border/50 whitespace-nowrap">
                      {line.type !== "add" ? line.oldLineNum : ""}
                    </td>
                    <td className="w-[1px] px-2 text-right text-muted-foreground/50 select-none border-r border-border/50 whitespace-nowrap">
                      {line.type !== "remove" ? line.newLineNum : ""}
                    </td>
                    <td className="px-3 whitespace-pre">
                      <span
                        className={cn(
                          "select-none mr-1",
                          line.type === "add" && "text-green-700 dark:text-green-400",
                          line.type === "remove" && "text-red-700 dark:text-red-400",
                          line.type === "context" && "text-muted-foreground",
                        )}
                      >
                        {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                      </span>
                      {line.content}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RunDiffViewer({ runId }: RunDiffViewerProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.runDiff(runId),
    queryFn: () => heartbeatsApi.diff(runId),
  });

  const files = useMemo(() => {
    if (!data?.diff) return [];
    return parseDiff(data.diff);
  }, [data?.diff]);

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading diff...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-destructive">
        Failed to load diff
      </div>
    );
  }

  if (data?.error || !data?.diff) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
        <GitBranch className="h-8 w-8 opacity-40" />
        <span>{data?.error ?? "No changes recorded for this run"}</span>
        {data?.preCommit && (
          <span className="font-mono text-xs">
            Pre: {data.preCommit.slice(0, 8)}
            {data.postCommit && <> &rarr; Post: {data.postCommit.slice(0, 8)}</>}
          </span>
        )}
      </div>
    );
  }

  if (data.diff === "") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
        <GitBranch className="h-8 w-8 opacity-40" />
        <span>No file changes during this run</span>
        <span className="font-mono text-xs">{data.preCommit?.slice(0, 8)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">
          {data.preCommit?.slice(0, 8)} &rarr; {data.postCommit?.slice(0, 8)}
        </span>
        <span>{files.length} file{files.length !== 1 ? "s" : ""} changed</span>
        {totalAdditions > 0 && <span className="text-green-600 dark:text-green-400">+{totalAdditions}</span>}
        {totalDeletions > 0 && <span className="text-red-600 dark:text-red-400">-{totalDeletions}</span>}
      </div>
      {files.map((file, idx) => (
        <DiffFileView key={`${file.path}-${idx}`} file={file} />
      ))}
    </div>
  );
}
