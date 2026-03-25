import type { CreateConfigValues } from "@paperclipai/adapter-utils";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4";
/** Default Outpost run cap for the Hermes process: 30 minutes (set to 0 in agent settings for no cap). */
const DEFAULT_TIMEOUT_SEC = 1800;

export function buildHermesConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};

  ac.model = v.model || DEFAULT_MODEL;
  ac.timeoutSec = DEFAULT_TIMEOUT_SEC;
  ac.persistSession = true;

  if (v.cwd) ac.cwd = v.cwd;
  if (v.command) ac.hermesCommand = v.command;
  if (v.extraArgs) {
    ac.extraArgs = v.extraArgs.split(/\s+/).filter(Boolean);
  }
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;

  return ac;
}
