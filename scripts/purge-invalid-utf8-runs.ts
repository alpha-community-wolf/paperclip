/**
 * Purge invalid UTF-8 bytes from heartbeat_runs columns.
 *
 * PostgreSQL error 22021 fires when the server tries to send bytes that are
 * invalid UTF-8 to a UTF-8 client. This can happen in TEXT columns *and* in
 * JSONB columns (when PostgreSQL serialises the binary JSONB to text for the wire).
 *
 * Strategy:
 *   1. Fetch all run IDs (no text/JSONB columns — always safe).
 *   2. For each ID, probe the full row with a normal UTF-8 connection.
 *      Rows that throw error code 22021 are the bad ones.
 *   3. For each bad row, connect in SQL_ASCII mode and NULL out every column
 *      that is individually corrupt (text columns tested one-by-one; JSONB
 *      columns tested by casting to text).
 *
 * Usage:
 *   DATABASE_URL=postgres://... node_modules/.bin/vite-node --root packages/db scripts/purge-invalid-utf8-runs.ts
 *   # add --apply to commit fixes (default is dry-run)
 */

import postgres from "postgres";

const TEXT_COLUMNS = ["error", "stdout_excerpt", "stderr_excerpt"] as const;
const JSONB_COLUMNS = ["result_json", "context_snapshot", "usage_json"] as const;
type AnyColumn = (typeof TEXT_COLUMNS)[number] | (typeof JSONB_COLUMNS)[number];

function isEncodingError(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "22021"
  );
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Error: DATABASE_URL environment variable is required.");
    console.error(
      "  For embedded postgres: DATABASE_URL=postgres://paperclip:paperclip@127.0.0.1:54329/paperclip",
    );
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  console.log(`Mode: ${apply ? "APPLY (will modify database)" : "DRY-RUN (no changes)"}`);
  console.log();

  // Normal UTF-8 connection for probing rows
  const sqlUtf8 = postgres(dbUrl, { max: 1, onnotice: () => {} });
  // SQL_ASCII connection for reading/updating rows that fail UTF-8 validation
  const sqlRaw = postgres(dbUrl, {
    max: 1,
    onnotice: () => {},
    connection: { client_encoding: "SQL_ASCII" },
  });

  try {
    // Step 1: get all IDs — selecting only the uuid primary key is always safe
    const allIds = await sqlUtf8.unsafe<{ id: string }[]>(
      "SELECT id FROM heartbeat_runs ORDER BY created_at DESC",
    );
    console.log(`Total runs in database: ${allIds.length}`);
    console.log("Probing rows for encoding errors...");
    console.log();

    const badIds: string[] = [];

    for (const { id } of allIds) {
      try {
        await sqlUtf8.unsafe(
          `SELECT error, stdout_excerpt, stderr_excerpt, result_json, context_snapshot, usage_json FROM heartbeat_runs WHERE id = '${id}'`,
        );
      } catch (err) {
        if (isEncodingError(err)) {
          badIds.push(id);
        } else {
          // Unexpected error — re-throw
          throw err;
        }
      }
    }

    if (badIds.length === 0) {
      console.log("✓ No rows with corrupted data found. Nothing to fix.");
      return;
    }

    console.log(`Found ${badIds.length} row(s) with corrupted data:\n`);

    // Step 2: for each bad row, identify which specific columns are corrupt
    const repairs: Array<{ id: string; badColumns: AnyColumn[] }> = [];

    for (const id of badIds) {
      const badColumns: AnyColumn[] = [];

      for (const col of TEXT_COLUMNS) {
        try {
          await sqlUtf8.unsafe(
            `SELECT ${col} FROM heartbeat_runs WHERE id = '${id}'`,
          );
        } catch (err) {
          if (isEncodingError(err)) badColumns.push(col);
          else throw err;
        }
      }
      for (const col of JSONB_COLUMNS) {
        try {
          await sqlUtf8.unsafe(
            `SELECT ${col}::text FROM heartbeat_runs WHERE id = '${id}'`,
          );
        } catch (err) {
          if (isEncodingError(err)) badColumns.push(col);
          else throw err;
        }
      }

      repairs.push({ id, badColumns });
      const colList = badColumns.length > 0 ? badColumns.join(", ") : "unknown (column isolation failed)";
      console.log(`  Run ${id}: corrupted columns — ${colList}`);
    }

    console.log();

    if (!apply) {
      console.log("Dry-run complete. Re-run with --apply to NULL out the corrupted columns.");
      return;
    }

    // Step 3: apply fixes using SQL_ASCII connection (bypasses encoding validation)
    let fixed = 0;
    for (const { id, badColumns } of repairs) {
      const colsToNull = badColumns.length > 0 ? badColumns : [...TEXT_COLUMNS, ...JSONB_COLUMNS];
      const setClauses = [...colsToNull.map((c) => `${c} = NULL`), "updated_at = NOW()"].join(", ");
      await sqlRaw.unsafe(`UPDATE heartbeat_runs SET ${setClauses} WHERE id = '${id}'`);
      console.log(`  Fixed run ${id} (nulled: ${colsToNull.join(", ")})`);
      fixed++;
    }

    console.log();
    console.log(`✓ Fixed ${fixed} row(s). Runs will now load without the warning.`);
  } finally {
    await sqlUtf8.end();
    await sqlRaw.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
