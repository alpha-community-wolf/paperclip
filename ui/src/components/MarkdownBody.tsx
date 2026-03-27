import { Fragment, isValidElement, useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseProjectMentionHref } from "@paperclipai/shared";
import { cn } from "../lib/utils";
import { useTheme } from "../context/ThemeContext";
import { useWorkspaceFile, type WorkspaceFileContextValue } from "../context/WorkspaceFileContext";
import { Link } from "@/lib/router";

interface MarkdownBodyProps {
  children: string;
  className?: string;
}

let mermaidLoaderPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidLoaderPromise) {
    mermaidLoaderPromise = import("mermaid").then((module) => module.default);
  }
  return mermaidLoaderPromise;
}

function flattenText(value: ReactNode): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item)).join("");
  return "";
}

function extractMermaidSource(children: ReactNode): string | null {
  if (!isValidElement(children)) return null;
  const childProps = children.props as { className?: unknown; children?: ReactNode };
  if (typeof childProps.className !== "string") return null;
  if (!/\blanguage-mermaid\b/i.test(childProps.className)) return null;
  return flattenText(childProps.children).replace(/\n$/, "");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mentionChipStyle(color: string | null): CSSProperties | undefined {
  if (!color) return undefined;
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return {
    borderColor: color,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
    color: luminance > 0.55 ? "#111827" : "#f8fafc",
  };
}

function MermaidDiagramBlock({ source, darkMode }: { source: string; darkMode: boolean }) {
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setSvg(null);
    setError(null);

    loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: darkMode ? "dark" : "default",
          fontFamily: "inherit",
          suppressErrorRendering: true,
        });
        const rendered = await mermaid.render(`outpost-mermaid-${renderId}`, source);
        if (!active) return;
        setSvg(rendered.svg);
      })
      .catch((err) => {
        if (!active) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Failed to render Mermaid diagram.";
        setError(message);
      });

    return () => {
      active = false;
    };
  }, [darkMode, renderId, source]);

  return (
    <div className="outpost-mermaid">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <>
          <p className={cn("outpost-mermaid-status", error && "outpost-mermaid-status-error")}>
            {error ? `Unable to render Mermaid diagram: ${error}` : "Rendering Mermaid diagram..."}
          </p>
          <pre className="outpost-mermaid-source">
            <code className="language-mermaid">{source}</code>
          </pre>
        </>
      )}
    </div>
  );
}

const FILE_PATH_EXTENSIONS = /\.(?:md|mdx|txt|log|json|jsonl|yaml|yml|toml|ini|ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|sh|bash|html|htm|css|scss|svg|xml|sql|csv|env|cfg|conf|lock)$/i;

function looksLikeFilePath(text: string): boolean {
  if (!text.includes("/")) return false;
  if (/^https?:\/\//i.test(text)) return false;
  if (/^mailto:/i.test(text)) return false;
  if (text.startsWith("#")) return false;
  if (text.includes(" ") || text.includes("\n")) return false;
  if (text.length > 300 || text.length < 3) return false;
  return FILE_PATH_EXTENSIONS.test(text) || text.endsWith("/");
}

function resolveWorkspacePath(text: string, cwd: string | null): string | null {
  let cleaned = text.trim().replace(/^\.\//, "");

  // Expand common agent env-var references against cwd
  if (cwd && /^\$[\w_]+\//.test(cleaned)) {
    const afterVar = cleaned.replace(/^\$[\w_]+\//, "");
    // Check if the remainder starts with a path segment that exists within cwd
    const cwdSegments = cwd.replace(/\/$/, "").split("/");
    const lastSeg = cwdSegments[cwdSegments.length - 1];
    if (lastSeg && afterVar.startsWith(lastSeg + "/")) {
      return afterVar.slice(lastSeg.length + 1);
    }
    return afterVar;
  }

  if (cwd) {
    const normalizedCwd = cwd.endsWith("/") ? cwd : cwd + "/";

    // Full absolute match
    if (cleaned.startsWith(normalizedCwd)) {
      return cleaned.slice(normalizedCwd.length);
    }

    // Partial suffix match (for paths that share a tail with cwd)
    const cwdSegments = normalizedCwd.replace(/\/$/, "").split("/");
    for (let i = 1; i < cwdSegments.length; i++) {
      const suffix = cwdSegments.slice(i).join("/") + "/";
      if (cleaned.startsWith(suffix)) {
        return cleaned.slice(suffix.length);
      }
    }
  }

  // If still an absolute path after all resolution, return null (unresolvable)
  if (cleaned.startsWith("/")) return null;

  return cleaned;
}

// Regex to find file paths embedded in prose text.
// Matches: optional ./ or / prefix, at least one dir/ segment, filename with known extension.
// Allows trailing sentence punctuation (stripped before use).
const FILE_PATH_IN_TEXT_RE = /(?:\.\/|\/)?(?:[\w.$@~-]+\/)+[\w.$@~-]+\.(?:md|mdx|txt|log|json|jsonl|yaml|yml|toml|ini|ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|sh|bash|html|htm|css|scss|svg|xml|sql|csv|env|cfg|conf|lock)(?=[.,;:!?)\]"'\s]|$)/gi;

/**
 * Scan a plain-text string for file path occurrences and return a ReactNode
 * with detected paths replaced by WorkspaceFileLinks.
 */
function linkFilePathsInText(
  text: string,
  wsCtx: WorkspaceFileContextValue,
): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Reset regex state (it has the `g` flag)
  FILE_PATH_IN_TEXT_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FILE_PATH_IN_TEXT_RE.exec(text)) !== null) {
    const matchText = match[0];
    const idx = match.index;

    // Skip if preceded by `://` (part of a URL)
    if (idx >= 3 && text.slice(idx - 3, idx).includes("://")) continue;

    const resolved = resolveWorkspacePath(matchText, wsCtx.workspaceCwd);
    if (!resolved) continue;

    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx));
    }
    parts.push(
      <WorkspaceFileLink key={key++} agentRouteId={wsCtx.agentRouteId} filePath={resolved} inline>
        {matchText}
      </WorkspaceFileLink>,
    );
    lastIndex = idx + matchText.length;
  }

  if (parts.length === 0) return text;

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <Fragment>{parts}</Fragment>;
}

/**
 * Recursively walk React children and replace text strings that contain
 * file paths with linked versions.
 */
function processChildrenForFilePaths(
  children: ReactNode,
  wsCtx: WorkspaceFileContextValue,
): ReactNode {
  if (typeof children === "string") {
    return linkFilePathsInText(children, wsCtx);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string" ? (
        <Fragment key={i}>{linkFilePathsInText(child, wsCtx)}</Fragment>
      ) : (
        child
      ),
    );
  }
  return children;
}

function workspaceFileHref(agentRouteId: string, filePath: string): string {
  return `/agents/${agentRouteId}/workspace?file=${encodeURIComponent(filePath)}`;
}

function WorkspaceFileLink({
  agentRouteId,
  filePath,
  children,
  inline,
}: {
  agentRouteId: string;
  filePath: string;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <Link
      to={workspaceFileHref(agentRouteId, filePath)}
      className={cn(
        "outpost-workspace-file-link",
        inline
          ? "font-mono text-[0.85em] px-1 py-0.5 rounded bg-primary/8 text-primary hover:bg-primary/15 transition-colors no-underline border border-primary/15"
          : "text-primary hover:underline",
      )}
      title={`Open in workspace: ${filePath}`}
    >
      {children}
    </Link>
  );
}

export function MarkdownBody({ children, className }: MarkdownBodyProps) {
  const { theme } = useTheme();
  const wsCtx = useWorkspaceFile();
  return (
    <div
      className={cn(
        "outpost-markdown prose prose-sm max-w-none prose-pre:whitespace-pre-wrap prose-pre:break-words prose-code:break-all",
        theme === "dark" && "prose-invert",
        className,
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ node: _node, children: preChildren, ...preProps }) => {
            const mermaidSource = extractMermaidSource(preChildren);
            if (mermaidSource) {
              return <MermaidDiagramBlock source={mermaidSource} darkMode={theme === "dark"} />;
            }
            return <pre {...preProps}>{preChildren}</pre>;
          },
          a: ({ href, children: linkChildren }) => {
            const parsed = href ? parseProjectMentionHref(href) : null;
            if (parsed) {
              const label = linkChildren;
              return (
                <a
                  href={`/projects/${parsed.projectId}`}
                  className="outpost-project-mention-chip"
                  style={mentionChipStyle(parsed.color)}
                >
                  {label}
                </a>
              );
            }
            if (wsCtx && href && looksLikeFilePath(href)) {
              const resolved = resolveWorkspacePath(href, wsCtx.workspaceCwd);
              if (resolved) {
                return (
                  <WorkspaceFileLink agentRouteId={wsCtx.agentRouteId} filePath={resolved}>
                    {linkChildren}
                  </WorkspaceFileLink>
                );
              }
            }
            return (
              <a href={href} rel="noreferrer">
                {linkChildren}
              </a>
            );
          },
          p: ({ node: _node, children: pChildren, ...pProps }) => {
            if (!wsCtx) return <p {...pProps}>{pChildren}</p>;
            return <p {...pProps}>{processChildrenForFilePaths(pChildren, wsCtx)}</p>;
          },
          li: ({ node: _node, children: liChildren, ...liProps }) => {
            if (!wsCtx) return <li {...liProps}>{liChildren}</li>;
            return <li {...liProps}>{processChildrenForFilePaths(liChildren, wsCtx)}</li>;
          },
          td: ({ node: _node, children: tdChildren, ...tdProps }) => {
            if (!wsCtx) return <td {...tdProps}>{tdChildren}</td>;
            return <td {...tdProps}>{processChildrenForFilePaths(tdChildren, wsCtx)}</td>;
          },
          code: ({ node: _node, className: codeClassName, children: codeChildren, ...codeProps }) => {
            const isBlock = codeClassName && /^language-/.test(codeClassName);
            if (isBlock || !wsCtx) {
              return <code className={codeClassName} {...codeProps}>{codeChildren}</code>;
            }
            const text = flattenText(codeChildren);
            if (looksLikeFilePath(text)) {
              const resolved = resolveWorkspacePath(text, wsCtx.workspaceCwd);
              if (resolved) {
                return (
                  <WorkspaceFileLink agentRouteId={wsCtx.agentRouteId} filePath={resolved} inline>
                    {text}
                  </WorkspaceFileLink>
                );
              }
            }
            return <code className={codeClassName} {...codeProps}>{codeChildren}</code>;
          },
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
