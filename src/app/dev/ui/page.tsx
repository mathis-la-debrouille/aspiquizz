"use client";

import { useState } from "react";
import { Compass, Flag, MapPin, Sparkles, Trophy } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CategoryBadge,
  Checkbox,
  DashedUnderline,
  DifficultyBadge,
  Divider,
  EmptyState,
  Input,
  LaurelSprig,
  Modal,
  Panel,
  PlayerChip,
  ProgressBar,
  QuestionTypeBadge,
  RadioCard,
  ScoreTicker,
  Select,
  Skeleton,
  SparkleFreeStar,
  StreakMeter,
  Tabs,
  Textarea,
  Timer,
  Toggle,
  Tooltip,
  ToastProvider,
  useToast,
} from "@/components/ui";
import { CompassRose } from "@/components/ui/HandDrawn";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-26 text-ink-high">{title}</h2>
        {description && <p className="text-14 text-ink-mid">{description}</p>}
        <DashedUnderline className="mt-2 h-3 w-40 text-border-hard" />
      </div>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </section>
  );
}

function ToastButtons() {
  const { push } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => push("Salon rejoint.", "success")}>
        Succès
      </Button>
      <Button variant="secondary" onClick={() => push("Identifiants incorrects.", "error")}>
        Erreur
      </Button>
      <Button variant="secondary" onClick={() => push("La partie commence dans 3…", "info")}>
        Info
      </Button>
    </div>
  );
}

export default function UiGalleryPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState("moss");
  const [score, setScore] = useState(1240);
  const [radioValue, setRadioValue] = useState("mcq");
  const [timerKey, setTimerKey] = useState(0);
  const timerStart = Date.now();

  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-4xl flex-col gap-14 px-6 py-12">
        <header className="flex items-center gap-4">
          <LaurelSprig className="h-10 w-24 text-gold-deep" />
          <div>
            <h1 className="font-display text-34 text-ink-high">Galerie — Forest Night</h1>
            <p className="text-14 text-ink-mid">
              Tous les composants du système de conception, dans tous leurs états. Route de
              développement uniquement — 404 en production.
            </p>
          </div>
        </header>

        <Section title="Boutons" description="Variantes, tailles, états.">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Créer un salon</Button>
              <Button variant="secondary">Rejoindre</Button>
              <Button variant="ghost">Annuler</Button>
              <Button variant="danger">Quitter la partie</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Petit</Button>
              <Button size="md">Moyen</Button>
              <Button size="lg">Grand</Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button loading>Chargement</Button>
              <Button disabled>Désactivé</Button>
              <Button leadingIcon={<Trophy className="h-4 w-4" strokeWidth={1.5} />}>
                Classement
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Cartes & panneaux">
          <Card className="w-64 p-4">
            <p className="text-14 text-ink-high">Carte simple, lip 1px + ombre chaude.</p>
          </Card>
          <Card radius="xl" elevation="lifted" className="w-64 p-4">
            <p className="text-14 text-ink-high">Rayon xl, élévation soulevée.</p>
          </Card>
          <Panel title="Configuration du salon" eyebrow="Hôte" className="w-72">
            <p className="text-14 text-ink-mid">Panneau — conteneur de section plus large.</p>
          </Panel>
        </Section>

        <Section title="Champs de formulaire">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <Input label="Nom du salon" placeholder="Soirée quiz du vendredi" />
            <Input label="Avec erreur" error="Ce champ est requis." defaultValue="" />
            <Input label="Désactivé" disabled defaultValue="Verrouillé" />
            <Textarea label="Explication" placeholder="Affichée à la révélation…" />
            <Select label="Catégorie" defaultValue="geo">
              <option value="geo">Géographie</option>
              <option value="histoire">Histoire</option>
              <option value="culture">Culture générale</option>
            </Select>
          </div>
          <div className="flex flex-col gap-3">
            <Checkbox label="Autoriser les retardataires" description="Rejoindre en spectateur" />
            <Checkbox label="Désactivé" disabled />
            <Toggle label="Son" defaultChecked />
            <Toggle label="Son coupé" />
          </div>
        </Section>

        <Section title="RadioCard — sélecteur de type de question">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <RadioCard
              name="qtype"
              value="open"
              label="Réponse libre"
              description="Texte tapé"
              icon={<Sparkles className="h-5 w-5" strokeWidth={1.5} />}
              checked={radioValue === "open"}
              onChange={() => setRadioValue("open")}
            />
            <RadioCard
              name="qtype"
              value="mcq"
              label="QCM"
              description="2 à 6 options"
              icon={<Flag className="h-5 w-5" strokeWidth={1.5} />}
              checked={radioValue === "mcq"}
              onChange={() => setRadioValue("mcq")}
            />
            <RadioCard
              name="qtype"
              value="image"
              label="Image"
              description="QCM ou libre"
              icon={<Compass className="h-5 w-5" strokeWidth={1.5} />}
              checked={radioValue === "image"}
              onChange={() => setRadioValue("image")}
            />
            <RadioCard
              name="qtype"
              value="geo"
              label="Géographie"
              description="Carte vectorielle"
              icon={<MapPin className="h-5 w-5" strokeWidth={1.5} />}
              checked={radioValue === "geo"}
              onChange={() => setRadioValue("geo")}
            />
          </div>
        </Section>

        <Section title="Badges">
          <CategoryBadge name="Géographie" colorToken="moss" />
          <CategoryBadge name="Histoire" colorToken="gold" />
          <CategoryBadge name="Cinéma" colorToken="clay" />
          <CategoryBadge name="Mythologie" colorToken="plum" />
          <DifficultyBadge level={1} />
          <DifficultyBadge level={3} />
          <DifficultyBadge level={5} />
          <QuestionTypeBadge type="mcq" />
          <QuestionTypeBadge type="geo" />
          <Badge>Neutre</Badge>
        </Section>

        <Section title="Avatar">
          <Avatar seed="alice" size="xs" />
          <Avatar seed="bob" size="sm" />
          <Avatar seed="carla" size="md" />
          <Avatar seed="denis" size="lg" />
          <Avatar seed="elin" size="xl" levelRingProgress={0.65} />
        </Section>

        <Section title="Timer" description="Anneau + numéral, tick réel sur une échéance serveur.">
          <Timer key={timerKey} deadlineMs={timerStart + 12_000} startedAtMs={timerStart} />
          <Button variant="secondary" size="sm" onClick={() => setTimerKey((k) => k + 1)}>
            Relancer
          </Button>
        </Section>

        <Section title="ProgressBar & StreakMeter">
          <div className="flex w-64 flex-col gap-4">
            <ProgressBar value={0.35} label="Maîtrise — Géographie" tone="moss" />
            <ProgressBar value={0.8} label="Chargement" tone="gold" />
          </div>
          <div className="flex flex-col gap-2">
            <StreakMeter streak={1} />
            <StreakMeter streak={3} />
            <StreakMeter streak={5} />
          </div>
        </Section>

        <Section title="ScoreTicker">
          <ScoreTicker value={score} className="text-34 text-gold" />
          <Button variant="secondary" size="sm" onClick={() => setScore((s) => s + 780)}>
            +780
          </Button>
        </Section>

        <Section title="PlayerChip">
          <PlayerChip displayName="Maëlys" seed="maelys" isHost ready score={2340} />
          <PlayerChip displayName="Younes" seed="younes" ready={false} score={1120} />
          <PlayerChip displayName="Théo" seed="theo" connected={false} score={640} />
        </Section>

        <Section title="Toast">
          <ToastButtons />
        </Section>

        <Section title="Modal">
          <Button onClick={() => setModalOpen(true)}>Ouvrir la modale</Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Créer un salon"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={() => setModalOpen(false)}>Créer</Button>
              </>
            }
          >
            <p className="text-14 text-ink-mid">
              Contenu de démonstration — la vraie modale de création de salon arrive en Phase 8.
            </p>
          </Modal>
        </Section>

        <Section title="Tabs">
          <div className="flex flex-col gap-3">
            <Tabs
              tabs={[
                { id: "moss", label: "Toujours" },
                { id: "gold", label: "30 jours" },
              ]}
              value={tab}
              onChange={setTab}
            />
            <p className="text-14 text-ink-mid">Onglet actif : {tab}</p>
          </div>
        </Section>

        <Section title="Tooltip">
          <Tooltip content="Copier le code du salon">
            <Button variant="secondary" size="sm">
              ABCD12
            </Button>
          </Tooltip>
        </Section>

        <Section title="EmptyState">
          <EmptyState
            title="Aucun salon ouvert pour l'instant."
            description="Créez-en un pour inviter le reste du groupe."
            action={<Button size="sm">Créer un salon</Button>}
          />
        </Section>

        <Section title="Skeleton">
          <div className="flex items-center gap-3">
            <Skeleton circle className="h-10 w-10" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </Section>

        <Section title="Divider">
          <div className="flex w-72 flex-col gap-4">
            <Divider />
            <Divider label="ou" />
          </div>
        </Section>

        <Section title="Accents dessinés à la main">
          <LaurelSprig className="h-10 w-24 text-gold" />
          <CompassRose className="h-12 w-12 text-ink-mid" />
          <DashedUnderline className="h-3 w-32 text-moss" />
          <SparkleFreeStar className="h-8 w-8 text-gold-soft" />
        </Section>
      </main>
    </ToastProvider>
  );
}
