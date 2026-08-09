import Link from "next/link";
import { LogOut } from "lucide-react";
import { LaurelSprig } from "@/components/ui/HandDrawn";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SoundToggle } from "@/components/app-shell/SoundToggle";
import { MobileNav } from "@/components/app-shell/MobileNav";
import { logoutAction } from "@/server/auth/actions";
import type { SessionUser } from "@/server/auth/session";

export function Header({ user }: { user: SessionUser }) {
  return (
    <header className="border-b border-border-soft bg-bg-raised">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <MobileNav role={user.role} />
        <Link href="/accueil" className="flex shrink-0 items-center gap-2">
          <LaurelSprig className="h-6 w-14 text-gold-deep" />
          <span className="font-display text-20 text-ink-high">ASPI Quiz</span>
        </Link>

        <nav
          aria-label="Navigation principale"
          className="hidden flex-1 items-center gap-1 sm:flex"
        >
          <Link
            href="/accueil"
            className="rounded-sm px-3 py-1.5 text-14 text-ink-mid transition-colors duration-150 hover:bg-bg-surface hover:text-ink-high"
          >
            Accueil
          </Link>
          <Link
            href="/creer"
            className="rounded-sm px-3 py-1.5 text-14 text-ink-mid transition-colors duration-150 hover:bg-bg-surface hover:text-ink-high"
          >
            Créer
          </Link>
          <Link
            href="/classement"
            className="rounded-sm px-3 py-1.5 text-14 text-ink-mid transition-colors duration-150 hover:bg-bg-surface hover:text-ink-high"
          >
            Classement
          </Link>
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="rounded-sm px-3 py-1.5 text-14 text-ink-mid transition-colors duration-150 hover:bg-bg-surface hover:text-ink-high"
            >
              Administration
            </Link>
          )}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-3">
          <SoundToggle />
          <Link
            href={`/profil/${user.username}`}
            className="flex items-center gap-2 rounded-sm px-1.5 py-1 transition-colors duration-150 hover:bg-bg-surface"
          >
            <Avatar seed={user.avatarSeed} size="sm" />
            <span className="hidden text-14 text-ink-mid sm:inline">{user.displayName}</span>
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" aria-label="Se déconnecter">
              <LogOut strokeWidth={1.5} className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
