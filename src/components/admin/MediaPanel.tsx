"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { deleteMediaAction } from "@/server/admin/actions";
import type { AdminMediaRow } from "@/server/admin/queries";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

export function MediaPanel({ media }: { media: AdminMediaRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleDelete(m: AdminMediaRow) {
    if (!confirm(`Supprimer « ${m.originalName} » ?`)) return;
    setPendingId(m.id);
    setError(null);
    const result = await deleteMediaAction(m.id);
    setPendingId(null);
    if (!result.ok) setError(result.error);
  }

  return (
    <Panel title="Médias" eyebrow={String(media.length)}>
      {error && <p className="mb-3 text-14 text-clay-soft">{error}</p>}
      {media.length === 0 ? (
        <EmptyState title="Aucun media importé." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {media.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-md border border-border-soft bg-bg-surface p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- authenticated /media/[id] route, not an optimizable static asset */}
              <img
                src={`/media/${m.id}`}
                alt={m.originalName}
                className="h-24 w-full rounded-sm object-cover"
              />
              <span className="truncate text-12 text-ink-faint" title={m.originalName}>
                {m.originalName}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-12 text-ink-faint">{formatBytes(m.sizeBytes)}</span>
                {m.inUseCount > 0 ? (
                  <Badge tone="moss">utilisé ×{m.inUseCount}</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Supprimer"
                    loading={pendingId === m.id}
                    onClick={() => handleDelete(m)}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </Button>
                )}
              </div>
              <span className="truncate text-12 text-ink-faint">@{m.uploaderUsername}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
