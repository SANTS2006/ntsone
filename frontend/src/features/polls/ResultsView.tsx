import { Crown, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PositionResult } from "./api";

export function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function CandidateAvatar({ url, size = "h-10 w-10" }: { url: string | null; size?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted", size)}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <UserRound className="h-1/2 w-1/2 text-muted-foreground" aria-hidden="true" />}
    </span>
  );
}

/**
 * One position's standings: each candidate's place, votes, and share of the vote, leader first.
 * Used by the admin results page and, when allowed, on the voting pages.
 */
export function PositionResults({ position, highlightId, compact = false }: { position: PositionResult; highlightId?: string; compact?: boolean }) {
  const ordered = [...position.candidates].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const tie = position.winnerIds.length > 1;
  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold">{position.title}</h3>
          <p className="text-xs text-muted-foreground">
            {position.totalVotes} vote{position.totalVotes === 1 ? "" : "s"}
            {position.totalVotes > 0 && tie && " · Tied for first"}
          </p>
        </div>
      )}
      <ol className="flex flex-col gap-2.5" aria-label={`Results for ${position.title}`}>
        {ordered.map((candidate) => {
          const leading = position.winnerIds.includes(candidate.id);
          return (
            <li
              key={candidate.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-2.5 transition-colors",
                leading ? "border-primary/40 bg-gradient-brand-soft" : "border-border/70",
                highlightId === candidate.id && "ring-2 ring-primary/50",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  leading ? "bg-gradient-brand text-white" : "bg-muted text-muted-foreground",
                )}
                aria-label={`${ordinal(candidate.rank)} place`}
              >
                {ordinal(candidate.rank)}
              </span>
              <CandidateAvatar url={candidate.imageUrl} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <span className="truncate">{candidate.name}</span>
                    {leading && position.totalVotes > 0 && <Crown className="h-4 w-4 shrink-0 text-amber-500" aria-label={tie ? "Tied for first" : "Leading"} />}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold">{candidate.percent}%</span>
                    <span className="text-muted-foreground"> · {candidate.votes}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-700", leading ? "bg-gradient-brand" : "bg-primary/40")}
                    style={{ width: `${candidate.percent}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
