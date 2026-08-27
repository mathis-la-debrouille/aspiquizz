import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/server/auth/session";
import { Header } from "@/components/app-shell/Header";
import { SessionTouch } from "@/components/app-shell/SessionTouch";
import { ToastProvider } from "@/components/ui/Toast";

/** Authoritative auth gate for every route under (app) — see middleware.ts for the coarse layer. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect("/connexion");
  }

  // The Toast provider lives here rather than per-page: it existed only in /dev/ui until now,
  // so useToast() threw anywhere real — which is why the report button had no confirmation.
  return (
    <ToastProvider>
      <div className="min-h-dvh bg-bg-base">
        <a
          href="#main-content"
          className="sr-only rounded-md bg-gold px-4 py-2 text-14 text-bg-void focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
        >
          Aller au contenu principal
        </a>
        <SessionTouch needsRenewal={session.needsRenewal} />
        <Header user={session.user} />
        <div id="main-content" className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          {children}
        </div>
      </div>
    </ToastProvider>
  );
}
