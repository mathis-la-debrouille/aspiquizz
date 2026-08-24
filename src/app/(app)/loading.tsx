import { Spinner } from "@/components/ui/Spinner";

/** Next's App Router Suspense-boundary convention: shown instantly in place of `{children}`
 *  in AppLayout while a route segment's async Server Component (a DB read, most of the time)
 *  is still in flight — Header/nav stay mounted throughout since only this segment swaps in.
 *  Cascades to every nested route under (app) that doesn't define its own loading.tsx. */
export default function AppLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-ink-mid"
    >
      <Spinner className="h-6 w-6" />
      <span className="text-14">Chargement…</span>
    </div>
  );
}
