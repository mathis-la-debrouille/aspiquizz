"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { CategoriesPanel } from "@/components/admin/CategoriesPanel";
import { MediaPanel } from "@/components/admin/MediaPanel";
import { QuestionsPanel } from "@/components/admin/QuestionsPanel";
import type { AdminUserRow, AdminCategoryRow, AdminMediaRow } from "@/server/admin/queries";
import type { QuestionListItem } from "@/server/questions/queries";

const TABS = [
  { id: "users", label: "Utilisateurs" },
  { id: "categories", label: "Catégories" },
  { id: "media", label: "Médias" },
  { id: "questions", label: "Questions" },
];

export function AdminTabs({
  users,
  categories,
  media,
  questions,
}: {
  users: AdminUserRow[];
  categories: AdminCategoryRow[];
  media: AdminMediaRow[];
  questions: QuestionListItem[];
}) {
  const [tab, setTab] = useState("users");

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "users" && <UsersPanel users={users} />}
      {tab === "categories" && <CategoriesPanel categories={categories} />}
      {tab === "media" && <MediaPanel media={media} />}
      {tab === "questions" && <QuestionsPanel questions={questions} />}
    </div>
  );
}
