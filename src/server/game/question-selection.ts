import { sql, eq, and, gte, lte, inArray, asc } from "drizzle-orm";
import { db } from "@/server/db";
import { questions, quizQuestions, type QuestionType } from "@/server/db/schema";
import type { RoomConfigInput } from "@/lib/schemas/socket";
import { MIN_QUESTIONS_PER_CATEGORY } from "@/lib/game-rules";

export interface SelectedQuestion {
  questionId: string;
  /** The caller resolves this to a duration via config.timeLimitByType/timeLimitS — duration is
   *  a room-setup decision, not a property of the question itself (Addendum B.2). */
  type: QuestionType;
}

interface Candidate extends SelectedQuestion {
  categoryId: string;
}

/** Fisher-Yates, in place. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = items[i] as T;
    items[i] = items[j] as T;
    items[j] = swap;
  }
  return items;
}

/**
 * Draws `count` questions giving every category an equal share, not a share proportional to how
 * many questions it holds. A flat `ORDER BY RANDOM()` over the whole pool made a 15-question game
 * roughly 10 geo questions, because geo has ~525 published questions and most other categories
 * have ten or fewer — the draw was fair per *question*, which is exactly what we don't want.
 *
 * Round-robin over the categories: one question each, then a second each, and so on. A category
 * that runs out just drops out of the rotation and the richer ones absorb the remainder, so a
 * thin category never blocks reaching `count`. Callers pass candidates already randomised within
 * each category — this function only decides how many come from where.
 */
export function drawBalanced(candidates: Candidate[], count: number): SelectedQuestion[] {
  const buckets = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = buckets.get(candidate.categoryId);
    if (bucket) bucket.push(candidate);
    else buckets.set(candidate.categoryId, [candidate]);
  }

  // Shuffled so that when `count` isn't a multiple of the category count, the leftover slots
  // don't always land on whichever category the database happened to return first.
  const rotation = shuffle([...buckets.values()]);
  const drawn: SelectedQuestion[] = [];

  while (drawn.length < count) {
    let drewThisPass = false;
    for (const bucket of rotation) {
      if (drawn.length >= count) break;
      const next = bucket.shift();
      if (!next) continue;
      drawn.push({ questionId: next.questionId, type: next.type });
      drewThisPass = true;
    }
    if (!drewThisPass) break; // every category is exhausted
  }

  // The round-robin order is category-by-category; a game shouldn't cycle through categories in
  // a visible pattern, so the final running order is shuffled.
  return shuffle(drawn);
}

export async function selectQuestionsForRoom(
  source: "quiz" | "random",
  quizId: string | null,
  config: RoomConfigInput,
): Promise<SelectedQuestion[]> {
  if (source === "quiz") {
    if (!quizId) throw new Error("quizId is required when source is 'quiz'.");
    const rows = await db
      .select({ questionId: quizQuestions.questionId, type: questions.type })
      .from(quizQuestions)
      .innerJoin(questions, eq(quizQuestions.questionId, questions.id))
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.position))
      .limit(config.questionCount);
    return rows;
  }

  const conditions = [
    eq(questions.status, "published" as const),
    gte(questions.difficulty, config.difficultyMin),
    lte(questions.difficulty, config.difficultyMax),
  ];
  if (config.categoryIds.length > 0) {
    conditions.push(inArray(questions.categoryId, config.categoryIds));
  } else {
    // "No category chosen" means every category, but a category too thin to be *pickable* in the
    // lobby must not sneak in through the default either — otherwise the one question in
    // Mythologie would still turn up in every single game. Same threshold, same count (published,
    // ignoring the difficulty window) as the lobby's greyed-out checkboxes.
    const eligible = await db
      .select({ id: questions.categoryId })
      .from(questions)
      .where(eq(questions.status, "published" as const))
      .groupBy(questions.categoryId)
      .having(gte(sql<number>`count(*)`, MIN_QUESTIONS_PER_CATEGORY));
    // On a young database no category clears the bar yet; a playable game beats an empty one.
    if (eligible.length > 0) {
      conditions.push(
        inArray(
          questions.categoryId,
          eligible.map((row) => row.id),
        ),
      );
    }
  }

  // Randomise inside each category in SQL and keep at most `questionCount` per category: that is
  // the most a single category could ever contribute, so nothing useful is cut, and the rows read
  // stay bounded by (categories × questionCount) instead of the whole published pool.
  const ranked = db
    .select({
      questionId: questions.id,
      type: questions.type,
      categoryId: questions.categoryId,
      rank: sql<number>`row_number() over (partition by ${questions.categoryId} order by RANDOM())`.as(
        "rank",
      ),
    })
    .from(questions)
    .where(and(...conditions))
    .as("ranked");

  const candidates = await db
    .select({
      questionId: ranked.questionId,
      type: ranked.type,
      categoryId: ranked.categoryId,
    })
    .from(ranked)
    .where(lte(ranked.rank, config.questionCount))
    .orderBy(asc(ranked.rank));

  return drawBalanced(candidates, config.questionCount);
}
