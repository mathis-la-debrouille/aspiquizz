import { z } from "zod";

/**
 * Shared across the authoring forms (client) and the create/update server
 * actions (server) — one schema per boundary, per CLAUDE.md conventions.
 */

export const questionSharedSchema = z.object({
  categoryId: z.string().min(1, "Catégorie requise."),
  difficulty: z.coerce.number().int().min(1).max(5),
  // No timeLimitS here — duration is set at room creation, not authoring time (Addendum B.2).
  hint: z.string().trim().max(280).optional().or(z.literal("")),
  explanation: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["draft", "published"]),
});

export const openQuestionSchema = questionSharedSchema.extend({
  type: z.literal("open"),
  prompt: z.string().trim().min(3, "La question est trop courte.").max(300),
  strict: z.boolean().default(false),
  primaryAnswer: z.string().trim().min(1, "Une réponse principale est requise."),
  variants: z.array(z.string().trim().min(1)).max(20).default([]),
});

const choiceSchema = z.object({
  label: z.string().trim().min(1, "Une option ne peut pas être vide.").max(120),
  isCorrect: z.boolean(),
});

export const mcqQuestionSchema = questionSharedSchema
  .extend({
    type: z.literal("mcq"),
    prompt: z.string().trim().min(3, "La question est trop courte.").max(300),
    choices: z.array(choiceSchema).min(2, "Deux options minimum.").max(6, "Six options maximum."),
  })
  .refine((data) => data.choices.some((c) => c.isCorrect), {
    message: "Au moins une option doit être correcte.",
    path: ["choices"],
  })
  .refine(
    (data) => {
      const labels = data.choices.map((c) => c.label.trim().toLowerCase());
      return new Set(labels).size === labels.length;
    },
    { message: "Les options doivent être uniques.", path: ["choices"] },
  );

export const imageQuestionSchema = questionSharedSchema
  .extend({
    type: z.literal("image"),
    prompt: z.string().trim().min(3, "La question est trop courte.").max(300),
    mediaId: z.string().min(1, "Une image est requise."),
    answerMode: z.enum(["mcq", "open"]),
    strict: z.boolean().default(false),
    primaryAnswer: z.string().trim().optional().or(z.literal("")),
    variants: z.array(z.string().trim().min(1)).max(20).default([]),
    choices: z.array(choiceSchema).max(6).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.answerMode === "open" && !data.primaryAnswer) {
      ctx.addIssue({
        code: "custom",
        message: "Une réponse principale est requise.",
        path: ["primaryAnswer"],
      });
    }
    if (data.answerMode === "mcq") {
      if (data.choices.length < 2) {
        ctx.addIssue({ code: "custom", message: "Deux options minimum.", path: ["choices"] });
      }
      if (!data.choices.some((c) => c.isCorrect)) {
        ctx.addIssue({
          code: "custom",
          message: "Au moins une option doit être correcte.",
          path: ["choices"],
        });
      }
    }
  });

export const geoModeSchema = z.enum([
  "locate_country",
  "name_country",
  "find_capital",
  "capital_of",
  "name_from_shape",
  "name_from_flag",
]);

export const geoQuestionSchema = questionSharedSchema.extend({
  type: z.literal("geo"),
  prompt: z.string().trim().min(3, "La question est trop courte.").max(300),
  geoMode: geoModeSchema,
  strict: z.boolean().default(false),
  targetIso3: z.string().length(3, "Choisissez un pays cible."),
  acceptedAnswers: z.array(z.string().trim().min(1)).max(20).default([]),
  showLabels: z.boolean().default(false),
  showNeighbours: z.boolean().default(true),
  viewBbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable().default(null),
});

/** `label` is required on every item, even in image mode — see question_sort_items' own doc
 *  comment in schema.ts for why. `mediaId` null means a text-only item. */
const sortItemSchema = z.object({
  label: z.string().trim().min(1, "Un élément ne peut pas être vide.").max(120),
  mediaId: z.string().min(1).nullable(),
});

export const sortQuestionSchema = questionSharedSchema
  .extend({
    type: z.literal("sort"),
    prompt: z.string().trim().min(3, "La question est trop courte.").max(300),
    // Stored/submitted top-to-bottom in the CORRECT order — position is each item's index here,
    // never a separate field the author sets directly (nothing to get out of sync).
    items: z
      .array(sortItemSchema)
      .min(3, "Trois éléments minimum.")
      .max(6, "Six éléments maximum."),
  })
  .refine(
    (data) => {
      const labels = data.items.map((i) => i.label.trim().toLowerCase());
      return new Set(labels).size === labels.length;
    },
    { message: "Les éléments doivent être uniques.", path: ["items"] },
  );

export const questionFormSchema = z.discriminatedUnion("type", [
  openQuestionSchema,
  mcqQuestionSchema,
  imageQuestionSchema,
  geoQuestionSchema,
  sortQuestionSchema,
]);

export type QuestionFormInput = z.infer<typeof questionFormSchema>;
export type OpenQuestionInput = z.infer<typeof openQuestionSchema>;
export type McqQuestionInput = z.infer<typeof mcqQuestionSchema>;
export type ImageQuestionInput = z.infer<typeof imageQuestionSchema>;
export type GeoQuestionInput = z.infer<typeof geoQuestionSchema>;
export type SortQuestionInput = z.infer<typeof sortQuestionSchema>;

// ---------------------------------------------------------------------------
// Quiz builder
// ---------------------------------------------------------------------------

export const quizFormSchema = z.object({
  title: z.string().trim().min(3, "Le titre est trop court.").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  categoryId: z.string().optional().or(z.literal("")),
  status: z.enum(["draft", "published"]),
  questionIds: z.array(z.string()).min(1, "Ajoutez au moins une question."),
});

export type QuizFormInput = z.infer<typeof quizFormSchema>;
