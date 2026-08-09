import { z } from "zod";

/**
 * Shared between the login form (client) and the loginAction server action
 * — one schema, both sides of the trust boundary. See CLAUDE.md conventions.
 */
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Nom d'utilisateur requis."),
  password: z.string().min(1, "Mot de passe requis."),
});

export type LoginInput = z.infer<typeof loginSchema>;
