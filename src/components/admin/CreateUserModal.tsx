"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { createUserAction } from "@/server/admin/actions";
import type { UserRole } from "@/server/db/schema";

export function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("player");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setUsername("");
    setPassword("");
    setDisplayName("");
    setRole("player");
    setError(null);
  }

  async function handleCreate() {
    setPending(true);
    setError(null);
    const result = await createUserAction({
      username,
      password,
      displayName: displayName || undefined,
      role,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Nouvel utilisateur"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={pending}
            disabled={!username || password.length < 8}
            onClick={handleCreate}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Nom d'utilisateur"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          hint="3-24 caractères, minuscules, chiffres, tiret ou underscore."
        />
        <Input
          label="Mot de passe"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="8 caractères minimum."
        />
        <Input
          label="Nom affiché (optionnel)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          <option value="player">Joueur</option>
          <option value="admin">Admin</option>
        </Select>
        {error && <p className="text-14 text-clay-soft">{error}</p>}
      </div>
    </Modal>
  );
}
