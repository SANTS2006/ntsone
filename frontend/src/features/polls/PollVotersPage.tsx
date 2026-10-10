import { Loading } from "@/components/Loading";
import * as React from "react";
import { DateRangeFilter, useDateRange } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listPollVoters } from "./api";
import { pollKeys } from "./hooks";
import { usePollOutletContext } from "./PollDetailLayout";

/**
 * Everyone who signed in to this poll. Voters only have poll accounts, never access to the
 * rest of the system. Ballots are secret, so only how many votes each person cast is shown.
 */
export function PollVotersPage() {
  const { poll } = usePollOutletContext();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const range = useDateRange();
  const params = { page, pageSize: 25, search: search || undefined, dateFrom: range.dateFrom, dateTo: range.dateTo };
  const { data, isLoading } = useQuery({
    queryKey: pollKeys.voters(poll.id, params),
    queryFn: () => listPollVoters(poll.id, params),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Voters</CardTitle>
        <CardDescription>
          People who signed up or signed in to vote. Who they voted for stays secret; only the number of votes they cast is shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search by name or email..."
              aria-label="Search voters"
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <ExportButtons path={`/polls/${poll.id}/voters/export`} params={{ search, dateFrom: range.dateFrom, dateTo: range.dateTo }} fileLabel={`${poll.name} voters`} />
        </div>
        <DateRangeFilter range={range} onChange={() => setPage(1)} label="Joined" />
        {isLoading && <Loading label="Loading voters" />}
        {data && data.items.length === 0 && <p className="text-sm text-muted-foreground">No voters yet.</p>}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Email</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Role</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Signs in with</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Joined</th>
                  <th scope="col" className="py-2 text-right font-medium">Votes cast</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((voter) => (
                  <tr key={voter.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{voter.name}</td>
                    <td className="py-2.5 pr-3 break-all">{voter.email}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant="secondary">Voter</Badge>
                    </td>
                    <td className="py-2.5 pr-3">{voter.signInMethod === "google" ? "Google" : "Email"}</td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{new Date(voter.joinedAt).toLocaleDateString()}</td>
                    <td className="py-2.5 text-right tabular-nums">{voter.votes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground">
              Page {data.page} of {data.totalPages} · {data.total} voters
            </span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
