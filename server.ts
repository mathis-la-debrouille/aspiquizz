/**
 * Custom server: Next.js request handler + Socket.IO attached to the same
 * HTTP server, one process, one port. See CLAUDE.md for why this exists
 * (locked constraint, incompatible with Turbopack — see next.config.ts).
 */
import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import next from "next";
import { attachSocketServer } from "@/server/socket";
import { prepareForShutdown } from "@/server/game/engine";
import { client as dbClient } from "@/server/db";
import { runMigrations } from "./scripts/migrate";

const port = Number(process.env["PORT"] ?? 3000);
const dev = process.env["NODE_ENV"] !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

const PACKAGE_VERSION = "0.1.0";
const bootedAt = Date.now();

// Migrations run here, not as a separate deploy step — brief §15 rules out any deployment
// config beyond this file and /healthz, and Railway's `pnpm start` is the only command that
// runs, so this is the only place a pending migration can actually get applied before traffic
// arrives. Before app.prepare()/attachSocketServer, both of which can hit the DB immediately
// (the latter's abandonStaleRooms() query, on the very next line after this block).
await runMigrations();

await app.prepare();

const server = createServer((req, res) => {
  if (req.url === "/healthz") {
    void handleHealthz(res);
    return;
  }
  // Socket.IO attaches its own "request"/"upgrade" listeners to this same httpServer (see
  // attachSocketServer below) and handles anything under its `path` (/ws) itself. Node fires
  // every "request" listener for every request, so without this guard our handler would race
  // Socket.IO's, routing its polling handshake into Next's router (a 404) instead.
  if (req.url?.startsWith("/ws")) return;
  void handle(req, res);
});

/** `ok` reflects the process itself (always true if this handler runs at all); `dbOk` is a
 *  real round-trip, not assumed — a DB outage shouldn't make an orchestrator's basic liveness
 *  check flap the container (the process is fine, it just can't reach Turso/libSQL right now),
 *  so this still answers 200 with `dbOk: false` rather than a 503, and lets whoever's watching
 *  the JSON body decide what that means for them. */
async function handleHealthz(res: ServerResponse): Promise<void> {
  let dbOk = true;
  try {
    await dbClient.execute("select 1");
  } catch {
    dbOk = false;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      dbOk,
      version: PACKAGE_VERSION,
      uptimeS: Math.round((Date.now() - bootedAt) / 1000),
    }),
  );
}

const io = await attachSocketServer(server);

server.listen(port, () => {
  console.log(
    JSON.stringify({
      event: "server_listening",
      port,
      dev,
      timestamp: new Date().toISOString(),
    }),
  );
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return; // a second SIGTERM while draining shouldn't restart the sequence
  shuttingDown = true;
  console.log(JSON.stringify({ event: "shutdown_start", signal }));

  void prepareForShutdown(io)
    .catch((err: unknown) => {
      // Best-effort — an unreachable DB at shutdown shouldn't block the process from actually
      // exiting (a hung SIGTERM handler is how you get a container killed with -9 instead).
      console.error(JSON.stringify({ event: "shutdown_prepare_failed", error: String(err) }));
    })
    .finally(() => {
      io.close();
      server.close(() => {
        console.log(JSON.stringify({ event: "shutdown_complete" }));
        process.exit(0);
      });
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
