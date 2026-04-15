import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensurePostgresDatabase } from "./client.js";
import { resolveDatabaseTarget } from "./runtime-config.js";

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

type EmbeddedPostgresCtor = new (opts: {
  databaseDir: string;
  user: string;
  password: string;
  port: number;
  persistent: boolean;
  onLog?: (message: unknown) => void;
  onError?: (message: unknown) => void;
}) => EmbeddedPostgresInstance;

export type MigrationConnection = {
  connectionString: string;
  source: string;
  stop: () => Promise<void>;
};

function readRunningPostmasterPid(postmasterPidFile: string): number | null {
  if (!existsSync(postmasterPidFile)) return null;
  try {
    const pid = Number(readFileSync(postmasterPidFile, "utf8").split("\n")[0]?.trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

function readPidFilePort(postmasterPidFile: string): number | null {
  if (!existsSync(postmasterPidFile)) return null;
  try {
    const lines = readFileSync(postmasterPidFile, "utf8").split("\n");
    const port = Number(lines[3]?.trim());
    return Number.isInteger(port) && port > 0 ? port : null;
  } catch {
    return null;
  }
}

async function loadEmbeddedPostgresCtor(): Promise<EmbeddedPostgresCtor> {
  const require = createRequire(import.meta.url);
  const resolveCandidates = [
    path.resolve(fileURLToPath(new URL("../..", import.meta.url))),
    path.resolve(fileURLToPath(new URL("../../server", import.meta.url))),
    path.resolve(fileURLToPath(new URL("../../cli", import.meta.url))),
    process.cwd(),
  ];

  try {
    const resolvedModulePath = require.resolve("embedded-postgres", { paths: resolveCandidates });
    const mod = await import(pathToFileURL(resolvedModulePath).href);
    return mod.default as EmbeddedPostgresCtor;
  } catch {
    throw new Error(
      "Embedded PostgreSQL support requires dependency `embedded-postgres`. Reinstall dependencies and try again.",
    );
  }
}

function isEmbeddedReuseRecoverableError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "57P03" || code === "57P01") return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /shutting down/i.test(msg) || /connection refused/i.test(msg) || /ECONNREFUSED/i.test(msg);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForPidExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (isPidAlive(pid) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function ensureEmbeddedPostgresConnection(
  dataDir: string,
  preferredPort: number,
): Promise<MigrationConnection> {
  const EmbeddedPostgres = await loadEmbeddedPostgresCtor();
  const postmasterPidFile = path.resolve(dataDir, "postmaster.pid");
  let reusePid = readRunningPostmasterPid(postmasterPidFile);
  let port = preferredPort;
  let instance: EmbeddedPostgresInstance | null = null;

  for (let recoveryAttempt = 0; recoveryAttempt < 2; recoveryAttempt++) {
    if (reusePid) {
      port = readPidFilePort(postmasterPidFile) ?? preferredPort;
      const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`;
      try {
        await ensurePostgresDatabase(adminConnectionString, "paperclip");
        return {
          connectionString: `postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`,
          source: `embedded-postgres@${port}`,
          stop: async () => {},
        };
      } catch (err) {
        const canRecover =
          recoveryAttempt === 0 && reusePid !== null && isEmbeddedReuseRecoverableError(err);
        if (!canRecover) throw err;
        rmSync(postmasterPidFile, { force: true });
        const stalePid = reusePid as number;
        if (isPidAlive(stalePid)) {
          try {
            process.kill(stalePid, "SIGTERM");
          } catch {
            /* ignore */
          }
          await waitForPidExit(stalePid, 15_000);
          if (isPidAlive(stalePid)) {
            try {
              process.kill(stalePid, "SIGKILL");
            } catch {
              /* ignore */
            }
            await waitForPidExit(stalePid, 5_000);
          }
        }
        reusePid = null;
      }
    } else {
      instance = new EmbeddedPostgres({
        databaseDir: dataDir,
        user: "paperclip",
        password: "paperclip",
        port: preferredPort,
        persistent: true,
        onLog: () => {},
        onError: () => {},
      });

      if (!existsSync(path.resolve(dataDir, "PG_VERSION"))) {
        await instance.initialise();
      }
      if (existsSync(postmasterPidFile)) {
        rmSync(postmasterPidFile, { force: true });
      }
      await instance.start();

      const adminConnectionString = `postgres://paperclip:paperclip@127.0.0.1:${preferredPort}/postgres`;
      await ensurePostgresDatabase(adminConnectionString, "paperclip");

      return {
        connectionString: `postgres://paperclip:paperclip@127.0.0.1:${preferredPort}/paperclip`,
        source: `embedded-postgres@${preferredPort}`,
        stop: async () => {
          await instance!.stop();
        },
      };
    }
  }

  throw new Error("Embedded PostgreSQL failed to start after recovery attempt");
}

export async function resolveMigrationConnection(): Promise<MigrationConnection> {
  const target = resolveDatabaseTarget();
  if (target.mode === "postgres") {
    return {
      connectionString: target.connectionString,
      source: target.source,
      stop: async () => {},
    };
  }

  return ensureEmbeddedPostgresConnection(target.dataDir, target.port);
}
