import type { Metadata } from "next";
import { LaurelSprig } from "@/components/ui/HandDrawn";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Connexion — ASPI Quiz",
};

export default function ConnexionPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16 sm:justify-end sm:px-16">
      <div className="flex w-full max-w-sm flex-col gap-6 sm:mr-[8vw]">
        <div className="flex flex-col items-start gap-2">
          <LaurelSprig className="h-8 w-20 text-gold-deep" />
          <h1 className="font-display text-34 text-ink-high">ASPI Quiz</h1>
          <p className="text-14 text-ink-mid">
            Accès réservé — connectez-vous avec le compte que l&apos;administrateur vous a créé.
          </p>
        </div>
        <Card className="p-6" elevation="lifted">
          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
