"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import { CategoryBadge, QuestionTypeBadge } from "@/components/ui/Badge";
import type { LibraryQuestionItem } from "@/server/questions/library";

// "category" gains a sort (category_name) once Addendum B.5 extends LIBRARY_SORTS to match —
// deliberately not wired here yet, see that task.
const COLUMNS: { key: string; label: string; sort?: string }[] = [
  { key: "type", label: "Type" },
  { key: "prompt", label: "Question" },
  { key: "category", label: "Catégorie" },
  { key: "difficulty", label: "Difficulté", sort: "difficulty_desc" },
  { key: "author", label: "Auteur" },
  { key: "status", label: "Statut" },
  { key: "asked", label: "Posée", sort: "most_played" },
  { key: "success", label: "Réussite", sort: "success_rate_desc" },
  { key: "avg", label: "Durée moy." },
  { key: "created", label: "Date", sort: "recent" },
];

const STATUS_LABELS_FR = { draft: "Brouillon", published: "Publiée", archived: "Archivée" };

export function LibraryTable({
  items,
  onPreview,
}: {
  items: LibraryQuestionItem[];
  onPreview: (id: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setSort(sort: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border-soft">
      <table className="w-full min-w-[900px] border-collapse text-14">
        <thead className="sticky top-0 z-10 bg-bg-raised">
          <tr>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className="border-b border-border-soft px-3 py-2 text-left text-12 font-medium text-ink-faint"
              >
                {col.sort ? (
                  <button
                    type="button"
                    onClick={() => setSort(col.sort!)}
                    className="flex items-center gap-1 hover:text-ink-mid"
                  >
                    {col.label}
                    <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((q) => (
            <tr
              key={q.id}
              tabIndex={0}
              onClick={() => onPreview(q.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onPreview(q.id);
              }}
              className="cursor-pointer border-b border-border-soft last:border-b-0 hover:bg-bg-surface focus:bg-bg-surface focus:outline-none"
            >
              <td className="px-3 py-2">
                <QuestionTypeBadge type={q.type} />
              </td>
              <td className="max-w-[320px] truncate px-3 py-2 text-ink-high">{q.prompt}</td>
              <td className="px-3 py-2">
                <CategoryBadge name={q.categoryName} colorToken={q.categoryColorToken} />
              </td>
              <td className="px-3 py-2 text-ink-mid">{q.difficulty}/5</td>
              <td className="px-3 py-2 text-ink-faint">@{q.authorUsername}</td>
              <td className="px-3 py-2 text-ink-faint">{STATUS_LABELS_FR[q.status] ?? q.status}</td>
              <td className="font-numeral px-3 py-2 tabular-nums text-ink-faint">{q.timesAsked}</td>
              <td className="font-numeral px-3 py-2 tabular-nums text-ink-faint">
                {q.timesAsked > 0 ? `${Math.round((q.timesCorrect / q.timesAsked) * 100)}%` : "—"}
              </td>
              <td className="font-numeral px-3 py-2 tabular-nums text-ink-faint">
                {q.avgMs !== null ? `${(q.avgMs / 1000).toFixed(1)} s` : "—"}
              </td>
              <td className="px-3 py-2 text-ink-faint">
                {new Date(q.createdAt).toLocaleDateString("fr-FR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <p className="p-6 text-center text-14 text-ink-faint">Aucune question.</p>
      )}
    </div>
  );
}
