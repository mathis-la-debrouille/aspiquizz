/**
 * In-memory, per-process rate limiting for /mcp (Addendum C.3) — sliding windows of timestamps
 * per token id, same "per-process Map, resets on restart" tradeoff already made for live game
 * state (server/game/engine.ts's `RoomState` Map) and accepted there for the same reason: this
 * app runs as one process, at a scale where persisting counters to the DB would be pure overhead.
 * A restart resetting a token's budget early is a non-issue at this app's size.
 */

const REQUEST_WINDOW_MS = 60_000;
const REQUEST_LIMIT = 60;
const QUESTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const QUESTION_LIMIT = 200;
const CATEGORY_MUTATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const CATEGORY_MUTATION_LIMIT = 20;

export type RateLimitCheck = { ok: true } | { ok: false; retryAfterS: number };

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  return timestamps.filter((t) => now - t < windowMs);
}

function retryAfterFrom(timestamps: number[], windowMs: number, now: number): number {
  const oldest = timestamps[0];
  if (oldest === undefined) return Math.ceil(windowMs / 1000);
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

// ---------------------------------------------------------------------------
// 60 requests/minute per token — checked once per /mcp HTTP request (not per JSON-RPC message
// inside it), matching the addendum's literal wording and C.8's "61 requests in a minute" test.
// ---------------------------------------------------------------------------

const requestLog = new Map<string, number[]>();

export function checkAndRecordRequestRate(tokenId: string): RateLimitCheck {
  const now = Date.now();
  const arr = prune(requestLog.get(tokenId) ?? [], REQUEST_WINDOW_MS, now);
  if (arr.length >= REQUEST_LIMIT) {
    requestLog.set(tokenId, arr);
    return { ok: false, retryAfterS: retryAfterFrom(arr, REQUEST_WINDOW_MS, now) };
  }
  arr.push(now);
  requestLog.set(tokenId, arr);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 200 questions created / rolling 24h per token — checked against the number of questions a
// tool call is *about* to create (so a batch can be partially throttled rather than an
// all-or-nothing reject), recorded once per question actually inserted.
// ---------------------------------------------------------------------------

const questionLog = new Map<string, number[]>();

export function questionCreationBudget(tokenId: string): number {
  const now = Date.now();
  const arr = prune(questionLog.get(tokenId) ?? [], QUESTION_WINDOW_MS, now);
  questionLog.set(tokenId, arr);
  return QUESTION_LIMIT - arr.length;
}

export function questionCreationRetryAfterS(tokenId: string): number {
  const now = Date.now();
  const arr = prune(questionLog.get(tokenId) ?? [], QUESTION_WINDOW_MS, now);
  return retryAfterFrom(arr, QUESTION_WINDOW_MS, now);
}

export function recordQuestionCreated(tokenId: string): void {
  const arr = questionLog.get(tokenId) ?? [];
  arr.push(Date.now());
  questionLog.set(tokenId, arr);
}

// ---------------------------------------------------------------------------
// 20 category mutations / rolling 24h per token — creer_categorie, modifier_categorie,
// fusionner_categories, supprimer_categorie each count as one.
// ---------------------------------------------------------------------------

const categoryMutationLog = new Map<string, number[]>();

export function checkAndRecordCategoryMutationRate(tokenId: string): RateLimitCheck {
  const now = Date.now();
  const arr = prune(categoryMutationLog.get(tokenId) ?? [], CATEGORY_MUTATION_WINDOW_MS, now);
  if (arr.length >= CATEGORY_MUTATION_LIMIT) {
    categoryMutationLog.set(tokenId, arr);
    return { ok: false, retryAfterS: retryAfterFrom(arr, CATEGORY_MUTATION_WINDOW_MS, now) };
  }
  arr.push(now);
  categoryMutationLog.set(tokenId, arr);
  return { ok: true };
}
