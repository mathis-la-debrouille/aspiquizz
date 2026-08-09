import { z } from "zod";

/** Shared between the edit-profile form (client) and updateProfileAction (server). */
export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Le nom affiché est requis.")
    .max(40, "40 caractères maximum."),
  bio: z
    .string()
    .trim()
    .max(280, "280 caractères maximum.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
