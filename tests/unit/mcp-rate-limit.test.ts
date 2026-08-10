import { describe, expect, it } from "vitest";
import {
  checkAndRecordRequestRate,
  questionCreationBudget,
  recordQuestionCreated,
  checkAndRecordCategoryMutationRate,
} from "@/server/mcp/rate-limit";

// Each test uses its own unique token id — the limiter's state is a module-level Map keyed by
// token id, so distinct ids keep tests isolated from each other without needing a reset hook.
let counter = 0;
function freshTokenId(): string {
  counter += 1;
  return `test-token-${counter}`;
}

describe("checkAndRecordRequestRate — 60 requests/minute per token (C.3/C.8)", () => {
  it("allows exactly 60 requests, then rejects the 61st with a retryAfterS", () => {
    const tokenId = freshTokenId();
    for (let i = 0; i < 60; i++) {
      expect(checkAndRecordRequestRate(tokenId)).toEqual({ ok: true });
    }
    const result = checkAndRecordRequestRate(tokenId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterS).toBeGreaterThan(0);
  });

  it("a different token has its own independent budget", () => {
    const a = freshTokenId();
    const b = freshTokenId();
    for (let i = 0; i < 60; i++) checkAndRecordRequestRate(a);
    expect(checkAndRecordRequestRate(a).ok).toBe(false);
    expect(checkAndRecordRequestRate(b).ok).toBe(true);
  });
});

describe("questionCreationBudget/recordQuestionCreated — 200 questions/24h per token (C.3/C.8)", () => {
  it("budget starts at 200 and drops to 0 exactly after 200 recorded creations", () => {
    const tokenId = freshTokenId();
    expect(questionCreationBudget(tokenId)).toBe(200);
    for (let i = 0; i < 200; i++) recordQuestionCreated(tokenId);
    expect(questionCreationBudget(tokenId)).toBe(0);
  });

  it("a 201st question is refused by budget reaching zero", () => {
    const tokenId = freshTokenId();
    for (let i = 0; i < 200; i++) recordQuestionCreated(tokenId);
    expect(questionCreationBudget(tokenId)).toBeLessThanOrEqual(0);
  });
});

describe("checkAndRecordCategoryMutationRate — 20 category mutations/24h per token (C.5)", () => {
  it("allows exactly 20, then rejects the 21st", () => {
    const tokenId = freshTokenId();
    for (let i = 0; i < 20; i++) {
      expect(checkAndRecordCategoryMutationRate(tokenId)).toEqual({ ok: true });
    }
    expect(checkAndRecordCategoryMutationRate(tokenId).ok).toBe(false);
  });
});
