import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { parseLibraryQuery } from "@/lib/schemas/library";
import { listLibraryQuestions, listQuestionAuthors } from "@/server/questions/library";
// listAllCategories is a plain read (no auth check baked in) — reused here from the admin
// module rather than duplicated; the Categories tab (Addendum B.5) needs the exact same
// question-count-per-category shape /admin's own Categories tab already computes.
import { listAllCategories } from "@/server/admin/queries";
import { listReviewQueue } from "@/server/questions/review";
import { CreerPageShell } from "@/components/library/CreerPageShell";

export const metadata: Metadata = { title: "Bibliothèque — ASPI Quiz" };

export default async function CreerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/connexion");

  const rawParams = await searchParams;
  const query = parseLibraryQuery(rawParams);

  const [result, categoryRows, authors, reviewQueueItems] = await Promise.all([
    listLibraryQuestions(query, session.user),
    listAllCategories(),
    listQuestionAuthors(),
    listReviewQueue(),
  ]);

  return (
    <CreerPageShell
      query={query}
      initialItems={result.items}
      total={result.total}
      facets={result.facets}
      hasMore={result.hasMore}
      categoryOptions={categoryRows.map((c) => ({
        id: c.id,
        name: c.name,
        colorToken: c.colorToken,
      }))}
      categoryRows={categoryRows}
      authors={authors}
      reviewQueueItems={reviewQueueItems}
      viewerId={session.user.id}
      isAdmin={session.user.role === "admin"}
    />
  );
}
