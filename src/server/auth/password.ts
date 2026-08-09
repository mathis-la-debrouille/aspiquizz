import { hash, verify } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";

/**
 * argon2id — Node's `crypto.scrypt` would also work, but argon2id is the
 * brief's locked choice (§3) and @node-rs/argon2 ships sane defaults.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return verify(passwordHash, password);
}

/**
 * A real argon2id hash of a random, never-reused value — computed once per
 * process and reused for every "user not found" login attempt, so that
 * path takes the same time as a real "wrong password" verify. Without this,
 * a missing-user response returns near-instantly while a wrong-password
 * response takes an argon2 verify's worth of time, leaking account
 * existence through a timing side channel. See brief §9.
 */
let dummyHashPromise: Promise<string> | null = null;

export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hash(randomUUID());
  return dummyHashPromise;
}
