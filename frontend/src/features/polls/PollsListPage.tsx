import { Loading } from "@/components/Loading";
import * as React from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, ExternalLink, ListOrdered, Plus, Search, Users2, Vote } from "lucide-react";
import { useAuth } from "@/app/AuthContext";
import { SharedBadge } from "../access/OwnSpace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardInteractive } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { usePageMeta } from "@/lib/seo";
import { listTenants } from "../platform/api";
import { createPoll, type PollState } from "./api";
import { useInvalidatePolls, usePollsList } from "./hooks";

const STATE_BADGE: Record<PollState, { label: string; variant: "secondary" | "success" | "warning" }> = {
  draft: { label: "Not open yet", variant: "secondary" },
  open: { label: "Voting open", variant: "success" },
  closed: { label: "Closed", variant: "warning" },
};

export function PollStateBadge({ state }: { state: PollState }) {
  const badge = STATE_BADGE[state];
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

function CreatePollDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const navigate = useNavigate();
  const invalidate = useInvalidatePolls();
  const { user } = useAuth();
  const choosesAccount = user?.role === "super_admin";
  const { data: accounts } = useQuery({
    queryKey: ["platform-tenants", "all-for-select"],
    queryFn: () => listTenants({ page: 1, pageSize: 100 }),
    enabled: choosesAccount && open,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Give the poll a name");
    if (choosesAccount && !tenantId) return toast.error("Choose the account this poll belongs to");
    setSaving(true);
    try {
      const poll = await createPoll({ name: name.trim(), description: description.trim() || undefined, ...(choosesAccount ? { tenantId } : {}) });
      await invalidate();
      toast.success("Poll created. Now add the positions people will vote for.");
      setOpen(false);
      navigate(`/admin/polls/${poll.id}/ballot`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create the poll");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New Poll
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a poll</DialogTitle>
          <DialogDescription>After creating it, you&apos;ll add the positions and candidates people vote for.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {choosesAccount && (
            <div className="flex flex-col gap-1.5">
              <Label>Account</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose the account this poll belongs to" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.items.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="poll-name">Poll name</Label>
            <Input id="poll-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Student Union Elections 2026" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="poll-description">Description (optional)</Label>
            <Textarea id="poll-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" loading={saving}>
              Create poll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PollsListPage() {
  usePageMeta({ title: "Polls" });
  const { user } = useAuth();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = usePollsList({ page, pageSize: 12, search: search || undefined });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Voting Polls</h1>
          <p className="text-sm text-muted-foreground">Run elections and votes with live results.</p>
        </div>
        {user?.role !== "viewer" && <CreatePollDialog />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Search polls..."
          aria-label="Search polls"
          className="pl-9"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
        <RefreshButton />
      </div>

      {isLoading && <Loading label="Loading polls" />}
      {!isLoading && data?.items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Vote className="h-8 w-8 text-primary/50" aria-hidden="true" />
            No polls yet. Create one to run your first vote.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((poll) => (
          <Link key={poll.id} to={`/admin/polls/${poll.id}`}>
            <CardInteractive className="flex h-full flex-col overflow-hidden">
              <div className="relative h-32 w-full shrink-0 overflow-hidden bg-gradient-brand-soft">
                {poll.imageUrl ? (
                  <img src={poll.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Vote className="h-9 w-9 text-primary/40" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  <PollStateBadge state={poll.state} />
                </div>
                {poll.state === "open" && (
                  <button
                    type="button"
                    title="Open the voting page"
                    aria-label="Open the voting page"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(`/vote/${poll.slug}`, "_blank", "noopener,noreferrer");
                    }}
                    className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-2 text-xs font-bold text-white">
                  <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 shadow-md backdrop-blur-sm">
                    <ListOrdered className="h-4 w-4" aria-hidden="true" />
                    {poll.positionCount ?? 0} position{poll.positionCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 shadow-md backdrop-blur-sm">
                    <Users2 className="h-4 w-4" aria-hidden="true" />
                    {poll.voterCount ?? 0} voted
                  </span>
                </div>
              </div>
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 break-words text-base font-semibold leading-tight">{poll.name}</h2>
                  <SharedBadge tenantId={poll.tenantId} />
                </div>
                <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{poll.description ?? "No description."}</p>
                {poll.closesAt && poll.state === "open" && (
                  <div className="flex items-center gap-1.5 border-t border-border/60 pt-3 text-xs font-medium text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    Closes {new Date(poll.closesAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </div>
                )}
              </CardContent>
            </CardInteractive>
          </Link>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
