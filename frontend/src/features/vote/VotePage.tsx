import { withSignOutOverlay } from "@/components/SignOutOverlay";
import { Loading } from "@/components/Loading";
import * as React from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Check, ChevronRight, LogOut, SkipForward, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { PollResults } from "../polls/api";
import { PositionResults } from "../polls/ResultsView";
import { castVote, getVoteResults, logoutVoter, type VotePoll, type VotePosition } from "./api";
import { PaidVoting } from "./PaidVoting";
import { VoteMessage } from "./VoteMessage";
import { PollLogo, useVotePoll, useVoterSession, voteKeys, VoteShell } from "./VoteShell";

type Outcome =
  | { kind: "done"; exited: boolean }
  | { kind: "already_voted"; message: string }
  | { kind: "domain"; message: string }
  | { kind: "not_verified"; message: string }
  | { kind: "closed" }
  | { kind: "failed"; positionId: string };

function useLiveResults(poll: VotePoll | undefined) {
  return useQuery({
    queryKey: voteKeys.results(poll?.slug ?? ""),
    queryFn: () => getVoteResults(poll!.slug),
    enabled: !!poll?.showResults,
    // Everyone sees the standings move as votes come in.
    refetchInterval: poll?.state === "open" ? 4000 : false,
  });
}

/** Candidate cards for one position; picking one is like choosing a radio button. */
function Ballot({
  position,
  selected,
  onSelect,
  disabled,
}: {
  position: VotePosition;
  selected: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <legend className="sr-only">Choose one candidate for {position.title}</legend>
      <div className="grid grid-cols-1 gap-3">
        {position.candidates.map((candidate) => {
          const checked = selected === candidate.id;
          return (
            <label
              key={candidate.id}
              className={cn(
                "group relative flex cursor-pointer items-center gap-4 rounded-2xl border-2 bg-card p-4 transition-all",
                checked ? "border-primary shadow-glow" : "border-border/70 hover:border-primary/40",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
              )}
            >
              <input
                type="radio"
                name={`position-${position.id}`}
                value={candidate.id}
                checked={checked}
                onChange={() => onSelect(candidate.id)}
                className="sr-only"
              />
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted sm:h-20 sm:w-20">
                {candidate.imageUrl ? (
                  <img src={candidate.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">{candidate.name}</span>
                {candidate.description && <span className="mt-1 block text-sm text-muted-foreground">{candidate.description}</span>}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                )}
              >
                {checked && <Check className="h-4 w-4" />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function LiveResultsCard({ results, positionId }: { results: PollResults | undefined; positionId: string }) {
  const position = results?.positions.find((p) => p.id === positionId);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
          Live results
          <span className="relative ml-1 flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        </CardTitle>
        {position && (
          <p className="text-xs text-muted-foreground">
            {position.totalVotes} vote{position.totalVotes === 1 ? "" : "s"} so far
          </p>
        )}
      </CardHeader>
      <CardContent aria-live="polite">
        {position ? <PositionResults position={position} compact /> : <Loading label="Loading" />}
      </CardContent>
    </Card>
  );
}

function AllResults({ results }: { results: PollResults | undefined }) {
  if (!results) return null;
  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">Live results</h2>
      {results.positions.map((position) => (
        <Card key={position.id}>
          <CardContent className="p-4">
            <PositionResults position={position} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Each visit (and each "continue voting") starts the flow afresh from the positions still to vote on. */
export function VotePage() {
  const { positionId } = useParams<{ positionId?: string }>();
  const location = useLocation();
  return <VoteFlow key={`${positionId ?? "all"}:${location.key}`} />;
}

function VoteFlow() {
  const { slug = "", positionId } = useParams<{ slug: string; positionId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: poll, isLoading, error } = useVotePoll(slug);
  const { data: session, isLoading: sessionLoading, isFetchedAfterMount: sessionFresh } = useVoterSession(slug);
  const { data: results } = useLiveResults(poll);
  usePageMeta({ title: poll ? `Vote: ${poll.name}` : "Vote" });

  const [queue, setQueue] = React.useState<string[] | null>(null);
  const [step, setStep] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [votedNow, setVotedNow] = React.useState<string[]>([]);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [askContinue, setAskContinue] = React.useState(false);

  // The positions to go through, fixed when the page opens. Already-voted ones are left out
  // when each email can vote only once.
  React.useEffect(() => {
    // Wait for this visit's own copy of the session, not a cached one from an earlier page.
    if (!poll || !session || !sessionFresh || queue) return;
    const voted = new Set(poll.onePerEmail ? session.votedPositionIds : []);
    setQueue(poll.positions.map((p) => p.id).filter((id) => (positionId ? id === positionId : !voted.has(id))));
  }, [poll, session, sessionFresh, queue, positionId]);

  if (isLoading || sessionLoading || !sessionFresh) {
    return (
      <VoteShell poll={poll}>
        <Loading label="Loading" />
      </VoteShell>
    );
  }
  if (error || !poll) {
    return (
      <VoteShell>
        <VoteMessage tone="error" title="Poll not found" message={error instanceof ApiError ? error.message : "This poll doesn't exist or has been removed."} />
      </VoteShell>
    );
  }

  const signOut = async () => {
    await withSignOutOverlay(async () => {
      await logoutVoter().catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: ["vote"] });
    });
  };

  if (poll.state === "draft") {
    return (
      <VoteShell poll={poll}>
        <VoteMessage tone="waiting" title="Voting hasn't opened yet" message={`${poll.name} isn't open for voting yet. Please come back later.`} />
      </VoteShell>
    );
  }
  if (poll.state === "closed" || outcome?.kind === "closed") {
    return (
      <VoteShell poll={poll}>
        <div className="flex flex-col gap-6">
          <VoteMessage tone="closed" title="Voting has been closed" message={`Voting for ${poll.name} has closed. Thank you to everyone who took part.`} />
          {poll.showResults && <AllResults results={results} />}
        </div>
      </VoteShell>
    );
  }
  if (!session?.voter) {
    return <Navigate to={`/vote/${slug}/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (session.notVerified || outcome?.kind === "not_verified") {
    return (
      <VoteShell poll={poll}>
        <VoteMessage
          tone="error"
          title="You're not a verified voter"
          message={
            outcome?.kind === "not_verified"
              ? outcome.message
              : `You cannot vote because you are not verified by the system as an eligible voter for this poll. The email you signed in with is ${session.voter.email}.`
          }
        >
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign in with a different email
          </Button>
        </VoteMessage>
      </VoteShell>
    );
  }
  if (!session.emailAllowed || outcome?.kind === "domain") {
    return (
      <VoteShell poll={poll}>
        <VoteMessage
          tone="error"
          title="This email can't vote"
          message={
            outcome?.kind === "domain"
              ? outcome.message
              : `You can't vote with the email you signed in with (${session.voter.email}). This poll only accepts email addresses ending in ${poll.allowedDomains.map((d) => `@${d}`).join(" or ")}.`
          }
        >
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign in with a different email
          </Button>
        </VoteMessage>
      </VoteShell>
    );
  }

  // A poll that charges for votes has its own screen: pay first, then choose a candidate.
  if (poll.payment) return <PaidVoting poll={poll} session={session} positionId={positionId} />;

  const single = !!positionId;
  const singlePosition = single ? poll.positions.find((p) => p.id === positionId) : undefined;
  if (single && !singlePosition) {
    return (
      <VoteShell poll={poll}>
        <VoteMessage tone="error" title="Position not found" message="This position isn't on the ballot any more.">
          <LinkButton to={`/vote/${slug}`} variant="default">
            See the whole poll
          </LinkButton>
        </VoteMessage>
      </VoteShell>
    );
  }
  const alreadyVotedHere = single && poll.onePerEmail && session.votedPositionIds.includes(positionId!) && !votedNow.includes(positionId!);
  if (outcome?.kind === "already_voted" || alreadyVotedHere) {
    return (
      <VoteShell poll={poll}>
        <div className="flex flex-col gap-6">
          <VoteMessage
            tone="error"
            title="You've already voted"
            message={outcome?.kind === "already_voted" ? outcome.message : `You've already voted for ${singlePosition!.title}. Each email address can vote only once.`}
          >
            <LinkButton to={`/vote/${slug}`} variant="default">
              Vote in the other positions
              <ChevronRight className="h-4 w-4" />
            </LinkButton>
          </VoteMessage>
          {poll.showResults && <AllResults results={results} />}
        </div>
      </VoteShell>
    );
  }

  if (outcome?.kind === "failed") {
    const failedTitle = poll.positions.find((p) => p.id === outcome.positionId)?.title;
    return (
      <VoteShell poll={poll}>
        <VoteMessage
          tone="error"
          title="Voting failed"
          message={`Your vote${failedTitle ? ` for ${failedTitle}` : ""} was not recorded because of a network or site problem. Nothing was counted, so you can safely try again.`}
        >
          <Button onClick={() => setOutcome(null)}>Try voting again</Button>
        </VoteMessage>
      </VoteShell>
    );
  }

  if (!queue) {
    return (
      <VoteShell poll={poll}>
        <Loading label="Loading" />
      </VoteShell>
    );
  }

  const done = outcome?.kind === "done" || step >= queue.length;
  if (done) {
    const exited = outcome?.kind === "done" && outcome.exited;
    const nothingLeft = queue.length === 0;
    return (
      <VoteShell poll={poll}>
        <div className="flex flex-col gap-6">
          <VoteMessage
            tone="success"
            title={nothingLeft ? "You've already voted" : votedNow.length ? "Thank you for voting!" : "No votes cast"}
            message={
              nothingLeft
                ? `You have already voted in every position of ${poll.name}.`
                : votedNow.length
                  ? `Your vote${votedNow.length > 1 ? "s have" : " has"} been recorded for ${votedNow
                      .map((id) => poll.positions.find((p) => p.id === id)?.title)
                      .filter(Boolean)
                      .join(", ")}.${exited ? " You left before the end; you can come back to vote in the rest while voting is open." : ""}`
                  : "You left without voting. You can come back and vote while voting is open."
            }
          >
            {!nothingLeft && (exited || votedNow.length < queue.length) && (
              <Button variant="outline" onClick={() => navigate(`/vote/${slug}`, { replace: true })}>
                Continue voting
              </Button>
            )}
          </VoteMessage>
          {poll.showResults && <AllResults results={results} />}
        </div>
      </VoteShell>
    );
  }

  const position = poll.positions.find((p) => p.id === queue[step])!;
  const remainingElsewhere = poll.positions.filter(
    (p) => p.id !== positionId && !(poll.onePerEmail && session.votedPositionIds.includes(p.id)),
  );

  const next = () => {
    setSelected(null);
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitVote = async () => {
    if (!selected) return toast.error("Choose a candidate first");
    setSubmitting(true);
    try {
      const response = await castVote(slug, position.id, selected);
      if (response.results) queryClient.setQueryData(voteKeys.results(slug), response.results);
      queryClient.setQueryData(voteKeys.session(slug), { ...session, votedPositionIds: response.votedPositionIds });
      setVotedNow((v) => [...v, position.id]);
      toast.success(`Your vote for ${position.title} has been recorded`);
      if (single) {
        if (remainingElsewhere.length > 0) setAskContinue(true);
        else setOutcome({ kind: "done", exited: false });
      } else {
        next();
      }
    } catch (err) {
      const reason = err instanceof ApiError ? (err.details as { reason?: string } | undefined)?.reason : undefined;
      const message = err instanceof ApiError ? err.message : "Your vote couldn't be recorded. Please try again.";
      if (reason === "already_voted") setOutcome({ kind: "already_voted", message });
      else if (reason === "domain_not_allowed") setOutcome({ kind: "domain", message });
      else if (reason === "not_verified") setOutcome({ kind: "not_verified", message });
      else if (reason === "closed") setOutcome({ kind: "closed" });
      else if (!(err instanceof ApiError) || err.statusCode >= 500) setOutcome({ kind: "failed", positionId: position.id });
      else toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <VoteShell poll={poll}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <PollLogo poll={poll} size="h-14 w-14" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {single ? "Vote" : `Position ${step + 1} of ${queue.length}`}
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{position.title}</h1>
          </div>
        </div>
        {!single && queue.length > 1 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-gradient-brand transition-all duration-500" style={{ width: `${(step / queue.length) * 100}%` }} />
          </div>
        )}

        <div className={cn("grid min-w-0 gap-6", poll.showResults && "md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] md:items-start")}>
          <div className="flex min-w-0 flex-col gap-5">
            {position.imageUrl && <img src={position.imageUrl} alt="" className="max-h-80 w-full rounded-2xl bg-card object-contain" />}
            {position.description && <p className="text-sm text-muted-foreground">{position.description}</p>}
            <p className="text-sm font-medium">Choose one candidate:</p>
            <Ballot position={position} selected={selected} onSelect={setSelected} disabled={submitting} />

            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-background/90 p-3 shadow-lg backdrop-blur">
              <Button variant="ghost" onClick={() => setOutcome({ kind: "done", exited: true })} disabled={submitting}>
                <LogOut className="h-4 w-4" />
                Exit
              </Button>
              <div className="flex gap-2">
                {!single && (
                  <Button variant="outline" onClick={next} disabled={submitting}>
                    <SkipForward className="h-4 w-4" />
                    Skip
                  </Button>
                )}
                <Button onClick={submitVote} loading={submitting} disabled={!selected}>
                  <Check className="h-4 w-4" />
                  Vote
                </Button>
              </div>
            </div>
          </div>
          {poll.showResults && (
            <div className="min-w-0 md:sticky md:top-20">
              <LiveResultsCard results={results} positionId={position.id} />
            </div>
          )}
        </div>
      </div>

      <Dialog open={askContinue} onOpenChange={setAskContinue}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vote recorded. Keep voting?</DialogTitle>
            <DialogDescription>
              {poll.name} has {remainingElsewhere.length} other position{remainingElsewhere.length === 1 ? "" : "s"} you can vote for:{" "}
              {remainingElsewhere.map((p) => p.title).join(", ")}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAskContinue(false);
                setOutcome({ kind: "done", exited: false });
              }}
            >
              No, I&apos;m done
            </Button>
            <Button
              onClick={() => {
                setAskContinue(false);
                navigate(`/vote/${slug}`);
              }}
            >
              Yes, continue voting
              <ChevronRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VoteShell>
  );
}
