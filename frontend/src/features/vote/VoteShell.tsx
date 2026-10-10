import { withSignOutOverlay } from "@/components/SignOutOverlay";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Vote } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { getVotePoll, getVoterSession, logoutVoter, type VotePoll } from "./api";

export const voteKeys = {
  poll: (slug: string) => ["vote", "poll", slug] as const,
  session: (slug: string) => ["vote", "session", slug] as const,
  results: (slug: string) => ["vote", "results", slug] as const,
};

// Whether voting is open and what this voter has already voted for must always be current.
export function useVotePoll(slug: string) {
  return useQuery({ queryKey: voteKeys.poll(slug), queryFn: () => getVotePoll(slug), retry: false, staleTime: 0 });
}

export function useVoterSession(slug: string, enabled = true) {
  return useQuery({ queryKey: voteKeys.session(slug), queryFn: () => getVoterSession(slug), retry: false, staleTime: 0, enabled });
}

export function PollLogo({ poll, size = "h-12 w-12" }: { poll: Pick<VotePoll, "imageUrl" | "name">; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-brand text-white shadow-glow ${size}`}>
      {poll.imageUrl ? <img src={poll.imageUrl} alt="" className="h-full w-full object-cover" /> : <Vote className="h-1/2 w-1/2" aria-hidden="true" />}
    </span>
  );
}

/** The frame of every voting page: the poll's own name and picture, and who is signed in. */
export function VoteShell({ poll, children }: { poll?: VotePoll; children: React.ReactNode }) {
  const { data: session } = useVoterSession(poll?.slug ?? "", !!poll);
  const queryClient = useQueryClient();

  const signOut = async () => {
    await withSignOutOverlay(async () => {
      await logoutVoter().catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: ["vote"] });
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-[90%] max-w-[1600px] items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {poll && <PollLogo poll={poll} size="h-10 w-10" />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold sm:text-base">{poll?.name ?? "Voting"}</p>
              {session?.voter && <p className="truncate text-xs text-muted-foreground">Signed in as {session.voter.name}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {session?.voter && (
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-[90%] max-w-[1600px] min-w-0 flex-1 py-6 focus:outline-none sm:py-10">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">Secure voting by NTSOne. One platform. Endless possibilities.</footer>
    </div>
  );
}
