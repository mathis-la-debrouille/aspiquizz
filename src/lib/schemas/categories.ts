import { z } from "zod";

/**
 * The lightweight, open-to-everyone creation shape (Addendum B.1) — deliberately not the same
 * schema as admin's fuller `categorySchema` (lib/schemas/admin.ts), which lets an admin set an
 * explicit slug/position when managing categories from /admin. Here the slug is always derived
 * server-side from the name (never trust a client-sent slug) and position always auto-appends.
 */
export const createCategorySchema = z.object({
  name: z.string().trim().min(2, "2 caractères minimum.").max(32, "32 caractères maximum."),
  colorToken: z.enum(["moss", "gold", "clay", "plum"]),
  description: z
    .string()
    .trim()
    // 400, not 200: a category description now carries the difficulty ladder
    // (what tiers 1-5 mean for that category), which does not fit in 200.
    .max(400, "400 caractères maximum.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
