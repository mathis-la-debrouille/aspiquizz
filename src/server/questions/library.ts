import { and, asc, desc, eq, exists, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  questions,
  questionChoices,
  questionOpenAnswers,
  questionGeo,
  questionStats,
  categories,
  users,
  type QuestionType,
  type QuestionStatus,
  type ColorToken,
} from "@/server/db/schema";
import type { QuestionLibraryQuery } from "@/lib/schemas/library";
import type { SessionUser } from "@/server/auth/session";

const PAGE_SIZE = 24;

export interface LibraryQuestionItem {
  id: string;
  type: QuestionType;
  prompt: string;
  difficulty: number;
  status: QuestionStatus;
  categoryId: string;
  categoryName: string;
  categoryColorToken: ColorToken;
  authorId: string;
  authorUsername: string;
  authorDisplayName: string;
  authorAvatarSeed: string;
  mediaId: string | null;
  answerMode: "mcq" | "open" | null;
  createdAt: Date;
  timesAsked: number;
  timesCorrect: number;
  avgMs: number | null;
  /** mcq, and image when answerMode='mcq' — drives "N choix" / "· plusieurs réponses". */
  choiceCount: number;
  multiSelect: boolean;
  /** open, and image when answerMode='open' — drives "N réponses acceptées". */
  openAnswerCount: number;
  /** geo only — the tiny inline silhouette thumbnail needs a target to render. */
  geoTargetIso3: string | null;
}

export interface LibraryFacets {
  byType: Partial<Record<QuestionType, number>>;
  byCategory: Record<string, number>;
}

export interface LibraryResult {
  items: LibraryQuestionItem[];
  total: number;
  facets: LibraryFacets;
  hasMore: boolean;
}

/**
 * `baseConditions` intentionally excludes `type`/`cat` — the facet counts (byType/byCategory)
 * are computed against everything else so the filter chips show "how many if I added this",
 * not "how many given I already picked one". `page` is a page *number*, not a keyset cursor —
 * a deliberate simplification for this app's scale (a private pool in the dozens-to-low-
 * hundreds, not the kind of concurrent-write volume where OFFSET's known skew actually bites);
 * see DECISIONS.md.
 */
export async function listLibraryQuestions(
  query: QuestionLibraryQuery,
  viewer: SessionUser,
  page = 0,
): Promise<LibraryResult> {
  const isAdmin = viewer.role === "admin";

  // Visibility rule (A.3): drafts are visible only to their author and to admins — enforced
  // here, unconditionally, regardless of what `status`/`scope` was requested. A non-admin
  // asking for someone else's drafts just gets nothing back, not a UI-level hide.
  const visibility = isAdmin
    ? undefined
    : or(sql`${questions.status} != 'draft'`, eq(questions.authorId, viewer.id));

  const baseConditions = [
    gte(questions.difficulty, query.dmin),
    lte(questions.difficulty, query.dmax),
  ];
  if (visibility) baseConditions.push(visibility);

  // scope=drafts is a shortcut for "my drafts" and overrides the status segmented control,
  // which is the more intuitive reading of two controls that can otherwise conflict.
  if (query.scope === "drafts") {
    baseConditions.push(eq(questions.authorId, viewer.id), eq(questions.status, "draft"));
  } else {
    if (query.status !== "all") baseConditions.push(eq(questions.status, query.status));
    if (query.scope === "mine") baseConditions.push(eq(questions.authorId, viewer.id));
  }

  const authorId = query.author === "me" ? viewer.id : query.author;
  if (authorId) baseConditions.push(eq(questions.authorId, authorId));

  if (query.q) {
    const pattern = `%${query.q}%`;
    baseConditions.push(
      or(
        like(questions.prompt, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(questionOpenAnswers)
            .where(
              and(
                eq(questionOpenAnswers.questionId, questions.id),
                like(questionOpenAnswers.value, pattern),
              ),
            ),
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(questionChoices)
            .where(
              and(eq(questionChoices.questionId, questions.id), like(questionChoices.label, pattern)),
            ),
        ),
      )!,
    );
  }

  const conditions = [...baseConditions];
  if (query.type.length > 0) conditions.push(inArray(questions.type, query.type));
  if (query.cat.length > 0) conditions.push(inArray(questions.categoryId, query.cat));

  const successRateExpr = sql<number | null>`CASE WHEN ${questionStats.timesAsked} > 0 THEN CAST(${questionStats.timesCorrect} AS REAL) / ${questionStats.timesAsked} ELSE NULL END`;
  const orderBy = (() => {
    switch (query.sort) {
      case "oldest":
        return asc(questions.createdAt);
      case "difficulty_asc":
        return asc(questions.difficulty);
      case "difficulty_desc":
        return desc(questions.difficulty);
      case "success_rate_asc":
        return sql`${successRateExpr} ASC`;
      case "success_rate_desc":
        return sql`${successRateExpr} DESC`;
      case "most_played":
        return desc(sql`COALESCE(${questionStats.timesAsked}, 0)`);
      case "never_played":
        return asc(sql`COALESCE(${questionStats.timesAsked}, 0)`);
      case "recent":
      default:
        return desc(questions.createdAt);
    }
  })();

  const [items, totalRows, facetRows] = await Promise.all([
    db
      .select({
        id: questions.id,
        type: questions.type,
        prompt: questions.prompt,
        difficulty: questions.difficulty,
        status: questions.status,
        categoryId: questions.categoryId,
        categoryName: categories.name,
        categoryColorToken: categories.colorToken,
        authorId: questions.authorId,
        authorUsername: users.username,
        authorDisplayName: users.displayName,
        authorAvatarSeed: users.avatarSeed,
        mediaId: questions.mediaId,
        answerMode: questions.answerMode,
        createdAt: questions.createdAt,
        timesAsked: sql<number>`COALESCE(${questionStats.timesAsked}, 0)`,
        timesCorrect: sql<number>`COALESCE(${questionStats.timesCorrect}, 0)`,
        totalMs: sql<number>`COALESCE(${questionStats.totalMs}, 0)`,
        choiceCount: sql<number>`(SELECT COUNT(*) FROM question_choices WHERE question_id = questions.id)`,
        correctChoiceCount: sql<number>`(SELECT COUNT(*) FROM question_choices WHERE question_id = questions.id AND is_correct = 1)`,
        openAnswerCount: sql<number>`(SELECT COUNT(*) FROM question_open_answers WHERE question_id = questions.id)`,
        geoTargetIso3: questionGeo.targetIso3,
      })
      .from(questions)
      .innerJoin(categories, eq(questions.categoryId, categories.id))
      .innerJoin(users, eq(questions.authorId, users.id))
      .leftJoin(questionStats, eq(questionStats.questionId, questions.id))
      .leftJoin(questionGeo, eq(questionGeo.questionId, questions.id))
      .where(and(...conditions))
      .orderBy(orderBy, desc(questions.id))
      .limit(PAGE_SIZE + 1)
      .offset(page * PAGE_SIZE),
    db
      .select({ n: sql<number>`count(*)` })
      .from(questions)
      .where(and(...conditions)),
    db
      .select({
        type: questions.type,
        categoryId: questions.categoryId,
        n: sql<number>`count(*)`,
      })
      .from(questions)
      .where(and(...baseConditions))
      .groupBy(questions.type, questions.categoryId),
  ]);

  const hasMore = items.length > PAGE_SIZE;
  const pageItems = items.slice(0, PAGE_SIZE).map((r) => ({
    ...r,
    avgMs: r.timesAsked > 0 ? Math.round(r.totalMs / r.timesAsked) : null,
    choiceCount: Number(r.choiceCount),
    multiSelect: Number(r.correctChoiceCount) > 1,
    openAnswerCount: Number(r.openAnswerCount),
  }));

  const byType: Partial<Record<QuestionType, number>> = {};
  const byCategory: Record<string, number> = {};
  for (const row of facetRows) {
    byType[row.type] = (byType[row.type] ?? 0) + Number(row.n);
    byCategory[row.categoryId] = (byCategory[row.categoryId] ?? 0) + Number(row.n);
  }

  return {
    items: pageItems,
    total: Number(totalRows[0]?.n ?? 0),
    facets: { byType, byCategory },
    hasMore,
  };
}

export interface QuestionAuthorOption {
  id: string;
  username: string;
  displayName: string;
}

/** Distinct authors with at least one question — feeds the library's author filter. */
export async function listQuestionAuthors(): Promise<QuestionAuthorOption[]> {
  const rows = await db
    .selectDistinct({ id: users.id, username: users.username, displayName: users.displayName })
    .from(questions)
    .innerJoin(users, eq(questions.authorId, users.id))
    .orderBy(asc(users.displayName));
  return rows;
}
