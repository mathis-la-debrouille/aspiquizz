/**
 * Seeds the static badge definitions from brief §12. Badges are code-defined,
 * not authorable — this script is the single source of truth for their
 * id/name/description/tier; `user_badges` rows reference `badges.id`.
 */
import { db, client } from "@/server/db";
import { badges, type BadgeTier } from "@/server/db/schema";

interface BadgeSeed {
  id: string;
  nameFr: string;
  descriptionFr: string;
  iconKey: string;
  tier: BadgeTier;
}

const BADGE_SEEDS: BadgeSeed[] = [
  {
    id: "premier-sang",
    nameFr: "Premier sang",
    descriptionFr: "Remporter sa première partie.",
    iconKey: "Swords",
    tier: "bronze",
  },
  {
    id: "sans-faute",
    nameFr: "Sans faute",
    descriptionFr: "Répondre correctement à toutes les questions d'une partie.",
    iconKey: "CheckCircle2",
    tier: "silver",
  },
  {
    id: "eclair",
    nameFr: "Éclair",
    descriptionFr: "Répondre correctement 5 fois en moins de 3 secondes.",
    iconKey: "Zap",
    tier: "silver",
  },
  {
    id: "globe-trotteur",
    nameFr: "Globe-trotteur",
    descriptionFr: "Réussir 50 questions de géographie.",
    iconKey: "Globe2",
    tier: "gold",
  },
  {
    id: "erudit",
    nameFr: "Érudit",
    descriptionFr: "Répondre à 500 questions au total.",
    iconKey: "BookOpen",
    tier: "gold",
  },
  {
    id: "artisan",
    nameFr: "Artisan",
    descriptionFr: "Créer 10 questions.",
    iconKey: "Hammer",
    tier: "bronze",
  },
  {
    id: "serie-noire",
    nameFr: "Série noire",
    descriptionFr: "Enchaîner 10 bonnes réponses d'affilée.",
    iconKey: "Flame",
    tier: "gold",
  },
  {
    id: "fidele",
    nameFr: "Fidèle",
    descriptionFr: "Jouer 10 parties.",
    iconKey: "Heart",
    tier: "silver",
  },
  {
    id: "cartographe",
    nameFr: "Cartographe",
    descriptionFr: "Réussir 100 questions de géographie.",
    iconKey: "Map",
    tier: "gold",
  },
  {
    id: "doyen",
    nameFr: "Doyen",
    descriptionFr: "Avoir joué dans 20 salons.",
    iconKey: "Landmark",
    tier: "silver",
  },
];

export async function seedBadges(): Promise<number> {
  for (const seed of BADGE_SEEDS) {
    await db
      .insert(badges)
      .values(seed)
      .onConflictDoUpdate({
        target: badges.id,
        set: {
          nameFr: seed.nameFr,
          descriptionFr: seed.descriptionFr,
          iconKey: seed.iconKey,
          tier: seed.tier,
        },
      });
  }
  return BADGE_SEEDS.length;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedBadges()
    .then((count) => {
      console.log(JSON.stringify({ event: "seed_badges_complete", count }));
      return client.close();
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({ event: "seed_badges_failed", error: String(error) }));
      process.exit(1);
    });
}
