import Link from "next/link";
import { LogOut } from "lucide-react";
import { LaurelSprig } from "@/components/ui/HandDrawn";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SoundToggle } from "@/components/app-shell/SoundToggle";
import { logoutAction } from "@/server/auth/actions";
import type { SessionUser } from "@/server/auth/session";

export function Header({ user }: { user: SessionUser }) {
  return (
    <header className="border-b border-border-soft bg-bg-raised">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <Link href="/accueil" className="flex shrink-0 items-center gap-2">
          <LaurelSprig className="h-6 w-14 text-gold-deep" />
          <span className="font-display text-20 text-ink-high">ASPI Quiz</span>
        </Link>

        {/* Single link is redundant with the logo for now — becomes a proper nav (with a
            mobile drawer) once Phase 6/10 add /creer and /admin. */}
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
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-3">
          <SoundToggle />
          <Avatar seed={user.avatarSeed} size="sm" />
          <span className="hidden text-14 text-ink-mid sm:inline">{user.displayName}</span>
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
