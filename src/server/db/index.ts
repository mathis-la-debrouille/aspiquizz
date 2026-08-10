import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/server/db/schema";

// `pnpm dev`/`build`/`start` all go through Next's own API, which auto-loads `.env` for them
// (`@next/env`) — but scripts/*.ts run as a bare `tsx` invocation that never touches Next, so
// DATABASE_URL sat unread in `.env` and every script silently fell back to local.db instead of
// erroring (this actually happened: `pnpm tsx scripts/create-user.ts` created an account in
// local.db while pointed, in the user's mind, at the real Turso DB). Node ≥22 — this app's own
// floor — can load a dotenv-style file itself; already-set process.env values always win, so
// this is a no-op under Next (already loaded by the time this module runs) and only matters for
// standalone scripts. No `.env` file (production — Railway injects real env vars directly, ships
// no file) is fine to ignore.
try {
  process.loadEnvFile();
} catch {
  // no .env present — real env vars are already set, or genuinely absent; either way, nothing
  // to load, and the DATABASE_URL fallback below still applies.
}

/**
 * Falls back to a local libSQL file when DATABASE_URL is unset, so the app
 * runs with zero external services — see CLAUDE.md / brief §15.
 */
const url = process.env["DATABASE_URL"]?.trim() || "file:./local.db";
const authToken = process.env["DATABASE_AUTH_TOKEN"]?.trim() || undefined;

export const client = createClient({ url, ...(authToken ? { authToken } : {}) });

export const db = drizzle(client, { schema });

export type Database = typeof db;
