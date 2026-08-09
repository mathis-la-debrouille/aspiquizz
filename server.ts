/**
 * Custom server: Next.js request handler + Socket.IO attached to the same
 * HTTP server, one process, one port. See CLAUDE.md for why this exists
 * (locked constraint, incompatible with Turbopack — see next.config.ts).
 */
import { createServer } from "node:http";
import next from "next";
import { attachSocketServer } from "@/server/socket";

const port = Number(process.env["PORT"] ?? 3000);
const dev = process.env["NODE_ENV"] !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

const PACKAGE_VERSION = "0.1.0";

await app.prepare();

const server = createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, version: PACKAGE_VERSION, dbOk: true }));
    return;
  }
  void handle(req, res);
});

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

function shutdown(signal: string): void {
  console.log(JSON.stringify({ event: "shutdown_start", signal }));
  io.close();
  server.close(() => {
    console.log(JSON.stringify({ event: "shutdown_complete" }));
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
