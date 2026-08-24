import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeTone = "moss" | "gold" | "clay" | "plum" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, string> = {
  moss: "bg-moss-deep/25 text-moss-glow border-moss-deep/60",
  gold: "bg-gold-deep/25 text-gold-soft border-gold-deep/60",
  clay: "bg-clay-deep/25 text-clay-soft border-clay-deep/60",
  plum: "bg-plum-deep/40 text-[#c9b0c8] border-plum/60",
  neutral: "bg-bg-inset text-ink-mid border-border-hard",
};

/** Small tag — category, difficulty, question type. Never used as a functional button.
 *  `shrink-0 whitespace-nowrap`: a badge sitting in a tight flex row must never squeeze below
 *  its own content width — that's what wraps a multi-word badge (or a difficulty badge's dots +
 *  label) onto two lines mid-pill. The row it sits in needs `flex-wrap` so *it* can overflow
 *  onto a new line instead — see LibraryCard's badge row for the one place that was missing it. */
export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-0.5 text-12 font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export type CategoryColorToken = "moss" | "gold" | "clay" | "plum";

export function CategoryBadge({
  name,
  colorToken,
}: {
  name: string;
  colorToken: CategoryColorToken;
}) {
  return <Badge tone={colorToken}>{name}</Badge>;
}

/** Difficulty tiers 1–5. Deliberately in-group slang, not neutral descriptors —
 *  this is a private quiz between friends (see DECISIONS.md). */
export const DIFFICULTY_LABELS_FR = ["Golem", "Macroniste", "Chad", "Aspi", "🙂"];

export function DifficultyBadge({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  const tone: BadgeTone = level <= 2 ? "moss" : level === 3 ? "gold" : "clay";
  return (
    <Badge tone={tone}>
      {"●".repeat(level)}
      {"○".repeat(5 - level)} {DIFFICULTY_LABELS_FR[level - 1]}
    </Badge>
  );
}

const QUESTION_TYPE_LABELS_FR = {
  open: "Réponse libre",
  mcq: "QCM",
  image: "Image",
  geo: "Géographie",
} as const;

export function QuestionTypeBadge({ type }: { type: keyof typeof QUESTION_TYPE_LABELS_FR }) {
  return <Badge tone="neutral">{QUESTION_TYPE_LABELS_FR[type]}</Badge>;
}

/** 'manual' renders nothing — the badge exists to tell the group a machine helped write a
 *  question (Addendum C.7), not to label the (overwhelmingly common) human-authored case. Never
 *  shown to players during a game — only on the library card/admin, both author-and-review-only
 *  surfaces. */
export function SourceBadge({ source }: { source: "manual" | "import" | "mcp" }) {
  if (source === "manual") return null;
  if (source === "mcp") return <Badge tone="plum">MCP</Badge>;
  return <Badge tone="gold">Import</Badge>;
}
