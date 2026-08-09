import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSession } from "@/server/auth/session";

/** UX-level gate — every action in server/admin/actions.ts re-checks via requireAdmin() too,
 *  since a layout having run isn't itself a trust boundary. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session || session.user.role !== "admin") {
    redirect("/accueil");
  }
  return <>{children}</>;
}
