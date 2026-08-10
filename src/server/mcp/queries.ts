import { and, desc, eq, gt, or, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { apiTokens, auditLog, users, type ApiTokenScope } from "@/server/db/schema";

const REVOKED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface TokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: ApiTokenScope[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** Revoked tokens stay listed, greyed, for 30 days (C.4) — filtered out only once older than
 *  that, so a user can still see "I revoked this last week" for a while. */
function notLongRevoked() {
  const cutoff = new Date(Date.now() - REVOKED_RETENTION_MS);
  return or(isNull(apiTokens.revokedAt), gt(apiTokens.revokedAt, cutoff));
}

export async function listMyTokens(userId: string): Promise<TokenRow[]> {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      scopes: apiTokens.scopes,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), notLongRevoked()))
    .orderBy(desc(apiTokens.createdAt));
}

export interface AdminTokenRow extends TokenRow {
  ownerUsername: string;
  ownerDisplayName: string;
}

/** Read-only, cross-user — /admin's "Jetons MCP" tab. Never the token values, only what was
 *  already persisted (prefix, not the secret). */
export async function listAllTokensForAdmin(): Promise<AdminTokenRow[]> {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      tokenPrefix: apiTokens.tokenPrefix,
      scopes: apiTokens.scopes,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
      ownerUsername: users.username,
      ownerDisplayName: users.displayName,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(notLongRevoked())
    .orderBy(desc(apiTokens.createdAt));
}

export interface AuditLogRow {
  id: string;
  actorUsername: string;
  tokenName: string | null;
  action: string;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: Date;
}

/** /admin's paper trail for category mutations made over MCP (C.5) — newest first, capped since
 *  this is a log, not a paginated table; the app's mutation volume never approaches this limit
 *  in practice. */
export async function listAuditLog(limit = 200): Promise<AuditLogRow[]> {
  return db
    .select({
      id: auditLog.id,
      actorUsername: users.username,
      tokenName: apiTokens.name,
      action: auditLog.action,
      beforeJson: auditLog.beforeJson,
      afterJson: auditLog.afterJson,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.actorUserId, users.id))
    .leftJoin(apiTokens, eq(auditLog.tokenId, apiTokens.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
