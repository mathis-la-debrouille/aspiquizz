/**
 * Seeds the starter set of question categories. Players/admins can add more
 * later via /admin/categories (Phase 10) — this just gives the app
 * something to author questions into from day one.
 */
import { db, client } from "@/server/db";
import { categories, type ColorToken } from "@/server/db/schema";

interface CategorySeed {
  name: string;
  slug: string;
  colorToken: ColorToken;
  description: string;
  position: number;
}

const CATEGORY_SEEDS: CategorySeed[] = [
  {
    name: "Géographie",
    slug: "geographie",
    colorToken: "moss",
    description:
      "Pays, capitales, drapeaux, reliefs. " +
      "1 Golem : pays et capitales évidents, drapeaux. " +
      "2 Macroniste : pays et capitales moyens, drapeaux. " +
      "3 Chad : pays difficiles. " +
      "4 Aspi : îles, territoires, populations, superficies. " +
      "5 🙂 : géographie de spécialiste.",
    position: 0,
  },
  {
    name: "Histoire",
    slug: "histoire",
    colorToken: "gold",
    description: "Des grands empires aux événements récents.",
    position: 1,
  },
  {
    name: "Sciences",
    slug: "sciences",
    colorToken: "moss",
    description: "Nature, physique, espace et corps humain.",
    position: 2,
  },
  {
    name: "Cinéma & Séries",
    slug: "cinema-series",
    colorToken: "clay",
    description: "Films, réalisateurs et têtes d'affiche.",
    position: 3,
  },
  {
    name: "Musique",
    slug: "musique",
    colorToken: "plum",
    description: "Artistes, morceaux et genres musicaux.",
    position: 4,
  },
  {
    name: "Sport",
    slug: "sport",
    colorToken: "gold",
    description: "Compétitions, records et grands noms du sport.",
    position: 5,
  },
  {
    name: "Culture générale",
    slug: "culture-generale",
    colorToken: "clay",
    description: "Un peu de tout, pour les esprits curieux.",
    position: 6,
  },
  {
    name: "Mythologie",
    slug: "mythologie",
    colorToken: "plum",
    description: "Dieux, héros et légendes du monde entier.",
    position: 7,
  },
  {
    name: "Littérature",
    slug: "litterature",
    colorToken: "moss",
    description: "Romans, autrices et auteurs, grandes œuvres.",
    position: 8,
  },
  {
    name: "Jeux vidéo",
    slug: "jeux-video",
    colorToken: "gold",
    description: "Studios, sagas et personnages iconiques.",
    position: 9,
  },
];

export async function seedCategories(): Promise<number> {
  for (const seed of CATEGORY_SEEDS) {
    await db
      .insert(categories)
      .values(seed)
      .onConflictDoUpdate({
        target: categories.slug,
        set: {
          name: seed.name,
          colorToken: seed.colorToken,
          description: seed.description,
          position: seed.position,
        },
      });
  }
  return CATEGORY_SEEDS.length;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  seedCategories()
    .then((count) => {
      console.log(JSON.stringify({ event: "seed_categories_complete", count }));
      return client.close();
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({ event: "seed_categories_failed", error: String(error) }));
      process.exit(1);
    });
}
