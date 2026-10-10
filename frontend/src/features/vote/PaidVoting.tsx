import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Check, Coins, Lock, ShieldCheck, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { formatMinor, parseLeones } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PollResults, PositionResult } from "../polls/api";
import { PositionResults } from "../polls/ResultsView";
import { castPaidVotes, getVoteResults, startVotePayment, type VoteCredit, type VotePoll, type VotePosition, type VoterSession } from "./api";
import { VoteShell, voteKeys } from "./VoteShell";
import { VoteMessage } from "./VoteMessage";

type Payment = NonNullable<VotePoll["payment"]>;

/** How many whole votes an amount buys, and what that costs. Mirrors the server, which always works it out again. */
function previewPurchase(payment: Payment, amount: string) {
  if (!payment.allowAnyAmount) return { votes: 1, totalMinor: payment.pricePerVoteMinor, error: null as string | null };
  const minor = parseLeones(amount);
  if (minor === null || minor < payment.pricePerVoteMinor) return { votes: 0, totalMinor: 0, error: `Enter at least ${formatMinor(payment.pricePerVoteMinor)}, the price of one vote.` };
  const votes = Math.floor(minor / payment.pricePerVoteMinor);
  if (votes > payment.maxVotesPerPayment) return { votes: 0, totalMinor: 0, error: `One payment can buy at most ${payment.maxVotesPerPayment} votes.` };
  return { votes, totalMinor: votes * payment.pricePerVoteMinor, error: null };
}

/** Candidates to choose from when using paid votes. */
function Candidates({ position, selected, onSelect, disabled }: { position: VotePosition; selected: string | null; onSelect: (id: string) => void; disabled: boolean }) {
  return (
    <fieldset disabled={disabled} className="grid gap-2">
      <legend className="sr-only">Choose one candidate for {position.title}</legend>
      {position.candidates.map((c) => (
        <label key={c.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border-2 bg-card p-3 transition-colors", selected === c.id ? "border-primary shadow-glow" : "border-border/70 hover:border-primary/40")}>
          <input type="radio" name={`paid-${position.id}`} className="sr-only" checked={selected === c.id} onChange={() => onSelect(c.id)} />
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">{c.imageUrl ? <img src={c.imageUrl} alt="" className="h-full w-full object-cover" /> : null}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium leading-tight">{c.name}</span>
            {c.description && <span className="block text-xs text-muted-foreground">{c.description}</span>}
          </span>
          <span aria-hidden="true" className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", selected === c.id ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
            {selected === c.id && <Check className="h-3 w-3" />}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Votes someone has paid for and not used yet: pick a candidate and cast them all, once. */
function CreditCard({ poll, credit, position, onUsed, alreadyVoted }: { poll: VotePoll; credit: VoteCredit; position: VotePosition; onUsed: (results: PollResults | null) => void; alreadyVoted: boolean }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const cast = async () => {
    if (!selected) return toast.error("Choose a candidate first");
    setBusy(true);
    try {
      const response = await castPaidVotes(poll.slug, credit.paymentId, selected);
      queryClient.setQueryData(voteKeys.session(poll.slug), (old: VoterSession | undefined) => (old ? { ...old, credits: response.credits, votedPositionIds: [...new Set([...old.votedPositionIds, credit.positionId ?? ""])] } : old));
      await queryClient.invalidateQueries({ queryKey: voteKeys.session(poll.slug) });
      toast.success(`${response.votes} ${response.votes === 1 ? "vote" : "votes"} recorded for ${position.title}`);
      onUsed(response.results);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Your votes couldn't be recorded. Nothing was counted, so you can try again.");
      await queryClient.invalidateQueries({ queryKey: voteKeys.session(poll.slug) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-emerald-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          You have {credit.votes} {credit.votes === 1 ? "vote" : "votes"} to cast for {position.title}
        </CardTitle>
        <CardDescription>Choose who gets {credit.votes === 1 ? "your vote" : `all ${credit.votes} of your votes`}. Votes can be used once.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {alreadyVoted ? (
          <p role="status" className="text-sm text-muted-foreground">
            You have already voted for {position.title}, and each email address can vote only once, so these votes can't be used. Ask the organizer to refund this payment.
          </p>
        ) : (
          <>
        <Candidates position={position} selected={selected} onSelect={setSelected} disabled={busy} />
        <Button onClick={cast} loading={busy} disabled={!selected} className="w-fit">
          <Check className="h-4 w-4" />
          Cast {credit.votes} {credit.votes === 1 ? "vote" : "votes"}
        </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Pay for the votes of one position, then be taken to Monime to pay. */
function BuyCard({ poll, position, payment, standings, alreadyVoted }: { poll: VotePoll; position: VotePosition; payment: Payment; standings?: PositionResult; alreadyVoted: boolean }) {
  const navigate = useNavigate();
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const plan = previewPurchase(payment, amount);

  const pay = async () => {
    if (plan.error || plan.votes < 1) return;
    setBusy(true);
    try {
      const started = await startVotePayment(poll.slug, position.id, payment.allowAnyAmount ? parseLeones(amount) ?? undefined : undefined);
      if (started.redirectUrl && started.redirectUrl.startsWith("https://")) window.location.assign(started.redirectUrl);
      else navigate(`/payment/${started.token}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The payment couldn't be started. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{position.title}</CardTitle>
        {position.description && <CardDescription>{position.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {alreadyVoted ? (
          <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
            You&apos;ve already voted for {position.title}. Each email address can vote only once, so you can&apos;t vote for it again.
          </p>
        ) : payment.allowAnyAmount ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`amount-${position.id}`}>How much do you want to pay? (NLe)</Label>
            <Input id={`amount-${position.id}`} inputMode="decimal" placeholder={`${payment.pricePerVoteMinor / 100}`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amount && plan.error) || undefined} />
            <p className={cn("text-sm", amount && plan.error ? "text-destructive" : "text-muted-foreground")}>
              {amount && plan.error
                ? plan.error
                : plan.votes > 0
                  ? `${formatMinor(plan.totalMinor)} buys ${plan.votes} ${plan.votes === 1 ? "vote" : "votes"}.`
                  : `One vote costs ${formatMinor(payment.pricePerVoteMinor)}. Pay more to buy more votes.`}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">One vote costs {formatMinor(payment.pricePerVoteMinor)}.</p>
        )}
        {!alreadyVoted && (
          <Button onClick={pay} loading={busy} disabled={plan.votes < 1} className="w-fit">
            <Coins className="h-4 w-4" />
            Pay {plan.votes > 0 ? formatMinor(plan.totalMinor) : ""} and vote
          </Button>
        )}
        {poll.showResults && (
          <div className="mt-2 flex flex-col gap-2 border-t border-border/70 pt-3" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
              Live results
              <span className="relative ml-1 flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {standings && <span className="ml-auto text-xs font-normal text-muted-foreground">{standings.totalVotes} {standings.totalVotes === 1 ? "vote" : "votes"} so far</span>}
            </p>
            {standings ? <PositionResults position={standings} compact /> : <p className="text-sm text-muted-foreground">Loading the results...</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Voting on a poll that charges for votes. Pay first (on Monime's page), come back here, choose a candidate and the
 * votes you paid for are cast, once. To vote again, pay again.
 */
export function PaidVoting({ poll, session, positionId }: { poll: VotePoll; session: VoterSession; positionId?: string }) {
  const payment = poll.payment!;
  const [results, setResults] = React.useState<PollResults | null>(null);
  const credits = session.credits ?? [];
  // With one vote per email, the positions this person (or their email) has already voted for are closed to them.
  const votedIds = new Set(poll.onePerEmail ? session.votedPositionIds : []);
  const positions = positionId ? poll.positions.filter((p) => p.id === positionId) : poll.positions;
  const cast = results !== null;
  // Everyone signed in sees the standings move while they decide, when the admin has turned results on.
  const { data: live } = useQuery({
    queryKey: voteKeys.results(poll.slug),
    queryFn: () => getVoteResults(poll.slug),
    enabled: poll.showResults,
    refetchInterval: poll.state === "open" ? 4000 : false,
  });

  return (
    <VoteShell poll={poll}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Vote in {poll.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Votes in this poll are paid for: {formatMinor(payment.pricePerVoteMinor)} a vote{payment.allowAnyAmount ? `, and you can pay any amount to buy more` : ""}. Pay first, then choose your candidate. Each payment is used once; to vote again, pay again.
          </p>
        </div>

        {credits.map((credit) => {
          const position = poll.positions.find((p) => p.id === credit.positionId);
          return position ? <CreditCard key={credit.paymentId} poll={poll} credit={credit} position={position} onUsed={(r) => setResults(r ?? ({} as PollResults))} alreadyVoted={votedIds.has(position.id)} /> : null;
        })}

        {cast && credits.length === 0 && <VoteMessage tone="success" title="Thank you for voting!" message="Your votes have been recorded. You can buy more votes below." />}

        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Buy votes</h2>
          <p className="text-sm text-muted-foreground">Choose a position. You pay on a secure Monime page with Orange Money or Africell Money, then come straight back here to vote.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {positions.map((position) => (
            <BuyCard key={position.id} poll={poll} position={position} payment={payment} standings={live?.positions.find((p) => p.id === position.id)} alreadyVoted={votedIds.has(position.id)} />
          ))}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex items-center gap-1">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Your payment is confirmed with Monime before any vote counts. The candidate you choose is never shown with your name.
          </span>
        </p>
      </div>
    </VoteShell>
  );
}
