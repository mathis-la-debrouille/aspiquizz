import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CategoryBadge, DifficultyBadge, QuestionTypeBadge } from "@/components/ui/Badge";
import type { QuestionListItem } from "@/server/questions/queries";

/**
 * Every question card anywhere in the app shows its author credit — brief
 * §10.1. Reused by the /creer pool and (later) the quiz builder's search.
 */
export function QuestionCard({ question }: { question: QuestionListItem }) {
  return (
    <Card className="flex flex-col gap-2 p-3" elevation="raised">
      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge name={question.categoryName} colorToken={question.categoryColorToken} />
        <QuestionTypeBadge type={question.type} />
        <DifficultyBadge level={question.difficulty as 1 | 2 | 3 | 4 | 5} />
      </div>
      <p className="text-14 text-ink-high">{question.prompt}</p>
      <Link
        href={`/profil/${question.authorUsername}`}
        className="flex items-center gap-1.5 text-12 text-ink-faint hover:text-ink-mid"
      >
        <Avatar seed={question.authorAvatarSeed} size="xs" />
        Proposée par @{question.authorUsername}
      </Link>
    </Card>
  );
}
