import { describe, expect, it } from "vitest";
import { generateRoomCode, generateUniqueRoomCode } from "@/server/game/room-code";

const AMBIGUOUS_CHARS = ["0", "O", "1", "I", "L"];

describe("generateRoomCode", () => {
  it("is 6 characters long", () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it("never contains ambiguous characters", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      for (const ch of AMBIGUOUS_CHARS) {
        expect(code).not.toContain(ch);
      }
    }
  });

  it("only contains uppercase letters and digits", () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });

  it("produces varied output (not a constant)", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("generateUniqueRoomCode", () => {
  it("returns a code immediately when nothing is taken", async () => {
    const code = await generateUniqueRoomCode(async () => false);
    expect(code).toHaveLength(6);
  });

  it("retries on collision until an available code is found", async () => {
    let calls = 0;
    const taken = new Set<string>();
    const code = await generateUniqueRoomCode(async (c) => {
      calls++;
      if (calls <= 3) {
        taken.add(c);
        return true; // simulate a collision for the first 3 attempts
      }
      return taken.has(c);
    });
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(taken.has(code)).toBe(false);
  });

  it("throws after exhausting max attempts against an always-taken checker", async () => {
    await expect(generateUniqueRoomCode(async () => true, 5)).rejects.toThrow();
  });
});
