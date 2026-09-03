"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { revokeMcpTokenAction } from "@/server/mcp/actions";
import type { TokenRow, AdminTokenRow } from "@/server/mcp/queries";

const SCOPE_SHORT: Record<string, string> = {
  "questions:read": "lecture",
  "questions:write": "écriture",
  "categories:write": "catégories",
};

function relativeFr(date: Date | null): string {
  if (!date) return "jamais utilisé";
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${Math.floor(months / 12)} an${months >= 24 ? "s" : ""}`;
}

function formatExpiry(date: Date | null): string {
  if (!date) return "jamais";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/** Shared by the profile's own token list (`showOwner: false`) and /admin's cross-user view
 *  (`showOwner: true`, C.4's "read-only view of all tokens across users … with the ability to
 *  revoke any of them"). */
export function TokenList({
  tokens,
  showOwner = false,
  onChanged,
}: {
  tokens: TokenRow[] | AdminTokenRow[];
  showOwner?: boolean;
  onChanged?: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleRevoke(tokenId: string) {
    setPending(true);
    await revokeMcpTokenAction(tokenId);
    setPending(false);
    setConfirming(null);
    onChanged?.();
  }

  if (tokens.length === 0) {
    return <p className="text-14 text-ink-faint">Aucun jeton pour le moment.</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-border-soft">
      {tokens.map((t) => {
        const revoked = Boolean(t.revokedAt);
        const expired = t.expiresAt ? t.expiresAt.getTime() <= Date.now() : false;
        return (
          <div
            key={t.id}
            className={`flex flex-wrap items-center justify-between gap-3 py-3 ${revoked ? "opacity-50" : ""}`}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-14 font-medium text-ink-high">{t.name}</span>
                <code className="font-numeral text-12 text-ink-faint">{t.tokenPrefix}…</code>
                {revoked && <Badge tone="neutral">Révoqué</Badge>}
                {!revoked && expired && <Badge tone="neutral">Expiré</Badge>}
                {showOwner && "ownerUsername" in t && (
                  <Badge tone="neutral">@{t.ownerUsername}</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-12 text-ink-faint">
                {t.scopes.map((s) => (
                  <span key={s} className="rounded-sm bg-bg-inset px-1.5 py-0.5">
                    {SCOPE_SHORT[s] ?? s}
                  </span>
                ))}
                <span>· dernière utilisation {relativeFr(t.lastUsedAt)}</span>
                <span>· expire {formatExpiry(t.expiresAt)}</span>
              </div>
            </div>
            {!revoked && (
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={<Trash2 className="h-4 w-4" strokeWidth={1.5} />}
                onClick={() => setConfirming(t.id)}
              >
                Révoquer
              </Button>
            )}

            <Modal
              open={confirming === t.id}
              onClose={() => setConfirming(null)}
              title="Révoquer ce jeton ?"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setConfirming(null)}>
                    Annuler
                  </Button>
                  <Button variant="danger" loading={pending} onClick={() => handleRevoke(t.id)}>
                    Révoquer
                  </Button>
                </>
              }
            >
              <p className="text-14 text-ink-mid">
                « {t.name} » ne pourra plus se connecter à ASPI Quiz. Cette action est irréversible.
              </p>
            </Modal>
          </div>
        );
      })}
    </div>
  );
}
