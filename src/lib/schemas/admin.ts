import { z } from "zod";

// Mirrors scripts/create-user.ts's own rules — the CLI and the admin UI create accounts the
// same way (brief §9: no public sign-up, this is the only other path).
const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_PATTERN, "3 à 24 caractères : minuscules, chiffres, tiret ou underscore."),
  password: z.string().min(8, "8 caractères minimum."),
  displayName: z
    .string()
    .trim()
    .max(40, "40 caractères maximum.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  role: z.enum(["admin", "player"]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

const SLUG_PATTERN = /^[a-z0-9-]{2,40}$/;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nom requis.").max(40, "40 caractères maximum."),
  slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN, "Minuscules, chiffres, tirets."),
  colorToken: z.enum(["moss", "gold", "clay", "plum"]),
  description: z
    .string()
    .trim()
    .max(200, "200 caractères maximum.")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  position: z.coerce.number().int().min(0).max(999),
});
export type CategoryInput = z.infer<typeof categorySchema>;
