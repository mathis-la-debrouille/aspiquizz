import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/server/auth/session";
import { Header } from "@/components/app-shell/Header";
import { SessionTouch } from "@/components/app-shell/SessionTouch";

/** Authoritative auth gate for every route under (app) — see middleware.ts for the coarse layer. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/connexion");
  }

  return (
    <div className="min-h-dvh bg-bg-base">
      <SessionTouch needsRenewal={session.needsRenewal} />
      <Header user={session.user} />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
