import { z } from "zod";

export const API_TOKEN_SCOPES = ["questions:read", "questions:write", "categories:write"] as const;

export const TOKEN_EXPIRY_OPTIONS = [30, 90, 180, "never"] as const;

export const createTokenSchema = z.object({
  name: z.string().trim().min(2, "2 caractères minimum.").max(60, "60 caractères maximum."),
  scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1, "Choisissez au moins une portée."),
  expiryDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal("never")]),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;
