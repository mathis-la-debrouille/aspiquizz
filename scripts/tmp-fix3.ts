/** One-off: nine more fact-check corrections found in Politique française. */
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
    id: "01M0YZSS1A8SVFBXVPF6FCNCQK",
    why: "FAUX — Sarkozy n'a pas créé l'UMP (2002, autour de Chirac) ; il l'a prise en 2004",
    prompt: "Quel président français, élu en 2007, avait pris la présidence de l'UMP trois ans plus tôt ?",
  },
  {
    id: "01M0YZSV3SDMTDQ6DBG29VRBFE",
    why: "PÉRIMÉE — Marine Le Pen ne dirige plus le RN depuis 2022 (Jordan Bardella)",
    prompt: "Quel est le nom du parti d'extrême droite fondé par Jean-Marie Le Pen en 1972, rebaptisé en 2018 ?",
  },
  {
    id: "01M0YZT7MXKBJEZA0Y85EKK9XY",
    why: "RÉFÉRENCE INVENTÉE — la « ligne du Bourget » ne désigne rien ; c'est le congrès d'Épinay",
    prompt: "Quel parti de gauche est né du congrès d'Épinay en 1971, sous l'impulsion de François Mitterrand ?",
  },
  {
    id: "01M0YZT17E25S5SEVYF4221Q8K",
    why: "L'ÉNONCÉ CONTENAIT SA PROPRE RÉPONSE, mot pour mot",
    prompt: "Quelle loi française, votée en 1905 et portée par Aristide Briand, a mis fin au régime du Concordat napoléonien ?",
  },
  {
    id: "01M0YZTASC3K4SVKCP1AFFQQE9",
    why: "L'ÉNONCÉ CONTENAIT SA PROPRE RÉPONSE",
    prompt: "Quel ministère français a son siège dans le quartier de Bercy, à Paris ?",
  },
  {
    id: "01M0YZTHM4FM3CY0XFXY4VDPRX",
    why: "AFFAIRE FAUSSE — Chirac a été condamné pour les emplois fictifs de la Ville de Paris, pas pour l'affaire des HLM",
    prompt: "Quel ancien président français a été condamné en 2011 dans l'affaire des emplois fictifs de la Ville de Paris, une première pour un ex-chef d'État sous la Ve République ?",
  },
  {
    id: "01M0YZTA3Q7QQTT86E5HAV6F6K",
    why: "INSOLUBLE — la bonne réponse était « il n'existe pas de règle »",
    prompt: "Quel article de la Constitution interdit à un ministre français d'exercer en même temps un mandat de député ?",
    choices: [
      { id: "01M0YZTA4F7N3H5956WKMTRP2C", label: "L'article 23", isCorrect: true },
      { id: "01M0YZTA4F5THEM4HMRCBRP8EF", label: "L'article 8", isCorrect: false },
      { id: "01M0YZTA4FWMXQ83Q9NKGSTDG3", label: "L'article 20", isCorrect: false },
      { id: "01M0YZTA4F6PHDDW1SX4FEQW6H", label: "L'article 34", isCorrect: false },
    ],
  },
  {
    id: "01M0YZTBWD97AXX08BH26VW8W2",
    why: "ÉNONCÉ CONFUS — « environ (à 5 révisions près) » pour une réponse qui est déjà une fourchette",
    prompt: "Combien de fois la Constitution de la Ve République a-t-elle été révisée depuis 1958 ?",
  },
  {
    id: "01M0YZTJD3V8081PCGYPANYR15",
    why: "ÉNONCÉ FAUX — novembre 2018 n'est pas « le second semestre » du mandat",
    prompt: "Quel mouvement social français, né en novembre 2018 du refus d'une taxe sur le carburant, a occupé les ronds-points pendant des mois ?",
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
