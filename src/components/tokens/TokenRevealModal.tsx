"use client";

import { useState } from "react";
import { Copy, Check, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      leadingIcon={
        copied ? (
          <Check className="h-4 w-4" strokeWidth={1.5} />
        ) : (
          <Copy className="h-4 w-4" strokeWidth={1.5} />
        )
      }
    >
      {copied ? "Copié" : label}
    </Button>
  );
}

/** Shown exactly once, right after creation — the token can never be retrieved again afterwards
 *  (C.3/C.4). Includes a ready-to-paste setup snippet, both the JSON config block and the
 *  `claude mcp add` CLI form, generated from PUBLIC_BASE_URL (falling back to the current
 *  origin when unset — e.g. local dev, where PUBLIC_BASE_URL is typically left empty). */
export function TokenRevealModal({
  open,
  onClose,
  token,
  publicBaseUrl,
}: {
  open: boolean;
  onClose: () => void;
  token: string | null;
  publicBaseUrl: string;
}) {
  const baseUrl = publicBaseUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const mcpUrl = `${baseUrl}/mcp`;

  const jsonSnippet = JSON.stringify(
    {
      mcpServers: {
        aspiquiz: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${token ?? ""}` },
        },
      },
    },
    null,
    2,
  );
  const cliSnippet = `claude mcp add --transport http aspiquiz ${mcpUrl} --header "Authorization: Bearer ${token ?? ""}"`;

  return (
    <Modal
      open={open && Boolean(token)}
      onClose={onClose}
      title="Jeton créé"
      footer={<Button onClick={onClose}>Terminé</Button>}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2 rounded-md border border-clay-deep bg-clay-deep/15 px-3 py-2.5 text-13 text-clay-soft">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <p>Ce jeton ne sera plus affiché. Copiez-le maintenant et conservez-le en lieu sûr.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">Jeton</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-border-hard bg-bg-inset px-3 py-2.5 font-numeral text-13 text-ink-high">
              {token}
            </code>
            <CopyButton text={token ?? ""} label="Copier" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">
            Configuration (Claude Desktop, Cowork, …)
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded-md border border-border-hard bg-bg-inset px-3 py-2.5 font-numeral text-12 text-ink-mid">
              {jsonSnippet}
            </pre>
            <CopyButton text={jsonSnippet} label="Copier" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-12 tracking-[0.08em] text-ink-faint uppercase">Claude Code</p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 overflow-x-auto rounded-md border border-border-hard bg-bg-inset px-3 py-2.5 font-numeral text-12 text-ink-mid whitespace-pre-wrap">
              {cliSnippet}
            </pre>
            <CopyButton text={cliSnippet} label="Copier" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
