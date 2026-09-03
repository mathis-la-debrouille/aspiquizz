"use client";

import { Panel } from "@/components/ui/Panel";
import { TokenList } from "@/components/tokens/TokenList";
import type { AdminTokenRow, AuditLogRow } from "@/server/mcp/queries";

const ACTION_LABELS: Record<string, string> = {
  category_create: "Création de catégorie",
  category_update: "Modification de catégorie",
  category_merge: "Fusion de catégories",
  category_delete: "Suppression de catégorie",
};

/** Admin's read-only, cross-user view of every MCP token (C.4) plus the category-mutation paper
 *  trail (C.5's audit_log, "surfaced in /admin") — one tab, since both are "what happened over
 *  MCP" at a glance. Revoking is the only mutation exposed here; token values are never shown. */
export function McpPanel({
  tokens,
  auditRows,
}: {
  tokens: AdminTokenRow[];
  auditRows: AuditLogRow[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <Panel
        eyebrow="Administration"
        title="Jetons MCP"
        action={<span className="text-12 text-ink-faint">{tokens.length} jeton(s)</span>}
      >
        <TokenList tokens={tokens} showOwner />
      </Panel>

      <Panel title="Journal des catégories" eyebrow={`${auditRows.length} entrée(s)`}>
        {auditRows.length === 0 ? (
          <p className="text-14 text-ink-faint">Aucune modification de catégorie enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-14">
              <thead>
                <tr className="border-b border-border-soft text-left text-12 text-ink-faint">
                  <th className="py-2 pr-4 font-normal">Quand</th>
                  <th className="py-2 pr-4 font-normal">Qui</th>
                  <th className="py-2 pr-4 font-normal">Jeton</th>
                  <th className="py-2 pr-4 font-normal">Action</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id} className="border-b border-border-soft/50">
                    <td className="py-2 pr-4 text-ink-faint">
                      {row.createdAt.toLocaleString("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-2 pr-4 text-ink-high">@{row.actorUsername}</td>
                    <td className="py-2 pr-4 text-ink-faint">{row.tokenName ?? "— (web)"}</td>
                    <td className="py-2 pr-4 text-ink-mid">
                      {ACTION_LABELS[row.action] ?? row.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
