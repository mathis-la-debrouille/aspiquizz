import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { parseLibraryQuery } from "@/lib/schemas/library";
import { listLibraryQuestions, listQuestionAuthors } from "@/server/questions/library";
import { LibraryClient } from "@/components/library/LibraryClient";

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

  const [result, categoryRows, authors] = await Promise.all([
    listLibraryQuestions(query, session.user),
    db.select().from(categories).orderBy(desc(categories.position)),
    listQuestionAuthors(),
  ]);

  return (
    <LibraryClient
      query={query}
      initialItems={result.items}
      total={result.total}
      facets={result.facets}
      hasMore={result.hasMore}
      categories={categoryRows.map((c) => ({ id: c.id, name: c.name, colorToken: c.colorToken }))}
      authors={authors}
      viewerId={session.user.id}
      isAdmin={session.user.role === "admin"}
    />
  );
}
