import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { listMyTokens } from "@/server/mcp/queries";
import { McpSettingsPage } from "@/components/tokens/McpSettingsPage";

export const metadata: Metadata = { title: "Accès MCP — ASPI Quiz" };

export default async function McpParametresPage() {
  const session = await getSession();
  if (!session) redirect("/connexion");

  const tokens = await listMyTokens(session.user.id);

  return (
    <McpSettingsPage tokens={tokens} publicBaseUrl={process.env["PUBLIC_BASE_URL"]?.trim() || ""} />
  );
}
