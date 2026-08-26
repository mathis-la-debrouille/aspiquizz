import { describe, expect, it } from "vitest";
import { drawBalanced } from "@/server/game/question-selection";

function pool(spec: Record<string, number>) {
  return Object.entries(spec).flatMap(([categoryId, n]) =>
    Array.from({ length: n }, (_, i) => ({
      questionId: `${categoryId}-${i}`,
      type: "mcq" as const,
      categoryId,
    })),
  );
}

function countByCategory(ids: string[]) {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const category = id.slice(0, id.lastIndexOf("-"));
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

describe("drawBalanced", () => {
  it("gives every category an equal share when the count divides evenly", () => {
    const drawn = drawBalanced(pool({ geo: 20, histoire: 20, cinema: 20 }), 15);
    expect(drawn).toHaveLength(15);
    const counts = countByCategory(drawn.map((q) => q.questionId));
    expect([...counts.values()]).toEqual([5, 5, 5]);
  });

  it("does not let a huge category dominate a thin one", () => {
    // The bug this function exists for: geo holds ~525 published questions, most other
    // categories hold ten or fewer.
    const drawn = drawBalanced(pool({ geo: 525, histoire: 8, cinema: 6 }), 12);
    const counts = countByCategory(drawn.map((q) => q.questionId));
    expect(counts.get("geo")).toBe(4);
    expect(counts.get("histoire")).toBe(4);
    expect(counts.get("cinema")).toBe(4);
  });

  it("spreads leftover slots at most one apart when the count doesn't divide evenly", () => {
    const drawn = drawBalanced(pool({ geo: 20, histoire: 20, cinema: 20, sport: 20 }), 15);
    expect(drawn).toHaveLength(15);
    const counts = [...countByCategory(drawn.map((q) => q.questionId)).values()].sort();
    expect(counts).toEqual([3, 4, 4, 4]);
  });

  it("lets richer categories absorb what an exhausted one cannot supply", () => {
    const drawn = drawBalanced(pool({ geo: 525, mythologie: 1 }), 15);
    expect(drawn).toHaveLength(15);
    const counts = countByCategory(drawn.map((q) => q.questionId));
    expect(counts.get("mythologie")).toBe(1);
    expect(counts.get("geo")).toBe(14);
  });

  it("returns everything available rather than looping when the pool is too small", () => {
    const drawn = drawBalanced(pool({ geo: 3, histoire: 2 }), 15);
    expect(drawn).toHaveLength(5);
    expect(new Set(drawn.map((q) => q.questionId)).size).toBe(5);
  });

  it("never repeats a question", () => {
    const drawn = drawBalanced(pool({ geo: 525, histoire: 8, cinema: 6, sport: 30 }), 20);
    expect(new Set(drawn.map((q) => q.questionId)).size).toBe(20);
  });

  it("handles a single category", () => {
    const drawn = drawBalanced(pool({ geo: 525 }), 15);
    expect(drawn).toHaveLength(15);
  });

  it("handles an empty pool", () => {
    expect(drawBalanced([], 15)).toEqual([]);
  });
});
