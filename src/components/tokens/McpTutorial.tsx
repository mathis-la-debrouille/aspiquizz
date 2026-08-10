import { Terminal, MessageSquareText } from "lucide-react";

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Créez un jeton",
    body: "Cliquez « Créer un jeton » ci-dessus, donnez-lui un nom (ex. « Claude Desktop »), et cochez au moins « Créer des questions ».",
  },
  {
    title: "Copiez la configuration",
    body: "Le jeton ne s'affiche qu'une fois, avec un extrait prêt à coller : un bloc JSON pour Claude Desktop/Cowork, ou une commande pour Claude Code.",
  },
  {
    title: "Ajoutez-le à votre client",
    body: "Claude Desktop/Cowork : collez le bloc JSON dans les réglages MCP de l'application. Claude Code : lancez la commande copiée dans un terminal.",
  },
  {
    title: "Redémarrez le client",
    body: "Fermez et rouvrez l'application (ou relancez la session) pour qu'elle se connecte au serveur ASPI Quiz.",
  },
  {
    title: "Vérifiez la connexion",
    body: "Demandez par exemple « Liste mes catégories ASPI Quiz » — si le modèle répond avec la liste, tout fonctionne.",
  },
  {
    title: "Générez, puis relisez",
    body: "Décrivez ce que vous voulez (« génère 10 questions sur… »). Les questions arrivent en brouillon dans l'onglet « À relire » de la bibliothèque, à valider avant publication.",
  },
];

/** A short, in-app setup walkthrough — kept static rather than a wizard, since it's six short
 *  steps a returning user will skim past in seconds; a collapsible/multi-page flow would be
 *  more ceremony than the content warrants. */
export function McpTutorial() {
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="font-numeral flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-moss-deep bg-moss-deep/20 text-12 text-moss-glow">
              {i + 1}
            </span>
            <div className="flex flex-col gap-0.5 pt-0.5">
              <p className="text-14 font-medium text-ink-high">{step.title}</p>
              <p className="text-13 text-ink-mid">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 border-t border-border-soft pt-4 text-12 text-ink-faint">
        <div className="flex items-center gap-1.5">
          <MessageSquareText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span>Claude Desktop / Cowork : Réglages → Développeur → Modifier la configuration.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          <span>Claude Code : collez la commande <code className="font-numeral text-ink-mid">claude mcp add …</code> telle quelle.</span>
        </div>
      </div>
    </div>
  );
}
