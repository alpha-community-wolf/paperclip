import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Send,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Check,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  Clock,
  MessageSquare,
  RefreshCw,
  Activity,
} from "lucide-react";
import { cn } from "../lib/utils";
import { api } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import type { AgentTelegramConfig, AgentTelegramTestResult } from "@paperclipai/shared";

interface TelegramConfigSectionProps {
  agentId: string;
  companyId: string;
}

interface TelegramTelemetry {
  botRunning: boolean;
  startedAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  activeSessionCount: number;
  retrying: boolean;
}

interface TelegramResponse {
  config: AgentTelegramConfig | null;
  status: "connected" | "disconnected" | "disabled" | "starting";
  telemetry?: TelegramTelemetry;
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TelegramConfigSection({ agentId, companyId }: TelegramConfigSectionProps) {
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [testResult, setTestResult] = useState<AgentTelegramTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [requireMentionInput, setRequireMentionInput] = useState(true);
  const [mentionPatternsInput, setMentionPatternsInput] = useState("");

  const {
    data,
    isLoading,
  } = useQuery({
    queryKey: queryKeys.telegram(agentId),
    queryFn: () => api.get<TelegramResponse>(`/agents/${agentId}/telegram?companyId=${companyId}`),
    refetchInterval: 15_000,
  });

  const saveMutation = useMutation({
    mutationFn: (body: { botToken: string; enabled: boolean; allowedUserIds?: string[]; requireMention?: boolean; mentionPatterns?: string[] }) =>
      api.put<TelegramResponse>(`/agents/${agentId}/telegram?companyId=${companyId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.telegram(agentId) });
      setIsEditing(false);
      setTokenInput("");
      setTestResult(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<TelegramResponse>(`/agents/${agentId}/telegram?companyId=${companyId}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.telegram(agentId) });
    },
  });

  const toggleMiniApp = useMutation({
    mutationFn: (miniAppEnabled: boolean) =>
      api.patch<TelegramResponse>(`/agents/${agentId}/telegram?companyId=${companyId}`, { miniAppEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.telegram(agentId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/agents/${agentId}/telegram?companyId=${companyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.telegram(agentId) });
      setIsEditing(false);
      setTokenInput("");
      setTestResult(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: (botToken: string) =>
      api.post<AgentTelegramTestResult>(`/agents/${agentId}/telegram/test?companyId=${companyId}`, { botToken }),
    onSuccess: (result) => {
      setTestResult(result);
      setTestError(null);
    },
    onError: (err: Error) => {
      setTestResult(null);
      setTestError(err.message);
    },
  });

  const handleTest = useCallback(() => {
    if (!tokenInput.trim()) return;
    testMutation.mutate(tokenInput.trim());
  }, [tokenInput, testMutation]);

  const handleSave = useCallback(() => {
    if (!tokenInput.trim()) return;
    const patterns = mentionPatternsInput
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    saveMutation.mutate({
      botToken: tokenInput.trim(),
      enabled: true,
      requireMention: requireMentionInput,
      mentionPatterns: patterns,
    });
  }, [tokenInput, requireMentionInput, mentionPatternsInput, saveMutation]);

  const config = data?.config;
  const status = data?.status ?? "disabled";
  const telemetry = data?.telemetry;
  const hasConfig = !!config;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading Telegram config...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Telegram</span>
          {hasConfig && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                status === "connected"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : status === "starting"
                    ? "bg-yellow-500/10 text-yellow-500"
                    : status === "disabled"
                      ? "bg-muted text-muted-foreground"
                      : "bg-red-500/10 text-red-500",
              )}
            >
              {status === "connected" ? (
                <Wifi className="h-2.5 w-2.5" />
              ) : (
                <WifiOff className="h-2.5 w-2.5" />
              )}
              {status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasConfig && !isEditing && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => toggleMutation.mutate(!config.enabled)}
                disabled={toggleMutation.isPending}
              >
                {config.enabled ? (
                  <ToggleRight className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5 mr-1" />
                )}
                {config.enabled ? "On" : "Off"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("Remove Telegram bot configuration? The bot will stop responding.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {hasConfig && !isEditing && (
        <div className="rounded-md border border-border p-3 space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bot</span>
              <span className="text-sm font-mono">
                {config.botUsername ? `@${config.botUsername}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Owner Chat ID</span>
              <span className="text-sm font-mono">
                {config.ownerChatId ?? (
                  <span className="text-muted-foreground/50 italic">auto-captured on first message</span>
                )}
              </span>
            </div>
            {config.allowedUserIds.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Allowed users</span>
                <span className="text-xs font-mono">{config.allowedUserIds.join(", ")}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Group mention required</span>
              <span className="text-xs font-mono">{config.requireMention ? "yes" : "no"}</span>
            </div>
            {config.mentionPatterns.length > 0 && (
              <div className="flex items-start justify-between gap-4">
                <span className="text-xs text-muted-foreground shrink-0">Mention patterns</span>
                <span className="text-xs font-mono text-right break-all">{config.mentionPatterns.join(", ")}</span>
              </div>
            )}
          </div>

          {telemetry && config.enabled && (
            <div className="border-t border-border pt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  Uptime
                </span>
                <span className="text-xs font-mono">
                  {telemetry.startedAt ? formatRelativeTime(telemetry.startedAt) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last message
                </span>
                <span className="text-xs font-mono">
                  {telemetry.lastMessageAt ? formatRelativeTime(telemetry.lastMessageAt) : "none yet"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  Messages / Sessions
                </span>
                <span className="text-xs font-mono">
                  {telemetry.messageCount} / {telemetry.activeSessionCount}
                </span>
              </div>
              {telemetry.retrying && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-500 mt-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Reconnecting after conflict...
                </div>
              )}
            </div>
          )}

          {/* Mini App toggle */}
          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground">Mini App</span>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Menu button in Telegram for quick issue management
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => toggleMiniApp.mutate(!config.miniAppEnabled)}
                disabled={toggleMiniApp.isPending}
              >
                {config.miniAppEnabled ? (
                  <ToggleRight className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5 mr-1" />
                )}
                {config.miniAppEnabled ? "On" : "Off"}
              </Button>
            </div>
            {config.miniAppEnabled && (
              <div className="mt-2 space-y-1.5">
                <label className="text-[10px] text-muted-foreground/60">
                  Mini App URL (leave empty for default, or enter a tunnel URL like ngrok)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    className={cn(inputClass, "text-xs")}
                    placeholder={`${window.location.origin}/mini-app`}
                    defaultValue={config.miniAppUrl ?? ""}
                    onBlur={(e) => {
                      const value = e.target.value.trim() || null;
                      if (value !== (config.miniAppUrl ?? null)) {
                        toggleMiniApp.mutate(true, {
                          onSuccess: () => {
                            // Save URL separately since toggleMiniApp only sends miniAppEnabled
                          },
                        });
                        api.patch(`/agents/${agentId}/telegram?companyId=${companyId}`, {
                          miniAppUrl: value,
                        }).then(() => {
                          queryClient.invalidateQueries({ queryKey: queryKeys.telegram(agentId) });
                        });
                      }
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  Active: {config.miniAppUrl || `${window.location.origin}/mini-app`}
                </p>
              </div>
            )}
          </div>

          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs w-full"
              onClick={() => {
                setIsEditing(true);
                setRequireMentionInput(config.requireMention);
                setMentionPatternsInput(config.mentionPatterns.join("\n"));
              }}
            >
              Update token
            </Button>
          </div>
        </div>
      )}

      {(!hasConfig || isEditing) && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type={showToken ? "text" : "password"}
              className={inputClass}
              placeholder="Paste your Telegram bot token..."
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                setTestResult(null);
                setTestError(null);
              }}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>

          {testResult && (
            <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/5 rounded px-2 py-1.5">
              <Check className="h-3 w-3 flex-shrink-0" />
              <span>
                Connected to <span className="font-medium">@{testResult.botUsername}</span>{" "}
                ({testResult.firstName})
              </span>
            </div>
          )}

          {testError && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/5 rounded px-2 py-1.5">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>{testError}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleTest}
              disabled={!tokenInput.trim() || testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              Test
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleSave}
              disabled={!tokenInput.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : null}
              {hasConfig ? "Update & Enable" : "Connect Bot"}
            </Button>
            {isEditing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setIsEditing(false);
                  setTokenInput("");
                  setTestResult(null);
                  setTestError(null);
                  setRequireMentionInput(true);
                  setMentionPatternsInput("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Require @mention in groups</label>
              <button
                type="button"
                className="flex items-center gap-1 text-xs"
                onClick={() => setRequireMentionInput((v) => !v)}
              >
                {requireMentionInput ? (
                  <ToggleRight className="h-4 w-4 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                )}
                <span className={requireMentionInput ? "text-emerald-500" : "text-muted-foreground"}>
                  {requireMentionInput ? "on" : "off"}
                </span>
              </button>
            </div>
            {requireMentionInput && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  Custom mention patterns (regex, one per line)
                </label>
                <textarea
                  className={cn(inputClass, "resize-none h-16 font-mono text-xs")}
                  placeholder={"hey bot\npaperclip help"}
                  value={mentionPatternsInput}
                  onChange={(e) => setMentionPatternsInput(e.target.value)}
                />
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Create a bot via{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              @BotFather
            </a>{" "}
            on Telegram, then paste the token here. Messages sent to the bot will be forwarded to
            this agent as chat messages.
          </p>
        </div>
      )}
    </div>
  );
}
