/**
 * Mounts /mcp on the raw server.ts HTTP server — Addendum C.2. Not a Next route handler: the
 * session-cookie middleware must never run on this path (C.3 — a logged-in browser tab must
 * never be able to author questions via a stray request to /mcp), and streaming lifecycle is
 * simpler off the raw server. server.ts routes any request whose URL starts with "/mcp" here,
 * before handing off to Next's own request handler.
 */
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifyBearerToken, type McpAuthContext } from "@/server/mcp/tokens";
import { checkAndRecordRequestRate } from "@/server/mcp/rate-limit";
import { registerMcpTools } from "@/server/mcp/register";

const PACKAGE_VERSION: string = (() => {
  try {
    const pkgPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
    return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

const MCP_INSTRUCTIONS = `Ce serveur MCP permet de créer des questions pour ASPI Quiz, un jeu de quiz en temps réel entre amis.

Règles de la maison :
- Toute question créée par ce canal arrive à l'état de brouillon ("draft") — jamais publiée directement. Un humain relit et publie ensuite depuis l'interface web.
- Vérifiez vos faits avant de soumettre : une question doit reposer sur un fait vérifiable, sans ambiguïté.
- Appelez lister_categories avant de créer une question, pour réutiliser une catégorie existante plutôt que d'en créer une nouvelle par erreur.
- Pour une question de géographie, appelez toujours chercher_pays afin de confirmer qu'un pays existe — n'inventez jamais un code ISO, une capitale ou une population.
- Créez une question à la fois avec creer_question ; utilisez creer_questions_en_lot (1 à 25 par appel) seulement si plusieurs questions sont explicitement demandées.
- Appelez rechercher_questions avant de créer, pour éviter les doublons.`;

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  /** The connection is bound to whichever token opened it — every subsequent request for this
   *  session id must re-present that same token (checked below), not merely *a* valid one. */
  tokenId: string;
}

const sessions = new Map<string, McpSession>();

function isMcpEnabled(): boolean {
  return (process.env["MCP_ENABLED"] ?? "true").trim().toLowerCase() !== "false";
}

function publicBaseUrl(): string {
  return process.env["PUBLIC_BASE_URL"]?.trim() || "";
}

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body));
}

// Byte-for-byte identical regardless of *why* auth failed (no token / malformed / unknown /
// revoked / expired / deactivated owner) — C.3, tested by C.8.
const UNAUTHORIZED_BODY = { jsonrpc: "2.0", error: { code: -32001, message: "Non autorisé." }, id: null };

function sendUnauthorized(res: ServerResponse): void {
  sendJson(res, 401, UNAUTHORIZED_BODY, { "WWW-Authenticate": "Bearer" });
}

/** Blocks DNS-rebinding against local MCP clients — a browser tab sends an `Origin` header that
 *  must match this server's own; a non-browser MCP client (Claude Desktop, Claude Code, curl)
 *  sends no Origin at all and is unaffected. No permissive CORS headers are ever sent (C.3): MCP
 *  clients aren't browsers and don't need them. */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  const base = publicBaseUrl();
  if (!base) return false;
  try {
    return new URL(origin).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

async function createSession(authCtx: McpAuthContext): Promise<McpSession> {
  const server = new McpServer(
    { name: "aspiquiz", version: PACKAGE_VERSION },
    { instructions: MCP_INSTRUCTIONS },
  );
  registerMcpTools(server, authCtx);

  const session = {} as McpSession;
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, session);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) sessions.delete(transport.sessionId);
  };
  session.transport = transport;
  session.server = server;
  session.tokenId = authCtx.tokenId;

  await server.connect(transport);
  return session;
}

export async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isMcpEnabled()) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  if (!originAllowed(req)) {
    sendJson(res, 403, { error: "forbidden_origin" });
    return;
  }

  const auth = await verifyBearerToken(req.headers.authorization);
  if (!auth.ok) return sendUnauthorized(res);

  const rate = checkAndRecordRequestRate(auth.ctx.tokenId);
  if (!rate.ok) {
    sendJson(
      res,
      429,
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Trop de requêtes — réessayez plus tard.", data: { retryAfterS: rate.retryAfterS } },
        id: null,
      },
      { "Retry-After": String(rate.retryAfterS) },
    );
    return;
  }

  const sessionIdHeader = req.headers["mcp-session-id"];
  const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;
  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (session && session.tokenId !== auth.ctx.tokenId) {
    // Same uniform 401 as a plain auth failure — never confirm or deny that the session id was
    // otherwise valid, for the same "don't leak why" reasoning as C.3's verification order.
    return sendUnauthorized(res);
  }

  if (!session) {
    // No known session: only a POST can be the initialize request that starts one. A stray
    // GET/DELETE with no session id has nothing to attach to.
    if (req.method !== "POST") {
      sendJson(res, 400, {
        jsonrpc: "2.0",
        error: { code: -32000, message: "En-tête mcp-session-id manquant." },
        id: null,
      });
      return;
    }
    session = await createSession(auth.ctx);
  }

  await session.transport.handleRequest(req, res);
}
