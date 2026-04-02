import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatMessage, ChatSession, CreateChatMessageResponse } from "@paperclipai/shared";
import {
  ChevronDown,
  Loader2,
  MessageSquarePlus,
  Send,
  X,
} from "lucide-react";
import { chatApi, type ChatLogEvent } from "../api/chat";
import { getUIAdapter, buildTranscript } from "../adapters";
import { queryKeys } from "../lib/queryKeys";
import { relativeTime, cn } from "../lib/utils";
import { useCompany } from "../context/CompanyContext";
import { useChatSidePanel, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH } from "../context/ChatSidePanelContext";
import { usePanel } from "../context/PanelContext";
import { displaySessionTitle } from "../lib/chat-sessions";
import { MarkdownBody } from "./MarkdownBody";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type StreamStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled" | "timed_out";

interface StreamState {
  sourceMessageId: string;
  runId: string | null;
  logs: ChatLogEvent[];
  status: StreamStatus;
  error: string | null;
}

function isStreamInProgress(streamState: StreamState | null): boolean {
  if (!streamState) return false;
  return streamState.status === "pending" || streamState.status === "streaming";
}

function derivePreview(streamState: StreamState | null, adapterType: string) {
  if (!streamState) return "";
  const transcript = buildTranscript(streamState.logs, getUIAdapter(adapterType).parseStdoutLine);
  const text = transcript
    .filter((e): e is Extract<typeof e, { kind: "assistant" }> => e.kind === "assistant")
    .map((e) => e.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (text) return text;
  if (streamState.error) return streamState.error;
  if (streamState.status === "failed") return "Run failed.";
  if (streamState.status === "timed_out") return "Run timed out.";
  if (streamState.status === "cancelled") return "Run cancelled.";
  return "Agent is thinking...";
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastX.current = e.clientX;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const delta = lastX.current - e.clientX;
      lastX.current = e.clientX;
      onResize(delta);
    },
    [onResize],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
    />
  );
}

export function ChatSidePanel() {
  const {
    isOpen,
    agentId,
    agentName,
    agentRouteId,
    adapterType,
    panelWidth,
    closeChat,
    setPanelWidth,
  } = useChatSidePanel();
  const { setPanelVisible } = usePanel();
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState | null>(null);
  const [completedMessageId, setCompletedMessageId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const finishedRunIds = useRef<Set<string>>(new Set());
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Close properties panel when chat panel opens
  useEffect(() => {
    if (isOpen) {
      setPanelVisible(false);
    }
  }, [isOpen, setPanelVisible]);

  // Reset state when agent changes
  useEffect(() => {
    setSelectedSessionId(null);
    setDraft("");
    setSendError(null);
    setStreamState(null);
    setCompletedMessageId(null);
    finishedRunIds.current.clear();
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, [agentId]);

  const sessionsQueryKey = agentId ? queryKeys.chatSessions(agentId, false) : ["chat", "sessions", "none"];
  const { data: sessions = [] } = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: () => chatApi.listSessions(agentId!, { includeArchived: false }),
    enabled: Boolean(agentId && isOpen),
  });

  // Auto-select first session
  useEffect(() => {
    if (!sessions.length) {
      setSelectedSessionId(null);
      return;
    }
    if (selectedSessionId && sessions.some((s) => s.id === selectedSessionId)) return;
    setSelectedSessionId(sessions[0]?.id ?? null);
  }, [selectedSessionId, sessions]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );

  const messagesQueryKey =
    agentId && selectedSessionId
      ? queryKeys.chatMessages(agentId, selectedSessionId)
      : ["chat", "messages", "none"];
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: messagesQueryKey,
    queryFn: () => chatApi.listMessages(agentId!, selectedSessionId!),
    enabled: Boolean(agentId && selectedSessionId && isOpen),
  });

  // Mark session as read
  useEffect(() => {
    if (!selectedSessionId || !agentId || messages.length === 0) return;
    chatApi.markSessionAsRead(agentId, selectedSessionId).then(() => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.sidebarBadges(selectedCompanyId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.chatUnreadSessions(agentId) });
    }).catch(() => {});
  }, [selectedSessionId, agentId, messages.length, selectedCompanyId, queryClient]);

  const closeStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const appendAssistantMessage = useCallback(
    (message: ChatMessage) => {
      if (!message.chatSessionId || !agentId) return;
      queryClient.setQueryData<ChatMessage[]>(
        queryKeys.chatMessages(agentId, message.chatSessionId),
        (current) => {
          if (!current) return [message];
          if (current.some((m) => m.id === message.id)) return current;
          return [...current, message];
        },
      );
    },
    [agentId, queryClient],
  );

  const startStream = useCallback(
    (sessionId: string, result: Pick<CreateChatMessageResponse, "message" | "runId">) => {
      closeStream();
      setCompletedMessageId(null);
      setStreamState({
        sourceMessageId: result.message.id,
        runId: result.runId,
        logs: [],
        status: "pending",
        error: null,
      });

      const source = new EventSource(chatApi.streamUrl(agentId!, sessionId, result.message.id));
      eventSourceRef.current = source;
      let finished = false;

      source.addEventListener("ready", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as { runId: string };
        setStreamState((cur) =>
          cur && cur.sourceMessageId === result.message.id
            ? { ...cur, runId: payload.runId, status: "streaming" }
            : cur,
        );
      });

      source.addEventListener("log", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as ChatLogEvent;
        setStreamState((cur) =>
          cur && cur.sourceMessageId === result.message.id
            ? { ...cur, status: "streaming", logs: [...cur.logs, payload] }
            : cur,
        );
      });

      source.addEventListener("completed", (event) => {
        finished = true;
        const payload = JSON.parse((event as MessageEvent).data) as {
          runId: string;
          status: StreamStatus;
          message: ChatMessage | null;
        };
        if (payload.runId) finishedRunIds.current.add(payload.runId);
        if (payload.message) {
          appendAssistantMessage(payload.message);
          setCompletedMessageId(payload.message.id);
        }
        setStreamState((cur) =>
          cur && cur.sourceMessageId === result.message.id
            ? { ...cur, runId: payload.runId, status: payload.status }
            : cur,
        );
        closeStream();
      });

      source.addEventListener("error", () => {
        if (finished) return;
        setStreamState((cur) =>
          cur && cur.sourceMessageId === result.message.id
            ? { ...cur, status: "failed", error: "Connection lost." }
            : cur,
        );
        closeStream();
      });
    },
    [agentId, appendAssistantMessage, closeStream],
  );

  // Cleanup stream on unmount
  useEffect(() => () => closeStream(), [closeStream]);

  // Reset finished IDs on session switch
  useEffect(() => {
    finishedRunIds.current.clear();
  }, [selectedSessionId]);

  // Reconnect to pending streams
  useEffect(() => {
    if (!selectedSessionId || !agentId) return;
    const assistantRunIds = new Set(
      messages
        .filter((m) => m.role === "assistant" && m.runId)
        .map((m) => m.runId as string),
    );
    const pending = [...messages]
      .reverse()
      .find((m) => m.role === "user" && m.runId && !assistantRunIds.has(m.runId));
    if (!pending?.runId) return;
    if (finishedRunIds.current.has(pending.runId)) return;
    if (eventSourceRef.current) return;
    startStream(selectedSessionId, { message: pending, runId: pending.runId });
  }, [messages, selectedSessionId, agentId, startStream]);

  // Scroll on new messages / streaming
  useEffect(() => {
    scrollToBottom("auto");
  }, [selectedSessionId, scrollToBottom]);

  useEffect(() => {
    if (!isStreamInProgress(streamState)) return;
    scrollToBottom("smooth");
  }, [messages.length, scrollToBottom, streamState, streamState?.logs.length]);

  useEffect(() => {
    if (!completedMessageId) return;
    scrollToBottom("smooth");
    setCompletedMessageId(null);
  }, [completedMessageId, scrollToBottom]);

  const createSession = useMutation({
    mutationFn: () => chatApi.createSession(agentId!, {}),
    onSuccess: (result) => {
      queryClient.setQueryData<ChatSession[]>(sessionsQueryKey, (current) => [
        result.session,
        ...(current ?? []),
      ]);
      setSelectedSessionId(result.session.id);
      setSendError(null);
    },
    onError: (err) => {
      setSendError(err instanceof Error ? err.message : "Failed to create session");
    },
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) => chatApi.sendMessage(agentId!, selectedSessionId!, { content }),
    onSuccess: (result) => {
      if (!selectedSessionId || !agentId) return;
      setSendError(null);
      setDraft("");
      queryClient.setQueryData<ChatMessage[]>(
        queryKeys.chatMessages(agentId, selectedSessionId),
        (current) => [...(current ?? []), result.message],
      );
      startStream(selectedSessionId, result);
    },
    onError: (err) => {
      setSendError(err instanceof Error ? err.message : "Failed to send message");
    },
  });

  const preview = useMemo(() => derivePreview(streamState, adapterType ?? ""), [adapterType, streamState]);
  const deferredPreview = useDeferredValue(preview);
  const streaming = useMemo(() => isStreamInProgress(streamState), [streamState]);
  const activeRunId = streamState?.runId ?? null;
  const hasPersistedReply = Boolean(
    activeRunId && messages.some((m) => m.role === "assistant" && m.runId === activeRunId),
  );
  const canSend = draft.trim().length > 0 && !sendMessage.isPending && !streaming;

  const handleResize = useCallback(
    (delta: number) => {
      setPanelWidth(panelWidth + delta);
    },
    [panelWidth, setPanelWidth],
  );

  if (!isOpen || !agentId) return null;

  return (
    <aside
      className="relative hidden md:flex border-l border-border bg-background flex-col shrink-0 overflow-hidden transition-[width] duration-150 ease-out"
      style={{ width: panelWidth, minWidth: MIN_PANEL_WIDTH, maxWidth: MAX_PANEL_WIDTH }}
    >
      <ResizeHandle onResize={handleResize} />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-border">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-semibold truncate">{agentName ?? "Chat"}</span>

          {/* Session selector */}
          {sessions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground gap-1">
                  <span className="truncate max-w-[120px]">
                    {selectedSession ? displaySessionTitle(selectedSession) : "Sessions"}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                {sessions.map((session) => (
                  <DropdownMenuItem
                    key={session.id}
                    onSelect={() => {
                      setSelectedSessionId(session.id);
                      setStreamState(null);
                      closeStream();
                    }}
                    className={cn(
                      "text-xs",
                      session.id === selectedSessionId && "bg-accent",
                    )}
                  >
                    <span className="truncate">{displaySessionTitle(session)}</span>
                    <span className="ml-auto pl-2 text-[10px] text-muted-foreground shrink-0">
                      {relativeTime(session.lastMessageAt ?? session.updatedAt)}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => createSession.mutate()}
          disabled={createSession.isPending}
          aria-label="New conversation"
        >
          {createSession.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageSquarePlus className="h-3.5 w-3.5" />
          )}
        </Button>

        <Button variant="ghost" size="icon-xs" onClick={closeChat} aria-label="Close chat panel">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={transcriptRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
        {messagesLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading...
          </div>
        )}
        {!selectedSessionId && !messagesLoading && (
          <div className="text-xs text-muted-foreground py-8 text-center">
            Create a conversation to begin.
          </div>
        )}
        {!messagesLoading && selectedSessionId && messages.length === 0 && (
          <div className="text-xs text-muted-foreground py-8 text-center">
            Send a message to start.
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div key={message.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-xs",
                  isUser
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-card border border-border/60",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {isUser ? "You" : agentName}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {relativeTime(message.createdAt)}
                  </span>
                </div>
                {isUser ? (
                  <div className="whitespace-pre-wrap text-xs">{message.content}</div>
                ) : (
                  <div className="text-xs [&_p]:mb-1 [&_p:last-child]:mb-0 [&_pre]:text-[10px] [&_code]:text-[10px]">
                    <MarkdownBody>{message.content}</MarkdownBody>
                  </div>
                )}
                {message.runId && !isUser && agentRouteId && (
                  <div className="mt-1.5">
                    <Link
                      to={`/agents/${encodeURIComponent(agentRouteId)}/runs/${encodeURIComponent(message.runId)}`}
                      className="text-[10px] text-muted-foreground/60 hover:text-foreground underline-offset-2 hover:underline"
                    >
                      View Run
                    </Link>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Streaming preview */}
        {streamState && !hasPersistedReply && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-lg border border-border/60 bg-card px-3 py-2 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium text-muted-foreground">{agentName}</span>
                <span className="text-[10px] text-muted-foreground/60">
                  {streaming ? "Streaming..." : streamState.status}
                </span>
              </div>
              <div className="text-xs [&_p]:mb-1 [&_p:last-child]:mb-0 [&_pre]:text-[10px] [&_code]:text-[10px]">
                <MarkdownBody>{streaming ? deferredPreview : preview}</MarkdownBody>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-background/95 px-3 py-2.5 backdrop-blur-sm">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message..."
            rows={1}
            className="min-h-[36px] max-h-[120px] resize-none text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && canSend) {
                e.preventDefault();
                sendMessage.mutate(draft.trim());
              }
            }}
            disabled={!selectedSessionId || sendMessage.isPending || streaming}
          />
          <Button
            size="icon-sm"
            onClick={() => sendMessage.mutate(draft.trim())}
            disabled={!selectedSessionId || !canSend}
            className="shrink-0"
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        {sendError && <div className="text-[10px] text-destructive mt-1">{sendError}</div>}
      </div>
    </aside>
  );
}
