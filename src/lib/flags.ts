/**
 * What a player can say when reporting a question. Shared by the report dialog (client) and
 * the input schema (server), so the length cap and the wording live in one place.
 *
 * The reason is stored as one line of free text — the tags are a shortcut for the common
 * cases, not a taxonomy anyone queries — which is why no migration was needed to add them:
 * `question_flags.reason` has been a nullable text column since reports were introduced.
 */

export const FLAG_REASON_MAX = 500;

export const FLAG_TAGS = [
  { id: "wrong_answer", label: "Réponse fausse" },
  { id: "other_answer", label: "Ma réponse aurait dû compter" },
  { id: "ambiguous", label: "Question ambiguë" },
  { id: "wrong_explanation", label: "Explication fausse" },
  { id: "outdated", label: "Plus à jour" },
  { id: "typo", label: "Faute ou coquille" },
] as const;

export type FlagTagId = (typeof FLAG_TAGS)[number]["id"];

const LABEL_BY_ID = new Map<string, string>(FLAG_TAGS.map((t) => [t.id, t.label]));

/**
 * Tags then comment, as the one line an admin reads: "Réponse fausse · Plus à jour — c'est
 * le PSG depuis 2025". Unknown tag ids are dropped, duplicates collapse, and the result is
 * capped at FLAG_REASON_MAX. Returns null when there is nothing to say, so a bare report
 * stays a bare report rather than an empty string.
 */
export function composeFlagReason(tags: readonly string[], comment: string): string | null {
  const labels = [...new Set(tags)]
    .map((id) => LABEL_BY_ID.get(id))
    .filter((l): l is string => Boolean(l));
  const text = comment.replace(/\s+/g, " ").trim();
  const head = labels.join(" · ");
  const joined = head && text ? `${head} — ${text}` : head || text;
  if (!joined) return null;
  return joined.length > FLAG_REASON_MAX ? `${joined.slice(0, FLAG_REASON_MAX - 1)}…` : joined;
}
