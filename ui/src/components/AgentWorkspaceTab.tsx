import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type WorkspaceFileEntry } from "../api/agents";
import { chatApi } from "../api/chat";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "./MarkdownBody";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileVideo,
  FileAudio,
  ChevronRight,
  ArrowLeft,
  FolderOpen,
  AlertCircle,
  Settings,
  MessageSquare,
  CircleDot,
  Upload,
  FilePlus,
  Loader2,
  Download,
} from "lucide-react";

interface AgentWorkspaceTabProps {
  agentId: string;
  agentRouteId: string;
  hasCwd: boolean;
}

const MAX_CHAT_CONTENT_LENGTH = 2000;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function fileIcon(entry: WorkspaceFileEntry) {
  if (entry.type === "directory") return Folder;
  const cat = categorizeFile(entry.name);
  if (cat === "image") return FileImage;
  if (cat === "video") return FileVideo;
  if (cat === "audio") return FileAudio;
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  if (["md", "mdx", "markdown", "txt", "log"].includes(ext)) return FileText;
  if (["json", "jsonl"].includes(ext)) return FileJson;
  if (["ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "sh", "bash"].includes(ext)) return FileCode;
  return File;
}

function extensionLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust",
    sh: "bash", bash: "bash", zsh: "bash",
    yaml: "yaml", yml: "yaml", toml: "toml",
    json: "json", jsonl: "json",
    html: "html", htm: "html", css: "css", scss: "scss",
    sql: "sql", graphql: "graphql",
    xml: "xml", svg: "xml",
  };
  return map[ext] ?? "text";
}

function isMarkdown(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["md", "mdx", "markdown"].includes(ext);
}

function isImage(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif"].includes(ext);
}

function isVideo(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv"].includes(ext);
}

function isAudio(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["mp3", "wav", "flac", "aac", "oga", "m4a", "wma"].includes(ext);
}

function isPdf(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ext === "pdf";
}

type FileCategory = "markdown" | "image" | "video" | "audio" | "pdf" | "text" | "binary";

function categorizeFile(filename: string): FileCategory {
  if (isMarkdown(filename)) return "markdown";
  if (isImage(filename)) return "image";
  if (isVideo(filename)) return "video";
  if (isAudio(filename)) return "audio";
  if (isPdf(filename)) return "pdf";
  // Check if it's a known text extension
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const textExts = [
    "txt", "log", "csv", "json", "jsonl",
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "py", "rb", "go", "rs", "java", "kt", "swift", "c", "cpp", "h",
    "sh", "bash", "zsh", "fish",
    "yaml", "yml", "toml", "ini", "cfg",
    "html", "htm", "css", "scss", "less",
    "xml", "env", "gitignore", "dockerignore",
    "sql", "graphql", "gql", "lock", "editorconfig",
  ];
  if (ext === "" || textExts.includes(ext)) return "text";
  return "binary";
}

function Breadcrumbs({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const segments = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-x-auto">
      <button
        onClick={() => onNavigate("")}
        className={cn(
          "shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-accent/50 transition-colors",
          segments.length === 0 && "text-foreground font-medium",
        )}
      >
        <FolderOpen className="h-3.5 w-3.5" />
        <span>workspace</span>
      </button>
      {segments.map((seg, i) => {
        const segPath = segments.slice(0, i + 1).join("/");
        const isLast = i === segments.length - 1;
        return (
          <span key={segPath} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
            <button
              onClick={() => onNavigate(segPath)}
              className={cn(
                "px-1.5 py-0.5 rounded hover:bg-accent/50 transition-colors",
                isLast && "text-foreground font-medium",
              )}
            >
              {seg}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function FileActionButtons({
  filePath,
  agentId,
  agentRouteId,
  companyId,
  fileContent,
  size = "sm",
}: {
  filePath: string;
  agentId: string;
  agentRouteId: string;
  companyId?: string;
  fileContent?: string;
  size?: "sm" | "xs";
}) {
  const navigate = useNavigate();
  const { openNewIssue } = useDialog();
  const [chatLoading, setChatLoading] = useState(false);

  const filename = filePath.split("/").pop() ?? filePath;

  async function handleChatAboutFile() {
    setChatLoading(true);
    try {
      let content = fileContent;
      if (content === undefined) {
        const fetched = await agentsApi.getFileContent(agentId, filePath, companyId);
        content = fetched.content;
      }

      const truncated =
        content.length > MAX_CHAT_CONTENT_LENGTH
          ? content.slice(0, MAX_CHAT_CONTENT_LENGTH) + "\n... (truncated)"
          : content;

      const sessionResult = await chatApi.createSession(agentId, {
        title: `Re: ${filename}`,
      });

      const message = `I'd like to discuss this file from your workspace:\n\`${filePath}\`\n\n<file-content path="${filePath}">\n${truncated}\n</file-content>`;
      await chatApi.sendMessage(agentId, sessionResult.session.id, { content: message });

      navigate(`/agents/${agentRouteId}/chat`);
    } catch {
      // Silently fail -- the user will see the chat tab hasn't changed
    } finally {
      setChatLoading(false);
    }
  }

  function handleCreateIssue() {
    openNewIssue({
      assigneeAgentId: agentId,
      description: `**Workspace file:** \`${filePath}\`\n\n---\n\n`,
      attachedFile: filePath,
    });
  }

  const iconSize = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size={size === "xs" ? "icon-xs" : "icon-sm"}
        onClick={(e) => {
          e.stopPropagation();
          handleChatAboutFile();
        }}
        disabled={chatLoading}
        title="Chat about this file"
        className="text-muted-foreground hover:text-foreground"
      >
        {chatLoading ? (
          <Loader2 className={cn(iconSize, "animate-spin")} />
        ) : (
          <MessageSquare className={iconSize} />
        )}
      </Button>
      <Button
        variant="ghost"
        size={size === "xs" ? "icon-xs" : "icon-sm"}
        onClick={(e) => {
          e.stopPropagation();
          handleCreateIssue();
        }}
        title="Create issue with this file"
        className="text-muted-foreground hover:text-foreground"
      >
        <CircleDot className={iconSize} />
      </Button>
    </div>
  );
}

function MediaFileViewer({
  agentId,
  filePath,
  companyId,
  category,
}: {
  agentId: string;
  filePath: string;
  companyId?: string;
  category: FileCategory;
}) {
  const rawUrl = agentsApi.rawFileUrl(agentId, filePath, companyId);
  const downloadUrl = agentsApi.downloadFileUrl(agentId, filePath, companyId);
  const filename = filePath.split("/").pop() ?? filePath;

  if (category === "image") {
    return (
      <div className="flex flex-col items-center gap-3 p-4">
        <img
          src={rawUrl}
          alt={filename}
          className="max-w-full max-h-[600px] rounded object-contain"
        />
        <a
          href={downloadUrl}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3 w-3" />
          Download original
        </a>
      </div>
    );
  }

  if (category === "video") {
    return (
      <div className="flex flex-col items-center gap-3 p-4">
        <video
          src={rawUrl}
          controls
          className="max-w-full max-h-[600px] rounded"
        >
          Your browser does not support this video format.
        </video>
        <a
          href={downloadUrl}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3 w-3" />
          Download original
        </a>
      </div>
    );
  }

  if (category === "audio") {
    return (
      <div className="flex flex-col items-center gap-3 p-6">
        <FileAudio className="h-12 w-12 text-muted-foreground/40" />
        <audio src={rawUrl} controls className="w-full max-w-md">
          Your browser does not support this audio format.
        </audio>
        <a
          href={downloadUrl}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3 w-3" />
          Download original
        </a>
      </div>
    );
  }

  if (category === "pdf") {
    return (
      <div className="flex flex-col gap-3">
        <iframe
          src={rawUrl}
          className="w-full h-[700px] rounded border-0"
          title={filename}
        />
        <div className="flex justify-center">
          <a
            href={downloadUrl}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-3 w-3" />
            Download original
          </a>
        </div>
      </div>
    );
  }

  // Binary fallback — show download link
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <File className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">
        This file type cannot be previewed in the browser.
      </p>
      <a
        href={downloadUrl}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Download {filename}
      </a>
    </div>
  );
}

function FileViewer({
  agentId,
  agentRouteId,
  filePath,
  companyId,
  onBack,
}: {
  agentId: string;
  agentRouteId: string;
  filePath: string;
  companyId?: string;
  onBack: () => void;
}) {
  const filename = filePath.split("/").pop() ?? filePath;
  const category = categorizeFile(filename);
  const isTextCategory = category === "markdown" || category === "text";

  const contentQuery = useQuery({
    queryKey: queryKeys.workspace.content(agentId, filePath),
    queryFn: () => agentsApi.getFileContent(agentId, filePath, companyId),
    enabled: isTextCategory,
  });

  return (
    <div className="animate-page-enter">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <span className="text-sm font-mono text-muted-foreground truncate flex-1">{filePath}</span>
        {isTextCategory && (
          <FileActionButtons
            filePath={filePath}
            agentId={agentId}
            agentRouteId={agentRouteId}
            companyId={companyId}
            fileContent={contentQuery.data?.content}
          />
        )}
      </div>

      {/* Media / binary files — rendered via raw URL, no text content fetch needed */}
      {!isTextCategory && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            <span className="text-xs font-mono text-muted-foreground">{filename}</span>
          </div>
          <MediaFileViewer
            agentId={agentId}
            filePath={filePath}
            companyId={companyId}
            category={category}
          />
        </div>
      )}

      {/* Text files — fetch content via JSON API */}
      {isTextCategory && contentQuery.isLoading && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading file...</p>
        </div>
      )}

      {isTextCategory && contentQuery.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Failed to load file</p>
            <p className="text-xs text-muted-foreground mt-1">
              {contentQuery.error instanceof Error ? contentQuery.error.message : "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => contentQuery.refetch()}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {isTextCategory && contentQuery.data && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            <span className="text-xs font-mono text-muted-foreground">{filename}</span>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(contentQuery.data.size)}
            </span>
          </div>
          <div className="p-4 overflow-x-auto">
            {isMarkdown(filename) ? (
              <MarkdownBody>{contentQuery.data.content}</MarkdownBody>
            ) : (
              <pre className="text-sm font-mono whitespace-pre-wrap break-words text-foreground/90 leading-relaxed">
                <code className={`language-${extensionLanguage(filename)}`}>
                  {contentQuery.data.content}
                </code>
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DirectoryListing({
  agentId,
  agentRouteId,
  currentPath,
  companyId,
  onNavigate,
  onOpenFile,
}: {
  agentId: string;
  agentRouteId: string;
  currentPath: string;
  companyId?: string;
  onNavigate: (path: string) => void;
  onOpenFile: (path: string) => void;
}) {
  const listQuery = useQuery({
    queryKey: queryKeys.workspace.files(agentId, currentPath),
    queryFn: () => agentsApi.listFiles(agentId, currentPath || undefined, companyId),
  });

  if (listQuery.isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Loading directory...</p>
      </div>
    );
  }

  if (listQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">Failed to load directory</p>
          <p className="text-xs text-muted-foreground mt-1">
            {listQuery.error instanceof Error ? listQuery.error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  const entries = listQuery.data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <Folder className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">This directory is empty</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Name</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-24 hidden sm:table-cell">Size</th>
            <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-28 hidden md:table-cell">Modified</th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const Icon = fileIcon(entry);
            const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
            return (
              <tr
                key={entry.name}
                onClick={() =>
                  entry.type === "directory" ? onNavigate(entryPath) : onOpenFile(entryPath)
                }
                className="border-b border-border last:border-b-0 cursor-pointer hover:bg-accent/50 transition-colors group"
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        entry.type === "directory"
                          ? "text-primary/70"
                          : "text-muted-foreground/70",
                      )}
                    />
                    <span className="truncate">{entry.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right text-xs text-muted-foreground hidden sm:table-cell">
                  {entry.type === "file" ? formatFileSize(entry.size) : "—"}
                </td>
                <td className="px-4 py-2 text-right text-xs text-muted-foreground hidden md:table-cell">
                  {formatModified(entry.modified)}
                </td>
                <td className="px-2 py-2">
                  {entry.type === "file" && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <FileActionButtons
                        filePath={entryPath}
                        agentId={agentId}
                        agentRouteId={agentRouteId}
                        companyId={companyId}
                        size="xs"
                      />
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NoWorkspaceState({ agentRouteId }: { agentRouteId: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-page-enter">
      <div className="p-5 mb-5 border border-dashed border-border/80 text-primary/50">
        <FolderOpen className="h-10 w-10" />
      </div>
      <p className="text-sm text-muted-foreground mb-2 max-w-sm">
        No workspace directory configured for this agent.
      </p>
      <p className="text-xs text-muted-foreground/70 mb-5 max-w-sm">
        Set a working directory in the agent's configuration to browse its files here.
      </p>
      <Button
        onClick={() => navigate(`/agents/${agentRouteId}/configuration`)}
        variant="outline"
        className="gap-1.5"
      >
        <Settings className="h-3.5 w-3.5" />
        Configure Workspace
      </Button>
    </div>
  );
}

export function AgentWorkspaceTab({ agentId, agentRouteId, hasCwd }: AgentWorkspaceTabProps) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileParam = searchParams.get("file");
  const [currentPath, setCurrentPath] = useState("");
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fileParam) {
      setOpenFile(fileParam);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("file");
        return next;
      }, { replace: true });
    }
  }, [fileParam, setSearchParams]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      agentsApi.uploadFile(agentId, currentPath, file, selectedCompanyId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.files(agentId, currentPath) });
    },
  });

  const createFileMutation = useMutation({
    mutationFn: (name: string) => {
      const filePath = currentPath ? `${currentPath}/${name}` : name;
      return agentsApi.writeFile(agentId, filePath, "", selectedCompanyId ?? undefined);
    },
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspace.files(agentId, currentPath) });
      const filePath = currentPath ? `${currentPath}/${name}` : name;
      setOpenFile(filePath);
      setNewFileName(null);
    },
  });

  useEffect(() => {
    if (newFileName !== null && newFileInputRef.current) {
      newFileInputRef.current.focus();
    }
  }, [newFileName]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    e.target.value = "";
  }

  function handleNewFileSubmit() {
    const name = newFileName?.trim();
    if (name) {
      createFileMutation.mutate(name);
    } else {
      setNewFileName(null);
    }
  }

  if (!hasCwd) {
    return <NoWorkspaceState agentRouteId={agentRouteId} />;
  }

  if (openFile) {
    return (
      <div className="animate-page-enter">
        <Breadcrumbs
          currentPath={openFile}
          onNavigate={(p) => {
            setOpenFile(null);
            setCurrentPath(p);
          }}
        />
        <div className="mt-3">
          <FileViewer
            agentId={agentId}
            agentRouteId={agentRouteId}
            filePath={openFile}
            companyId={selectedCompanyId ?? undefined}
            onBack={() => setOpenFile(null)}
          />
        </div>
      </div>
    );
  }

  const parentPath = currentPath.includes("/")
    ? currentPath.slice(0, currentPath.lastIndexOf("/"))
    : "";

  return (
    <div className="space-y-3 animate-page-enter">
      <div className="flex items-center gap-2">
        {currentPath && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPath(parentPath)}
            className="gap-1.5 shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        )}
        <Breadcrumbs currentPath={currentPath} onNavigate={setCurrentPath} />
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Upload</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNewFileName("")}
            disabled={newFileName !== null}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <FilePlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New File</span>
          </Button>
        </div>
      </div>

      {newFileName !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2">
          <FilePlus className="h-4 w-4 text-primary/70 shrink-0" />
          <input
            ref={newFileInputRef}
            type="text"
            placeholder="filename.md"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleNewFileSubmit();
              if (e.key === "Escape") setNewFileName(null);
            }}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewFileSubmit}
            disabled={!newFileName?.trim() || createFileMutation.isPending}
          >
            {createFileMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Create"
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNewFileName(null)}>
            Cancel
          </Button>
        </div>
      )}

      {(uploadMutation.isError || createFileMutation.isError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            {uploadMutation.error instanceof Error
              ? uploadMutation.error.message
              : createFileMutation.error instanceof Error
                ? createFileMutation.error.message
                : "Operation failed"}
          </p>
        </div>
      )}

      <DirectoryListing
        agentId={agentId}
        agentRouteId={agentRouteId}
        currentPath={currentPath}
        companyId={selectedCompanyId ?? undefined}
        onNavigate={setCurrentPath}
        onOpenFile={setOpenFile}
      />
    </div>
  );
}
