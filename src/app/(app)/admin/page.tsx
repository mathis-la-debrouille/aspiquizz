import type { Metadata } from "next";
import { listAllUsers, listAllCategories, listAllMedia } from "@/server/admin/queries";
import { listQuestions } from "@/server/questions/queries";
import { AdminTabs } from "@/components/admin/AdminTabs";

export const metadata: Metadata = { title: "Administration — ASPI Quiz" };

export default async function AdminPage() {
  const [users, categoryRows, mediaRows, questionRows] = await Promise.all([
    listAllUsers(),
    listAllCategories(),
    listAllMedia(),
    listQuestions({}), // no status filter — moderation sees drafts/archived too
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-26 text-ink-high">Administration</h1>
      <AdminTabs
        users={users}
        categories={categoryRows}
        media={mediaRows}
        questions={questionRows}
      />
    </div>
  );
}
