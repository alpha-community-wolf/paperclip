import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { api, ApiError } from "../api/client";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { AlertCircle, Check, Globe, Loader2, Server } from "lucide-react";

interface InstanceNetworkResponse {
  configPath: string;
  configFileExists: boolean;
  fileAllowedHostnames: string[];
  envAllowedHostnames: string[] | null;
  authPublicHostname: string | null;
  effectiveAllowedHostnames: string[];
  deploymentMode: string;
  deploymentExposure: string;
  privateHostnameGateEnabled: boolean;
  bindHost: string;
  restartRequiredAfterFileChange: boolean;
  notes: {
    envOverride: string | null;
    viteDev: string | null;
  };
}

export function InstanceNetworkSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Server & network" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const query = useQuery({
    queryKey: queryKeys.instance.network,
    queryFn: () => api.get<InstanceNetworkResponse>("/system/network"),
    retry: false,
  });

  useEffect(() => {
    if (query.data?.fileAllowedHostnames) {
      setDraft(query.data.fileAllowedHostnames.join("\n"));
    }
  }, [query.data?.fileAllowedHostnames]);

  const saveMutation = useMutation({
    mutationFn: (allowedHostnames: string[]) =>
      api.patch<{ ok: boolean; restartRequired: boolean }>("/system/network", { allowedHostnames }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.instance.network });
      setSaveToast(
        data.restartRequired
          ? "Saved to config. Restart the Paperclip server for host checks (and Vite dev) to use the new list."
          : "Saved.",
      );
      setTimeout(() => setSaveToast(null), 8000);
    },
  });

  const handleSave = () => {
    const lines = draft
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    saveMutation.mutate(lines);
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading server network settings…
      </div>
    );
  }

  if (query.error) {
    const err = query.error as ApiError;
    const isForbidden = err.status === 403;
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-4 text-sm">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">
              {isForbidden ? "Instance admin required" : "Could not load settings"}
            </p>
            <p className="text-muted-foreground mt-1">
              {isForbidden
                ? "Only instance administrators can view or edit server network settings. Ask an admin to grant access, or use the CLI on the host: pnpm paperclipai allowed-hostname <host>"
                : err.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const data = query.data!;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Server className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Instance</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground mt-1">Server & network</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Allowed hostnames are stored in your Paperclip config file (same as{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">pnpm paperclipai allowed-hostname</code>
          ). In authenticated + private mode, requests must match this list (and Vite dev middleware uses
          the same set).
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4" />
          Config file hostnames
        </div>
        <textarea
          className="w-full min-h-[140px] rounded-md border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
          placeholder={"my-macbook.tailnet.ts.net\nunlegally-dioritic-deandre.ngrok-free.dev"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                Saving…
              </>
            ) : (
              "Save to config"
            )}
          </Button>
          {saveToast && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              {saveToast}
            </span>
          )}
          {saveMutation.isError && (
            <span className="text-xs text-destructive">
              {(saveMutation.error as Error).message ?? "Save failed"}
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          One hostname per line. Include tunnels (ngrok, Cloudflare), Tailscale hostnames, or LAN names. Use
          &quot;Reset&quot; in the browser to reload from disk if you edit the file externally.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
        <p className="font-medium text-foreground">Effective runtime list</p>
        <p className="text-xs text-muted-foreground">
          Merged from config file, optional env, and auth public URL hostname.{" "}
          <span className="font-mono">{data.effectiveAllowedHostnames.join(", ") || "(none)"}</span>
        </p>
        {data.envAllowedHostnames && data.envAllowedHostnames.length > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>PAPERCLIP_ALLOWED_HOSTNAMES</strong> is set ({data.envAllowedHostnames.join(", ")}).
            Editing the list above only changes the file; env entries are still merged at runtime.
          </p>
        )}
        {data.authPublicHostname && (
          <p className="text-xs text-muted-foreground">
            Auth public URL contributes: <span className="font-mono">{data.authPublicHostname}</span>
          </p>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs pt-2 border-t border-border/60 mt-2">
          <dt className="text-muted-foreground">Config path</dt>
          <dd className="font-mono break-all">{data.configPath}</dd>
          <dt className="text-muted-foreground">Deployment</dt>
          <dd>
            {data.deploymentMode} / {data.deploymentExposure}
            {data.privateHostnameGateEnabled ? (
              <span className="text-emerald-600"> · private hostname gate on</span>
            ) : (
              <span className="text-muted-foreground"> · gate off</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Bind host</dt>
          <dd className="font-mono">{data.bindHost}</dd>
        </dl>
      </div>

      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Telegram Mini App:</strong> when you save a Mini App URL on an
        agent, you can opt in to append that URL&apos;s hostname to this list automatically (instance admins
        only).
      </div>
    </div>
  );
}
