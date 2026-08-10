/**
 * Every MCP tool, resource and prompt — Addendum C.5. `registerMcpTools` is called once per
 * session (src/server/mcp/transport.ts), binding all of it to the one authenticated caller
 * (`ctx`) that opened the connection — there is no per-call re-authentication of *identity*
 * beyond what the transport layer already did (C.3's token checks run on every HTTP request),
 * but every tool still re-checks *scope* and, for the four category-mutation tools, *role*,
 * since a token's scopes are the actual authorization boundary, not just a connection-time gate.
 *
 * All descriptions, parameter descriptions and returned messages are French (C.5) — the model
 * reads them and mirrors the language into the questions it writes.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, GetPromptResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { ApiTokenScope } from "@/server/db/schema";
import type { McpAuthContext } from "@/server/mcp/tokens";
import { hasScope } from "@/server/mcp/tokens";
import {
  checkAndRecordCategoryMutationRate,
  questionCreationBudget,
  questionCreationRetryAfterS,
  recordQuestionCreated,
} from "@/server/mcp/rate-limit";
import { logMcpToolCall } from "@/server/mcp/log";
import { writeAuditLog } from "@/server/audit/log";
import { listAllCategories } from "@/server/admin/queries";
import {
  createCategoryCore,
  updateCategoryCore,
  mergeCategoriesCore,
  deleteCategoryStrictCore,
} from "@/server/categories/actions";
import { createQuestionFromDraft, pickColorToken } from "@/server/questions/ingest";
import { questionDraftSchema } from "@/lib/schemas/ingest";
import {
  searchQuestionsForDedup,
  listMyDrafts,
  patchDraft,
  deleteDraft,
} from "@/server/questions/mcp-core";
import { resolveCountry } from "@/server/geo/resolve";
import { QUESTION_TYPES } from "@/lib/schemas/library";

// ---------------------------------------------------------------------------
// Shared helpers — scope/role guard, logging, small result builders.
// ---------------------------------------------------------------------------

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function guardTool(
  ctx: McpAuthContext,
  opts: { scope: ApiTokenScope; requireAdmin?: boolean },
): CallToolResult | null {
  if (!hasScope(ctx, opts.scope)) {
    return errorResult(
      `Ce jeton n'a pas la portée « ${opts.scope} » nécessaire pour cet outil. Portées actuelles : ${ctx.scopes.join(", ") || "aucune"}.`,
    );
  }
  if (opts.requireAdmin && ctx.role !== "admin") {
    return errorResult("Cet outil est réservé aux administrateurs.");
  }
  return null;
}

/** Wraps every tool body — measures duration and logs (token id, user id, tool name, argument
 *  byte size, outcome, duration; never the token itself, C.3) and turns a thrown error into a
 *  clean tool-error result instead of crashing the session. */
async function runTool(
  ctx: McpAuthContext,
  tool: string,
  args: unknown,
  fn: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const start = Date.now();
  let result: CallToolResult;
  try {
    result = await fn();
  } catch (e) {
    result = errorResult(e instanceof Error ? e.message : "Erreur inattendue.");
  }
  logMcpToolCall({
    tokenId: ctx.tokenId,
    userId: ctx.userId,
    tool,
    argBytes: Buffer.byteLength(JSON.stringify(args ?? {})),
    outcome: result.isError ? "error" : "ok",
    durationMs: Date.now() - start,
  });
  return result;
}

const difficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMcpTools(server: McpServer, ctx: McpAuthContext): void {
  // -- lister_categories ------------------------------------------------------------------
  server.registerTool(
    "lister_categories",
    {
      description:
        "Liste les catégories existantes (id, nom, slug, couleur, nombre de questions). À appeler avant de créer une question, pour réutiliser une catégorie existante plutôt que d'en créer une nouvelle par erreur.",
    },
    async () =>
      runTool(ctx, "lister_categories", {}, async () => {
        const guard = guardTool(ctx, { scope: "questions:read" });
        if (guard) return guard;
        const rows = await listAllCategories();
        return jsonResult(
          rows.map((r) => ({
            id: r.id,
            nom: r.name,
            slug: r.slug,
            couleur: r.colorToken,
            nombreQuestions: r.questionCount,
          })),
        );
      }),
  );

  // -- rechercher_questions -----------------------------------------------------------------
  const rechercherQuestionsSchema = z.object({
    requete: z.string().trim().min(1, "Une requête est requise."),
    type: z.enum(QUESTION_TYPES).optional(),
    categorieId: z.string().optional(),
    limite: z.number().int().min(1).max(50).optional(),
  });
  server.registerTool(
    "rechercher_questions",
    {
      description:
        "Recherche des questions existantes par texte (id, prompt, type, auteur) — à utiliser avant de créer, pour éviter un doublon.",
      inputSchema: rechercherQuestionsSchema,
    },
    async (args) =>
      runTool(ctx, "rechercher_questions", args, async () => {
        const guard = guardTool(ctx, { scope: "questions:read" });
        if (guard) return guard;
        const rows = await searchQuestionsForDedup(args);
        return jsonResult(rows);
      }),
  );

  // -- chercher_pays ------------------------------------------------------------------------
  const chercherPaysSchema = z.object({ requete: z.string().trim().min(1, "Une requête est requise.") });
  server.registerTool(
    "chercher_pays",
    {
      description:
        "Résout un nom de pays vers ses données de référence (iso3, nom français, capitale, population, superficie, région). À appeler pour confirmer qu'un pays existe avant de créer une question de géographie — n'inventez jamais de code ISO.",
      inputSchema: chercherPaysSchema,
    },
    async (args) =>
      runTool(ctx, "chercher_pays", args, async () => {
        const guard = guardTool(ctx, { scope: "questions:read" });
        if (guard) return guard;
        const resolution = await resolveCountry(args.requete);
        if (!resolution.match) {
          const suggestions = resolution.closest.map((c) => c.nameFr);
          return errorResult(
            `Pays introuvable : « ${args.requete} ».` +
              (suggestions.length > 0 ? ` Suggestions : ${suggestions.join(", ")}.` : ""),
          );
        }
        const c = resolution.match;
        return jsonResult({
          iso3: c.iso3,
          nom: c.nameFr,
          capitale: c.capitalFr,
          population: c.population,
          superficieKm2: c.areaKm2,
          region: c.regionFr,
        });
      }),
  );

  // -- creer_question -----------------------------------------------------------------------
  server.registerTool(
    "creer_question",
    {
      description:
        "Crée une question, toujours à l'état de brouillon (jamais publiée directement). Types acceptés : open, mcq, geo — pas image (une image doit être téléversée par un humain depuis le formulaire web).",
      inputSchema: questionDraftSchema,
    },
    async (args) =>
      runTool(ctx, "creer_question", args, async () => {
        const guard = guardTool(ctx, { scope: "questions:write" });
        if (guard) return guard;
        if (questionCreationBudget(ctx.tokenId) <= 0) {
          return errorResult(
            `Limite quotidienne de création de questions atteinte pour ce jeton. Réessayez dans ${questionCreationRetryAfterS(ctx.tokenId)} secondes.`,
          );
        }
        const result = await createQuestionFromDraft(args, { authorId: ctx.userId, source: "mcp" });
        if (!result.ok) return errorResult(result.errors.map((e) => e.message).join(" "));
        recordQuestionCreated(ctx.tokenId);
        return jsonResult({
          questionId: result.questionId,
          statut: "brouillon",
          avertissements: result.warnings.map((w) => w.message),
        });
      }),
  );

  // -- creer_questions_en_lot --------------------------------------------------------------
  const bulkSchema = z.object({ questions: z.array(questionDraftSchema).min(1).max(25) });
  server.registerTool(
    "creer_questions_en_lot",
    {
      description:
        "Crée 1 à 25 questions en un appel, toutes à l'état de brouillon. Succès partiel : un brouillon invalide n'empêche pas la création des autres — chaque élément a son propre résultat.",
      inputSchema: bulkSchema,
    },
    async (args) =>
      runTool(ctx, "creer_questions_en_lot", args, async () => {
        const guard = guardTool(ctx, { scope: "questions:write" });
        if (guard) return guard;

        const resultats: Array<{
          index: number;
          ok: boolean;
          questionId?: string;
          avertissements?: string[];
          erreur?: string;
        }> = [];

        for (let i = 0; i < args.questions.length; i++) {
          if (questionCreationBudget(ctx.tokenId) <= 0) {
            resultats.push({
              index: i,
              ok: false,
              erreur: `Limite quotidienne de création atteinte (réessayez dans ${questionCreationRetryAfterS(ctx.tokenId)} s).`,
            });
            continue;
          }
          const draft = args.questions[i];
          const r = await createQuestionFromDraft(draft, { authorId: ctx.userId, source: "mcp" });
          if (r.ok) {
            recordQuestionCreated(ctx.tokenId);
            resultats.push({
              index: i,
              ok: true,
              questionId: r.questionId,
              avertissements: r.warnings.map((w) => w.message),
            });
          } else {
            resultats.push({ index: i, ok: false, erreur: r.errors.map((e) => e.message).join(" ") });
          }
        }

        return jsonResult({
          resultats,
          crees: resultats.filter((r) => r.ok).length,
          echoues: resultats.filter((r) => !r.ok).length,
        });
      }),
  );

  // -- lister_mes_brouillons -----------------------------------------------------------------
  const listDraftsSchema = z.object({ limite: z.number().int().min(1).max(100).optional() });
  server.registerTool(
    "lister_mes_brouillons",
    {
      description: "Liste vos propres brouillons créés dans cette session ou précédemment.",
      inputSchema: listDraftsSchema,
    },
    async (args) =>
      runTool(ctx, "lister_mes_brouillons", args, async () => {
        const guard = guardTool(ctx, { scope: "questions:read" });
        if (guard) return guard;
        const rows = await listMyDrafts(ctx.userId, args.limite ?? 50);
        return jsonResult(
          rows.map((r) => ({
            id: r.id,
            type: r.type,
            enonce: r.prompt,
            categorie: r.categoryName,
            difficulte: r.difficulty,
            source: r.source,
            creeLe: r.createdAt.toISOString(),
          })),
        );
      }),
  );

  // -- modifier_brouillon ---------------------------------------------------------------------
  const patchDraftSchema = z.object({
    id: z.string(),
    enonce: z.string().trim().min(8).max(280).optional(),
    categorieId: z.string().optional(),
    difficulte: difficultySchema.optional(),
    indice: z.string().trim().max(280).optional(),
    explication: z.string().trim().max(1000).optional(),
  });
  server.registerTool(
    "modifier_brouillon",
    {
      description:
        "Modifie les champs communs (énoncé, catégorie, difficulté, indice, explication) d'un de vos brouillons. Ne modifie pas la structure (réponses/choix/pays) — supprimez et recréez pour un changement structurel. Les questions publiées ne sont pas modifiables par cet outil.",
      inputSchema: patchDraftSchema,
    },
    async (args) =>
      runTool(ctx, "modifier_brouillon", args, async () => {
        const guard = guardTool(ctx, { scope: "questions:write" });
        if (guard) return guard;
        const { id, ...patch } = args;
        const result = await patchDraft(id, ctx.userId, patch);
        return result.ok ? jsonResult({ ok: true }) : errorResult(result.error);
      }),
  );

  // -- supprimer_brouillon --------------------------------------------------------------------
  const deleteDraftSchema = z.object({ id: z.string() });
  server.registerTool(
    "supprimer_brouillon",
    {
      description: "Supprime un de vos brouillons, s'il n'a jamais été joué.",
      inputSchema: deleteDraftSchema,
    },
    async (args) =>
      runTool(ctx, "supprimer_brouillon", args, async () => {
        const guard = guardTool(ctx, { scope: "questions:write" });
        if (guard) return guard;
        const result = await deleteDraft(args.id, ctx.userId);
        return result.ok ? jsonResult({ ok: true }) : errorResult(result.error);
      }),
  );

  // -- creer_categorie ------------------------------------------------------------------------
  const createCategorySchema = z.object({
    nom: z.string().trim().min(2).max(32),
    couleur: z.enum(["moss", "gold", "clay", "plum"]).optional(),
    description: z.string().trim().max(200).optional(),
  });
  server.registerTool(
    "creer_categorie",
    {
      description:
        "Crée une nouvelle catégorie. Un nom déjà utilisé (accent/casse ignorés) renvoie l'id de la catégorie existante plutôt qu'une erreur.",
      inputSchema: createCategorySchema,
    },
    async (args) =>
      runTool(ctx, "creer_categorie", args, async () => {
        const guard = guardTool(ctx, { scope: "categories:write" });
        if (guard) return guard;
        const rate = checkAndRecordCategoryMutationRate(ctx.tokenId);
        if (!rate.ok) {
          return errorResult(
            `Limite de modifications de catégories atteinte pour ce jeton. Réessayez dans ${rate.retryAfterS} secondes.`,
          );
        }
        const result = await createCategoryCore({
          name: args.nom,
          colorToken: args.couleur ?? pickColorToken(args.nom),
          description: args.description,
        });
        if (!result.ok) {
          if (result.existingCategoryId) {
            return jsonResult({
              id: result.existingCategoryId,
              dejaExistante: true,
              message: "Une catégorie portant ce nom existe déjà — catégorie existante utilisée.",
            });
          }
          return errorResult(result.error);
        }
        await writeAuditLog({
          actorUserId: ctx.userId,
          tokenId: ctx.tokenId,
          action: "category_create",
          after: result.category,
        });
        return jsonResult({ id: result.category.id, nom: result.category.name, couleur: result.category.colorToken });
      }),
  );

  // -- modifier_categorie (admin only) ---------------------------------------------------------
  const updateCategorySchema = z.object({
    id: z.string(),
    nom: z.string().trim().min(2).max(32).optional(),
    couleur: z.enum(["moss", "gold", "clay", "plum"]).optional(),
    description: z.string().trim().max(200).optional(),
    position: z.number().int().min(0).optional(),
  });
  server.registerTool(
    "modifier_categorie",
    {
      description:
        "Modifie une catégorie existante (nom, couleur, description, position) — réservé aux administrateurs. L'id et le slug ne changent jamais, les questions existantes ne sont pas affectées.",
      inputSchema: updateCategorySchema,
    },
    async (args) =>
      runTool(ctx, "modifier_categorie", args, async () => {
        const guard = guardTool(ctx, { scope: "categories:write", requireAdmin: true });
        if (guard) return guard;
        const rate = checkAndRecordCategoryMutationRate(ctx.tokenId);
        if (!rate.ok) {
          return errorResult(
            `Limite de modifications de catégories atteinte pour ce jeton. Réessayez dans ${rate.retryAfterS} secondes.`,
          );
        }
        const { id, nom, couleur, description, position } = args;
        const result = await updateCategoryCore(id, {
          name: nom,
          colorToken: couleur,
          description,
          position,
        });
        if (!result.ok) return errorResult(result.error);
        await writeAuditLog({
          actorUserId: ctx.userId,
          tokenId: ctx.tokenId,
          action: "category_update",
          before: result.before,
          after: result.after,
        });
        return jsonResult({ ok: true, categorie: { id: result.after.id, nom: result.after.name, couleur: result.after.colorToken } });
      }),
  );

  // -- fusionner_categories (admin only) -------------------------------------------------------
  const mergeCategoriesSchema = z.object({ sourceId: z.string(), cibleId: z.string() });
  server.registerTool(
    "fusionner_categories",
    {
      description:
        "Déplace toutes les questions de sourceId vers cibleId puis supprime sourceId, en une transaction — réservé aux administrateurs. Seul moyen de retirer une catégorie non vide.",
      inputSchema: mergeCategoriesSchema,
    },
    async (args) =>
      runTool(ctx, "fusionner_categories", args, async () => {
        const guard = guardTool(ctx, { scope: "categories:write", requireAdmin: true });
        if (guard) return guard;
        const rate = checkAndRecordCategoryMutationRate(ctx.tokenId);
        if (!rate.ok) {
          return errorResult(
            `Limite de modifications de catégories atteinte pour ce jeton. Réessayez dans ${rate.retryAfterS} secondes.`,
          );
        }
        const result = await mergeCategoriesCore(args.sourceId, args.cibleId);
        if (!result.ok) return errorResult(result.error);
        await writeAuditLog({
          actorUserId: ctx.userId,
          tokenId: ctx.tokenId,
          action: "category_merge",
          before: { sourceId: args.sourceId, cibleId: args.cibleId },
          after: { movedCount: result.movedCount },
        });
        return jsonResult({ ok: true, questionsDeplacees: result.movedCount });
      }),
  );

  // -- supprimer_categorie (admin only) --------------------------------------------------------
  const deleteCategorySchema = z.object({ id: z.string() });
  server.registerTool(
    "supprimer_categorie",
    {
      description:
        "Supprime une catégorie — réservé aux administrateurs. Ne fonctionne que si elle ne contient aucune question (sinon, utilisez fusionner_categories).",
      inputSchema: deleteCategorySchema,
    },
    async (args) =>
      runTool(ctx, "supprimer_categorie", args, async () => {
        const guard = guardTool(ctx, { scope: "categories:write", requireAdmin: true });
        if (guard) return guard;
        const rate = checkAndRecordCategoryMutationRate(ctx.tokenId);
        if (!rate.ok) {
          return errorResult(
            `Limite de modifications de catégories atteinte pour ce jeton. Réessayez dans ${rate.retryAfterS} secondes.`,
          );
        }
        const result = await deleteCategoryStrictCore(args.id);
        if (!result.ok) return errorResult(result.error);
        await writeAuditLog({
          actorUserId: ctx.userId,
          tokenId: ctx.tokenId,
          action: "category_delete",
          before: { id: args.id },
        });
        return jsonResult({ ok: true });
      }),
  );

  registerResources(server);
  registerPrompt(server);
}

// ---------------------------------------------------------------------------
// Resources — read-only grounding for the model.
// ---------------------------------------------------------------------------

const GUIDELINES_TEXT = `Guide d'écriture de questions — ASPI Quiz

- Une question, un fait vérifiable. Évitez toute ambiguïté : la bonne réponse doit être unique et
  incontestable pour quelqu'un qui connaît le sujet.
- Évitez les questions dont la réponse change avec le temps (classements, records battus,
  populations exactes) sauf à préciser une date explicite dans l'énoncé ("en 2020, …").
- Formulez en français correct, sans faute — les questions sont lues à voix haute par les joueurs.
- Calibrez la difficulté honnêtement : 1-2 = culture générale large, 3 = intermédiaire, 4-5 =
  spécialiste. Ne mettez pas systématiquement 3 par défaut.
- Pour les QCM : des options plausibles, pas de piège absurde qui rend la bonne réponse évidente
  par élimination.
- Pour les questions ouvertes : proposez plusieurs variantes de réponse acceptées (orthographes,
  abréviations courantes) pour éviter de pénaliser une réponse juste mais mal formulée.
- Pour la géographie : laissez toujours le serveur résoudre le pays via chercher_pays — n'inventez
  jamais de code ISO, de capitale ou de population.
- Réutilisez une catégorie existante (lister_categories) plutôt que d'en créer une proche d'une
  catégorie qui existe déjà.`;

function registerResources(server: McpServer): void {
  server.registerResource(
    "guidelines",
    "aspiquiz://guidelines",
    { title: "Guide d'écriture", description: "Bonnes pratiques pour écrire une question ASPI Quiz.", mimeType: "text/plain" },
    (uri): ReadResourceResult => ({
      contents: [{ uri: uri.href, mimeType: "text/plain", text: GUIDELINES_TEXT }],
    }),
  );

  server.registerResource(
    "categories",
    "aspiquiz://categories",
    { title: "Catégories", description: "La liste des catégories actuelles.", mimeType: "application/json" },
    async (uri): Promise<ReadResourceResult> => {
      const rows = await listAllCategories();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              rows.map((r) => ({ id: r.id, nom: r.name, couleur: r.colorToken, nombreQuestions: r.questionCount })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerResource(
    "schema-question",
    "aspiquiz://schema/question",
    { title: "Schéma QuestionDraft", description: "Le schéma JSON attendu par creer_question.", mimeType: "application/json" },
    (uri): ReadResourceResult => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(z.toJSONSchema(questionDraftSchema), null, 2),
        },
      ],
    }),
  );
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function registerPrompt(server: McpServer): void {
  server.registerPrompt(
    "generer-questions",
    {
      title: "Générer des questions",
      description: "Modèle pour générer un lot de questions ASPI Quiz sur un sujet donné.",
      argsSchema: {
        sujet: z.string().describe("Le sujet des questions, ex. « capitales d'Afrique de l'Ouest »."),
        nombre: z.string().describe("Combien de questions générer, ex. « 10 »."),
        type: z.string().optional().describe("Type souhaité : open, mcq ou geo (facultatif)."),
        difficulte: z.string().optional().describe("Difficulté visée, de 1 à 5 (facultatif)."),
      },
    },
    ({ sujet, nombre, type, difficulte }): GetPromptResult => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Génère ${nombre} question(s) de quiz sur : ${sujet}.`,
              type ? `Type : ${type}.` : null,
              difficulte ? `Difficulté visée : ${difficulte}/5.` : null,
              "",
              "Avant de créer quoi que ce soit :",
              "1. Appelle lister_categories et réutilise une catégorie existante si elle correspond.",
              "2. Appelle rechercher_questions pour vérifier qu'aucune question similaire n'existe déjà.",
              "3. Pour toute question de géographie, appelle chercher_pays pour confirmer chaque pays — n'invente jamais de code ISO, de capitale ou de population.",
              "4. Vérifie chaque fait avant de le soumettre.",
              "5. Soumets le lot avec creer_questions_en_lot (une question à la fois seulement si on ne t'en demande qu'une).",
              "Toutes les questions créées arrivent à l'état de brouillon et devront être relues par un humain avant publication.",
            ]
              .filter((l) => l !== null)
              .join("\n"),
          },
        },
      ],
    }),
  );
}
