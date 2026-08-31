/** One-off: five more fact-check corrections found in Politique européenne. */
import { eq } from "drizzle-orm";
import { db, client } from "@/server/db";
import { questions, questionChoices } from "@/server/db/schema";

interface Fix {
  id: string;
  why: string;
  prompt?: string;
  choices?: { id: string; label: string; isCorrect: boolean }[];
}

const FIXES: Fix[] = [
  {
    id: "01M0YZTVQG5FHKVQ6FHE9XDX9B",
    why: "PÉRIMÉE — 21 depuis l'entrée de la Bulgarie le 1er janvier 2026",
    prompt: "Combien de pays utilisent l'euro comme monnaie officielle au sein de la zone euro ?",
    choices: [
      { id: "01M0YZTVR83EY5SSDDCWK2EFWK", label: "21", isCorrect: true },
      { id: "01M0YZTVR831FMYVWYCN8RK134", label: "27", isCorrect: false },
      { id: "01M0YZTVR8WZB00EVAP1EA8FS6", label: "19", isCorrect: false },
      { id: "01M0YZTVR8KMDMBYTF7KR93GD5", label: "25", isCorrect: false },
    ],
  },
  {
    id: "01M0YZV08MZ19SZNJGRWF4C2HQ",
    why: "DEUX BONNES RÉPONSES — le poème de Schiller EST l'Ode à la joie",
    choices: [
      { id: "01M0YZV09D5FMNFYC6GSA3RNEZ", label: "L'Ode à la joie", isCorrect: true },
      { id: "01M0YZV09DMATECKGYMMZHNFMC", label: "La Marseillaise", isCorrect: false },
      {
        id: "01M0YZV09D4SDQPS861HPJ2Y6M",
        label: "La Symphonie du Nouveau Monde",
        isCorrect: false,
      },
      { id: "01M0YZV09D71E3YD06FKJ3DHFW", label: "Nabucco", isCorrect: false },
    ],
  },
  {
    id: "01M0YZV9GCZ0NW6XS0B605XMZE",
    why: "DISTRACTEUR QUI SE DÉNONCE — la parenthèse disait elle-même qu'il est faux",
    choices: [
      { id: "01M0YZV9H504Q7JEQJH5PMZKYV", label: "Le Bundestag", isCorrect: true },
      { id: "01M0YZV9H5X9G78VVK61S2VRAY", label: "Le Bundesrat", isCorrect: false },
      { id: "01M0YZV9H58HB9J5TAT7Y7QWBH", label: "La Volkskammer", isCorrect: false },
      { id: "01M0YZV9H5Z6HCF6RPYG615ZQP", label: "Le Landtag", isCorrect: false },
    ],
  },
  {
    id: "01M0YZVE67F2RQ7BHPGZEBGX4A",
    why: "INCOHÉRENTE — l'Ukraine n'est ni dans les Balkans, ni sa propre voisine",
    prompt:
      "Quel pays en guerre a officiellement ouvert ses négociations d'adhésion à l'UE en juin 2024, deux ans après avoir obtenu le statut de candidat ?",
    choices: [
      { id: "01M0YZVE6ZMYQP8C6DPFZ9EP8J", label: "L'Ukraine", isCorrect: true },
      { id: "01M0YZVE6ZQMV79BBZ188YZRCY", label: "La Serbie", isCorrect: false },
      { id: "01M0YZVE6Z7XVDS460N95MD74S", label: "L'Albanie", isCorrect: false },
      { id: "01M0YZVE6ZZM0CCF5ZMC7DKBCY", label: "Le Kosovo", isCorrect: false },
    ],
  },
  {
    id: "01M0YZVKVXWM51B2JPF9AB1FBC",
    why: "DATE FAUSSE — accord politique en 2019, signature bien plus tard, jamais 2020",
    prompt:
      "Quel accord de libre-échange, négocié pendant vingt ans, lie l'UE aux pays d'Amérique du Sud ?",
  },
];

const APPLY = process.argv.includes("--apply");

async function main() {
  for (const fix of FIXES) {
    const [before] = await db.select().from(questions).where(eq(questions.id, fix.id));
    if (!before) throw new Error(`introuvable: ${fix.id}`);
    console.log(`\n=== ${fix.why}`);
    console.log(`  AVANT : ${before.prompt}`);
    if (fix.prompt) console.log(`  APRÈS : ${fix.prompt}`);
    for (const c of fix.choices ?? []) console.log(`     [${c.isCorrect ? "x" : " "}] ${c.label}`);
    if (!APPLY) continue;
    if (fix.prompt) {
      await db
        .update(questions)
        .set({ prompt: fix.prompt, updatedAt: new Date() })
        .where(eq(questions.id, fix.id));
    }
    for (const c of fix.choices ?? []) {
      await db
        .update(questionChoices)
        .set({ label: c.label, isCorrect: c.isCorrect })
        .where(eq(questionChoices.id, c.id));
    }
  }
  console.log(`\n${FIXES.length} — ${APPLY ? "APPLIQUÉ" : "simulation"}`);
  client.close();
}
void main();
