import { Loading } from "@/components/Loading";
import { Trophy } from "lucide-react";
import { ExportButtons } from "@/components/ExportButtons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { usePollResults } from "./hooks";
import { usePollOutletContext } from "./PollDetailLayout";
import { PositionResults } from "./ResultsView";

/** Every position's standings, with head counts and percentages, refreshed live. */
export function PollResultsPage() {
  const { poll } = usePollOutletContext();
  const { data: results, isLoading } = usePollResults(poll.id, poll.state === "open");

  if (isLoading || !results) return <Loading label="Loading results" />;

  const turnout = results.registeredVoters ? Math.round((results.voters / results.registeredVoters) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ExportButtons path={`/polls/${poll.id}/results/export`} fileLabel={`${poll.name} results`} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="People who voted" value={results.voters} />
        <StatCard label="Voters signed up" value={results.registeredVoters} />
        <StatCard label="Turnout" value={`${turnout}%`} />
        <StatCard label="Votes cast" value={results.votes} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Winners
          </CardTitle>
          <CardDescription>
            {poll.state === "open" ? "Leading candidates so far. Updates every few seconds while voting is open." : "Final standings."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.positions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add positions on the Ballot tab to see results.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Position</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{poll.state === "closed" ? "Winner" : "Leading"}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Votes</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Share</th>
                    <th scope="col" className="py-2 text-right font-medium">Voters</th>
                  </tr>
                </thead>
                <tbody>
                  {results.positions.map((position) => {
                    const winners = position.candidates.filter((c) => position.winnerIds.includes(c.id));
                    return (
                      <tr key={position.id} className="border-b border-border/50 last:border-0">
                        <th scope="row" className="py-2.5 pr-3 text-left font-medium">{position.title}</th>
                        <td className="py-2.5 pr-3">
                          {winners.length === 0 ? (
                            <span className="text-muted-foreground">No votes yet</span>
                          ) : (
                            <>
                              {winners.map((w) => w.name).join(", ")}
                              {winners.length > 1 && <span className="ml-1 text-xs text-amber-600">(tie)</span>}
                            </>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{winners[0]?.votes ?? 0}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{winners[0]?.percent ?? 0}%</td>
                        <td className="py-2.5 text-right tabular-nums">{position.voters}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {results.positions.map((position) => (
          <Card key={position.id}>
            <CardContent className="p-5">
              <PositionResults position={position} />
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Last updated {new Date(results.updatedAt).toLocaleTimeString()}</p>
    </div>
  );
}
