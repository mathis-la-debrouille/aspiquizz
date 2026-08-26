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
