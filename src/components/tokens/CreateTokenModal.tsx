"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { RadioCard } from "@/components/ui/RadioCard";
import { Button } from "@/components/ui/Button";
import { createMcpTokenAction } from "@/server/mcp/actions";
import { API_TOKEN_SCOPES } from "@/lib/schemas/tokens";
import type { ApiTokenScope } from "@/server/db/schema";

const SCOPE_LABELS: Record<ApiTokenScope, { label: string; description: string }> = {
  "questions:read": {
    label: "Lire les questions",
    description: "Lister les catégories, rechercher des questions existantes, résoudre un pays.",
  },
  "questions:write": {
    label: "Créer des questions",
    description: "Créer, modifier et supprimer ses propres brouillons.",
  },
  "categories:write": {
    label: "Gérer les catégories",
    description:
      "Créer une catégorie ; renommer, fusionner ou supprimer nécessite d'être administrateur.",
  },
};

const EXPIRY_OPTIONS: { value: 30 | 90 | 180 | "never"; label: string }[] = [
  { value: 30, label: "30 jours" },
  { value: 90, label: "90 jours" },
  { value: 180, label: "180 jours" },
  { value: "never", label: "Jamais" },
];

export function CreateTokenModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: { token: string; tokenPrefix: string; expiresAt: Date | null }) => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["questions:read"]);
  const [expiryDays, setExpiryDays] = useState<30 | 90 | 180 | "never">(180);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggleScope(scope: ApiTokenScope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function reset() {
    setName("");
    setScopes(["questions:read"]);
    setExpiryDays(180);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await createMcpTokenAction({ name, scopes, expiryDays });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    reset();
    onCreated(result);
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Créer un jeton"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={pending}
            disabled={!name.trim() || scopes.length === 0}
            onClick={handleSubmit}
          >
            Créer le jeton
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          label="Nom"
          placeholder="ex. « Claude Desktop — portable »"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error ?? undefined}
        />

        <div className="flex flex-col gap-2">
          <p className="text-14 font-medium text-ink-mid">Durée de validité</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EXPIRY_OPTIONS.map((opt) => (
              <RadioCard
                key={String(opt.value)}
                label={opt.label}
                name="expiry"
                checked={expiryDays === opt.value}
                onChange={() => setExpiryDays(opt.value)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-14 font-medium text-ink-mid">Portée</p>
          <div className="flex flex-col gap-3">
            {API_TOKEN_SCOPES.map((scope) => (
              <Checkbox
                key={scope}
                label={SCOPE_LABELS[scope].label}
                description={SCOPE_LABELS[scope].description}
                checked={scopes.includes(scope)}
                onChange={() => toggleScope(scope)}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
