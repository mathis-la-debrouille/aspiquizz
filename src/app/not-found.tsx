import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompassRose } from "@/components/ui/HandDrawn";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <EmptyState
        icon={<CompassRose className="h-14 w-14" />}
        title="Cette page n'existe pas."
        description="Le chemin emprunté ne mène nulle part — retournez à l'accueil."
        action={
          <Link
            href="/"
            className="btn-physical inline-flex h-11 items-center justify-center rounded-md border border-moss-deep border-b-[3px] bg-moss px-4 text-16 font-medium text-bg-void hover:brightness-110 active:translate-y-[2px] active:border-b-[1px] active:brightness-95"
          >
            Retour à l&apos;accueil
          </Link>
        }
      />
    </main>
  );
}
