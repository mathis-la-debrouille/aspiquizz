import { z } from "zod";
import { geoModeSchema } from "@/lib/schemas/questions";

/**
 * `QuestionDraft` — Addendum C.1/C.5's one shape for every non-image question submitted through
 * `createQuestionFromDraft` (src/server/questions/ingest.ts), whether that call originates from
 * an MCP tool, a future bulk-JSON import, or (translated from the existing authoring forms) the
 * web UI. Field names are the French ones the MCP tools expose directly (`enonce`, `categorie`,
 * `difficulte`, …) — the model reads the tool's input schema and this *is* that schema, so there
 * is no separate English-named twin to keep in sync.
 *
 * Deliberately excludes anything the addendum says a caller must never control: no `statut`/
 * `status`, no `id`, no `authorId`, no `pointsBase`. Zod's default (non-`.passthrough()`) object
 * parsing already strips any such field silently if present — ingest.ts additionally never reads
 * those fields off the parsed draft even defensively, always supplying them itself.
 */

const questionDraftCommonSchema = z.object({
  enonce: z.string().trim().min(8, "8 caractères minimum.").max(280, "280 caractères maximum."),
  /** A category id, or a name (existing or new — resolved by ingest.ts). */
  categorie: z.string().trim().min(1, "Catégorie requise."),
  difficulte: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  indice: z.string().trim().max(280).optional(),
  explication: z.string().trim().max(1000).optional(),
});

export const openDraftSchema = questionDraftCommonSchema.extend({
  type: z.literal("open"),
  reponses: z.array(z.string().trim().min(1)).min(1, "Une réponse minimum.").max(8, "8 réponses maximum."),
  strict: z.boolean().optional(),
});

export const mcqDraftSchema = questionDraftCommonSchema.extend({
  type: z.literal("mcq"),
  choix: z
    .array(z.object({ texte: z.string().trim().min(1).max(120), correct: z.boolean() }))
    .min(2, "Deux options minimum.")
    .max(6, "Six options maximum."),
});

export const geoDraftSchema = questionDraftCommonSchema.extend({
  type: z.literal("geo"),
  mode: geoModeSchema,
  /** A French country NAME, never an iso code — resolved server-side against `countries`
   *  (never trusted for capital/population/accepted-answers, see ingest.ts). */
  pays: z.string().trim().min(1, "Pays requis."),
  afficherNoms: z.boolean().optional(),
  afficherVoisins: z.boolean().optional(),
});

export const sortDraftSchema = questionDraftCommonSchema.extend({
  type: z.literal("sort"),
  /** Text only, top to bottom in the CORRECT order — MCP has no image upload path (same reason
   *  the `image` type itself is entirely absent from this union), so every MCP-created sort
   *  question is the text-only variant; the web form is still the only way to attach images to
   *  items, and still the only way to edit an MCP-created one into having them. */
  elements: z
    .array(z.string().trim().min(1).max(120))
    .min(3, "Trois éléments minimum.")
    .max(6, "Six éléments maximum."),
});

export const questionDraftSchema = z.discriminatedUnion("type", [
  openDraftSchema,
  mcqDraftSchema,
  geoDraftSchema,
  sortDraftSchema,
]);

export type QuestionDraft = z.infer<typeof questionDraftSchema>;
export type OpenQuestionDraft = z.infer<typeof openDraftSchema>;
export type McqQuestionDraft = z.infer<typeof mcqDraftSchema>;
export type GeoQuestionDraft = z.infer<typeof geoDraftSchema>;
export type SortQuestionDraft = z.infer<typeof sortDraftSchema>;
