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
 * Falls back to a local libSQL file when DATABASE_URL is *unset*, so the app runs with zero
 * external services — see CLAUDE.md / brief §15.
 *
 * Set-but-empty is a different thing entirely and now throws. The comment above records this
 * bug happening once via a missing `.env`; it happened a second time through the gap that fix
 * left open — `--env-file` pointed at a file whose `DATABASE_URL=` line held nothing but a
 * trailing comment, so the variable was defined and blank, `|| "file:./local.db"` swallowed it,
 * and roughly 500 questions were seeded into a local file over several minutes while every log
 * line, and the agent writing them, said "production". An empty value is never someone asking
 * for the local file — they asked for something and the something is missing. Say so.
 */
const rawUrl = process.env["DATABASE_URL"];
if (rawUrl !== undefined && rawUrl.trim() === "") {
  throw new Error(
    "DATABASE_URL is set but empty. Either give it a real libsql:// URL, or unset it entirely " +
      "to use the local file (file:./local.db). An empty value used to fall through to the " +
      "local file silently, which is how data gets written somewhere nobody is looking.",
  );
}
const url = rawUrl?.trim() || "file:./local.db";
const authToken = process.env["DATABASE_AUTH_TOKEN"]?.trim() || undefined;

// Which database this process is actually talking to, said out loud once. Scripts that write
// data print plenty about *what* they wrote and nothing about *where* — and "where" is the part
// that was wrong. Cheap enough to always emit; the remote URL carries no credentials (the token
// is separate), so this is safe to have in a log.
if (process.env["NODE_ENV"] !== "test") {
  console.log(`[db] ${url.startsWith("file:") ? `local ${url}` : url}`);
}

export const client = createClient({ url, ...(authToken ? { authToken } : {}) });

export const db = drizzle(client, { schema });

export type Database = typeof db;
