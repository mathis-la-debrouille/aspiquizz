"use client";

import { useEffect } from "react";

/**
 * Fires the sliding-renewal write once per app-shell mount when the current
 * session is under the 15-day threshold — see /api/session/touch and
 * server/auth/session.ts for why this can't happen during the layout's own
 * Server Component render.
 */
export function SessionTouch({ needsRenewal }: { needsRenewal: boolean }) {
  useEffect(() => {
    if (!needsRenewal) return;
    void fetch("/api/session/touch", { method: "POST" });
  }, [needsRenewal]);

  return null;
}
