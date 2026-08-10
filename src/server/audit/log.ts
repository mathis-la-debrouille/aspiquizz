/**
 * `audit_log` writes — Addendum C.5's category-mutation paper trail, surfaced read-only in
 * /admin. Deliberately a thin generic writer, not one function per action: the shape of
 * before/after varies per action and this is a log, not a queried domain table.
 */
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";

export async function writeAuditLog(entry: {
  actorUserId: string;
  /** Null for a web-UI-originated mutation (no token involved). */
  tokenId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    tokenId: entry.tokenId ?? null,
    action: entry.action,
    beforeJson: entry.before ?? null,
    afterJson: entry.after ?? null,
  });
}
