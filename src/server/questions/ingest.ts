/**
 * The single question-insertion path — Addendum C.1. Every entry point that can create a
 * question (the web authoring forms, MCP's `creer_question`/`creer_questions_en_lot`, and any
 * future bulk-JSON import) calls `createQuestionFromDraft`. There is no other `insert(questions)`
 * call anywhere else in the codebase for creation (edits go through the existing per-type
 * `updateXQuestion` actions in server/questions/actions.ts, which is a different, already-
 * permission-checked operation on a question that already exists).
 *
 * image type is out of scope here entirely (C.6: no upload channel exists off the web form) —
 * server/questions/actions.ts's createImageQuestion remains the only path for that type and is
 * deliberately NOT rewired through this module, since ingest.ts's QuestionDraft schema has no
 * image variant to route it through. sort is *partially* in scope: MCP/import can create the
 * text-only variant here (no mediaId field exists on sortDraftSchema's items at all — same
 * reason image is fully excluded, just narrower), but createSortQuestion/updateSortQuestion in
 * actions.ts remain the only path for a sort question whose items carry uploaded images.
 * estimation is fully in scope, unlike either of those — a number and an optional unit label
 * carry no media, so createEstimationQuestion in actions.ts routes through here too rather than
 * inserting directly.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  questions,
  questionChoices,
  questionOpenAnswers,
  questionGeo,
  questionSortItems,
  questionEstimation,
  countryCapitals,
  categories,
  type QuestionSource,
  type QuestionStatus,
  type ColorToken,
  type ViewBbox,
} from "@/server/db/schema";
import { normalizeAnswer, damerauLevenshtein } from "@/server/game/grading";
import { normalizeForComparison } from "@/server/categories/slug";
import { createCategoryCore } from "@/server/categories/core";
import { resolveCountry, type FullCountryRow } from "@/server/geo/resolve";
import { questionDraftSchema } from "@/lib/schemas/ingest";

const DEFAULT_POINTS_BASE = 1000;

export interface IngestWarning {
  code: "duplicate_prompt";
  message: string;
  questionId: string;
  prompt: string;
}

export interface IngestError {
  code:
    | "image_not_supported"
    | "validation"
    | "unknown_category"
    | "category_create_failed"
    | "unknown_country"
    | "duplicate_choices"
    | "no_correct_choice"
    | "duplicate_items";
  message: string;
  /** Populated for unknown_country — up to 3 nearest countries by name, so the caller can retry. */
  suggestions?: string[];
  /** Populated for unknown_category when creation isn't allowed. */
  validCategories?: string[];
}

/** The human web form's own richer geo-authoring capability (target picked directly on the map,
 *  cadrage/viewBbox, editable accepted answers, strict toggle — Addendum B.3) doesn't fit
 *  `QuestionDraft`'s narrow, auto-suggest-only MCP shape (name-only `pays`, no viewBbox, no
 *  editable answers). Rather than fork the insert path (which the C.8 acceptance criterion
 *  explicitly forbids — grep for `insert(questions)` must find exactly one call site), the web
 *  form's createGeoQuestion still calls createQuestionFromDraft, but with this override supplied
 *  through `ctx` — never reachable from MCP or import, since neither ever constructs one. When
 *  present, country-name resolution is skipped entirely and these values are used verbatim. */
export interface ManualGeoOverride {
  targetIso3: string;
  acceptedAnswers: string[];
  viewBbox: ViewBbox | null;
  strict: boolean;
}

export type IngestContext = {
  authorId: string;
  source: QuestionSource;
  /** Defaults true — any authenticated caller may create a new category by name inline (mirrors
   *  Addendum B.1's "any logged-in user may create categories" web rule). Set false to require an
   *  existing category (id or exact name) and error with the valid-name list instead — not
   *  currently wired to any caller, kept for the behaviour the addendum's prose describes. */
  allowCreateCategory?: boolean;
  /** Only honoured when `source === 'manual'` — a human choosing to publish immediately from the
   *  web form. MCP and import always get 'draft' regardless of this field (the addendum's
   *  non-negotiable: no parameter lets a model publish directly), enforced below, not just by
   *  omission at the call site. */
  initialStatus?: QuestionStatus;
  manualGeo?: ManualGeoOverride;
};

export type IngestResult =
  | { ok: true; questionId: string; warnings: IngestWarning[] }
  | { ok: false; errors: IngestError[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * `draft` is deliberately typed `unknown`, not `QuestionDraft` — parsing untrusted input is step
 * 1 of the addendum's own algorithm, so the type system shouldn't pretend that already happened
 * before this function runs. Every MCP tool call, the (future) bulk import, and the web form all
 * hand this raw, unvalidated JSON.
 */
export async function createQuestionFromDraft(
  draft: unknown,
  ctx: IngestContext,
): Promise<IngestResult> {
  // image gets a specific, actionable error before the generic discriminated-union parse would
  // otherwise just say "invalid discriminator value" — C.6.
  if (isRecord(draft) && draft["type"] === "image") {
    return {
      ok: false,
      errors: [
        {
          code: "image_not_supported",
          message:
            "Les questions de type image ne peuvent pas être créées par ce canal — une image doit être choisie et téléversée par un humain. Utilisez le formulaire web.",
        },
      ],
    };
  }
  const parsed = questionDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "validation",
        message: `${issue.path.join(".") || "draft"} : ${issue.message}`,
      })),
    };
  }
  const data = parsed.data;

  const categoryResult = await resolveCategory(data.categorie, ctx.allowCreateCategory ?? true);
  if (!categoryResult.ok) return { ok: false, errors: [categoryResult.error] };

  let geoCountry: FullCountryRow | null = null;
  if (data.type === "geo" && !ctx.manualGeo) {
    const resolution = await resolveCountry(data.pays);
    if (!resolution.match) {
      return {
        ok: false,
        errors: [
          {
            code: "unknown_country",
            message: `Pays introuvable : « ${data.pays} ».`,
            suggestions: resolution.closest.map((c) => c.nameFr),
          },
        ],
      };
    }
    geoCountry = resolution.match;
  }

  if (data.type === "mcq") {
    const labels = data.choix.map((c) => c.texte.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      return {
        ok: false,
        errors: [{ code: "duplicate_choices", message: "Les options doivent être uniques." }],
      };
    }
    if (!data.choix.some((c) => c.correct)) {
      return {
        ok: false,
        errors: [{ code: "no_correct_choice", message: "Au moins une option doit être correcte." }],
      };
    }
  }

  if (data.type === "sort") {
    const labels = data.elements.map((e) => e.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      return {
        ok: false,
        errors: [{ code: "duplicate_items", message: "Les éléments doivent être uniques." }],
      };
    }
  }

  const warnings: IngestWarning[] = [];
  const dup = await findSimilarPrompt(data.enonce);
  if (dup) {
    warnings.push({
      code: "duplicate_prompt",
      message: `Une question très similaire existe déjà : « ${dup.prompt} ».`,
      questionId: dup.id,
      prompt: dup.prompt,
    });
  }

  // Resolved before the transaction opens: for find_capital this reads
  // country_capitals, and issuing that query inside the tx callback would be a
  // second connection against a held write transaction.
  const geoAccepted: GeoAccepted =
    data.type === "geo"
      ? ctx.manualGeo?.acceptedAnswers
        ? {
            all: ctx.manualGeo.acceptedAnswers,
            canonicalCount: ctx.manualGeo.acceptedAnswers.length,
          }
        : await geoAcceptedAnswers(data.mode, geoCountry!)
      : { all: [], canonicalCount: 0 };

  // Insert inside a transaction — a question with no choices/answers/geo row is unplayable and
  // must never be observable half-written.
  const questionId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(questions)
      .values({
        type: data.type,
        prompt: data.enonce,
        hint: data.indice ?? null,
        explanation: data.explication ?? null,
        categoryId: categoryResult.categoryId,
        // Never read off the draft — the model must never set its own author, id, status, or
        // points (C.1 step 4). Every one of these is supplied by ingest.ts itself.
        authorId: ctx.authorId,
        difficulty: data.difficulte,
        pointsBase: DEFAULT_POINTS_BASE,
        strict:
          data.type === "open"
            ? (data.strict ?? false)
            : data.type === "geo"
              ? (ctx.manualGeo?.strict ?? false)
              : false,
        // Non-negotiable (C.1): only a 'manual' source may ever land as anything but 'draft',
        // and only via an explicit choice — MCP/import ignore initialStatus entirely, by this
        // condition, not merely by their call sites never setting it.
        status: ctx.source === "manual" ? (ctx.initialStatus ?? "draft") : "draft",
        source: ctx.source,
      })
      .returning({ id: questions.id });
    const newId = row!.id;

    if (data.type === "open") {
      await tx
        .insert(questionOpenAnswers)
        .values(
          data.reponses.map((value, i) => ({ questionId: newId, value, isPrimary: i === 0 })),
        );
    } else if (data.type === "mcq") {
      await tx.insert(questionChoices).values(
        data.choix.map((c, position) => ({
          questionId: newId,
          label: c.texte,
          isCorrect: c.correct,
          position,
        })),
      );
    } else if (data.type === "geo") {
      const targetIso3 = ctx.manualGeo?.targetIso3 ?? geoCountry!.iso3;
      const accepted = geoAccepted.all;
      await tx.insert(questionGeo).values({
        questionId: newId,
        mode: data.mode,
        targetIso3,
        extraIso3: [],
        viewBbox: ctx.manualGeo?.viewBbox ?? null,
        showLabels: data.afficherNoms ?? false,
        showNeighbours: data.afficherVoisins ?? true,
      });
      if (accepted.length > 0) {
        await tx.insert(questionOpenAnswers).values(
          // isPrimary marks the CANONICAL answers, not just the first one: the
          // reveal prints only these, so a Bolivia reveal reads "Sucre ou La Paz"
          // and not "… ou The Illustrious and Heroic Sucre".
          accepted.map((value, i) => ({
            questionId: newId,
            value,
            isPrimary: i < geoAccepted.canonicalCount,
          })),
        );
      }
    } else if (data.type === "sort") {
      // data.elements is already top-to-bottom in the CORRECT order — position is just each
      // element's index in it. mediaId is always null here: sortDraftSchema has no field for
      // one at all, MCP having no image upload path (see this module's own doc comment).
      await tx.insert(questionSortItems).values(
        data.elements.map((label, position) => ({
          questionId: newId,
          label,
          mediaId: null,
          position,
        })),
      );
    } else if (data.type === "estimation") {
      await tx.insert(questionEstimation).values({
        questionId: newId,
        correctValue: data.valeur,
        toleranceType: data.typeTolerance,
        toleranceValue: data.tolerance,
        unit: data.unite ?? null,
      });
    }

    return newId;
  });

  return { ok: true, questionId, warnings };
}

// ---------------------------------------------------------------------------
// Category resolution — accept an id or a name; create-if-new (B.1 parity).
// ---------------------------------------------------------------------------

type CategoryResolution = { ok: true; categoryId: string } | { ok: false; error: IngestError };

async function resolveCategory(input: string, allowCreate: boolean): Promise<CategoryResolution> {
  const byId = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, input))
    .limit(1);
  if (byId[0]) return { ok: true, categoryId: byId[0].id };

  const all = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const normalizedInput = normalizeForComparison(input);
  const existing = all.find((c) => normalizeForComparison(c.name) === normalizedInput);
  if (existing) return { ok: true, categoryId: existing.id };

  if (!allowCreate) {
    return {
      ok: false,
      error: {
        code: "unknown_category",
        message: `Catégorie inconnue : « ${input} ».`,
        validCategories: all.map((c) => c.name),
      },
    };
  }

  const created = await createCategoryCore({
    name: input,
    colorToken: pickColorToken(input),
    description: undefined,
  });
  if (!created.ok) {
    // A concurrent request created the same name between our check above and now — that's a
    // successful resolution, not an ingest failure.
    if (created.existingCategoryId) return { ok: true, categoryId: created.existingCategoryId };
    return {
      ok: false,
      error: { code: "category_create_failed", message: created.error },
    };
  }
  return { ok: true, categoryId: created.category.id };
}

const COLOR_TOKENS: ColorToken[] = ["moss", "gold", "clay", "plum"];

/** No colour is specified when a category is created inline from a question's `categorie` name
 *  (unlike the dedicated `creer_categorie` tool, which takes an explicit `couleur`) — deterministic
 *  per name rather than always the same token, so a batch of auto-created categories isn't
 *  monochrome. Not meant to be meaningful, just varied. Exported — the MCP `creer_categorie` tool
 *  reuses it as the fallback when `couleur` is omitted. */
export function pickColorToken(name: string): ColorToken {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return COLOR_TOKENS[sum % COLOR_TOKENS.length]!;
}

// ---------------------------------------------------------------------------
// Geo auto-fill — capital/name are always taken from `countries`, never the caller.
// ---------------------------------------------------------------------------

interface GeoAccepted {
  /** Everything that grades as correct: canonical names then spelling variants. */
  all: string[];
  /** How many leading entries of `all` are canonical — the rest are variants. */
  canonicalCount: number;
}

async function geoAcceptedAnswers(mode: string, country: FullCountryRow): Promise<GeoAccepted> {
  if (mode === "find_capital") {
    // EVERY capital counts, not just the canonical one. Bolivia's constitutional
    // capital is Sucre and its seat of government is La Paz; a player answering
    // La Paz is not wrong, and marking them wrong is the kind of call that starts
    // an argument instead of teaching anyone anything. The reveal explains the
    // distinction — see country_capitals.role.
    const rows = await db
      .select({ nameFr: countryCapitals.nameFr, aliases: countryCapitals.aliases })
      .from(countryCapitals)
      .where(eq(countryCapitals.countryIso3, country.iso3))
      .orderBy(countryCapitals.position);
    if (rows.length > 0) {
      const canonical = rows.map((r) => r.nameFr);
      const variants = rows.flatMap((r) => r.aliases ?? []);
      return { all: [...canonical, ...variants], canonicalCount: canonical.length };
    }
    const single = country.capitalFr ? [country.capitalFr] : [];
    return { all: single, canonicalCount: single.length };
  }
  if (mode === "name_country" || mode === "name_from_shape" || mode === "name_from_flag") {
    return { all: [country.nameFr], canonicalCount: 1 };
  }
  return { all: [], canonicalCount: 0 };
}

// ---------------------------------------------------------------------------
// Dedup — no real FTS5 (see DECISIONS.md, same call as the library's search); a normalized
// edit-distance nearest-neighbour scan is plenty accurate at this app's question-pool scale and
// needs no extra index.
// ---------------------------------------------------------------------------

async function findSimilarPrompt(prompt: string): Promise<{ id: string; prompt: string } | null> {
  const target = normalizeAnswer(prompt);
  const rows = await db.select({ id: questions.id, prompt: questions.prompt }).from(questions);

  let best: { id: string; prompt: string; distance: number } | null = null;
  for (const row of rows) {
    const distance = damerauLevenshtein(target, normalizeAnswer(row.prompt));
    if (!best || distance < best.distance) best = { ...row, distance };
  }
  if (!best) return null;

  // A full-sentence prompt gets a looser, length-proportional budget than grading.ts's
  // single-word fuzzyThreshold (§7) — roughly 15% of the normalized length, floor of 3.
  const threshold = Math.max(3, Math.round(target.length * 0.15));
  return best.distance <= threshold ? { id: best.id, prompt: best.prompt } : null;
}
