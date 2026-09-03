import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { db } from "@/server/db";
import { categories } from "@/server/db/schema";
import { getSession } from "@/server/auth/session";
import { getFullQuestionDetail } from "@/server/game/question-detail";
import { QuestionComposer, type EditingQuestion } from "@/components/authoring/QuestionComposer";
import { EmptyState } from "@/components/ui/EmptyState";
import type { SharedFieldsValue } from "@/components/authoring/SharedFields";

export const metadata: Metadata = { title: "Modifier la question — ASPI Quiz" };

export default async function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/connexion");

  const [detail, categoryRows] = await Promise.all([
    getFullQuestionDetail(id),
    db.select().from(categories).orderBy(desc(categories.position)),
  ]);
  if (!detail) notFound();

  const canEdit = session.user.role === "admin" || detail.authorId === session.user.id;
  if (!canEdit) redirect("/creer");

  const categoryOptions = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    colorToken: c.colorToken,
  }));

  const shared: SharedFieldsValue = {
    categoryId: detail.categoryId,
    difficulty: detail.difficulty,
    hint: detail.hint ?? "",
    explanation: detail.explanation ?? "",
    status: detail.status === "archived" ? "draft" : detail.status,
  };

  if (detail.type === "geo") {
    return (
      <div className="flex flex-col gap-10">
        <h1 className="font-display text-34 text-ink-high">Modifier la question</h1>
        <EmptyState
          title="L'édition des questions de géographie arrive bientôt."
          description="Cette fonctionnalité n'est pas encore disponible pour ce type de question."
        />
      </div>
    );
  }

  const primaryAnswer = detail.openAnswers.find((_v, i) => i === 0) ?? "";
  // isPrimary isn't carried through FullQuestionDetail's flattened openAnswers array — the
  // create action always inserts the primary answer first (see actions.ts), so position 0 is a
  // safe read here without adding a field just for this.
  const variants = detail.openAnswers.slice(1);

  const editing: EditingQuestion = {
    id: detail.id,
    type: detail.type,
    open:
      detail.type === "open"
        ? {
            id: detail.id,
            prompt: detail.prompt,
            strict: detail.strict,
            primaryAnswer,
            variants,
            shared,
          }
        : undefined,
    mcq:
      detail.type === "mcq"
        ? {
            id: detail.id,
            prompt: detail.prompt,
            choices: detail.choices.map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
            shared,
          }
        : undefined,
    image:
      detail.type === "image"
        ? {
            id: detail.id,
            prompt: detail.prompt,
            answerMode: detail.answerMode ?? "open",
            mediaId: detail.mediaId ?? "",
            primaryAnswer,
            variants,
            choices: detail.choices.map((c) => ({ label: c.label, isCorrect: c.isCorrect })),
            strict: detail.strict,
            shared,
          }
        : undefined,
    sort:
      detail.type === "sort"
        ? {
            id: detail.id,
            prompt: detail.prompt,
            items: detail.sortItems.map((i) => ({ label: i.label, mediaId: i.mediaId })),
            shared,
          }
        : undefined,
    estimation:
      detail.type === "estimation" && detail.estimation
        ? {
            id: detail.id,
            prompt: detail.prompt,
            correctValue: detail.estimation.correctValue,
            toleranceType: detail.estimation.toleranceType,
            toleranceValue: detail.estimation.toleranceValue,
            unit: detail.estimation.unit ?? "",
            shared,
          }
        : undefined,
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-34 text-ink-high">Modifier la question</h1>
        <p className="text-16 text-ink-mid">{detail.prompt}</p>
      </div>

      <QuestionComposer categories={categoryOptions} editing={editing} />
    </div>
  );
}
