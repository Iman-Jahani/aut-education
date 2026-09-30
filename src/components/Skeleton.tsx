"use client";

export function Skeleton({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return <div className={`skeleton ${dark ? "skeleton-dark" : ""} ${className}`} />;
}

/** Rows shaped like a list item: avatar + two text lines (+ optional trailing pill). */
export function ListSkeleton({ rows = 3, pill = true }: { rows?: number; pill?: boolean }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border border-line rounded-xl p-3">
          <Skeleton className="w-9 h-9 !rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          {pill && <Skeleton className="h-6 w-14 !rounded-full" />}
        </div>
      ))}
    </div>
  );
}

/** Grid of cards (exercises / quizzes / competitions). */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-line rounded-xl p-4 space-y-3">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 !rounded-full" />
            <Skeleton className="h-5 w-14 !rounded-full" />
          </div>
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Stat boxes + leaderboard rows (quiz results, submissions). */
export function StatsListSkeleton({ stats = 3, rows = 4 }: { stats?: number; rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stats}, minmax(0,1fr))` }}>
        {Array.from({ length: stats }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <ListSkeleton rows={rows} />
    </div>
  );
}

export function CommentsSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1].map((i) => (
        <div key={i} className="bg-slate-50 rounded-lg px-3 py-2.5 space-y-2">
          <Skeleton className="h-3 w-1/4" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="space-y-4 p-1">
      {[false, true, false].map((mine, i) => (
        <div key={i} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
          <Skeleton className="w-8 h-8 !rounded-full shrink-0" />
          <Skeleton className={`h-10 ${mine ? "w-40" : "w-52"} !rounded-2xl`} />
        </div>
      ))}
    </div>
  );
}

/** A code-cell shaped placeholder. */
export function CellSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <Skeleton className="w-10 h-10 !rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-6 w-16 !rounded-full" />
      </div>
      <Skeleton className="!rounded-none h-40 !bg-slate-800/90" dark />
      <div className="px-4 py-3 border-t border-line flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}

/** Whole class page while the session is loading. */
export function ClassPageSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="glass">
        <div className="max-w-4xl mx-auto px-4 pt-3 pb-2.5 flex items-center gap-3">
          <Skeleton className="w-9 h-9 !rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex-1" />
          <Skeleton className="h-8 w-20 !rounded-full" />
          <Skeleton className="h-8 w-28 !rounded-full" />
        </div>
        <div className="max-w-4xl mx-auto px-4 pb-2.5 flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-24 !rounded-xl" />
          ))}
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <Skeleton className="h-6 w-44" />
        <CellSkeleton />
        <CellSkeleton />
      </div>
    </div>
  );
}
