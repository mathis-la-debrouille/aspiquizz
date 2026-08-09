"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { Select } from "@/components/ui/Select";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import { setUserActiveAction, setUserRoleAction } from "@/server/admin/actions";
import type { AdminUserRow } from "@/server/admin/queries";
import type { UserRole } from "@/server/db/schema";

export function UsersPanel({ users }: { users: AdminUserRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggleActive(user: AdminUserRow) {
    setPendingId(user.id);
    setError(null);
    const result = await setUserActiveAction(user.id, !user.isActive);
    setPendingId(null);
    if (!result.ok) setError(result.error);
  }

  async function handleRoleChange(user: AdminUserRow, role: UserRole) {
    if (role === user.role) return;
    setPendingId(user.id);
    setError(null);
    const result = await setUserRoleAction(user.id, role);
    setPendingId(null);
    if (!result.ok) setError(result.error);
  }

  return (
    <Panel
      title="Utilisateurs"
      eyebrow={String(users.length)}
      action={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          + Utilisateur
        </Button>
      }
    >
      {error && <p className="mb-3 text-14 text-clay-soft">{error}</p>}
      <div className="flex flex-col divide-y divide-border-soft">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex min-w-40 flex-1 flex-col">
              <span className="text-14 font-medium text-ink-high">{u.displayName}</span>
              <span className="text-12 text-ink-faint">@{u.username}</span>
            </div>
            <Select
              value={u.role}
              disabled={pendingId === u.id}
              onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
              className="w-36"
            >
              <option value="player">Joueur</option>
              <option value="admin">Admin</option>
            </Select>
            <Toggle
              label={u.isActive ? "Actif" : "Désactivé"}
              checked={u.isActive}
              disabled={pendingId === u.id}
              onChange={() => handleToggleActive(u)}
            />
            {!u.isActive && <Badge tone="clay">Désactivé</Badge>}
          </div>
        ))}
      </div>
      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Panel>
  );
}
