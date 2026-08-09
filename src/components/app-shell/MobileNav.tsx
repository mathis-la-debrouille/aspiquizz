"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { UserRole } from "@/server/db/schema";

const LINKS = [
  { href: "/accueil", label: "Accueil" },
  { href: "/creer", label: "Créer" },
  { href: "/classement", label: "Classement" },
];

/** The `sm:flex` nav in Header hides below that breakpoint with nothing standing in for it —
 *  this is that stand-in, a hamburger + a plain link list in a Modal. Same links, same order. */
export function MobileNav({ role }: { role: UserRole }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Ouvrir le menu"
        className="sm:hidden"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" strokeWidth={1.5} />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Menu">
        <nav aria-label="Navigation principale" className="flex flex-col gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-16 text-ink-high transition-colors duration-150 hover:bg-bg-surface"
            >
              {link.label}
            </Link>
          ))}
          {role === "admin" && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-16 text-ink-high transition-colors duration-150 hover:bg-bg-surface"
            >
              Administration
            </Link>
          )}
        </nav>
      </Modal>
    </>
  );
}
