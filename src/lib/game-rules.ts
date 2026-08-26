/**
 * A category needs at least this many published questions before a host can pick it for a random
 * game. Below it, the category is a trap rather than a choice: the draw gives every category an
 * equal share (see `server/game/question-selection.ts`), so a category holding one question would
 * serve that same question in literally every game it takes part in.
 *
 * Shared by the lobby UI (which greys the category out) and the selection query (which leaves it
 * out of the implicit "all categories" pool) — those two must never disagree.
 */
export const MIN_QUESTIONS_PER_CATEGORY = 15;

/**
 * Per-type time floors, applied when the room has no explicit override for that type.
 *
 * The room's flat "20s / question" is fine for a multiple-choice question and impossible for a
 * six-item drag-to-order one: in the first real game, nobody finished a `sort` question, and
 * every single answer scored zero — not because the players were wrong, but because they ran out
 * of time reordering. A type whose answer takes physical manipulation needs a different budget
 * from one you answer by tapping.
 *
 * Only a default, never a cap: an explicit per-type value in `timeLimitByType` still wins, so a
 * host who deliberately wants 15-second sort questions can have them.
 */
export const DEFAULT_TIME_LIMIT_S_BY_TYPE: Partial<Record<string, number>> = {
  sort: 45,
};

/** The room's flat default, the per-type default, or the flat value — in that order. */
export function resolveTimeLimitS(
  type: string,
  flatTimeLimitS: number,
  byType: Partial<Record<string, number>> | undefined,
): number {
  return byType?.[type] ?? DEFAULT_TIME_LIMIT_S_BY_TYPE[type] ?? flatTimeLimitS;
}
