import { randomInt } from "node:crypto";

/**
 * Unambiguous alphabet — no 0/O, 1/I/L confusion — brief §5 (rooms.code).
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Generates a code and retries against a caller-supplied uniqueness check
 * (e.g. a DB lookup) until it finds one that isn't taken — brief §14:
 * "collision retry".
 */
export async function generateUniqueRoomCode(
  isTaken: (code: string) => Promise<boolean>,
  maxAttempts = 10,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateRoomCode();
    if (!(await isTaken(code))) return code;
  }
  throw new Error("Could not generate a unique room code after several attempts.");
}
