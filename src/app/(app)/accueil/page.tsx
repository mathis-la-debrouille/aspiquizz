import type { Metadata } from "next";
import { getSession } from "@/server/auth/session";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Accueil — ASPI Quiz",
};

export default async function AccueilPage() {
  const session = await getSession();
  const displayName = session?.user.displayName ?? "";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-34 text-ink-high">Bienvenue, {displayName}</h1>
        <p className="text-16 text-ink-mid">
          La salle des salons ouverts arrive avec le temps réel (Phase 7).
        </p>
      </div>
      <EmptyState
        title="Aucun salon ouvert pour l'instant."
        description="La création et la liste des salons en direct arrivent dans une prochaine phase du projet."
        action={
          <Button disabled size="sm">
            Créer un salon
          </Button>
        }
      />
    </div>
  );
}
