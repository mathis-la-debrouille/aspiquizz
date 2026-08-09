import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/server/auth/session";

/** Already-logged-in users don't see the login screen — brief §9. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (session) {
    redirect("/accueil");
  }

  return <div className="min-h-dvh bg-bg-base">{children}</div>;
}
