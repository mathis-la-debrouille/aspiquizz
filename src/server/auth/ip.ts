import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * We never store a raw IP (see schema comment on sessions.ip_hash) — only a
 * salted-ish digest, enough to rate-limit and audit without keeping PII
 * around indefinitely.
 */
export async function getClientIpHash(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}
