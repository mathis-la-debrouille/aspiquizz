import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/** All /dev/* playgrounds (ui gallery, map) are dev-only — 404 in production. See brief §13. */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <div className="min-h-dvh bg-bg-base">{children}</div>;
}
