"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import {
  questions,
  questionChoices,
  questionOpenAnswers,
  quizzes,
  quizQuestions,
} from "@/server/db/schema";
import { getSession, type SessionUser } from "@/server/auth/session";
import {
  openQuestionSchema,
  mcqQuestionSchema,
  imageQuestionSchema,
  geoQuestionSchema,
  quizFormSchema,
  type OpenQuestionInput,
  type McqQuestionInput,
  type ImageQuestionInput,
  type GeoQuestionInput,
  type QuizFormInput,
} from "@/lib/schemas/questions";
import { createQuestionFromDraft } from "@/server/questions/ingest";
import type { QuestionDraft } from "@/lib/schemas/ingest";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Non authentifié.");
  return session.user;
}

/** The credited author never changes on edit (brief §10.3) — this only checks *who may edit*,
 *  not who gets credited. Used by every updateXQuestion action below. */
async function requireEditAccess(questionId: string, user: SessionUser): Promise<ActionResult | null> {
  if (user.role === "admin") return null;
  const row = (
    await db.select({ authorId: questions.authorId }).from(questions).where(eq(questions.id, questionId)).limit(1)
  )[0];
  if (!row) return { ok: false, error: "Question introuvable." };
  if (row.authorId !== user.id) return { ok: false, error: "Vous ne pouvez modifier que vos propres questions." };
  return null;
}

export async function createOpenQuestion(input: OpenQuestionInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = openQuestionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  // Routed through the single insert path (ingest.ts, Addendum C.1) — createQuestionFromDraft is
  // the only place `insert(questions)` happens for question creation, web form included.
  const draft: QuestionDraft = {
    type: "open",
    enonce: data.prompt,
    categorie: data.categoryId,
    difficulte: data.difficulty as 1 | 2 | 3 | 4 | 5,
    indice: data.hint || undefined,
    explication: data.explanation || undefined,
    reponses: [data.primaryAnswer, ...data.variants],
    strict: data.strict,
  };
  const result = await createQuestionFromDraft(draft, {
    authorId: user.id,
    source: "manual",
    initialStatus: data.status,
  });
  if (!result.ok) {
    return { ok: false, error: result.errors[0]?.message ?? "Formulaire invalide." };
  }

  revalidatePath("/creer");
  return { ok: true, id: result.questionId };
}

export async function updateOpenQuestion(
  questionId: string,
  input: OpenQuestionInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const denied = await requireEditAccess(questionId, user);
  if (denied) return denied;
  const parsed = openQuestionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  await db
    .update(questions)
    .set({
      prompt: data.prompt,
      hint: data.hint || null,
      explanation: data.explanation || null,
      categoryId: data.categoryId,
      difficulty: data.difficulty,
      strict: data.strict,
      status: data.status,
      updatedAt: new Date(),
    })
    .where(eq(questions.id, questionId));

  await db.delete(questionOpenAnswers).where(eq(questionOpenAnswers.questionId, questionId));
  await db
    .insert(questionOpenAnswers)
    .values([
      { questionId, value: data.primaryAnswer, isPrimary: true },
      ...data.variants.map((value) => ({ questionId, value, isPrimary: false })),
    ]);

  revalidatePath("/creer");
  revalidatePath(`/creer/question/${questionId}`);
  return { ok: true, id: questionId };
}

export async function createMcqQuestion(input: McqQuestionInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = mcqQuestionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  const draft: QuestionDraft = {
    type: "mcq",
    enonce: data.prompt,
    categorie: data.categoryId,
    difficulte: data.difficulty as 1 | 2 | 3 | 4 | 5,
    indice: data.hint || undefined,
    explication: data.explanation || undefined,
    choix: data.choices.map((c) => ({ texte: c.label, correct: c.isCorrect })),
  };
  const result = await createQuestionFromDraft(draft, {
    authorId: user.id,
    source: "manual",
    initialStatus: data.status,
  });
  if (!result.ok) {
    return { ok: false, error: result.errors[0]?.message ?? "Formulaire invalide." };
  }

  revalidatePath("/creer");
  return { ok: true, id: result.questionId };
}

export async function updateMcqQuestion(
  questionId: string,
  input: McqQuestionInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const denied = await requireEditAccess(questionId, user);
  if (denied) return denied;
  const parsed = mcqQuestionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  await db
    .update(questions)
    .set({
      prompt: data.prompt,
      hint: data.hint || null,
      explanation: data.explanation || null,
      categoryId: data.categoryId,
      difficulty: data.difficulty,
      status: data.status,
      updatedAt: new Date(),
    })
    .where(eq(questions.id, questionId));

  await db.delete(questionChoices).where(eq(questionChoices.questionId, questionId));
  await db.insert(questionChoices).values(
    data.choices.map((choice, position) => ({
      questionId,
      label: choice.label,
      isCorrect: choice.isCorrect,
      position,
    })),
  );

  revalidatePath("/creer");
  revalidatePath(`/creer/question/${questionId}`);
  return { ok: true, id: questionId };
}

export async function createImageQuestion(input: ImageQuestionInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = imageQuestionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  const [row] = await db
    .insert(questions)
    .values({
      type: "image",
      prompt: data.prompt,
      hint: data.hint || null,
      explanation: data.explanation || null,
      categoryId: data.categoryId,
      authorId: user.id,
      difficulty: data.difficulty,
      mediaId: data.mediaId,
      answerMode: data.answerMode,
      strict: data.strict,
      status: data.status,
    })
    .returning({ id: questions.id });
  const questionId = row!.id;

  if (data.answerMode === "mcq") {
    await db.insert(questionChoices).values(
      data.choices.map((choice, position) => ({
        questionId,
        label: choice.label,
        isCorrect: choice.isCorrect,
        position,
      })),
    );
  } else {
    await db
      .insert(questionOpenAnswers)
      .values([
        { questionId, value: data.primaryAnswer!, isPrimary: true },
        ...data.variants.map((value) => ({ questionId, value, isPrimary: false })),
      ]);
  }

  revalidatePath("/creer");
  return { ok: true, id: questionId };
}

export async function updateImageQuestion(
  questionId: string,
  input: ImageQuestionInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const denied = await requireEditAccess(questionId, user);
  if (denied) return denied;
  const parsed = imageQuestionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  await db
    .update(questions)
    .set({
      prompt: data.prompt,
      hint: data.hint || null,
      explanation: data.explanation || null,
      categoryId: data.categoryId,
      difficulty: data.difficulty,
      mediaId: data.mediaId,
      answerMode: data.answerMode,
      strict: data.strict,
      status: data.status,
      updatedAt: new Date(),
    })
    .where(eq(questions.id, questionId));

  await db.delete(questionChoices).where(eq(questionChoices.questionId, questionId));
  await db.delete(questionOpenAnswers).where(eq(questionOpenAnswers.questionId, questionId));
  if (data.answerMode === "mcq") {
    await db.insert(questionChoices).values(
      data.choices.map((choice, position) => ({
        questionId,
        label: choice.label,
        isCorrect: choice.isCorrect,
        position,
      })),
    );
  } else {
    await db
      .insert(questionOpenAnswers)
      .values([
        { questionId, value: data.primaryAnswer!, isPrimary: true },
        ...data.variants.map((value) => ({ questionId, value, isPrimary: false })),
      ]);
  }

  revalidatePath("/creer");
  revalidatePath(`/creer/question/${questionId}`);
  return { ok: true, id: questionId };
}

export async function createGeoQuestion(input: GeoQuestionInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = geoQuestionSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  // The web geo form already resolved a target directly on the map (not a free-text name), and
  // carries fields (viewBbox cadrage, editable accepted answers, strict) that MCP's narrower
  // QuestionDraft has no room for — ctx.manualGeo below carries them through verbatim instead of
  // re-deriving from a country name, while still funnelling the actual insert through ingest.ts.
  const draft: QuestionDraft = {
    type: "geo",
    enonce: data.prompt,
    categorie: data.categoryId,
    difficulte: data.difficulty as 1 | 2 | 3 | 4 | 5,
    indice: data.hint || undefined,
    explication: data.explanation || undefined,
    mode: data.geoMode,
    // Never resolved (manualGeo is set below) — a placeholder satisfying the schema's non-empty
    // string requirement only.
    pays: data.targetIso3,
    afficherNoms: data.showLabels,
    afficherVoisins: data.showNeighbours,
  };
  const result = await createQuestionFromDraft(draft, {
    authorId: user.id,
    source: "manual",
    initialStatus: data.status,
    manualGeo: {
      targetIso3: data.targetIso3,
      acceptedAnswers: data.acceptedAnswers,
      viewBbox: data.viewBbox,
      strict: data.strict,
    },
  });
  if (!result.ok) {
    return { ok: false, error: result.errors[0]?.message ?? "Formulaire invalide." };
  }

  revalidatePath("/creer");
  return { ok: true, id: result.questionId };
}

export async function createQuiz(input: QuizFormInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = quizFormSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const data = parsed.data;

  const [row] = await db
    .insert(quizzes)
    .values({
      title: data.title,
      description: data.description || null,
      categoryId: data.categoryId || null,
      authorId: user.id,
      status: data.status,
    })
    .returning({ id: quizzes.id });
  const quizId = row!.id;

  await db
    .insert(quizQuestions)
    .values(data.questionIds.map((questionId, position) => ({ quizId, questionId, position })));

  revalidatePath("/creer/quiz");
  return { ok: true, id: quizId };
}
