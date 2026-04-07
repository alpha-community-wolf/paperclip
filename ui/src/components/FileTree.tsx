import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentsApi, type WorkspaceFileEntry } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileVideo,
  FileAudio,
  Loader2,
} from "lucide-react";

function nodeIcon(entry: WorkspaceFileEntry) {
  if (entry.type === "directory") return null; // handled separately with Folder/FolderOpen
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"].includes(ext)) return FileImage;
  if (["mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv"].includes(ext)) return FileVideo;
  if (["mp3", "wav", "flac", "aac", "oga", "m4a", "wma"].includes(ext)) return FileAudio;
  if (["md", "mdx", "markdown", "txt", "log"].includes(ext)) return FileText;
  if (["json", "jsonl"].includes(ext)) return FileJson;
  if (["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "sh", "bash"].includes(ext)) return FileCode;
  return File;
}

interface FileTreeNodeProps {
  entry: WorkspaceFileEntry;
  path: string;
  depth: number;
  isLast: boolean;
  agentId: string;
  companyId?: string;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  onToggle: (path: string) => void;
  onSelectFile: (path: string) => void;
  /** Tracks which ancestor depths have a continuing vertical line */
  connectorDepths: Set<number>;
}

function FileTreeNode({
  entry,
  path,
  depth,
  isLast,
  agentId,
  companyId,
  expandedPaths,
  selectedPath,
  onToggle,
  onSelectFile,
  connectorDepths,
}: FileTreeNodeProps) {
  const isDir = entry.type === "directory";
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;

  const childQuery = useQuery({
    queryKey: queryKeys.workspace.files(agentId, path),
    queryFn: () => agentsApi.listFiles(agentId, path, companyId),
    enabled: isDir && isExpanded,
  });

  const children = childQuery.data?.entries ?? [];
  const isLoading = isDir && isExpanded && childQuery.isLoading;

  const FileIcon = isDir ? (isExpanded ? FolderOpen : Folder) : nodeIcon(entry);

  // Build connector depths for children
  const childConnectorDepths = new Set(connectorDepths);
  if (!isLast) {
    childConnectorDepths.add(depth);
  }

  return (
    <div>
      {/* Node row */}
      <button
        onClick={() => {
          if (isDir) {
            onToggle(path);
          } else {
            onSelectFile(path);
          }
        }}
        className={cn(
          "flex items-center w-full text-left text-sm py-1 pr-2 rounded-sm transition-colors hover:bg-accent/50 group relative",
          isSelected && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {/* Branch connector lines */}
        {depth > 0 && (
          <>
            {/* Vertical lines for ancestors that continue */}
            {Array.from(connectorDepths).map((d) => (
              <span
                key={d}
                className="absolute top-0 bottom-0 border-l border-border/50"
                style={{ left: `${d * 16 + 11}px` }}
              />
            ))}
            {/* Horizontal + vertical connector for this node */}
            <span
              className={cn(
                "absolute border-l border-b border-border/50 rounded-bl-sm",
                isLast ? "top-0 h-[14px]" : "top-0 bottom-0",
              )}
              style={{
                left: `${(depth - 1) * 16 + 11}px`,
                width: "9px",
                ...(isLast ? {} : {}),
              }}
            />
            {isLast && (
              <span
                className="absolute border-b border-border/50"
                style={{
                  left: `${(depth - 1) * 16 + 11}px`,
                  top: "14px",
                  width: "9px",
                }}
              />
            )}
          </>
        )}

        {/* Chevron for directories */}
        {isDir ? (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
              isExpanded && "rotate-90",
            )}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Icon */}
        {FileIcon && (
          <FileIcon
            className={cn(
              "h-3.5 w-3.5 shrink-0 ml-1",
              isDir ? "text-primary/70" : "text-muted-foreground/70",
            )}
          />
        )}

        {/* Name */}
        <span className="ml-1.5 truncate">{entry.name}</span>

        {/* Loading indicator */}
        {isLoading && (
          <Loader2 className="h-3 w-3 ml-auto shrink-0 text-muted-foreground animate-spin" />
        )}
      </button>

      {/* Children */}
      {isDir && isExpanded && !isLoading && children.length > 0 && (
        <div>
          {children.map((child, i) => {
            const childPath = path ? `${path}/${child.name}` : child.name;
            return (
              <FileTreeNode
                key={child.name}
                entry={child}
                path={childPath}
                depth={depth + 1}
                isLast={i === children.length - 1}
                agentId={agentId}
                companyId={companyId}
                expandedPaths={expandedPaths}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
                connectorDepths={childConnectorDepths}
              />
            );
          })}
        </div>
      )}

      {/* Empty directory */}
      {isDir && isExpanded && !isLoading && children.length === 0 && !childQuery.isError && (
        <div
          className="text-xs text-muted-foreground/50 py-1 italic"
          style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
        >
          empty
        </div>
      )}
    </div>
  );
}

interface FileTreeProps {
  agentId: string;
  companyId?: string;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  /** Path to auto-expand to on mount (e.g. from ?file= deep link) */
  initialExpandPath?: string | null;
}

export function FileTree({
  agentId,
  companyId,
  selectedPath,
  onSelectFile,
  initialExpandPath,
}: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Always expand root
    const initial = new Set<string>([""]);
    // Auto-expand ancestors of initialExpandPath
    if (initialExpandPath) {
      const segments = initialExpandPath.split("/").filter(Boolean);
      let p = "";
      for (let i = 0; i < segments.length - 1; i++) {
        p = p ? `${p}/${segments[i]}` : segments[i];
        initial.add(p);
      }
    }
    return initial;
  });

  // Handle new initialExpandPath changes
  useEffect(() => {
    if (initialExpandPath) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        const segments = initialExpandPath.split("/").filter(Boolean);
        let p = "";
        for (let i = 0; i < segments.length - 1; i++) {
          p = p ? `${p}/${segments[i]}` : segments[i];
          next.add(p);
        }
        return next;
      });
    }
  }, [initialExpandPath]);

  const onToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Root directory query
  const rootQuery = useQuery({
    queryKey: queryKeys.workspace.files(agentId, ""),
    queryFn: () => agentsApi.listFiles(agentId, undefined, companyId),
  });

  const rootEntries = rootQuery.data?.entries ?? [];

  return (
    <div className="text-sm select-none">
      {/* Root label */}
      <button
        onClick={() => onToggle("")}
        className={cn(
          "flex items-center w-full text-left py-1 px-1 rounded-sm transition-colors hover:bg-accent/50 font-medium text-sm",
          !selectedPath && "text-primary",
        )}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-primary transition-transform duration-150",
            expandedPaths.has("") && "rotate-90",
          )}
        />
        <FolderOpen className="h-3.5 w-3.5 shrink-0 ml-1 text-primary" />
        <span className="ml-1.5 truncate text-primary">workspace</span>
      </button>

      {/* Root loading */}
      {rootQuery.isLoading && (
        <div className="flex items-center gap-2 py-2 px-4 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading...
        </div>
      )}

      {/* Root children */}
      {expandedPaths.has("") && rootEntries.length > 0 && (
        <div>
          {rootEntries.map((entry, i) => (
            <FileTreeNode
              key={entry.name}
              entry={entry}
              path={entry.name}
              depth={1}
              isLast={i === rootEntries.length - 1}
              agentId={agentId}
              companyId={companyId}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              connectorDepths={new Set<number>()}
            />
          ))}
        </div>
      )}

      {/* Root empty */}
      {expandedPaths.has("") && !rootQuery.isLoading && rootEntries.length === 0 && !rootQuery.isError && (
        <div className="text-xs text-muted-foreground/50 py-2 px-6 italic">
          No files
        </div>
      )}
    </div>
  );
}
