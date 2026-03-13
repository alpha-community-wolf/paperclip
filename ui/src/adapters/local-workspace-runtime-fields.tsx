import type { AdapterConfigFieldsProps } from "./types";
import { Field } from "../components/agent-config-primitives";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function LocalWorkspaceRuntimeFields(props: AdapterConfigFieldsProps) {
  if (props.isCreate) return null;

  const workspaceStrategy = asRecord(
    props.eff("adapterConfig", "workspaceStrategy", asRecord(props.config.workspaceStrategy) ?? {}),
  );
  const workspaceRuntime = asRecord(
    props.eff("adapterConfig", "workspaceRuntime", asRecord(props.config.workspaceRuntime) ?? {}),
  );

  const worktreeParentDir = asNonEmptyString(workspaceStrategy?.worktreeParentDir);
  const runtimeServices = Array.isArray(workspaceRuntime?.services)
    ? workspaceRuntime.services
      .map((service) => asRecord(service))
      .filter((service): service is Record<string, unknown> => Boolean(service))
    : [];
  const runtimePaths = runtimeServices
    .map((service) => asNonEmptyString(service.cwd))
    .filter((value): value is string => Boolean(value));

  if (!worktreeParentDir && runtimePaths.length === 0) return null;

  return (
    <Field
      label="Workspace paths"
      hint="Saved execution-workspace paths currently attached to this adapter config."
    >
      <div className="space-y-1 rounded-md border border-border px-2.5 py-2 text-xs font-mono text-muted-foreground">
        {worktreeParentDir && <div>worktreeParentDir: {worktreeParentDir}</div>}
        {runtimePaths.map((path) => (
          <div key={path}>runtime.cwd: {path}</div>
        ))}
      </div>
    </Field>
  );
}
