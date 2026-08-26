"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { CategoriesPanel } from "@/components/admin/CategoriesPanel";
import { MediaPanel } from "@/components/admin/MediaPanel";
import { QuestionsPanel } from "@/components/admin/QuestionsPanel";
import { McpPanel } from "@/components/admin/McpPanel";
import { FlagsPanel } from "@/components/admin/FlagsPanel";
import type { AdminUserRow, AdminCategoryRow, AdminMediaRow } from "@/server/admin/queries";
import type { QuestionListItem } from "@/server/questions/queries";
import type { AdminTokenRow, AuditLogRow } from "@/server/mcp/queries";
import type { FlaggedQuestion } from "@/server/questions/flags";

const TABS = [
  { id: "users", label: "Utilisateurs" },
  { id: "categories", label: "Catégories" },
  { id: "media", label: "Médias" },
  { id: "questions", label: "Questions" },
  { id: "flags", label: "Signalements" },
  { id: "mcp", label: "MCP" },
];

export function AdminTabs({
  users,
  categories,
  media,
  questions,
  mcpTokens,
  auditRows,
  flagged,
}: {
  users: AdminUserRow[];
  categories: AdminCategoryRow[];
  media: AdminMediaRow[];
  questions: QuestionListItem[];
  mcpTokens: AdminTokenRow[];
  auditRows: AuditLogRow[];
  flagged: FlaggedQuestion[];
}) {
  const [tab, setTab] = useState("users");

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "users" && <UsersPanel users={users} />}
      {tab === "categories" && <CategoriesPanel categories={categories} />}
      {tab === "media" && <MediaPanel media={media} />}
      {tab === "questions" && <QuestionsPanel questions={questions} />}
      {tab === "flags" && <FlagsPanel flagged={flagged} />}
      {tab === "mcp" && <McpPanel tokens={mcpTokens} auditRows={auditRows} />}
    </div>
  );
}
