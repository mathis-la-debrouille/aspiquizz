"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Plus } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { CreateTokenModal } from "@/components/tokens/CreateTokenModal";
import { TokenRevealModal } from "@/components/tokens/TokenRevealModal";
import { TokenList } from "@/components/tokens/TokenList";
import { McpTutorial } from "@/components/tokens/McpTutorial";
import type { TokenRow } from "@/server/mcp/queries";

export function McpSettingsPage({
  tokens,
  publicBaseUrl,
}: {
  tokens: TokenRow[];
  publicBaseUrl: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [reveal, setReveal] = useState<{ token: string; expiresAt: Date | null } | null>(null);

  function handleChanged() {
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel
        eyebrow="Profil"
        title="Accès MCP"
        action={
          <Button
            size="sm"
            leadingIcon={<Plus className="h-4 w-4" strokeWidth={1.5} />}
            onClick={() => setCreateOpen(true)}
          >
            Créer un jeton
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-md border border-border-soft bg-bg-inset px-4 py-3">
            <Plug className="mt-0.5 h-5 w-5 shrink-0 text-moss-glow" strokeWidth={1.5} />
            <p className="text-14 text-ink-mid">
              MCP permet de connecter votre propre client IA (Claude Desktop, Cowork, Claude
              Code, ou tout client compatible MCP) à ASPI Quiz pour créer des questions par la
              conversation — vous utilisez votre propre modèle, aucune clé tierce n&apos;est
              stockée ici. Les questions créées arrivent toujours à l&apos;état de brouillon et
              doivent être relues avant publication.
            </p>
          </div>

          <TokenList tokens={tokens} onChanged={handleChanged} />
        </div>
      </Panel>

      <Panel eyebrow="Guide" title="Configurer votre client en 6 étapes">
        <McpTutorial />
      </Panel>

      <CreateTokenModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(result) => {
          setCreateOpen(false);
          setReveal({ token: result.token, expiresAt: result.expiresAt });
          router.refresh();
        }}
      />

      <TokenRevealModal
        open={Boolean(reveal)}
        onClose={() => setReveal(null)}
        token={reveal?.token ?? null}
        publicBaseUrl={publicBaseUrl}
      />
    </div>
  );
}
